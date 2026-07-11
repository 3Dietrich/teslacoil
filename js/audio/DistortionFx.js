/**
 * DistortionFx.js – Saturation/Clipping/Distortion über WaveShaperNode.
 *
 * Effekt-Slot im Bus VOR dem Reverb (… → Ladder → Distortion → Reverb → Master).
 * Drive ist in die Shaper-Kurve eingebacken (kein Clamping-Problem), Oversampling
 * 4× gegen das Alias, das jede Nichtlinearität erzeugt (vgl. Vadim, Kap. 4.5/4.6).
 *
 * Modi: Bypass | Saturation (tanh) | Hard Clip | Foldback.
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

        this.active = false;
        this.mode = 'Saturation';
        this.drive = 1;

        this.shaper.connect(this.post);
        this.post.connect(this.output);
        this.buildCurve();
        this._route();
    }

    setActive(on) { this.active = !!on; this._route(); }

    _route() {
        try { this.input.disconnect(); } catch { /* noop */ }
        if (this.active) this.input.connect(this.shaper);
        else this.input.connect(this.output);
    }

    setMode(m) { this.mode = m; this.buildCurve(); }
    setDrive(d) { this.drive = Math.max(0.1, d); this.buildCurve(); }
    setOut(o) { this.post.gain.setTargetAtTime(Math.max(0, o), this.ctx.currentTime, 0.01); }

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
