/**
 * DistortionFx.js – Saturation/Clipping/Distortion über WaveShaperNode.
 *
 * Effekt-Slot im Bus VOR dem Reverb (… → Ladder → Distortion → Reverb → Master).
 * Drive ist in die Shaper-Kurve eingebacken (kein Clamping-Problem), Oversampling
 * 4× gegen das Alias, das jede Nichtlinearität erzeugt (vgl. Vadim, Kap. 4.5/4.6).
 *
 * Modi: Bypass | Saturation (tanh) | Hard Clip | Foldback.
 *
 * Dry/Wet-Crossfade (@dpa 20260715): dry = 1−mix, wet = mix – dieselbe lineare
 * Konvention wie im GateReverb, damit sich beide Regler gleich anfühlen. Der Dry-Pfad
 * läuft parallel am Shaper vorbei; bei mix=1 klingt es exakt wie vorher (reines Wet).
 *
 * Dry-Delay in SAMPLES (@dpa 20260715_223000, „Experiment"): der Versatz zwischen
 * trockenem und verzerrtem Signal, in Samples statt ms – bei so kurzen Zeiten hört man
 * Kammfilter/Phasen, keine Echos. Weil ein DelayNode nur VORHALTEN kann, sitzt in
 * BEIDEN Zweigen einer: positiv verzögert dry, negativ verzögert wet (= dry relativ
 * früher). Hörbar wird das nur zwischen den Extremen (mix ≈ 0.5), wo sich beide Pfade
 * mischen – bei mix = 1 (reines Wet) tut der Regler nichts.
 */

/** Foldback-Distortion: Werte außerhalb [-1,1] zurückfalten. */
function foldback(x) {
    while (x > 1 || x < -1) x = x > 1 ? 2 - x : -2 - x;
    return x;
}

export class DistortionFx {
    /** @param {AudioContext} ctx */
    constructor(ctx) {
        this.ctx = ctx;
        this.input = ctx.createGain();
        this.output = ctx.createGain();
        this.shaper = ctx.createWaveShaper();
        this.shaper.oversample = '4x';
        this.post = ctx.createGain();
        this.dry = ctx.createGain();   // parallel am Shaper vorbei
        this.wet = ctx.createGain();   // hinter Shaper+Out-Pegel
        // Sample-Versatz zwischen den Zweigen. maxDelayTime großzügig (0.1 s) – der
        // Regler bleibt weit darunter, die Grenze kostet nur Puffer, keine Latenz.
        this.dryDelay = ctx.createDelay(0.1);
        this.wetDelay = ctx.createDelay(0.1);

        this.active = false;
        this.mode = 'Saturation';
        this.drive = 1;
        this.mix = 1;                  // 1 = reines Wet → Default klingt wie vor dem Regler
        this.dryDelaySamples = 0;      // >0 = dry später, <0 = wet später

        this.shaper.connect(this.post);
        this.post.connect(this.wetDelay);
        this.wetDelay.connect(this.wet);
        this.wet.connect(this.output);
        this.dryDelay.connect(this.dry);
        this.dry.connect(this.output);
        this.buildCurve();
        this._route();
        this._applyGains(true);   // Startwerte hart setzen, nicht 20ms hochrampen
    }

    setActive(on) { this.active = !!on; this._route(); this._applyGains(); }

    /** Bei 'aus' hängt der Eingang direkt am Ausgang – Shaper UND Crossfade sind dann
     *  komplett aus der Kette, nicht nur auf 0 gedreht (kein Rest-Rechenaufwand). */
    _route() {
        try { this.input.disconnect(); } catch { /* noop */ }
        if (this.active) { this.input.connect(this.shaper); this.input.connect(this.dryDelay); }
        else this.input.connect(this.output);
    }

    setMode(m) { this.mode = m; this.buildCurve(); }
    setDrive(d) { this.drive = Math.max(0.1, d); this.buildCurve(); }
    setOut(o) { this.post.gain.setTargetAtTime(Math.max(0, o), this.ctx.currentTime, 0.01); }
    setMix(m) { this.mix = Math.max(0, Math.min(1, m)); this._applyGains(); }

    /** Versatz in SAMPLES: positiv = dry verzögern, negativ = wet verzögern.
     *  Immer nur EIN Zweig verzögert, der andere steht auf 0 → der Regler bleibt
     *  bei 0 exakt der bisherige Zustand (beide Delays neutral). */
    setDryDelaySamples(n) {
        this.dryDelaySamples = Math.round(n) || 0;
        this._applyDelays();
    }

    _applyDelays() {
        const sr = this.ctx.sampleRate;
        const n = this.dryDelaySamples;
        // Auf die Puffergrenze klemmen, damit ein per Meta aufgezogener Regler nicht
        // still am maxDelayTime hängen bleibt.
        const secs = Math.min(0.1, Math.abs(n) / sr);
        const now = this.ctx.currentTime;
        // Sprungfrei umsetzen: eine kurze Rampe statt eines harten Sprungs (der knackt
        // im Delay hörbar). 5 ms ist kurz genug, um beim Drehen unmittelbar zu wirken.
        this.dryDelay.delayTime.setTargetAtTime(n > 0 ? secs : 0, now, 0.005);
        this.wetDelay.delayTime.setTargetAtTime(n < 0 ? secs : 0, now, 0.005);
    }

    /** Linearer Crossfade wie im GateReverb. Bei 'aus' zählt nur der direkte Pfad.
     *  `immediate` (nur beim Aufbau) setzt hart statt zu gleiten – sonst startet der
     *  Effekt mit einer 20-ms-Rampe aus dem Gain-Default 1. */
    _applyGains(immediate = false) {
        const now = this.ctx.currentTime;
        const dry = this.active ? 1 - this.mix : 0;
        const wet = this.active ? this.mix : 0;
        if (immediate) { this.dry.gain.value = dry; this.wet.gain.value = wet; return; }
        this.dry.gain.setTargetAtTime(dry, now, 0.02);
        this.wet.gain.setTargetAtTime(wet, now, 0.02);
    }

    /** Shaper-Kurve neu erzeugen (Drive eingebacken). */
    buildCurve() {
        const N = 2048;
        const c = new Float32Array(N);
        const drive = this.drive;
        for (let i = 0; i < N; i++) {
            const x = (i / (N - 1)) * 2 - 1;
            const xd = x * drive;
            let y;
            switch (this.mode) {
                case 'Hard Clip': y = Math.max(-1, Math.min(1, xd)); break;
                case 'Foldback': y = foldback(xd); break;
                case 'Saturation':
                default: y = Math.tanh(xd); break;
            }
            c[i] = y;
        }
        this.shaper.curve = c;
    }
}
