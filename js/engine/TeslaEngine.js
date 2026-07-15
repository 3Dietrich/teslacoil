/**
 * TeslaEngine.js – Verdrahtet alle Module zum Signalfluss.
 *
 *   Clock ──▶ pro Trigger:
 *     Gate offen?  → PitchOsc abtasten (S&H) → Skaler → SquareOsc.trigger()
 *     PitchOsc & GateOsc um ein Intervall weiterdrehen
 *
 * Liest sämtliche Parameter LIVE aus dem State (kein doppelter Wahrheitsbesitz).
 */
import { Master } from '../audio/Master.js';
import { SquareOsc } from '../audio/SquareOsc.js';
import { LadderFilter } from '../audio/LadderFilter.js';
import { DistortionFx } from '../audio/DistortionFx.js';
import { GateReverb } from '../audio/GateReverb.js';
import { Metronome } from '../audio/Metronome.js';
import { Clock } from '../core/Clock.js';
import { triggerInterval } from '../core/TriggerDivider.js';
import { PitchOsc } from '../pitch/PitchOsc.js';
import { GateOsc } from '../core/GateOsc.js';
import { ScaleModel, NOTE_NAMES, rotateMask } from '../pitch/ScaleModel.js';
import { quantizeToScale, freqToMidi, midiToFreq, foldToBand } from '../pitch/Scaler.js';
import { seqAdvance } from '../dsp/stepSeq.js';
import { keytrackCutoff, envPeakMult } from '../dsp/filterMod.js';

export class TeslaEngine {
    /** @param {import('../core/State.js').State} state */
    constructor(state) {
        this.state = state;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = new Master(this.ctx);
        this.master.setVolume(state.get('masterVol'));
        this.master.setDcBlock(state.get('dcBlock'));

        // Bus-Kette: Voices → voiceBus → [FX in state.fxOrder] → Master. Die FX-Reihenfolge
        // (Filter/Distortion/Reverb) ist LIVE umsteckbar (_rewireFX) – zum freien Ausprobieren.
        this.ladder = new LadderFilter(this.ctx);
        this.dist = new DistortionFx(this.ctx);
        this.reverb = new GateReverb(this.ctx);
        this.voiceBus = this.ctx.createGain();   // fester Sammelpunkt der Voices (Ketten-Anfang)
        this._fxReady = false;
        this.square = new SquareOsc(this.ctx, this.voiceBus);
        this._rewireFX();
        this._applyDistortion();
        this._applyReverbLevels();
        this._rebuildReverb();

        this.pitch = new PitchOsc(this._pitchCfg());
        this.gate = new GateOsc(this._gateCfg());
        this.scale = new ScaleModel(state.get('scaleMask'));

        this.clock = new Clock(this.ctx, (t, iv) => this._onTrigger(t, iv));
        this.clock.intervalFn = () => triggerInterval(state.get('bpm'), state.get('division'));

        // Metronom: eigener Klick am Master (umgeht FX), eigener Takt-Divider.
        this.metro = new Metronome(this.ctx, this.master.input);
        this._rebuildMetro();
        this._applyMetroRoute();
        this.metro.setLevel(state.get('metroLevel'));
        this.metroClock = new Clock(this.ctx, (t) => { if (state.get('metroEnabled')) this.metro.tick(t); });
        // Metronom-Periode als freies Verhältnis l/m des Viertels (@dpa 20260713):
        // (60/bpm)·(l/m). l,m ganzzahlig 1..16; l=1,m=1 → Viertel (wie früher '1/4').
        this.metroClock.intervalFn = () => {
            const secPerBeat = 60 / Math.max(1e-6, state.get('bpm'));
            const l = Math.max(1, state.get('metroL') | 0);
            const m = Math.max(1, state.get('metroM') | 0);
            return secPerBeat * (l / m);
        };

        this._lastFreq = state.get('baseHz');

        // Test-Ton (trockener Sinus auf der BaseFrq, umgeht die FX-Kette). Lazy erzeugt.
        this.testOsc = null; this.testGain = null;
        this._applyTestOsc();

        // Step-Sequenzer-Laufzeit (nicht persistiert): Position pro Sequenzer.
        // Start bei -1 → erster Trigger landet auf Step 0. _seqReset = „set0"-Wunsch.
        this._seqPos = { amp: -1, filter: -1 };
        this._seqReset = { amp: false, filter: false };
        this._lastEffCutoff = state.get('lpCutoff');   // zuletzt gesetzter effektiver Cutoff (Debug)

        // Auf State-Änderungen reagieren (Master-Volume + Modul-Sync)
        state.subscribe((key) => this._onStateChange(key));
    }

