/**
 * ScaleModel.js – 12-Ton-Maske (eine Oktave) + Skalen-Presets.
 *
 * Reine Logik. Hält 12 Booleans (C, C#, … B). quantize() rundet einen
 * beliebigen Halbtonwert auf die nächste AKTIVE Stufe (über Oktaven hinweg).
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Ein paar nützliche Start-Skalen (12 bool, Index 0 = C). */
export const SCALE_PRESETS = {
    chromatic: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    major:     [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1],
    minor:     [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0],
    pentaMin:  [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0],
    octaves:   [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

/**
 * Skala-Maske um `delta` Halbtöne auf der Frequenzachse verschieben (rotieren).
 * Die Skala selbst (Intervallmuster) bleibt gleich, nur ihre Lage im 12-Ton-Raster
 * wandert: newMask[(k+delta) mod 12] = mask[k]. delta=5 → C-Stufe landet auf F.
 * @param {number[]} mask  – 12 Werte (0/1)
 * @param {number} delta   – Verschiebung in Halbtönen (beliebig, mod 12)
 * @returns {number[]} neue 12er-Maske
 */
export function rotateMask(mask, delta) {
    const d = ((Math.round(delta) % 12) + 12) % 12;
    const out = new Array(12).fill(0);
    for (let k = 0; k < 12; k++) out[(k + d) % 12] = mask[k] ? 1 : 0;
    return out;
}

export class ScaleModel {
    /** @param {number[]} [mask] – 12 Werte (0/1). Default: chromatisch. */
    constructor(mask) {
        this.mask = (mask && mask.length === 12)
            ? mask.map(Boolean)
            : SCALE_PRESETS.chromatic.map(Boolean);
    }

    setPreset(name) {
        const p = SCALE_PRESETS[name];
        if (p) this.mask = p.map(Boolean);
        return this;
    }

    toggle(index) {
        this.mask[index] = !this.mask[index];
        return this;
    }

    /** @returns {boolean} ob mindestens eine Stufe aktiv ist */
    get hasActive() {
        return this.mask.some(Boolean);
    }

    /**
     * Runde einen Halbtonwert (relativ, kann nachkommastellig sein) auf die
     * nächste aktive Skalenstufe. Sucht über Oktaven hinweg den nächsten Treffer.
     * @param {number} semitone – z.B. 7.3
     * @returns {number} gerundeter Halbton (ganzzahlig) auf aktiver Stufe
     */
    quantize(semitone) {
        if (!this.hasActive) return Math.round(semitone); // Maske leer → nicht quantisieren
        const target = Math.round(semitone);
        // Suche im Umkreis nach dem nächsten aktiven Pitch-Class
        for (let d = 0; d < 12; d++) {
            const up = target + d;
            const down = target - d;
            if (this.mask[((up % 12) + 12) % 12]) return up;
            if (this.mask[((down % 12) + 12) % 12]) return down;
        }
        return target;
    }

    toJSON() { return { mask: this.mask.map(Number) }; }
    static fromJSON(json) { return new ScaleModel(json?.mask); }
}
