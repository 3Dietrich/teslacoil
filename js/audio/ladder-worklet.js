/**
 * ladder-worklet.js – AudioWorkletProcessor des resonanten Multipol-Tiefpasses.
 *
 * Läuft im Audio-Render-Thread. Die DSP-Logik ist eine 1:1-Spiegelung von
 * `js/dsp/ladderCore.js` (Worklets können keine ES-Module zuverlässig
 * importieren) – bei Änderungen BEIDE Dateien synchron halten. Tests laufen
 * gegen ladderCore.js.
 *
 * Parameter:
 *   cutoff (a-rate) – Grund-/Hüllkurven-Cutoff in Hz (von außen automatisiert)
 *   q      (k-rate) – Resonanz; intern R = 1/(2q) (wirkt ab 2 Polen)
 * Polzahl via processorOptions.poles bzw. port-Message { poles }.
 */
class LadderProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            // Basis-Cutoff (Keytrack, pro Note gesetzt) und Env-Multiplikator (eigene
            // Automation) sind GETRENNT → sie stören sich nicht mehr. Effektiver Cutoff
            // = cutoff · cutoffEnv (pro Sample). So laufen Keytrack UND Env gleichzeitig.
            { name: 'cutoff', defaultValue: 1000, minValue: 20, maxValue: 20000, automationRate: 'a-rate' },
            { name: 'cutoffEnv', defaultValue: 1, minValue: 0.0001, maxValue: 1000, automationRate: 'a-rate' },
            { name: 'q', defaultValue: 0.707, minValue: 0.05, maxValue: 24, automationRate: 'k-rate' },
        ];
    }

    constructor(options) {
        super();
        const o = (options && options.processorOptions) || {};
        this.poles = Math.max(1, Math.min(4, (o.poles | 0) || 4));
        this.type = o.type || 'LP';
        this.s1 = 0; this.s2 = 0; this.z = [0, 0];
        this.port.onmessage = (e) => {
            if (!e.data) return;
            // Typ-/Pol-Wechsel: States nullen → verhindert Einfrieren/„Stille" nach
            // einem Umschalten aus einem instabilen Zustand.
            if (e.data.poles != null) { this.poles = Math.max(1, Math.min(4, e.data.poles | 0)); this._reset(); }
            if (e.data.type != null) { this.type = e.data.type; this._reset(); }
        };
    }

    _reset() { this.s1 = 0; this.s2 = 0; this.z = [0, 0]; }

    // ─ identisch zu LadderCore.tick (ladderCore.js) ─
    _tick(x, g, R) {
        // 'Ladder-org' = Ur-Filter (1ba15ad): SVF-Lowpass, fest 4-polig, Resonanz R=1/(2q).
        const org = this.type === 'Ladder-org';
        const tp = org ? 'LP' : this.type;
        const np = org ? 4 : this.poles;
        const G = g / (1 + g);
        if (np === 1 && (tp === 'LP' || tp === 'HP')) {
            const v = (x - this.s1) * G;
            const ylp = v + this.s1;
            this.s1 = ylp + v;
            return tp === 'HP' ? x - ylp : ylp;
        }
        const denom = 1 + 2 * R * g + g * g;
        const hp = (x - (2 * R + g) * this.s1 - this.s2) / denom;
        const bp = g * hp + this.s1; this.s1 = g * hp + bp;
        const lp = g * bp + this.s2; this.s2 = g * bp + lp;
        let out = tp === 'HP' ? hp : tp === 'BP' ? bp : lp;
        const extra = np - 2;
        for (let j = 0; j < extra; j++) {
            const v = (out - this.z[j]) * G;
            const ylp = v + this.z[j];
            this.z[j] = ylp + v;
            out = tp === 'HP' ? out - ylp : ylp;
        }
        return out;
    }

    process(inputs, outputs, params) {
        const out = outputs[0] && outputs[0][0];
        if (!out) return true;
        const inCh = inputs[0] && inputs[0][0];
        const cut = params.cutoff;
        const q = Math.max(0.05, params.q[0]);
        const R = 1 / (2 * q);
        const sr = sampleRate;
        const env = params.cutoffEnv;
        const aRate = cut.length > 1, aRateE = env.length > 1;
        for (let i = 0; i < out.length; i++) {
            const x = inCh ? inCh[i] : 0;
            // Basis (Keytrack) · Env-Multiplikator → effektiver Cutoff, dann klemmen.
            const base = (aRate ? cut[i] : cut[0]) * (aRateE ? env[i] : env[0]);
            const fc = Math.min(Math.max(base, 1), sr * 0.49);
            const g = Math.tan(Math.PI * fc / sr);
            let y = this._tick(x, g, R);
            // NaN/Inf-Schutz: instabiler Zustand → States nullen statt Dauer-Stille.
            if (!Number.isFinite(y)) { this._reset(); y = 0; }
            out[i] = y;
        }
        return true;
    }
}

registerProcessor('tesla-ladder', LadderProcessor);