    _pitchCfg() {
        const s = this.state;
        // 'from' bleibt 0: der Bezug ('von') wird als absolute Frequenz addiert.
        return { rate: s.get('pitchRate'), from: 0, range: s.get('pitchRange'), waveform: s.get('pitchWave'), seed: s.get('pitchRandSeed') };
    }
    _gateCfg() {
        const s = this.state;
        return { rate: s.get('gateRate'), width: s.get('gateWidth'), enabled: s.get('gateEnabled') };
    }

    _onStateChange(key) {
        const s = this.state;
        if (key === 'masterVol' || key === '*') this.master.setVolume(s.get('masterVol'));
        if (key === 'dcBlock' || key === '*') this.master.setDcBlock(s.get('dcBlock'));
        if (['scaleMask', 'baseToC', '*'].includes(key)) this._applyScale();
        // Base→C: bei jeder BaseFrq-Änderung die effektive (relativ rotierte) Maske nachziehen.
        else if (s.get('baseToC') && ['baseSrc', 'baseHz', 'baseNote', 'baseBand', 'bpm'].includes(key)) this._applyScale();
        // Filter: Typ/Pole NUR bei echter Änderung an den Worklet posten – jede solche
        // Message nullt dort den kompletten Filter-State (_reset) → hörbarer Knacks UND
        // der Resonanz-/Selbstoszillations-Aufbau (der den Ladder „singen" lässt) wird
        // weggewischt. Reso/Cutoff/Env/KeyTrack dürfen live ohne Reset nachgeführt werden.
        if (key === '*' || key === 'filterEnabled') this._applyFilter();
        else if (key === 'filterType') { this.ladder.setType(s.get('filterType')); this._applyFilterParams(); }
        else if (key === 'lpMode') { this.ladder.setPoles(this._lpPoles()); this._applyFilterParams(); }
        else if (['lpReso', 'lpCutoff', 'lpEnv', 'lpKeyTrack'].includes(key)) this._applyFilterParams();
        if (['distEnabled', 'distMode', 'distDrive', 'distOut', 'distMix', 'distDryDelay', '*'].includes(key)) this._applyDistortion();
        // Reverb: Pegel-Regler OHNE IR-Neuberechnung (unterbrechungsfrei bedienbar),
        // nur IR-Parameter lösen ein Rebuild aus.
        if (key === '*') { this._applyReverbLevels(); this._rebuildReverb(); }
        else if (key === 'reverbEnabled') { this.reverb.setActive(this._reverbActive()); }
        else if (key === 'revMix') this.reverb.setMix(s.get('revMix'));
        else if (key === 'revWet') this.reverb.setWetVol(s.get('revWet'));
        else if (key === 'revShelfFreq' || key === 'revShelfGain') this.reverb.setShelf(s.get('revShelfFreq'), s.get('revShelfGain'));
        else if (key === 'revPreDelay') this.reverb.setPreDelay(s.get('revPreDelay'));
        else if (['revDensity', 'revAttack', 'revRelease', 'revReleaseShape', 'revSeed', 'revLenPct', 'bpm', 'division'].includes(key)) this._rebuildReverb();
        // Metronom: Pegel ohne Rebuild; Klang-Parameter rendern den Buffer neu.
        if (key === 'metroLevel' || key === '*') this.metro.setLevel(s.get('metroLevel'));
        if (['metroMorph', 'metroCutoff', 'metroCutoffQuant', 'metroCutBand', 'metroReso', '*'].includes(key)) this._rebuildMetro();
        if (key === 'fxOrder' || key === '*') this._rewireFX();   // FX-Kette live umstecken (setzt auch Metro-Ziel)
        // Test-Ton: an/aus/Pegel + Frequenz an die BaseFrq nachführen (BaseFrq hängt von
        // baseSrc/baseHz/baseNote/baseOct/tempoOct/bpm ab → bei all diesen aktualisieren).
        if (['baseTestOn', 'baseTestLevel', 'baseSrc', 'baseHz', 'baseNote', 'baseBand', 'bpm', '*'].includes(key)) this._applyTestOsc();
        // Metronom-Quant: bei aktivem metroCutoffQuant hängt der Klick-Cutoff an der
        // BaseFrq → bei jeder BaseFrq-Änderung den Klick-Buffer neu rendern.
        if (['baseSrc', 'baseHz', 'baseNote', 'baseBand', 'bpm'].includes(key) && s.get('metroCutoffQuant')) this._rebuildMetro();
        // Pitch/Gate-Parameter werden ohnehin pro Trigger frisch gelesen (s. _syncOscs)
    }

