/**
 * PitchOsc.js – Langsamer LFO, der die Tonhöhe "wandern" lässt.
 *
 * Liefert beim Abtasten (Sample & Hold) einen Halbtonwert zwischen
 * `von` und `von + range`. Output der Wellenform wird von -1..1 → 0..1
 * normalisiert (unipolar), dann auf den Halbtonbereich gespreizt.
 *
 * Reine Logik: Phase wird über advance(dt) akkumuliert.
 */

export const PITCH_WAVEFORMS = ['sine', 'saw', 'triangle', 'random'];

/** Deterministischer RNG (mulberry32): fester Seed ⇒ feste Zufallsfolge. */
function mulberry32(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class PitchOsc {
    /**
     * @param {object} [c]
     * @param {number} [c.rate=1]      – Hz (0.1 – 4)
     * @param {number} [c.from=0]      – Startton in Halbtönen ("von")
     * @param {number} [c.range=12]    – Spanne in Halbtönen (1 – 36)
     * @param {string} [c.waveform='sine']
     */
    constructor(c = {}) {
        this.rate = c.rate ?? 1;
        this.from = c.from ?? 0;
        this.range = c.range ?? 12;
        this.waveform = c.waveform ?? 'sine';
        this._phase = 0;            // 0..1
        // 'random' ist ein WIEDERHOLENDES, seed-festes Stufen-Muster ÜBER DIE PERIODE
        // (nicht ein neuer Wert pro Periode): es „schwingt" wie saw/tri von von→Range,
        // nur zufällig profiliert, und wiederholt sich jede Periode identisch. Die
        // Anzahl Stufen (Auflösung) = Range → gleicher Seed ⇒ feste Tonfolge.
        this._seed = c.seed ?? 1;
        this._pattern = null; this._patN = -1; this._patSeed = null;
    }

    get seed() { return this._seed; }
    set seed(s) { this._seed = (s | 0) || 1; }   // Muster wird bei Bedarf neu gebaut

    /** Phase zurücksetzen (Sync: reproduzierbarer Neustart; Muster ist seed-fest). */
    reset() { this._phase = 0; return this; }

    /** Akkumuliere die Phase um dt Sekunden. */
    advance(dt) {
        this._phase = (this._phase + this.rate * dt) % 1;
        if (this._phase < 0) this._phase += 1;
        return this;
    }

    /** Seed-festes Random-Stufen-Muster (Länge = Range) am aktuellen Phasenpunkt (0..1). */
    _patternValue() {
        const n = Math.max(1, Math.round(this.range));
        if (this._patN !== n || this._patSeed !== this._seed || !this._pattern) {
            const rng = mulberry32(this._seed);
            this._pattern = new Array(n);
            for (let i = 0; i < n; i++) this._pattern[i] = rng();
            this._patN = n; this._patSeed = this._seed;
        }
        const i = Math.min(n - 1, Math.floor(this._phase * n));
        return this._pattern[i];
    }

    /** Roher Wellenwert -1..1 an der aktuellen Phase. */
    _raw() {
        const p = this._phase;
        switch (this.waveform) {
            case 'saw':      return 2 * p - 1;
            case 'triangle': return 1 - 4 * Math.abs(p - 0.5);
            case 'random':   return 2 * this._patternValue() - 1;
            case 'sine':
            default:         return Math.sin(2 * Math.PI * p);
        }
    }

    /**
     * Aktueller Halbtonwert (S&H-Abnahme): -1..1 → 0..1 → [from, from+range].
     * @returns {number}
     */
    sample() {
        return this.from + this.sampleUnipolar() * this.range;
    }

    /** Roher LFO-Wert auf 0..1 normalisiert (für Scale-Quantizer). */
    sampleUnipolar() {
        return (this._raw() + 1) * 0.5;
    }

    get phase() { return this._phase; }
    set phase(p) { this._phase = ((p % 1) + 1) % 1; }

    toJSON() {
        return { rate: this.rate, from: this.from, range: this.range, waveform: this.waveform, seed: this._seed };
    }
    static fromJSON(j) { return new PitchOsc(j); }
}
