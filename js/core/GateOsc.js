/**
 * GateOsc.js – Unabhängiger Oszillator, der Trigger an/aus schaltet.
 *
 * Erzeugt "rhythmische Gebilde": läuft mit eigener Frequenz; ist der
 * Phasenwert unterhalb einer Schwelle (width), gilt das Gate als OFFEN.
 *
 * Reine Logik. Phase über advance(dt).
 */
export class GateOsc {
    /**
     * @param {object} [c]
     * @param {number} [c.rate=0.5]   – Hz
     * @param {number} [c.width=0.5]  – Anteil 0..1 der Periode, in dem das Gate offen ist
     * @param {boolean} [c.enabled=false] – wenn false: Gate immer offen (kein Gating)
     */
    constructor(c = {}) {
        this.rate = c.rate ?? 0.5;
        this.width = c.width ?? 0.5;
        this.enabled = c.enabled ?? false;
        this._phase = 0;
    }

    advance(dt) {
        this._phase = (this._phase + this.rate * dt) % 1;
        if (this._phase < 0) this._phase += 1;
        return this;
    }

    /** Phase zurücksetzen (Sync: reproduzierbarer Neustart). */
    reset() { this._phase = 0; return this; }

    /** @returns {boolean} ob ein Trigger gerade durchgelassen wird */
    isOpen() {
        if (!this.enabled) return true;
        return this._phase < Math.min(1, Math.max(0, this.width));
    }

    get phase() { return this._phase; }
    set phase(p) { this._phase = ((p % 1) + 1) % 1; }

    toJSON() { return { rate: this.rate, width: this.width, enabled: this.enabled }; }
    static fromJSON(j) { return new GateOsc(j); }
}