    /** Trockener Sinus-Test-Ton auf der effektiven BaseFrq (lazy, umgeht die FX-Kette). */
    _applyTestOsc() {
        const on = this.state.get('baseTestOn');
        if (on && !this.testOsc) {
            this.testOsc = this.ctx.createOscillator(); this.testOsc.type = 'sine';
            this.testGain = this.ctx.createGain(); this.testGain.gain.value = 0;
            this.testOsc.connect(this.testGain).connect(this.master.input);
            this.testOsc.start();
        }
        if (this.testOsc) {
            const t = this.ctx.currentTime;
            this.testOsc.frequency.setTargetAtTime(Math.max(1, this.baseFreq), t, 0.02);
            this.testGain.gain.setTargetAtTime(on ? this.state.get('baseTestLevel') : 0, t, 0.02);
        }
    }

    /** Metronom-Ziel aus der KETTE ableiten (@dpa 20260713, ersetzt den Route-Select):
     *  Metronom ist ein Ketten-Knoten in fxOrder. Es speist in den Eingang des ERSTEN
     *  Effekts NACH ihm ein → durchläuft ab dort die Kette. Steht es hinter allen Effekten
     *  (oder nicht in der Kette), geht es parallel an den Master. */
    _metroDestFromChain() {
        const order = this.state.get('fxOrder') || [];
        const map = { Filter: this.ladder, Distortion: this.dist, Reverb: this.reverb };
        const mi = order.indexOf('Metronom');
        if (mi >= 0) for (let i = mi + 1; i < order.length; i++) if (map[order[i]]) return map[order[i]].input;
        return this.master.input;
    }
    _applyMetroRoute() { if (this.metro) this.metro.setDestination(this._metroDestFromChain()); }

    /** Metronom-Klick-Buffer aus dem State neu rendern. Quant AN: Cutoff kommt aus
     *  dem Oktaver an der BaseFrq (cutoff = BaseFrq · 2^oct) statt aus dem Cutoff-Knob. */
    _rebuildMetro() {
        const s = this.state;
        const cutoff = s.get('metroCutoffQuant')
            ? Math.max(20, Math.min(18000, foldToBand(this.baseFreq, s.get('metroCutBand'))))
            : s.get('metroCutoff');
        this.metro.rebuild({ morph: s.get('metroMorph'), cutoff, reso: s.get('metroReso') });
    }

    /** Distortion-Status aus dem State übernehmen ('aktiv'-Haken = Bypass). */
    _applyDistortion() {
        const s = this.state;
        const on = s.get('distEnabled');
        this.dist.setActive(on);
        if (on) this.dist.setMode(s.get('distMode'));
        this.dist.setDrive(s.get('distDrive'));
        this.dist.setOut(s.get('distOut'));
        this.dist.setMix(s.get('distMix'));
        this.dist.setDryDelaySamples(s.get('distDryDelay'));
    }

