/**
 * logic.test.mjs – Headless-Tests der reinen DSP/Logik-Module (kein Web Audio).
 * Lauf: node test/logic.test.mjs   (oder: npm test)
 */
import assert from 'node:assert/strict';
import { HINTS, HINT_IDS, factoryHint } from '../js/data/hints.js';
import { normalizeFxOrder } from '../js/core/fxChain.js';
import { DEFAULTS as STATE_DEFAULTS } from '../js/core/State.js';

import { triggerInterval, DIVISIONS } from '../js/core/TriggerDivider.js';
import { ScaleModel, rotateMask } from '../js/pitch/ScaleModel.js';
import { quantizeToScale, activeMidis, semitoneToHz, harmonicSnap, freqToMidi, midiToFreq, midiToName, foldToBand } from '../js/pitch/Scaler.js';
import { PitchOsc, PITCH_WAVEFORMS } from '../js/pitch/PitchOsc.js';
import { GateOsc } from '../js/core/GateOsc.js';
import { pulseCoefficients, harmonicsForFreq, phaseWarp, warpedCoefficients, fmCoefficients } from '../js/audio/pulseWave.js';
import { LadderCore, prewarp, resToDamping } from '../js/dsp/ladderCore.js';
import { fft } from '../js/dsp/fft.js';
import { renderMetroClick } from '../js/dsp/metroClick.js';
import { makeSeqSteps, seqAdvance, fillSeq, seqDyn, SEQ_MAX, SEQ_DYN_MIN } from '../js/dsp/stepSeq.js';
import { bestFraction, reduce } from '../js/pitch/rateFraction.js';
import { encodeWav, decodeWav } from '../js/dsp/wavEncoder.js';
import { keytrackCutoff, envPeakMult } from '../js/dsp/filterMod.js';
import { thinBackups, captureState, restoreState, pushBackup, readBackups, BACKED_UP_KEYS, serializeBackup, parseBackupFile, FILE_KIND } from '../js/data/Backup.js';
import { PresetManager } from '../js/data/PresetManager.js';
import { safeFilename, fileStamp } from '../js/core/fileIO.js';
import { hasUserState, fetchFactory, withFreshHints } from '../js/data/factory.js';
import { targetKind, globalKeyOk, arrowKeyOk } from '../js/core/keyRoute.js';
import { slidePlan, slideFreqAt, SLIDE_L } from '../js/dsp/holdSlide.js';
import { DebugPanel } from '../js/ui/DebugPanel.js';
import { t as tr, hasTranslation, setLang, EN_KEYS } from '../js/core/i18n.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0;
function t(name, fn) {
    // Wächter: async an t() zu geben wäre ein Scheinerfolg – t() bekäme sofort ein
    // Promise, hakte ✓ ab und sähe ein Fehlschlagen nie. Für async gibt es ta().
    if (fn.constructor.name === 'AsyncFunction') {
        console.error(`  ✗ ${name}\n    async-Test an t() übergeben – ta() nehmen (t() kann nicht fehlschlagen)`);
        process.exitCode = 1;
        return;
    }
    try { fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}
/** async-Test: wird gesammelt und am Ende abgewartet (sonst zählt niemand das Ergebnis). */
const asyncTests = [];
function ta(name, fn) {
    asyncTests.push(Promise.resolve().then(fn).then(
        () => { pass++; console.log(`  ✓ ${name}`); },
        (e) => { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; },
    ));
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

console.log('TriggerDivider');
t('120 BPM, 1/4 = 0.5 s', () => assert.ok(approx(triggerInterval(120, '1/4'), 0.5)));
t('120 BPM, 1/16 = 0.125 s', () => assert.ok(approx(triggerInterval(120, '1/16'), 0.125)));
t('60 BPM, 1/1 = 4 s', () => assert.ok(approx(triggerInterval(60, '1/1'), 4)));
t('alle Divisions definiert', () => assert.equal(Object.keys(DIVISIONS).length, 5));

console.log('ScaleModel');
t('major quantisiert 1 → 0 oder 2 (kein C#)', () => {
    const s = new ScaleModel(); s.setPreset('major');
    const q = s.quantize(1); // C# nicht in C-Dur
    assert.ok(q === 0 || q === 2, `got ${q}`);
});
t('octaves: jeder Wert landet auf Vielfachem von 12', () => {
    const s = new ScaleModel(); s.setPreset('octaves');
    assert.equal(s.quantize(7), 12);   // näher an 12 (d=5) als 0 (d=7)
    assert.equal(s.quantize(5), 0);    // näher an 0
});
t('leere Maske → reine Rundung', () => {
    const s = new ScaleModel([0,0,0,0,0,0,0,0,0,0,0,0]);
    assert.equal(s.quantize(7.4), 7);
});
t('chromatic lässt alles durch', () => {
    const s = new ScaleModel();
    assert.equal(s.quantize(6.6), 7);
});

console.log('rotateMask (Skala auf Frequenzachse verschieben)');
t('C→F (delta 5): C-Dur wird nach F verschoben', () => {
    const major = [1,0,1,0,1,1,0,1,0,1,0,1]; // C D E F G A B
    const shifted = rotateMask(major, 5);
    // was bei C(0) war, liegt jetzt bei F(5); was bei D(2) war, bei G(7) …
    assert.deepEqual(shifted, [1,0,1,0,1,1,0,1,0,1,1,0]); // F-Dur: C D E F G A Bb
    assert.equal(shifted[5], major[0]); // F trägt jetzt Cs Wert
    assert.equal(shifted[7], major[2]); // G trägt Ds Wert
});
t('delta 0 = unverändert', () => {
    const m = [1,0,1,1,0,1,0,1,0,0,1,0];
    assert.deepEqual(rotateMask(m, 0), m);
});
t('delta 12 = Identität (mod 12)', () => {
    const m = [1,0,0,1,0,1,0,1,0,0,1,0];
    assert.deepEqual(rotateMask(m, 12), m);
});
t('Anzahl aktiver Töne bleibt erhalten (reine Verschiebung)', () => {
    const m = [1,0,1,0,1,1,0,1,0,1,0,1];
    const sum = (a) => a.reduce((s, v) => s + v, 0);
    for (const d of [1,3,5,7,11]) assert.equal(sum(rotateMask(m, d)), sum(m));
});

console.log('Scaler – Helfer');
t('semitoneToHz: +12 = Oktave', () => assert.ok(approx(semitoneToHz(12, 100), 200)));
t('harmonicSnap zieht auf n·base (über Basis)', () => assert.equal(harmonicSnap(317, 100), 300));
t('harmonicSnap: knapp unter Basis → Basis', () => assert.equal(harmonicSnap(90, 100), 100));   // k=0
t('harmonicSnap: ~1/2 → Sub-Oktave base/2', () => assert.equal(harmonicSnap(52, 100), 50));     // log2(1.92)≈0.94→k=1
t('harmonicSnap: 1/4 der Basis (C1 unter C3)', () => assert.ok(approx(harmonicSnap(32.7, 131), 32.75, 0.01))); // 131/4
t('harmonicSnap: tief → 1/8', () => assert.equal(harmonicSnap(13, 100), 12.5));                 // log2(7.7)≈2.9→k=3
t('foldToBand: hohe Freq halbiert ins Band', () => assert.ok(approx(foldToBand(440, 30), 55)));   // 440→220→110→55 ∈ [30,60)
t('foldToBand: tiefe Freq verdoppelt ins Band', () => assert.ok(approx(foldToBand(10, 30), 40))); // 10→20→40 ∈ [30,60)
t('foldToBand: schon im Band bleibt', () => assert.equal(foldToBand(45, 30), 45));
t('foldToBand: Untergrenze inklusiv', () => assert.equal(foldToBand(30, 30), 30));
t('foldToBand: 2·low fällt in nächstes → zurück ins Band', () => assert.ok(approx(foldToBand(60, 30), 30)));
t('foldToBand: ungültige Eingabe = unverändert', () => assert.equal(foldToBand(100, 0), 100));
t('freqToMidi: 440 = 69 (A4)', () => assert.ok(approx(freqToMidi(440), 69, 1e-9)));
t('freqToMidi: 55 = 33 (A1)', () => assert.ok(approx(freqToMidi(55), 33, 1e-9)));
t('midiToFreq invertiert freqToMidi', () => assert.ok(approx(midiToFreq(freqToMidi(123.4)), 123.4, 1e-6)));
t('midiToName: 55 Hz → A1 (nicht C!)', () => assert.equal(midiToName(freqToMidi(55)), 'A1'));
t('midiToName: 261.6 Hz → C4', () => assert.equal(midiToName(freqToMidi(261.63)), 'C4'));

console.log('Scaler – quantizeToScale (gleichmäßige Verteilung auf aktive Töne)');
t('activeMidis chromatisch: lückenloses Fenster', () => {
    const s = new ScaleModel();
    const list = activeMidis(45, 12, s); // 45..57
    assert.equal(list.length, 13);
    assert.equal(list[0], 45); assert.equal(list[12], 57);
});
t('activeMidis C-Dur: nur aktive Tonklassen', () => {
    const s = new ScaleModel(); s.setPreset('major');
    const list = activeMidis(45, 12, s);
    // keine ausgeschalteten Tonklassen (z.B. A#=10, C#=1, D#=3, F#=6, G#=8)
    assert.ok(list.every((m) => s.mask[((m % 12) + 12) % 12]));
    assert.ok(!list.includes(46) && !list.includes(49)); // A#, C# raus
});
t('u=0 → unterster aktiver Ton', () => {
    const s = new ScaleModel();
    const hz = quantizeToScale({ unipolar: 0, vonMidi: 45, range: 12, scale: s, baseHz: 55, harmonizeMix: 0 });
    assert.ok(approx(hz, midiToFreq(45), 1e-6), `got ${hz}`);
});
t('u≈1 → oberster aktiver Ton (kein Überlauf)', () => {
    const s = new ScaleModel();
    const hz = quantizeToScale({ unipolar: 0.999999, vonMidi: 45, range: 12, scale: s, baseHz: 55, harmonizeMix: 0 });
    assert.ok(approx(hz, midiToFreq(57), 1e-6), `got ${hz}`);
});
t('OFF-Treffer landet NIE auf ausgeschalteter Tonklasse', () => {
    const s = new ScaleModel(); s.setPreset('major');
    for (let i = 0; i <= 100; i++) {
        const hz = quantizeToScale({ unipolar: i / 100, vonMidi: 45, range: 24, scale: s, baseHz: 55, harmonizeMix: 0 });
        const pc = ((Math.round(freqToMidi(hz)) % 12) + 12) % 12;
        assert.ok(s.mask[pc], `u=${i/100} landete auf AUS-Ton pc=${pc}`);
    }
});
t('gleichmäßige Verteilung: jeder aktive Ton wird getroffen', () => {
    const s = new ScaleModel(); s.setPreset('pentaMin');
    const list = activeMidis(45, 24, s);
    const hit = new Set();
    for (let i = 0; i <= 200; i++) {
        const hz = quantizeToScale({ unipolar: i / 200, vonMidi: 45, range: 24, scale: s, baseHz: 55, harmonizeMix: 0 });
        hit.add(Math.round(freqToMidi(hz)));
    }
    assert.equal(hit.size, list.length, `nur ${hit.size}/${list.length} Töne getroffen`);
});
t('nur 1 aktiver Ton + schmale Range ohne Treffer → nächster aktiver Ton (nicht still)', () => {
    const s = new ScaleModel([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // nur C
    for (const vonMidi of [26, 29, 31, 34]) {   // D1..A#1: kein C im 1-Halbton-Fenster
        const hz = quantizeToScale({ unipolar: 0.5, vonMidi, range: 1, scale: s, baseHz: 0, harmonizeMix: 0 });
        assert.ok(hz !== null, `vonMidi=${vonMidi} darf nicht still sein`);
        const pc = ((Math.round(freqToMidi(hz)) % 12) + 12) % 12;
        assert.equal(pc, 0, `vonMidi=${vonMidi} muss auf ein C rasten, war pc=${pc}`);
    }
});
t('leere Maske → null (echte Stille)', () => {
    const s = new ScaleModel([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(quantizeToScale({ unipolar: 0.5, vonMidi: 45, range: 12, scale: s, baseHz: 0, harmonizeMix: 0 }), null);
});
t('Harmonize Mix=1 zieht auf n·base', () => {
    const s = new ScaleModel();
    const hz = quantizeToScale({ unipolar: 0, vonMidi: 69, range: 0, scale: s, baseHz: 55, harmonizeMix: 1 });
    assert.equal(hz, harmonicSnap(midiToFreq(69), 55)); // 440 = 8·55
});
t('leere Maske → null (Stille)', () => {
    const s = new ScaleModel([0,0,0,0,0,0,0,0,0,0,0,0]);
    assert.equal(quantizeToScale({ unipolar: 0.5, vonMidi: 45, range: 12, scale: s, baseHz: 55, harmonizeMix: 0 }), null);
});

console.log('PitchOsc');
t('sample liegt in [from, from+range]', () => {
    const o = new PitchOsc({ rate: 1, from: 5, range: 10, waveform: 'sine' });
    for (let i = 0; i < 100; i++) {
        o.advance(0.01);
        const v = o.sample();
        assert.ok(v >= 5 - 1e-9 && v <= 15 + 1e-9, `out of range: ${v}`);
    }
});
t('saw bei phase 0 = unteres Ende, bei 0.5 = Mitte', () => {
    const o = new PitchOsc({ from: 0, range: 12, waveform: 'saw' });
    o.phase = 0; assert.ok(approx(o.sample(), 0, 1e-9));
    o.phase = 0.5; assert.ok(approx(o.sample(), 6, 1e-9));
});
t('rate steuert Phasenfortschritt', () => {
    const o = new PitchOsc({ rate: 2 });
    o.advance(0.25); assert.ok(approx(o.phase, 0.5, 1e-9));
});

console.log('GateOsc');
t('disabled → immer offen', () => {
    const g = new GateOsc({ enabled: false });
    assert.equal(g.isOpen(), true);
});
t('width 0.5 → erste Hälfte offen, zweite zu', () => {
    const g = new GateOsc({ rate: 1, width: 0.5, enabled: true });
    g.phase = 0.25; assert.equal(g.isOpen(), true);
    g.phase = 0.75; assert.equal(g.isOpen(), false);
});

console.log('pulseWave');
t('DC = 0', () => {
    const { real, imag } = pulseCoefficients(0.5, 0, 32);
    assert.equal(real[0], 0); assert.equal(imag[0], 0);
});
t('duty 0.5: gerade Harmonische ~0', () => {
    const { real, imag } = pulseCoefficients(0.5, 0, 16);
    for (let n = 2; n < 16; n += 2) {
        assert.ok(Math.hypot(real[n], imag[n]) < 1e-6, `n=${n} nicht null`);
    }
});
t('Betrag der Koeffizienten phasen-invariant', () => {
    const a = pulseCoefficients(0.3, 0, 16);
    const b = pulseCoefficients(0.3, 0.37, 16);
    for (let n = 1; n < 16; n++) {
        const ma = Math.hypot(a.real[n], a.imag[n]);
        const mb = Math.hypot(b.real[n], b.imag[n]);
        assert.ok(approx(ma, mb, 1e-6), `n=${n}: ${ma} vs ${mb}`);
    }
});
t('harmonicsForFreq: tiefer Ton mehr Harmonische als hoher', () => {
    assert.ok(harmonicsForFreq(50, 48000) > harmonicsForFreq(2000, 48000));
});
t('harmonicsForFreq: Subbass mit hohem Cap → viele Obertöne (scharfe Ecken)', () => {
    // 20 Hz @ 44.1k: ~1102 Harmonische bis Nyquist, Cap 2048 lässt sie durch
    assert.ok(harmonicsForFreq(20, 44100, 2048) > 1000, 'zu wenig Obertöne im Subbass');
});
t('harmonicsForFreq: hoher Ton bleibt bandlimitiert (kein Aliasing)', () => {
    assert.ok(harmonicsForFreq(4000, 44100, 2048) <= 6);
});

// Hilfen: Signal durch den Filter schicken und Spitzenamplitude nach Einschwingen messen.
const SR = 48000;
function peakResponse(poles, fcHz, sigHz, q = 0.707, n = 8192) {
    const core = new LadderCore(poles);
    const g = prewarp(fcHz, SR);
    const R = resToDamping(q);
    let peak = 0;
    for (let i = 0; i < n; i++) {
        const x = Math.sin(2 * Math.PI * sigHz * i / SR);
        const y = core.tick(x, g, R);
        if (i > n / 2) peak = Math.max(peak, Math.abs(y)); // zweite Hälfte = eingeschwungen
    }
    return peak;
}

console.log('LadderCore (TPT)');
t('prewarp monoton steigend mit Cutoff', () => {
    assert.ok(prewarp(200, SR) < prewarp(2000, SR));
    assert.ok(prewarp(2000, SR) < prewarp(8000, SR));
});
t('DC passiert (Gain → 1) bei 1p und 2p', () => {
    for (const poles of [1, 2]) {
        const core = new LadderCore(poles);
        const g = prewarp(500, SR), R = resToDamping(0.707);
        let y = 0;
        for (let i = 0; i < 40000; i++) y = core.tick(1, g, R);
        assert.ok(approx(y, 1, 1e-3), `${poles}p DC-Gain ${y}`);
    }
});
t('echte Pol-Steilheit: 1p > 2p > 3p > 4p oberhalb Cutoff', () => {
    const p1 = peakResponse(1, 1000, 8000);
    const p2 = peakResponse(2, 1000, 8000);
    const p3 = peakResponse(3, 1000, 8000);
    const p4 = peakResponse(4, 1000, 8000);
    assert.ok(p1 > p2 && p2 > p3 && p3 > p4, `Dämpfung nicht monoton: ${p1.toFixed(5)} ${p2.toFixed(5)} ${p3.toFixed(5)} ${p4.toFixed(5)}`);
    // jede Stufe ~6 dB mehr → 4p dämpft drastisch stärker als 1p
    assert.ok(p1 / p4 > 8, `4p sollte deutlich stärker dämpfen (Verhältnis ${(p1 / p4).toFixed(1)})`);
});
t('Resonanz wirkt ab 2p, nicht bei 1p', () => {
    const a = peakResponse(1, 1000, 1000, 0.707);
    const b = peakResponse(1, 1000, 1000, 18);
    assert.ok(approx(a, b, 1e-9), '1p darf nicht resonieren');
    const c = peakResponse(2, 1000, 1000, 0.707);
    const d = peakResponse(2, 1000, 1000, 18);
    assert.ok(d > c * 2, `2p-Resonanz sollte Pegel an fc klar anheben (${c.toFixed(3)} → ${d.toFixed(3)})`);
});
t('bleibt stabil (kein NaN/Inf) bei extremer Resonanz', () => {
    const core = new LadderCore(4);
    const g = prewarp(1000, SR), R = resToDamping(20);
    let y = 0;
    for (let i = 0; i < 40000; i++) y = core.tick(Math.sin(i * 0.01), g, R);
    assert.ok(Number.isFinite(y), `instabil: ${y}`);
});

// Multimode-Antwort (Typ) messen: Signal durch den Filter, Spitze nach Einschwingen.
function typedPeak(type, fcHz, sigHz, q = 0.707, n = 8192) {
    const core = new LadderCore(4, type);
    const g = prewarp(fcHz, SR), R = resToDamping(q);
    let peak = 0;
    for (let i = 0; i < n; i++) {
        const x = Math.sin(2 * Math.PI * sigHz * i / SR);
        const y = core.tick(x, g, R);
        if (i > n / 2) peak = Math.max(peak, Math.abs(y));
    }
    return peak;
}

console.log('Filter-Typen (HP/BP)');
t('HP: dämpft tiefe, passt hohe Frequenzen', () => {
    const lo = typedPeak('HP', 1000, 100);
    const hi = typedPeak('HP', 1000, 8000);
    assert.ok(hi > lo * 4, `HP sollte hoch >> tief durchlassen (${lo.toFixed(4)} → ${hi.toFixed(4)})`);
});
t('HP: DC wird geblockt (Gain → 0)', () => {
    const core = new LadderCore(2, 'HP');
    const g = prewarp(500, SR), R = resToDamping(0.707);
    let y = 0;
    for (let i = 0; i < 40000; i++) y = core.tick(1, g, R);
    assert.ok(Math.abs(y) < 1e-3, `HP-DC-Gain sollte ~0 sein: ${y}`);
});
t('BP: Peak bei fc, gedämpft weit darüber/darunter', () => {
    const atFc = typedPeak('BP', 1000, 1000);
    const below = typedPeak('BP', 1000, 60);
    const above = typedPeak('BP', 1000, 12000);
    assert.ok(atFc > below * 2 && atFc > above * 2, `BP-Peak nicht bei fc (${below.toFixed(4)} < ${atFc.toFixed(4)} > ${above.toFixed(4)})`);
});
t('Ladder-org: SVF-Lowpass, DC passiert (Gain → 1)', () => {
    // Der einzige verbliebene „Ladder": Ur-SVF-Lowpass, fest 4-polig (kein Moog-k mehr).
    const core = new LadderCore(4, 'Ladder-org');
    const g = prewarp(500, SR), R = resToDamping(0.707);
    let y = 0;
    for (let i = 0; i < 40000; i++) y = core.tick(1, g, R);
    assert.ok(approx(y, 1, 1e-2), `Ladder-org-DC-Gain ${y}`);
});
t('Ladder-org: dämpft oberhalb fc (4-polig, stabil)', () => {
    const hi = typedPeak('Ladder-org', 1000, 8000);
    assert.ok(Number.isFinite(hi) && hi < 0.2, `Ladder-org sollte hoch stark dämpfen: ${hi.toFixed(4)}`);
});

console.log('FFT');
t('cos bei Bin 3 → Energie nur bei Bin 3', () => {
    const M = 64;
    const re = new Float64Array(M), im = new Float64Array(M);
    for (let i = 0; i < M; i++) re[i] = Math.cos(2 * Math.PI * 3 * i / M);
    fft(re, im, -1);
    assert.ok(approx(re[3], M / 2, 1e-6), `Bin3 Re ${re[3]}`);
    assert.ok(approx(Math.hypot(re[5], im[5]), 0, 1e-6), 'Bin5 sollte leer sein');
});
t('Länge nicht-2er-Potenz wirft', () => {
    assert.throws(() => fft(new Float64Array(48), new Float64Array(48)));
});

console.log('Phase-Distortion');
t('phaseWarp: Endpunkte fix, neutral = Identität', () => {
    for (const pw of [0, 0.3, 0.5, 0.8, 1]) {
        assert.ok(approx(phaseWarp(0, pw), 0, 1e-9));
        assert.ok(approx(phaseWarp(1, pw), 1, 1e-9));
    }
    assert.ok(approx(phaseWarp(0.37, 0.5), 0.37, 1e-9), 'pw=0.5 muss linear sein');
});
t('phaseWarp: Richtung gemäß Skizze (<0.5 untere, >0.5 obere Kurve)', () => {
    assert.ok(phaseWarp(0.3, 0.2) < 0.3, 'pw<0.5 → unter der Diagonale');
    assert.ok(phaseWarp(0.3, 0.8) > 0.3, 'pw>0.5 → über der Diagonale');
});
t('warpedCoefficients: neutrale Sine = reiner Grundton', () => {
    const c = warpedCoefficients('sine', 0.5, 0, 16);
    assert.ok(approx(c.imag[1], 1, 1e-3), `Grundton-Sin ${c.imag[1]}`);
    assert.ok(approx(c.real[1], 0, 1e-3), 'kein Cos-Anteil');
    for (let n = 2; n < 16; n++) {
        assert.ok(approx(Math.hypot(c.real[n], c.imag[n]), 0, 1e-3), `Oberton ${n} sollte 0 sein`);
    }
});
t('warpedCoefficients: Verbiegung erzeugt Obertöne (Sine wird reicher)', () => {
    const neutral = warpedCoefficients('sine', 0.5, 0, 16);
    const bent = warpedCoefficients('sine', 0.15, 0, 16);
    const energy = (c) => { let e = 0; for (let n = 2; n < 16; n++) e += c.real[n] ** 2 + c.imag[n] ** 2; return e; };
    assert.ok(energy(bent) > energy(neutral) + 0.01, 'verbogene Sine muss Obertöne haben');
});
t('fmCoefficients: Feedback 0 = reiner Sinus', () => {
    const c = fmCoefficients(0, 0, 16);
    assert.ok(approx(c.imag[1], 1, 1e-3), `Grundton ${c.imag[1]}`);
    for (let n = 2; n < 16; n++) {
        assert.ok(approx(Math.hypot(c.real[n], c.imag[n]), 0, 1e-3), `Oberton ${n} sollte 0 sein`);
    }
});
t('fmCoefficients: mehr Feedback → mehr Obertöne (Richtung Sägezahn)', () => {
    const energy = (c) => { let e = 0; for (let n = 2; n < 16; n++) e += c.real[n] ** 2 + c.imag[n] ** 2; return e; };
    const low = fmCoefficients(0.2, 0, 16);
    const high = fmCoefficients(0.9, 0, 16);
    assert.ok(energy(high) > energy(low) + 0.01, 'mehr Feedback muss mehr Obertöne bringen');
});

t('metroClick: endliche Werte, Transient am peakIndex, Bypass in der Mitte', () => {
    const { data, peakIndex } = renderMetroClick({ sampleRate: 48000, morph: 0.5 });
    assert.ok(data.length > peakIndex && peakIndex >= 1, 'peakIndex plausibel');
    assert.ok(data.every(Number.isFinite), 'alle Samples endlich');
    // Vorschwinger negativ, Haupt-Transient klar der Betrags-Peak.
    assert.ok(data[peakIndex - 1] <= 0, 'Vorschwinger ist eine Gegenauslenkung');
    let maxI = 0, maxA = 0;
    for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > maxA) { maxA = a; maxI = i; } }
    assert.equal(maxI, peakIndex, 'Betrags-Peak liegt auf dem Transienten');
});
t('metroClick: HP ist schärfer als LP (Morph wirkt)', () => {
    // Breitbandiger Knack: HP betont die scharfe Flanke (viel HF), LP glättet sie.
    // Erste-Differenz-Energie ≈ Hochfrequenz-Anteil.
    const hf = (morph) => {
        const { data } = renderMetroClick({ sampleRate: 48000, morph, cutoff: 1500, reso: 1 });
        let e = 0; for (let i = 1; i < data.length; i++) { const d = data[i] - data[i - 1]; e += d * d; }
        return e;
    };
    assert.ok(hf(0.0) < hf(1.0), 'Lowpass muss weniger HF haben als Highpass');
});

console.log('StepSeq (Filter-/Amp-Sequenzer)');
t('makeSeqSteps: first → nur Step 0 = 1, Länge SEQ_MAX', () => {
    const a = makeSeqSteps('first');
    assert.equal(a.length, SEQ_MAX);
    assert.equal(a[0], 1);
    assert.ok(a.slice(1).every((v) => v === 0));
});
t('makeSeqSteps: full → alles 1', () => {
    const a = makeSeqSteps('full');
    assert.ok(a.every((v) => v === 1));
});
t('seqAdvance: -1 → 0 (erster Trigger), dann Ringlauf mod length', () => {
    assert.equal(seqAdvance(-1, 7, false), 0);
    assert.equal(seqAdvance(5, 7, false), 6);
    assert.equal(seqAdvance(6, 7, false), 0);   // wrap
});
t('seqAdvance: reset erzwingt 0 (set0)', () => {
    assert.equal(seqAdvance(3, 7, true), 0);
    assert.equal(seqAdvance(6, 16, true), 0);
});
t('seqAdvance: length wird auf 1..SEQ_MAX geklemmt', () => {
    assert.equal(seqAdvance(0, 0, false), 0);    // len<1 → 1 → bleibt 0
    assert.equal(seqAdvance(-1, 999, false), 0);
});
/* ── Dyn (@dpa 20260716_164359): 0 = alles 100 % · 100 = wie eingestellt · 200 = volle
      Dynamik (>50 %→100 %, <50 %→min, NICHT aus). Die drei Punkte sind @dpas Ansage –
      sie stehen hier einzeln, damit eine spätere Kurven-Idee sie nicht still verbiegt. ── */
t('seqDyn: 0 = alles 100 % (jeder Ton gleich laut)', () => {
    assert.equal(seqDyn(1, 0), 1);
    assert.equal(seqDyn(0.5, 0), 1);
    assert.equal(seqDyn(0.01, 0), 1);
});
t('seqDyn: 100 = wie eingestellt (roher Step-Wert)', () => {
    assert.equal(seqDyn(1, 100), 1);
    assert.equal(seqDyn(0.5, 100), 0.5);
    assert.equal(seqDyn(0.2, 100), 0.2);
});
t('seqDyn: 200 = volle Dynamik – >50 % auf 100 %, <50 % auf min (nicht aus)', () => {
    assert.equal(seqDyn(1, 200), 1);
    assert.equal(seqDyn(0.6, 200), 1);
    assert.equal(seqDyn(0.5, 200), 1);          // die Hälfte zählt nach oben
    assert.equal(seqDyn(0.4, 200), SEQ_DYN_MIN);
    assert.equal(seqDyn(0.05, 200), SEQ_DYN_MIN);
    assert.ok(SEQ_DYN_MIN > 0, 'min darf nie 0 sein – „nicht aus!"');
});
t('seqDyn: Step 0 bleibt 0 – Dyn erfindet keine Töne', () => {
    // Sonst machte dyn=0 („alles 100 %") aus jeder Pause einen Ton.
    assert.equal(seqDyn(0, 0), 0);
    assert.equal(seqDyn(0, 100), 0);
    assert.equal(seqDyn(0, 200), 0);
});
t('seqDyn: stetig – kein Sprung an den Stützstellen, monoton dazwischen', () => {
    const v = 0.25;
    // 0 → 100: von 1 auf v
    assert.ok(Math.abs(seqDyn(v, 50) - (1 + (v - 1) * 0.5)) < 1e-9);
    // 100 → 200: von v auf min
    assert.ok(Math.abs(seqDyn(v, 150) - (v + (SEQ_DYN_MIN - v) * 0.5)) < 1e-9);
    // An der Naht muss beides denselben Wert liefern.
    assert.equal(seqDyn(v, 100), v);
});
t('seqDyn: Dyn wird auf 0..200 geklemmt, fehlender Wert = neutral', () => {
    assert.equal(seqDyn(0.5, -50), 1);      // wie 0
    assert.equal(seqDyn(0.5, 999), 1);      // wie 200 (0.5 zählt nach oben)
    assert.equal(seqDyn(0.5, undefined), 0.5);  // Default 100 = eingestellt
});
t('fillSeq: sichtbares Muster kachelt den unsichtbaren Rest', () => {
    const s = makeSeqSteps('first'); // [1,0,0,...]
    s[1] = 0.5;                      // Muster der ersten 3: [1, 0.5, 0]
    const out = fillSeq(s, 3);
    assert.equal(out.length, SEQ_MAX);
    // Erste 3 unverändert
    assert.deepEqual(out.slice(0, 3), [1, 0.5, 0]);
    // Danach Wiederholung: [1,0.5,0, 1,0.5,0, …]
    assert.deepEqual(out.slice(3, 9), [1, 0.5, 0, 1, 0.5, 0]);
});
t('fillSeq: liefert neuen Array (Immutabilität)', () => {
    const s = makeSeqSteps('full');
    const out = fillSeq(s, 4);
    assert.notEqual(out, s);
    assert.ok(out.every((v) => v === 1));
});

console.log('PitchOsc random (eingezäumtes, wiederholendes Muster)');
t('random wiederholt sich pro Periode identisch (gleiche Phase → gleicher Wert)', () => {
    const p = new PitchOsc({ waveform: 'random', rate: 1, range: 8, seed: 5 });
    // Werte an denselben Phasen in Periode 1 und Periode 2 vergleichen.
    const per1 = [];
    for (let i = 0; i < 8; i++) { p.phase = i / 8 + 0.01; per1.push(p.sampleUnipolar()); }
    const per2 = [];
    for (let i = 0; i < 8; i++) { p.phase = i / 8 + 0.01; per2.push(p.sampleUnipolar()); }
    assert.deepEqual(per1, per2);
    // Es gibt mehrere verschiedene Stufen (kein Stehen auf einem Wert).
    assert.ok(new Set(per1).size > 1, 'Muster muss mehrere Stufen haben');
});
t('random: gleicher Seed = gleiches Muster, anderer Seed = anderes', () => {
    const mk = (seed) => { const p = new PitchOsc({ waveform: 'random', range: 8, seed }); const o = []; for (let i = 0; i < 8; i++) { p.phase = i / 8; o.push(p.sampleUnipolar()); } return o; };
    assert.deepEqual(mk(5), mk(5));
    assert.notDeepEqual(mk(5), mk(9));
});
t('random: Auflösung folgt der Range (mehr Stufen bei größerer Range)', () => {
    const steps = (range) => { const p = new PitchOsc({ waveform: 'random', range, seed: 3 }); const s = new Set(); for (let i = 0; i < 200; i++) { p.phase = i / 200; s.add(p.sampleUnipolar()); } return s.size; };
    assert.ok(steps(24) > steps(4), 'größere Range → feinere Auflösung');
});

console.log('rateFraction (Rate als Bruch k/l der Base)');
t('exakter Bruch wird exakt gefunden (3/2)', () => {
    const f = bestFraction(1.5, 8, 8);
    assert.equal(f.k, 3); assert.equal(f.l, 2);
});
t('ganzzahliges Verhältnis → l=1', () => {
    const f = bestFraction(4, 8, 8);
    assert.equal(f.k, 4); assert.equal(f.l, 1);
});
t('Bruch wird gekürzt (6/4 → 3/2)', () => {
    assert.deepEqual(reduce(6, 4), { k: 3, l: 2 });
    const f = bestFraction(1.5, 12, 12);
    assert.equal(f.k, 3); assert.equal(f.l, 2);
});
t('Maxima begrenzen Zähler/Nenner (π ≈ mit kMax=3,lMax=1)', () => {
    const f = bestFraction(Math.PI, 3, 1);   // nur k/1 erlaubt → 3/1
    assert.equal(f.k, 3); assert.equal(f.l, 1);
});
t('bessere Approximation bei größeren Maxima (π: 22/7)', () => {
    const f = bestFraction(Math.PI, 40, 10);
    assert.ok(Math.abs(f.k / f.l - Math.PI) <= Math.abs(3 - Math.PI), 'muss näher als 3 sein');
});
t('0.5 → 1/2', () => {
    const f = bestFraction(0.5, 8, 8);
    assert.equal(f.k, 1); assert.equal(f.l, 2);
});

console.log('wavEncoder (Debug-Rekorder, C7)');
t('RIFF/WAVE-Header korrekt, Byte-Länge = 44 + n·2', () => {
    const n = 100;
    const bytes = encodeWav(new Float32Array(n), 48000);
    assert.equal(bytes.length, 44 + n * 2);
    const s = String.fromCharCode(...bytes.slice(0, 4));
    assert.equal(s, 'RIFF');
    assert.equal(String.fromCharCode(...bytes.slice(8, 12)), 'WAVE');
});
t('Samplerate rundtrip-fest', () => {
    const bytes = encodeWav(new Float32Array(10), 44100);
    const { sampleRate } = decodeWav(bytes);
    assert.equal(sampleRate, 44100);
});
t('Samples rundtrip (Quantisierungsfehler < 1/1000)', () => {
    const src = new Float32Array(200);
    for (let i = 0; i < src.length; i++) src[i] = Math.sin(2 * Math.PI * 5 * i / src.length);
    const { samples } = decodeWav(encodeWav(src, 48000));
    assert.equal(samples.length, src.length);
    for (let i = 0; i < src.length; i++) assert.ok(approx(samples[i], src[i], 1e-3), `Sample ${i}: ${samples[i]} ≠ ${src[i]}`);
});
t('Clipping: Werte außerhalb ±1 werden geklemmt (kein Überlauf/NaN)', () => {
    const { samples } = decodeWav(encodeWav(new Float32Array([2, -2, 0]), 48000));
    assert.ok(approx(samples[0], 1, 1e-3) && approx(samples[1], -1, 1e-3) && samples[2] === 0);
});

console.log('Filter-Modulation (Keytrack + Env-Peak)');
t('Keytrack 100 %: Oktave gespielt → Oktave Cutoff (multiplikativ)', () => {
    assert.ok(approx(keytrackCutoff(1000, 100, 440, 220), 2000)); // Freq ×2 → Cutoff ×2
    assert.ok(approx(keytrackCutoff(1000, 100, 110, 220), 500));  // Freq ÷2 → Cutoff ÷2
    assert.ok(approx(keytrackCutoff(1000, 100, 220, 220), 1000)); // an der Referenz = Knopfwert
});
t('Keytrack 0 % = nur Cutoff (kein Tracking)', () => {
    assert.equal(keytrackCutoff(1000, 0, 440, 220), 1000);
});
t('Keytrack 50 % = halbe Steigung (2 Okt Freq → 1 Okt Cutoff)', () => {
    assert.ok(approx(keytrackCutoff(1000, 50, 880, 220), 2000)); // Freq ×4 @50% → Cutoff ×2
});
t('Keytrack klemmt auf [20, 20000] Hz', () => {
    assert.equal(keytrackCutoff(10, 0, 100, 220), 20);
    assert.equal(keytrackCutoff(1000, 100, 800000, 220), 20000);
});
t('Env-Mult: lpEnv 0 → Multiplikator 1 (keine Modulation)', () => {
    assert.ok(approx(envPeakMult(0, 1), 1));
});
t('Env-Mult: lpEnv>0 öffnet (>1), <0 schließt (<1); ±1 = ±octaves', () => {
    assert.ok(envPeakMult(0.5, 1) > 1, 'positiv soll öffnen');
    assert.ok(envPeakMult(-0.5, 1) < 1, 'negativ soll schließen');
    assert.ok(approx(envPeakMult(1, 1, 6), 64));    // +6 Okt = ×2^6
    assert.ok(approx(envPeakMult(-1, 1, 6), 1 / 64)); // −6 Okt
    assert.ok(approx(envPeakMult(0.5, 1, 6), 8));   // +3 Okt
});

console.log('Backup');
const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3, WEEK = 7 * DAY;
t('thin: max 2 innerhalb 1 Min', () => {
    const now = 1_000_000_000_000;
    const list = [0, 5e3, 10e3, 20e3, 40e3].map((d) => ({ ts: now - d }));   // 5 in der letzten Minute
    const keep = thinBackups(list, now);
    assert.equal(keep.filter((b) => now - b.ts < MIN).length, 2);
});
t('thin: max 5 innerhalb 1 Std (inkl. Minuten-Backups)', () => {
    const now = 2_000_000_000_000;
    const list = [];
    for (let i = 0; i < 3; i++) list.push({ ts: now - i * 10e3 });          // 3 in der Minute → nur 2 bleiben
    for (let i = 1; i <= 10; i++) list.push({ ts: now - (MIN + i * 60e3) }); // 10 in der Stunde
    const keep = thinBackups(list, now);
    assert.equal(keep.filter((b) => now - b.ts < HOUR).length, 5);
});
t('thin: 1 pro Tag zwischen 1 Std und 1 Woche', () => {
    const now = 3 * WEEK;   // Tag-Buckets sauber am Epoch-Raster
    const list = [];
    for (let d = 0; d < 4; d++) for (let k = 0; k < 3; k++) list.push({ ts: now - (2 * HOUR + d * DAY + k * 1000) });
    const keep = thinBackups(list, now).filter((b) => { const a = now - b.ts; return a >= HOUR && a < WEEK; });
    assert.equal(keep.length, 4);   // 4 Tage → 4 Backups
});
t('thin: 1 pro Woche ab 1 Woche', () => {
    const now = 10 * WEEK + 3 * DAY;   // Wochenmitte → Backups liegen sauber je in einem Bucket
    const list = [];
    for (let w = 1; w <= 3; w++) for (let k = 0; k < 3; k++) list.push({ ts: now - (w * WEEK + k * 1000) });
    const keep = thinBackups(list, now).filter((b) => now - b.ts >= WEEK);
    assert.equal(keep.length, 3);   // 3 Wochen → 3 Backups
});
// Fake-Storage für capture/restore/push
function fakeStorage(init = {}) {
    const m = new Map(Object.entries(init));
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
        _map: m,
    };
}
t('capture/restore: Roundtrip aller Keys', () => {
    const s = fakeStorage({ teslacoil_live: '{"a":1}', teslacoil_snapshots: '[1,2]' });
    const snap = captureState(s);
    s.setItem('teslacoil_live', '{"a":2}'); s.setItem('teslacoil_scales', '["x"]');
    restoreState(s, snap);
    assert.equal(s.getItem('teslacoil_live'), '{"a":1}');
    assert.equal(s.getItem('teslacoil_scales'), null);   // war im Backup nicht vorhanden → entfernt
});
t('pushBackup: legt Eintrag mit Daten an und dünnt', () => {
    const s = fakeStorage({ teslacoil_live: '{"v":1}' });
    pushBackup(s, 100, 'test');
    const list = readBackups(s);
    assert.equal(list.length, 1);
    assert.equal(list[0].label, 'test');
    assert.equal(list[0].data.teslacoil_live, '{"v":1}');
    assert.ok(BACKED_UP_KEYS.includes('teslacoil_live'));
});

console.log('Datei-Zugang: Backup-Datei (@dpa 20260715)');
t('serialize → parse: Roundtrip erhält alle Daten', () => {
    const s = fakeStorage({ teslacoil_live: '{"a":1}', teslacoil_snapshots: '[{"name":"x"}]' });
    const file = serializeBackup(s, 4242, 'Export');
    assert.equal(file.kind, FILE_KIND);
    const got = parseBackupFile(JSON.stringify(file));
    assert.equal(got.ts, 4242);
    assert.equal(got.label, 'Export');
    assert.deepEqual(got.data, { teslacoil_live: '{"a":1}', teslacoil_snapshots: '[{"name":"x"}]' });
});
t('parse → restore: Datei stellt den Zustand wirklich her', () => {
    const src = fakeStorage({ teslacoil_live: '{"v":7}', teslacoil_layouts: '["L"]' });
    const text = JSON.stringify(serializeBackup(src, 1, ''));
    const dst = fakeStorage({ teslacoil_live: '{"v":999}' });
    restoreState(dst, parseBackupFile(text).data);
    assert.equal(dst.getItem('teslacoil_live'), '{"v":7}');
    assert.equal(dst.getItem('teslacoil_layouts'), '["L"]');
});
t('lehnt kaputtes JSON ab', () => assert.throws(() => parseBackupFile('{nope'), /gültige JSON/));
t('lehnt fremdes JSON ab', () => assert.throws(() => parseBackupFile('{"hallo":1}'), /keine teslacoil-Backup-Datei/));
t('lehnt Array ab', () => assert.throws(() => parseBackupFile('[1,2]'), /kein Backup-Objekt/));
t('erkennt Snapshot-Datei und sagt, wo sie hingehört', () => {
    assert.throws(() => parseBackupFile('{"name":"a","state":{"bpm":120}}'), /Snapshot-Datei, kein Backup/);
});
t('lehnt neuere Dateiversion ab', () => {
    assert.throws(() => parseBackupFile(JSON.stringify({ kind: FILE_KIND, version: 99, data: { teslacoil_live: '{}' } })), /neueren teslacoil-Version/);
});
t('lehnt Backup ohne bekannte Keys ab', () => {
    assert.throws(() => parseBackupFile(JSON.stringify({ kind: FILE_KIND, version: 1, data: { fremd: 'x' } })), /keine bekannten teslacoil-Daten/);
});
t('ignoriert Fremd-Keys und Nicht-Strings in data', () => {
    const got = parseBackupFile(JSON.stringify({ kind: FILE_KIND, version: 1, ts: 5, data: { teslacoil_live: '{"a":1}', teslacoil_scales: { boese: true }, evil: 'x' } }));
    assert.deepEqual(Object.keys(got.data), ['teslacoil_live']);   // Objekt-Wert + Fremd-Key raus
});

console.log('Datei-Zugang: Snapshot-Datei (@dpa 20260715)');
t('parse: Name und Zustand kommen an', () => {
    const got = PresetManager.parseSnapshotFile('{"kind":"teslacoil-snapshot","name":"Fiep","state":{"bpm":128}}');
    assert.equal(got.name, 'Fiep');
    assert.deepEqual(got.state, { bpm: 128 });
});
t('akzeptiert Alt-Export ohne kind (Rückwärtskompatibilität)', () => {
    const got = PresetManager.parseSnapshotFile('{"name":"Alt","ts":1,"version":1,"state":{"bpm":90}}');
    assert.equal(got.name, 'Alt');
});
t('wirft Optik-Keys raus (Snapshot darf NIE das Layout anfassen)', () => {
    const got = PresetManager.parseSnapshotFile(JSON.stringify({ name: 'X', state: { bpm: 100, groupOrder: ['a'], knobMeta: { x: 1 }, snapSel: 'foo' } }));
    assert.deepEqual(got.state, { bpm: 100 });
});
t('leerer Name → "Import"', () => {
    assert.equal(PresetManager.parseSnapshotFile('{"name":"  ","state":{"bpm":1}}').name, 'Import');
});
t('erkennt Backup-Datei und sagt, wo sie hingehört', () => {
    assert.throws(() => PresetManager.parseSnapshotFile(JSON.stringify({ kind: FILE_KIND, data: { teslacoil_live: '{}' } })), /Backup-Datei, kein Snapshot/);
});
t('lehnt kaputtes JSON / leeren State ab', () => {
    assert.throws(() => PresetManager.parseSnapshotFile('{nope'), /gültige JSON/);
    assert.throws(() => PresetManager.parseSnapshotFile('{"name":"x","state":{}}'), /leer/);
});
t('lehnt fremde kind-Kennung ab', () => {
    assert.throws(() => PresetManager.parseSnapshotFile('{"kind":"was-anderes","name":"x","state":{"bpm":1}}'), /keine teslacoil-Snapshot-Datei/);
});
t('Optik-Snapshot-Datei mit NUR Optik-Keys → leerer Sound-State, klare Absage', () => {
    // Grenzfall: Datei enthält ausschließlich Layout-Keys → nach dem Strippen bleibt
    // nichts übrig. Darf nicht als „leerer Snapshot" durchrutschen und alles platt machen.
    assert.throws(() => PresetManager.parseSnapshotFile(JSON.stringify({ name: 'NurOptik', state: { groupOrder: ['a'] } })), /leer/);
});

console.log('Umbenennen (@dpa 20260717)');
t('benennt um und lässt den Rest des Eintrags in Ruhe', () => {
    const list = [{ name: 'A', state: { bpm: 90 } }, { name: 'B', state: { bpm: 120 } }];
    assert.equal(PresetManager.renameIn(list, 1, 'Bumms'), '');
    assert.deepEqual(list[1], { name: 'Bumms', state: { bpm: 120 } });
    assert.equal(list[0].name, 'A');
});
t('Name ist der Schlüssel: schon vergeben → Absage statt stiller Verschmelzung', () => {
    // Ohne diese Regel würde der Upsert beim nächsten Speichern zwei Einträge zu einem
    // machen – ein Snapshot wäre weg, ohne dass jemand danach gefragt wurde.
    const list = [{ name: 'A' }, { name: 'B' }];
    assert.match(PresetManager.renameIn(list, 1, 'A'), /schon einen Eintrag/);
    assert.equal(list[1].name, 'B');
});
t('leerer Name / nur Leerzeichen → Absage', () => {
    const list = [{ name: 'A' }];
    assert.match(PresetManager.renameIn(list, 0, '   '), /nicht leer/);
    assert.equal(list[0].name, 'A');
});
t('gleicher Name = nichts zu tun (kein Fehler)', () => {
    const list = [{ name: 'A' }];
    assert.equal(PresetManager.renameIn(list, 0, 'A'), '');
});
t('trimmt den neuen Namen (Tippfehler beim Abtippen)', () => {
    const list = [{ name: 'A' }];
    assert.equal(PresetManager.renameIn(list, 0, '  Neu  '), '');
    assert.equal(list[0].name, 'Neu');
});
t('unbekannter Index → Absage, Liste unverändert', () => {
    const list = [{ name: 'A' }];
    assert.match(PresetManager.renameIn(list, 7, 'X'), /gibt es nicht mehr/);
    assert.equal(list.length, 1);
});

console.log('Werkseinstellung (@dpa 20260715)');
t('hasUserState: leerer Speicher = Erstbesuch', () => {
    assert.equal(hasUserState(fakeStorage()), false);
});
t('hasUserState: EIN bekannter Key genügt → kein Erstbesuch', () => {
    assert.equal(hasUserState(fakeStorage({ teslacoil_live: '{}' })), true);
    assert.equal(hasUserState(fakeStorage({ teslacoil_snapshots: '[]' })), true);
});
t('hasUserState: fremde Keys zählen NICHT als Zustand', () => {
    assert.equal(hasUserState(fakeStorage({ irgendwas: 'x', teslacoil_backups: '[]' })), false);
});
ta('fetchFactory: liefert geprüfte Daten', async () => {
    const file = JSON.stringify({ kind: FILE_KIND, version: 1, ts: 7, label: 'Werkseinstellung', data: { teslacoil_live: '{"bpm":91}' } });
    const got = await fetchFactory('x.json', async () => ({ ok: true, text: async () => file }));
    assert.equal(got.data.teslacoil_live, '{"bpm":91}');
});
ta('fetchFactory: 404 → null (Synth bootet trotzdem)', async () => {
    assert.equal(await fetchFactory('x.json', async () => ({ ok: false })), null);
});
ta('fetchFactory: Netzfehler → null', async () => {
    assert.equal(await fetchFactory('x.json', async () => { throw new Error('offline'); }), null);
});
ta('fetchFactory: kaputte Datei → null (kein halber Zustand)', async () => {
    assert.equal(await fetchFactory('x.json', async () => ({ ok: true, text: async () => '{kaputt' })), null);
});

console.log('Atmende Hinweise: frisch in der Werkseinstellung (@dpa 20260717)');
t('withFreshHints: die Zähler fliegen aus dem Boot-Zustand', () => {
    // Der Sinn der Übung: @dpas Export kennt Snapshot und Play längst – ein NEUER
    // Besucher soll den Hinweis trotzdem bekommen. Ohne das hätte niemand ihn je gesehen
    // außer dem, der ihn gebaut hat.
    const data = { teslacoil_live: JSON.stringify({ bpm: 120, snapOpened: 2, playUsed: 2 }) };
    const live = JSON.parse(withFreshHints(data).teslacoil_live);
    assert.equal(live.snapOpened, undefined);
    assert.equal(live.playUsed, undefined);
    assert.equal(live.bpm, 120);              // alles andere bleibt, wie es war
});
t('withFreshHints: rührt die Werkseinstellung nicht an (rein)', () => {
    const data = { teslacoil_live: JSON.stringify({ snapOpened: 2 }) };
    const before = data.teslacoil_live;
    withFreshHints(data);
    assert.equal(data.teslacoil_live, before);
});
t('withFreshHints: fehlender/kaputter Boot-Zustand → unverändert, kein Wurf', () => {
    assert.deepEqual(withFreshHints({}), {});
    assert.deepEqual(withFreshHints({ teslacoil_live: '{kaputt' }), { teslacoil_live: '{kaputt' });
    assert.deepEqual(withFreshHints(null), null);
});

console.log('fileIO (Namens-Helfer)');
t('safeFilename entschärft Sonderzeichen', () => {
    assert.equal(safeFilename('Mein Fiep/Sound!'), 'Mein_Fiep_Sound');
    assert.equal(safeFilename('äöü'), 'teslacoil');       // nichts Brauchbares → Fallback
    assert.equal(safeFilename('', 'fallback'), 'fallback');
});
t('fileStamp: YYYYMMDD_HHMMSS', () => {
    assert.equal(fileStamp(new Date(2026, 6, 15, 9, 5, 3)), '20260715_090503');
});

console.log('keyRoute (Tasten-Zuständigkeit)');
// Duck-typed Fakes – genau das, was targetKind() liest.
const el = (tag, extra = {}) => ({ tagName: tag, ...extra });
const withClass = (...cls) => ({ classList: { contains: (c) => cls.includes(c) } });

t('Texteingabe schluckt alles: input[text], number, textarea, contenteditable', () => {
    assert.equal(targetKind(el('INPUT', { type: 'text' })), 'text');
    assert.equal(targetKind(el('INPUT', { type: 'number' })), 'text');
    assert.equal(targetKind(el('INPUT')), 'text');            // type fehlt → default 'text'
    assert.equal(targetKind(el('TEXTAREA')), 'text');
    assert.equal(targetKind(el('DIV', { isContentEditable: true })), 'text');
});
t('pfeil-bediente Elemente: select, input[range], Knob', () => {
    assert.equal(targetKind(el('SELECT')), 'arrows');
    assert.equal(targetKind(el('INPUT', { type: 'range' })), 'arrows');
    assert.equal(targetKind(el('DIV', withClass('knob-container'))), 'arrows');
});
t('tastenlose Elemente: Checkbox, Button, Body', () => {
    assert.equal(targetKind(el('INPUT', { type: 'checkbox' })), 'none');
    assert.equal(targetKind(el('BUTTON')), 'none');
    assert.equal(targetKind(el('BODY')), 'none');
    assert.equal(targetKind(null), 'none');
});
// Der eigentliche Fehler aus dd.md 870: Menu-Switch/'aktiv' stellten Space+'e' tot.
t('870: Space/e leben auf fokussiertem Select (Menu-Switch)', () => {
    assert.equal(globalKeyOk(el('SELECT')), true);
});
t('870: Space/e leben auf fokussierter Checkbox (aktiv)', () => {
    assert.equal(globalKeyOk(el('INPUT', { type: 'checkbox' })), true);
});
t('870: Space/e leben auf fokussiertem Knob', () => {
    assert.equal(globalKeyOk(el('DIV', withClass('knob-container'))), true);
});
t('Space/e schweigen NUR beim echten Tippen', () => {
    assert.equal(globalKeyOk(el('INPUT', { type: 'text' })), false);
    assert.equal(globalKeyOk(el('TEXTAREA')), false);
});
t('Pfeile bleiben lokal bei Tippen UND bei Select/Slider/Knob', () => {
    assert.equal(arrowKeyOk(el('INPUT', { type: 'text' })), false);
    assert.equal(arrowKeyOk(el('SELECT')), false);
    assert.equal(arrowKeyOk(el('INPUT', { type: 'range' })), false);
    assert.equal(arrowKeyOk(el('DIV', withClass('knob-container'))), false);
});
t('Pfeile gehören global bei Checkbox/Button/Body (BaseFrq-Fernsteuerung)', () => {
    assert.equal(arrowKeyOk(el('INPUT', { type: 'checkbox' })), true);
    assert.equal(arrowKeyOk(el('BUTTON')), true);
    assert.equal(arrowKeyOk(el('BODY')), true);
});

console.log('holdSlide (Pitch-Slide im Amp-Hold)');
t('startet exakt bei from und kommt nach glide exakt bei to an', () => {
    const p = slidePlan(100, 200, 0.1);
    assert.equal(slideFreqAt(p, 0), 100);
    assert.equal(slideFreqAt(p, 0.1), 200);
    assert.equal(slideFreqAt(p, 0.5), 200);   // danach bleibt er dort (gekappt)
});
t('die LP-Kurve trifft das Ziel am Kapp-Punkt (das Kappen springt nicht)', () => {
    const p = slidePlan(100, 200, 0.1);
    // Das ist der ganze Sinn der Überhöhung k: die ungekappte e-Kurve steht bei t=glide
    // bereits AUF dem Ziel – setValueAtTime schneidet dort nichts ab, es setzt nur fest.
    const ungekappt = p.target + (p.from - p.target) * Math.exp(-p.glide / p.tau);
    assert.ok(Math.abs(ungekappt - 200) < 1e-9, `Sprung beim Kappen: ${ungekappt}`);
});
t('läuft monoton und liegt bei halber Zeit über der Hälfte (LP-Form, nicht linear)', () => {
    const p = slidePlan(100, 200, 0.1);
    let prev = -Infinity;
    for (let i = 0; i <= 10; i++) { const v = slideFreqAt(p, i * 0.01); assert.ok(v >= prev); prev = v; }
    assert.ok(slideFreqAt(p, 0.05) > 150);
});
t('abwärts genauso (Vorzeichen ist egal)', () => {
    const p = slidePlan(400, 100, 0.2);
    assert.equal(slideFreqAt(p, 0.2), 100);
    assert.ok(slideFreqAt(p, 0.1) < 250 && slideFreqAt(p, 0.1) > 100);
});
t('Retune MITTEN im Slide startet beim Ist-Wert, nicht beim alten Ziel', () => {
    // Der Fehler, der „Slide funktioniert nicht mehr" verursachte (@dpa 20260715_224643):
    // Anker war das alte ZIEL. Kommt der nächste Trigger vor dem Ende des Slides, ist der
    // Ton dort noch gar nicht – der Folge-Slide startete also von einem falschen Ort.
    const first = slidePlan(100, 200, 0.4);
    const ist = slideFreqAt(first, 0.1);                 // 1/4 durch → deutlich unter 200
    assert.ok(ist < 200 && ist > 100);
    const richtig = slidePlan(ist, 300, 0.4);            // neuer Slide ab Ist-Wert
    const falsch = slidePlan(first.to, 300, 0.4);        // alter Fehler: ab dem Ziel 200
    assert.equal(slideFreqAt(richtig, 0), ist);          // lückenlos an den Ton angeschlossen
    assert.ok(richtig.from < falsch.from);               // der falsche Anker sprang voraus
});
t('L liegt fest bei 0.2 (Slide-Form ist kein Regler mehr)', () => {
    assert.equal(SLIDE_L, 0.2);
    const p = slidePlan(100, 200, 0.1);
    assert.ok(Math.abs(p.tau - 0.1 / 0.2) < 1e-12);
});
t('glide 0 wird nicht gerechnet (harter Sprung ist Sache des Aufrufers)', () => {
    assert.equal(slideFreqAt(null, 0.1), null);
});

// ── Debug-Recorder: die zwei Slots (@dpa 20260716_031100) ───────────────────────
// Die Regeln gehören in DebugPanel, nicht in die UI – deshalb sind sie hier testbar.
// Die echten Recorder brauchen Web Audio → gegen Attrappen getauscht (der Konstruktor
// von DebugPanel fasst den ctx nicht an, nur seine Methoden täten es).
function makeDbg() {
    const ctx = { sampleRate: 48000 };
    const engine = { ctx, master: { volume: {} } };
    const dbg = new DebugPanel({ get: () => '' }, engine);
    const fake = (len) => ({
        recording: false,
        start() { this.recording = true; },
        stop() { this.recording = false; return new Float32Array(len); },
    });
    dbg.slots.a.rec = fake(4800);    // 0.1 s
    dbg.slots.b.rec = fake(9600);    // 0.2 s
    return dbg;
}
t('Debug: ein Start nimmt auf, ein zweiter Klick stoppt', () => {
    const d = makeDbg();
    assert.equal(d.toggle('a'), null);
    assert.equal(d.recording('a'), true);
    assert.equal(d.toggle('a'), 0.1);
    assert.equal(d.recording('a'), false);
});
t('Debug: NIEMALS nehmen beide gleichzeitig auf', () => {
    const d = makeDbg();
    d.toggle('a');
    d.toggle('b');                       // startet b, während a läuft
    assert.equal(d.recording('a'), false, 'a muss gestoppt sein');
    assert.equal(d.recording('b'), true);
});
t('Debug: der verdrängte Recorder behält seine Aufnahme (Vergleich vorher/nachher)', () => {
    const d = makeDbg();
    d.toggle('a');
    d.toggle('b');
    assert.equal(d.lastSeconds('a'), 0.1, 'a-Take darf nicht verloren gehen');
});
t('Debug: ein neuer Start löscht die vorherige Aufnahme DIESES Recorders', () => {
    const d = makeDbg();
    d.toggle('a'); d.toggle('a');
    assert.equal(d.lastSeconds('a'), 0.1);
    d.toggle('a');                       // neuer Take → alter ist weg, solange er läuft
    assert.equal(d.lastSeconds('a'), 0);
    assert.equal(d.recording('a'), true);
});

// Rücksetzen beider Slots (@dpa 20260716_132014: „ein extra Rücksetzen Icon zum
// leeren/reseten beider Recs"). Auch das ist Logik in DebugPanel, nicht in der UI.
t('Debug: Rücksetzen leert BEIDE Aufnahmen', () => {
    const d = makeDbg();
    d.toggle('a'); d.toggle('a');        // a: fertiger Take
    d.toggle('b'); d.toggle('b');        // b: fertiger Take
    assert.equal(d.lastSeconds('a'), 0.1);
    assert.equal(d.lastSeconds('b'), 0.2);
    d.resetAll();
    assert.equal(d.lastSeconds('a'), 0, 'a muss leer sein');
    assert.equal(d.lastSeconds('b'), 0, 'b muss leer sein');
});
t('Debug: Rücksetzen bricht eine laufende Aufnahme ab (hinterher ist nichts mehr da)', () => {
    const d = makeDbg();
    d.toggle('a');                       // läuft noch
    d.resetAll();
    assert.equal(d.recording('a'), false, 'darf nicht weiterlaufen');
    assert.equal(d.lastSeconds('a'), 0, 'der abgebrochene Take darf nicht liegen bleiben');
});

/* ── i18n (@dpa 20260716_164359) ─────────────────────────────────────────────────
   Der deutsche Text IST der Schlüssel. Das ist bequem, hat aber genau eine Gefahr:
   ändert jemand einen deutschen Hint, findet EN[] ihn nicht mehr und die Übersetzung
   verschwindet STILL (es erscheint wieder Deutsch – niemand merkt es).
   Dieser Wächter liest die Hints aus dem Quelltext und hält sie gegen EN[]. */
function sourceHints() {
    const out = new Set();
    const walk = (dir) => readdirSync(dir).forEach((f) => {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) return walk(p);
        if (!f.endsWith('.js') || p.includes('i18n.js')) return;
        const src = readFileSync(p, 'utf8');
        // Alle Wege, auf denen ein deutscher UI-Text ins i18n läuft – einzeilige,
        // einfache Literale. Zusammengesetzte ('a' + 'b') und dynamische (`${…}`)
        // Texte prüft der Wächter bewusst nicht: die erste Hälfte wäre kein Schlüssel.
        const PATTERNS = [
            /(?:hint|i18nText)\([^,]+,\s*'((?:[^'\\]|\\.)*)'\s*\)/g,   // hint(el, '…')
            /iconBtn\('[a-z]+',\s*'((?:[^'\\]|\\.)*)'/g,                 // iconBtn('gear', '…')
            /\btitle:\s*'((?:[^'\\]|\\.)*)'/g,                           // BUTTONS/KNOBS: title: '…'
            // foot/Cluster: ['plus', 'Neu…', 'title…', fn]. Bewusst auf die bekannten
            // Icon-Namen festgenagelt – ein offenes /\['[a-z]+'/ fing sonst JEDES
            // String-Array (options: ['off','each','seq'], knobs: [...]) als „Hint".
            /\['(?:plus|export|import|load|edit|trash|gear|close|sync|power|expand|arrange|play|stop|fill|rewind|caret)',\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'/g,
        ];
        for (const re of PATTERNS) {
            for (const m of src.matchAll(re)) {
                for (const g of m.slice(1)) if (g) out.add(g.replace(/\\'/g, "'"));
            }
        }
    });
    walk('js');
    return [...out];
}
t('i18n: jeder einzeilige Hint im Code hat eine englische Übersetzung', () => {
    const missing = sourceHints().filter((h) => h && !hasTranslation(h));
    assert.deepEqual(missing, [], 'ohne EN-Eintrag (fällt still auf Deutsch zurück):\n  - '
        + missing.join('\n  - '));
});
t('i18n: EN[] enthält keine Leichen (Schlüssel, die es im Code nicht mehr gibt)', () => {
    // Findet die Umkehrung: ein umformulierter deutscher Text lässt seinen alten
    // EN-Eintrag als toten Ballast zurück. Nur einzeilige Hints sind hier belegbar,
    // darum prüfen wir gegen die Vereinigung aus Code-Hints und den bekannten
    // Sammel-Texten (Buttons/Abschnitte), die aus mehrteiligen Literalen kommen.
    const known = new Set(sourceHints());
    // Ein Schlüssel darf auch mehrteilig im Code stehen ('a ' + 'b', Ternär, Wort in einem
    // längeren Satz). Darum: was der Scanner nicht als Literal fand, muss wenigstens
    // wörtlich irgendwo im Quelltext vorkommen. Das findet echte Leichen (umformulierter
    // deutscher Text) und lässt legitime Bauformen in Ruhe – ohne Pflege-Liste.
    const allSrc = (function read(dir) {
        return readdirSync(dir).map((f) => {
            const p = join(dir, f);
            if (statSync(p).isDirectory()) return read(p);
            return f.endsWith('.js') && !p.includes('i18n.js') ? readFileSync(p, 'utf8') : '';
        }).join('\n');
    })('js');
    const dead = EN_KEYS.filter((k) => !known.has(k) && !allSrc.includes(k));
    assert.deepEqual(dead, [], 'EN-Einträge ohne Fundstelle im Code:\n  - ' + dead.join('\n  - '));
});
t('i18n: t() gibt Deutsch zurück, solange nicht umgeschaltet ist', () => {
    assert.equal(tr('Einstellungen'), 'Einstellungen');
    assert.equal(tr('gibt es nicht'), 'gibt es nicht');   // Unbekanntes bleibt, wie es ist
});
t('i18n: nach setLang(en) kommt Englisch, Unbekanntes bleibt deutsch', () => {
    setLang('en');
    assert.equal(tr('Einstellungen'), 'Settings');
    assert.equal(tr('Ein-/Ausklappen'), 'Collapse/expand');
    // Kein Schlüssel-Kauderwelsch, wenn eine Übersetzung fehlt:
    assert.equal(tr('völlig unübersetzt'), 'völlig unübersetzt');
    setLang('de');   // Zustand für die anderen Tests zurückgeben
    assert.equal(tr('Einstellungen'), 'Einstellungen');
});

