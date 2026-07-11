/**
 * logic.test.mjs – Headless-Tests der reinen DSP/Logik-Module (kein Web Audio).
 * Lauf: node test/logic.test.mjs   (oder: npm test)
 */
import assert from 'node:assert/strict';

import { triggerInterval, DIVISIONS } from '../js/core/TriggerDivider.js';
import { ScaleModel, rotateMask } from '../js/pitch/ScaleModel.js';
import { quantizeToScale, activeMidis, semitoneToHz, harmonicSnap, freqToMidi, midiToFreq, midiToName, foldToBand } from '../js/pitch/Scaler.js';
import { PitchOsc, PITCH_WAVEFORMS } from '../js/pitch/PitchOsc.js';
import { GateOsc } from '../js/core/GateOsc.js';
import { pulseCoefficients, harmonicsForFreq, phaseWarp, warpedCoefficients, fmCoefficients } from '../js/audio/pulseWave.js';
import { LadderCore, prewarp, resToDamping } from '../js/dsp/ladderCore.js';
import { fft } from '../js/dsp/fft.js';
import { renderMetroClick } from '../js/dsp/metroClick.js';
import { makeSeqSteps, seqAdvance, fillSeq, SEQ_MAX } from '../js/dsp/stepSeq.js';
import { bestFraction, reduce } from '../js/pitch/rateFraction.js';
import { encodeWav, decodeWav } from '../js/dsp/wavEncoder.js';
import { keytrackCutoff, envPeakMult } from '../js/dsp/filterMod.js';

let pass = 0;
function t(name, fn) {
    try { fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
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
t('harmonicSnap zieht auf n·base', () => assert.equal(harmonicSnap(317, 100), 300));
t('harmonicSnap min n=1', () => assert.equal(harmonicSnap(20, 100), 100));
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

console.log(`\n${pass} Tests bestanden${process.exitCode ? ' (mit Fehlern!)' : ' ✅'}`);