    /** Reverb aktiv über den 'aktiv'-Haken (fester Gate-Reverb-Effekt). */
    _reverbActive() {
        return this.state.get('reverbEnabled');
    }

    /** Reverb-Pegel/IO setzen (kein IR-Rebuild). */
    _applyReverbLevels() {
        const s = this.state;
        this.reverb.setActive(this._reverbActive());
        this.reverb.setMix(s.get('revMix'));
        this.reverb.setWetVol(s.get('revWet'));
        this.reverb.setShelf(s.get('revShelfFreq'), s.get('revShelfGain'));
        this.reverb.setPreDelay(s.get('revPreDelay'));
        this.reverb.setXfade(this._reverbLenSeconds() * 1000); // X-Fade an Len gebunden
    }

    /** FX-Kette in der Reihenfolge state.fxOrder verdrahten: voiceBus → fx[0] → … →
     *  fx[n] → Master. LIVE umsteckbar (freies Ausprobieren, kein Speichern nötig) – nur
     *  ein kurzer Reconnect; die Module (interne Verdrahtung) bleiben erhalten. */
    _rewireFX() {
        const map = { Filter: this.ladder, Distortion: this.dist, Reverb: this.reverb };
        const order = (this.state.get('fxOrder') || []).filter((n) => map[n]);
        for (const n of ['Filter', 'Distortion', 'Reverb']) if (!order.includes(n)) order.push(n);
        // Nur die VON UNS gesetzten Verbindungen lösen (Ausgänge + voiceBus), Module intakt.
        try { this.voiceBus.disconnect(); } catch { /* noop */ }
        for (const n of order) { try { map[n].output.disconnect(); } catch { /* noop */ } }
        let prev = this.voiceBus;
        for (const n of order) { prev.connect(map[n].input); prev = map[n].output; }
        prev.connect(this.master.input);
        this._applyMetroRoute();   // Metro-Ziel hängt an der (neuen) Ketten-Position
    }

    /** Effektive Skalen-Maske für den Quantizer setzen. Base→C AN: scaleMask ist RELATIV
     *  (Index 0 = Basis = do) → um die Tonklasse der BaseFrq rotieren, damit das Muster
     *  mit der Basis mitwandert. AUS: absolut wie gespeichert. */
    _applyScale() {
        const s = this.state;
        const mask = s.get('scaleMask').map(Number);
        if (s.get('baseToC')) {
            const pc = ((Math.round(freqToMidi(this.baseFreq)) % 12) + 12) % 12;
            this.scale.mask = rotateMask(mask, pc).map(Boolean);
        } else {
            this.scale.mask = mask.map(Boolean);
        }
    }

    /* ── Step-Sequenzer (Filter/Amp) ── */
    /** Position eines Sequenzers weiterschalten und den aktuellen Step-Wert (0..1) liefern. */
    _seqStep(which) {
        const pos = seqAdvance(this._seqPos[which], this.state.get(which + 'SeqLen'), this._seqReset[which]);
        this._seqReset[which] = false;
        this._seqPos[which] = pos;
        const steps = this.state.get(which + 'SeqSteps') || [];
        return Math.max(0, Math.min(1, steps[pos] || 0));
    }
    /** „set0": beim nächsten Trigger wieder bei Step 0 anfangen. */
    resetSeq(which) { if (this._seqReset[which] !== undefined) this._seqReset[which] = true; }
    /** Aktuelle Playhead-Position (für die Widget-Anzeige). */
    seqPos(which) { return this._seqPos[which]; }

    /** Reverb-Wolkenlänge relativ zum Trigger-Intervall (tempo-synchron). */
    _reverbLenSeconds() {
        return triggerInterval(this.state.get('bpm'), this.state.get('division')) * this.state.get('revLenPct');
    }