/* ── Hilfe-Hints (@dpa 20260716_174111: „Bitte erzeuge für alle (alle) Controls
 * helphints") ───────────────────────────────────────────────────────────────────
 * Der Wächter dazu: JEDES Control, das app.js definiert, braucht einen Auslieferungs-Hint.
 * Er liest die Definitionen aus dem Quelltext (KNOBS/SELECTS/…), damit ein neu angelegtes
 * Control hier auffällt, statt still ohne Hilfe zu bleiben. Und die Gegenrichtung: kein
 * Hint für eine Kennung, die es nicht mehr gibt. */
function definedCtrlIds() {
    const src = readFileSync('js/app.js', 'utf8');
    const pre = { KNOBS: 'k', SELECTS: 's', TOGGLES: 't', TEXTS: 'x', NOTES: 'n', BUTTONS: 'b' };
    const ids = [];
    for (const [name, p] of Object.entries(pre)) {
        const m = src.match(new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\n\\};'));
        if (!m) continue;
        for (const k of m[1].matchAll(/^ {4}(\w+):/gm)) ids.push(p + ':' + k[1]);
    }
    return ids;
}
t('Hints: jedes definierte Control hat einen Auslieferungs-Hint', () => {
    const missing = definedCtrlIds().filter((id) => !HINTS[id]);
    assert.deepEqual(missing, [], 'ohne Hilfetext (die Blase bliebe leer):\n  - ' + missing.join('\n  - '));
});
t('Hints: keine Hilfetexte für Controls, die es nicht mehr gibt', () => {
    const known = new Set(definedCtrlIds());
    // 'u:'-Kennungen (Keyboard, Seq, Graph …) sind keine Definitionen in app.js – sie
    // entstehen beim Bauen und dürfen deshalb nicht gegen die Liste geprüft werden.
    const dead = HINT_IDS.filter((id) => !known.has(id) && !id.startsWith('u:'));
    assert.deepEqual(dead, [], 'Hilfetext ohne Control:\n  - ' + dead.join('\n  - '));
});
t('Hints: jeder Hilfetext hat DE und EN', () => {
    const bad = HINT_IDS.filter((id) => !HINTS[id].de || !HINTS[id].en);
    assert.deepEqual(bad, [], 'unvollständig:\n  - ' + bad.join('\n  - '));
});
t('Hints: factoryHint fällt auf Deutsch zurück, statt leer zu bleiben', () => {
    assert.equal(factoryHint('k:bpm', 'de'), HINTS['k:bpm'].de);
    assert.equal(factoryHint('k:bpm', 'en'), HINTS['k:bpm'].en);
    assert.equal(factoryHint('gibt:es:nicht', 'de'), '');
});