    /** IR neu erzeugen (density/len/release/seed). X-Fade folgt der Len → alle
     *  Controls blenden über die volle Wolkenlänge sanft ineinander. */
    _rebuildReverb() {
        const s = this.state;
        const len = this._reverbLenSeconds();
        this.reverb.setXfade(len * 1000);
        this.reverb.set({ density: s.get('revDensity'), len, attack: s.get('revAttack'), release: s.get('revRelease'), releaseShape: s.get('revReleaseShape'), seed: s.get('revSeed') });
    }

    /** Polzahl aus dem lpMode-Select (1..4; 'Aus' gibt es nicht mehr → 'aktiv'-Haken). */
    _lpPoles() { const i = ['1p', '2p', '3p', '4p'].indexOf(this.state.get('lpMode')); return i < 0 ? 2 : i + 1; }

    /** Voller Filter-Sync (aktiv + Typ + Pole + Parameter). NUR bei Recall/Init/aktiv-
     *  Umschalten – Typ/Pole nullen im Worklet den State (Knacks), daher hier gebündelt
     *  statt bei jeder Reglerbewegung. */
    _applyFilter() {
        if (!this.ladder.ready) return;
        const on = this.state.get('filterEnabled');
        this.ladder.setActive(on);
        if (on) {
            this.ladder.setType(this.state.get('filterType'));
            this.ladder.setPoles(this._lpPoles());
        }
        this._applyFilterParams();
    }

    /** Reset-FREIE Filter-Parameter (Reso + statischer Cutoff). Für die Live-
     *  Reglerbedienung: postet NICHT Typ/Pole (das würde den Worklet-State nullen →
     *  Knacks + verlorene Resonanz). */
    _applyFilterParams() {
        if (!this.ladder.ready || !this.state.get('filterEnabled')) return;
        this.ladder.setReso(this.state.get('lpReso'));
        // Statischer Cutoff NUR wenn weder Env noch Keytrack aktiv sind – sonst führt
        // der Trigger den Cutoff (Env-Ramp bzw. Keytrack-Sprung), und hier dazwischen-
        // zufunken erzeugte das „wilde" Springen. (NI-Reaktor: eine Quelle.)
        if (this.state.get('lpEnv') === 0 && this.state.get('lpKeyTrack') <= 0) {
            this.ladder.setCutoff(this.state.get('lpCutoff'));
        }
    }

    /** Worklet einmalig laden und Ladder bauen (lazy beim ersten Start). */
    async _ensureFx() {
        if (this._fxReady) return;
        try {
            await LadderFilter.load(this.ctx);
            this.ladder.build(Math.max(1, this._lpPoles()), this.state.get('lpReso'), this.state.get('filterType'));
            this._fxReady = true;
            this._applyFilter();
        } catch (e) {
            console.warn('Ladder-Worklet konnte nicht geladen werden – Filter bleibt im Bypass.', e);
        }
    }

    /** Übernimm Live-Parameter in die Oszillator-Objekte (Phase bleibt erhalten). */
    _syncOscs() {
        const s = this.state;
        this.pitch.rate = s.get('pitchRate');
        this.pitch.from = 0;
        this.pitch.range = s.get('pitchRange');
        this.pitch.waveform = s.get('pitchWave');
        this.pitch.seed = s.get('pitchRandSeed');   // reseedet nur bei Änderung
        this.gate.rate = s.get('gateRate');
        this.gate.width = s.get('gateWidth');
        this.gate.enabled = s.get('gateEnabled');
        // Effektive Maske pro Trigger frisch setzen – über _applyScale, damit Base→C
        // (relative Rotation um die BaseFrq-Tonklasse) NICHT überschrieben wird und der
        // BaseFrq live folgt. (Früher stand hier die rohe scaleMask → Base→C wirkungslos.)
        this._applyScale();
    }

    _onTrigger(time, interval) {
        const s = this.state;
        this._syncOscs();

        // Sequenzer laufen IMMER pro Takt-Step mit (auch wenn inaktiv → phasenrichtig),
        // ausgewertet werden sie nur bei 'aktiv'.
        const ampSeqV = this._seqStep('amp');
        const filtSeqV = this._seqStep('filter');
        const ampEn = s.get('ampSeqEnabled');
        // Env-Trig dreistufig (@dpa 20260713, ersetzt das alte Bool 'filterSeqEnabled'):
        // 'off' = Env nie triggern, 'each' = jeder Trigger volle Env, 'seq' = Sequenzer
        // steuert Trigger+Depth pro Step (bisheriges "filterSeqEnabled=true"-Verhalten).
        const filterEnvTrig = s.get('filterEnvTrig');
        const filtEn = filterEnvTrig === 'seq';
        // Amp-Sequenzer gated die Note (0 = kein Trigger) und skaliert die Velocity.
        // 'Dyn' biegt die Velocity-Kurve bipolar: −1 = alle Steps auf 75 % (flach),
        // 0 = linear (roher Step-Wert), +1 = quadratisch v² (Kontrast, "hart/weich").
        let ampGate = ampEn ? ampSeqV : 1;
        if (ampEn && ampGate > 0) {
            const dyn = s.get('ampSeqDyn');
            const g = ampGate;
            ampGate = dyn >= 0 ? (g * (1 - dyn) + g * g * dyn) : (g * (1 + dyn) + 0.75 * (-dyn));
        }

        const open = this.gate.isOpen();
        const von = s.get('fromHz');
        // Harmonize-Basis = echte BaseFrq. harmonicSnap rastet Töne DARUNTER auf Sub-
        // Oktaven (BF/2^k), DARÜBER auf n·BF – daher kein min(…,von)-Deckel mehr nötig.
        const baseHz = this.baseFreq;
        const u = this.pitch.sampleUnipolar();           // Pitch-Position 0..1 im Fenster
        // S&H-Wert (0..1) wird gleichmäßig auf die aktiven Töne im Fenster verteilt
        const freq = quantizeToScale({
            unipolar: u,
            vonMidi: freqToMidi(von),
            range: s.get('pitchRange'),
            scale: this.scale,
            baseHz,
            harmonizeMix: s.get('harmonizeMix'),
        });

        // freq === null → KEIN Ton aktiv (ganze Skala aus) → Pause.
        // ampGate 0 (Amp-Sequenzer-Step off) → ebenfalls keine Note.
        const wantNote = open && freq != null && ampGate > 0;
        let noteOn = false;   // true = frischer Anschlag (KEIN Hold-Suspend) – von der Filter-Sektion genutzt
        if (wantNote) {
            // Pitch → Env-Länge: zwischen lo (u=0) und hi (u=1) interpolierter %-Faktor.
            // KEIN Deckel auf ein Trigger-Intervall mehr: envPercent > 100 % macht Töne
            // LÄNGER als ein Step → aufeinanderfolgende Trigger überlappen = Polyphonie
            // (begrenzt durch polyMax). Vorher kappte Math.min(interval,…) das auf 100 %.
            const lo = s.get('envPitchLo'), hi = s.get('envPitchHi');
            const factor = (lo + (hi - lo) * u) / 100;
            const envLen = Math.max(0.005, interval * s.get('envPercent') * factor);
            // Hold (@dpa): Wenn die Länge dieses Steps über den nächsten Trigger hinausgeht
            // (envLen > interval) UND schon eine Voice klingt, wird NICHT neu angeschlagen –
            // stattdessen die gehaltene Voice umgestimmt und ihr Sustain verlängert. So hält
            // der Amp DURCHGEHEND (kein wiederkehrender Attack), nur die Tonhöhe steppt.
            // Erst bei kurzer Länge (envLen ≤ interval) oder verstummter Voice schlägt sie neu an.
            const voiceAlive = this._ampHoldUntil != null && time < this._ampHoldUntil - 1e-4;
            const suspend = s.get('ampHold') && voiceAlive && envLen > interval + 1e-4;
            this._lastFreq = freq;            // Filter-Keytrack folgt der (neuen) Tonhöhe
            if (suspend) {
                // Wellenform-Parameter mitgeben: die gehaltene Voice wird nie neu angeschlagen,
                // muss Engine/PW/FM aber trotzdem live folgen (sonst wirken die Audio-Osz-Regler
                // im Hold nie). Amp/Attack/Release bleiben bewusst unberührt – das IST der Hold.
                const engine = s.get('oscEngine');
                // Slide (@dpa 20260715): der Hold setzt nur die AMP-Env aus – die Frequenz
                // gleitet linear auf die neue Tonhöhe, statt hart zu springen.
                this.square.retune(freq, time, envLen, s.get('ampHoldGlide'), {
                    engine,
                    param: engine === 'Sine-FM' ? s.get('fmFeedback') : s.get('duty'),
                });
                this._ampHoldUntil = time + envLen;       // Hold weiter nach vorn schieben
            } else {
                const engine = s.get('oscEngine');
                // Pitch → Amp: dämpft hohe Töne. 0 % = Multiplikator immer 1; 100 % = linear 1→0.
                const ampPitchMult = 1 - (s.get('ampPitchAmt') / 100) * u;
                this.square.trigger(time, freq, envLen, {
                    engine,
                    param: engine === 'Sine-FM' ? s.get('fmFeedback') : s.get('duty'),
                    attack: s.get('attack'),
                    release: s.get('ampDecay'),   // ASR: der Regler ist das Release nach dem Len-Ende
                    amp: s.get('amp') * ampGate * ampPitchMult,   // Amp-Sequenzer = Velocity
                    polyMax: s.get('polyMax'),
                });
                this._ampHoldUntil = time + envLen;   // Merke Len-Ende (ohne Release) – für hold
                noteOn = true;                        // frischer Anschlag (für Filter-Keytrack/-Env)
            }
        }

        // Filter-Decay-Hüllkurve auf den Bus-Ladder.
        //   Filter-Sequenzer AN  → Trigger/Depth kommen aus der Sequenz (unabhängig
        //     von der Note; Step 0 = kein Trigger → alte Env läuft weiter).
        //   Filter-Sequenzer AUS → klassisch: bei jeder Note (Takt×Gate) triggern.
        // Keytrack: die gespielte (skalierte+harmonisierte) Frequenz wird anteilig
        // (0..100 %) auf den Cutoff addiert (effCutoff) – IMMER die Basis pro Note,
        // auch wenn die Env aktiv ist (kt-Pfad läuft nur an Steps OHNE Env-Trigger,
        // sonst würden zwei Automationsquellen gleichzeitig auf 'cutoff' schreiben).
        // Env bipolar −1..+1: >0 öffnet Richtung Maximum, <0 Richtung 20 Hz – EIN
        // Vorzeichen für ALLE Filtertypen (der User entscheidet die Richtung selbst,
        // kein typabhängiges Umkehren mehr → HP/BP klangen sonst wie LP/„alles durch").
        if (this._fxReady && this.ladder.active) {
            const kt = s.get('lpKeyTrack');
            // Musikalisches Keytrack (multiplikativ, Referenz = „von"): Oktave gespielt
            // = Oktave Cutoff. Bei kt=100 folgt der Cutoff 1:1 der Tonhöhe.
            const effCutoff = keytrackCutoff(s.get('lpCutoff'), kt, this._lastFreq, s.get('fromHz'));
            this._lastEffCutoff = effCutoff;   // für die Filter-Debug-Anzeige
            const lpEnv = s.get('lpEnv');
            // (1) BASIS-Cutoff pro Note setzen = Keytrack. Läuft IMMER, unabhängig von
            //     der Env (die sitzt auf einem eigenen Param obendrauf). Nur wenn weder
            //     Keytrack noch Env aktiv sind, hält der statische Cutoff (_applyFilterParams).
            if (noteOn && (kt > 0 || lpEnv !== 0)) this.ladder.setCutoffAt(time, effCutoff, s.get('lpGlide'));
            // (2) ENV als Multiplikator NUR auf getriggerten Steps neu anstoßen; sie läuft
            //     danach eigenständig weiter (eigener Param), während Keytrack die Basis
            //     darunter pro Note weiterbewegt → beide gleichzeitig, keiner würgt ab.
            if (lpEnv !== 0 && filterEnvTrig !== 'off') {
                const doTrig = filtEn ? filtSeqV > 0 : noteOn;
                if (doTrig) {
                    const depth = filtEn ? filtSeqV : 1;
                    const peakMult = envPeakMult(lpEnv, depth);
                    this.ladder.triggerEnvMult(time, peakMult, s.get('lpAttack'), s.get('lpDecay'));
                }
            }
        }

        // Modulatoren weiterdrehen (Sample & Hold zwischen den Triggern)
        this.pitch.advance(interval);
        this.gate.advance(interval);
    }