/* ── FX-Kette (@dpa 20260716_232709: „Metronom fehlt in der Kette! Die kette und ihre
 * Verknüpfungen sind sehr wichtig!") ────────────────────────────────────────────────
 * fxOrder steckt im Sound-Snapshot; die Metronom-Migration lief nur beim Booten. Ältere
 * Snapshots (43 von 51 in @dpas eigener Werkseinstellung) trugen deshalb eine Kette OHNE
 * Metronom und warfen den Knoten beim Recall still aus Ansicht und Verdrahtung. */
const FX_KNOWN = ['Filter', 'Distortion', 'Reverb', 'Metronom'];
t('fxChain: ein alter Snapshot ohne Metronom bekommt es zurück', () => {
    assert.deepEqual(normalizeFxOrder(['Filter', 'Distortion', 'Reverb'], FX_KNOWN),
        ['Filter', 'Distortion', 'Reverb', 'Metronom']);
});
t('fxChain: die gespeicherte REIHENFOLGE bleibt erhalten', () => {
    assert.deepEqual(normalizeFxOrder(['Reverb', 'Metronom', 'Filter', 'Distortion'], FX_KNOWN),
        ['Reverb', 'Metronom', 'Filter', 'Distortion']);
});
t('fxChain: fehlendes/leeres fxOrder ergibt die volle Kette', () => {
    assert.deepEqual(normalizeFxOrder(undefined, FX_KNOWN), FX_KNOWN);
    assert.deepEqual(normalizeFxOrder([], FX_KNOWN), FX_KNOWN);
});
t('fxChain: unbekannte Knoten und Doppelte fliegen raus', () => {
    assert.deepEqual(normalizeFxOrder(['Filter', 'Chorus', 'Filter', 'Reverb'], FX_KNOWN),
        ['Filter', 'Reverb', 'Distortion', 'Metronom']);
});
t('fxChain: eine vollständige Kette bleibt unangetastet', () => {
    assert.deepEqual(normalizeFxOrder(FX_KNOWN, FX_KNOWN), FX_KNOWN);
});
t('fxChain: die Default-Kette ist selbst vollständig', () => {
    // Gegen den echten State, nicht gegen eine Kopie der Liste: fällt hier ein Knoten aus
    // DEFAULTS.fxOrder heraus oder kommt einer dazu, muss es auffallen.
    assert.deepEqual(normalizeFxOrder(STATE_DEFAULTS.fxOrder, STATE_DEFAULTS.fxOrder), STATE_DEFAULTS.fxOrder);
    assert.ok(STATE_DEFAULTS.fxOrder.includes('Metronom'), 'Metronom gehört in die Kette');
});

await Promise.all(asyncTests);   // sonst wäre der Zähler unten fertig, bevor sie es sind
console.log(`\n${pass} Tests bestanden${process.exitCode ? ' (mit Fehlern!)' : ' ✅'}`);