    /* ── Transport ── */
    async start() {
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        await this._ensureFx();
        // Sync: bei aktivem 'syncOnStart' alle Sequenzen reproduzierbar von vorne –
        // Step-Sequenzer (amp/filter) UND die Modulatoren (Skaler-Rate/Gate-Phase +
        // Seed-Zufallsfolge). So starten mehrfache Starts identisch.
        if (this.state.get('syncOnStart')) {
            this.resetSeq('amp'); this.resetSeq('filter');
            this.pitch.seed = this.state.get('pitchRandSeed');
            this.pitch.reset(); this.gate.reset();
        }
        this.clock.start();
        this.metroClock.start();
    }
    /** Stop hält nur den Takt an – es wird NICHTS abgewürgt (@dpa 20260715): keine neuen
     *  Trigger, laufende Hüllkurven gehen zu Ende, alles klingt aus. Jede Voice hat ihr
     *  osc.stop() schon beim Anschlag geplant, es bleibt also nichts liegen. Hängt doch
     *  mal etwas, gibt es dafür den Reset-Knopf (audioReset). */
    stop() {
        this.clock.stop();
        this.metroClock.stop();
    }

    /** Harter Audio-Reset („Panik", @dpa 20260715). Der normale Stop lässt alles
     *  ausklingen – nur wenn doch mal etwas hängt, räumt DAS hier auf: alle Voices tot,
     *  Filter- und Reverb-Speicher genullt. Knacken ist dabei ausdrücklich in Ordnung. */
    audioReset() {
        this.square.kill();
        try { this.ladder.reset(); } catch { /* Filter evtl. noch nicht gebaut */ }
        try { this.reverb.reset(); } catch { /* Reverb evtl. noch nicht gebaut */ }
    }
    get running() { return this.clock.running; }

    /** Aktuell zuletzt gespielte Frequenz (für Keyboard-Anzeige). */
    get currentFreq() { return this._lastFreq; }

    /** Zuletzt gesetzter effektiver Filter-Cutoff (für die Keytrack-Debug-Anzeige). */
    get filterEffCutoff() { return this._lastEffCutoff; }

    /** Effektive BaseFrq aus der gewählten Quelle (Freq / Tempo / Ton), zusätzlich
     *  quellenübergreifend in das Band [baseBand, 2·baseBand) gefaltet (Register-Wahl). */
    get baseFreq() {
        const s = this.state;
        let f;
        switch (s.get('baseSrc')) {
            case 'Tempo': f = s.get('bpm') / 60; break;            // Beat-Frequenz
            case 'Ton': {
                const pc = Math.max(0, NOTE_NAMES.indexOf(s.get('baseNote')));
                f = midiToFreq(3 * 12 + pc);                       // C2 (=MIDI 36) als Anker
                break;
            }
            default: f = s.get('baseHz');
        }
        // Register-Wahl per Faltung ins Frequenzband (ersetzt die ±Oktave-Verschiebung).
        return foldToBand(f, s.get('baseBand'));
    }
}
