/**
 * ladderCore.js – Multimode-Filterkern (TPT / Zero-Delay-Feedback, nach
 * V. Zavalishin, „The Art of VA Filter Design").
 *
 * Reine Mathematik (keine Web-Audio-Abhängigkeit) → headless testbar. Dieselbe
 * Logik läuft im AudioWorklet (`ladder-worklet.js`); diese Datei ist Referenz
 * und Testbasis. Bei Änderungen BEIDE Stellen synchron halten.
 *
 * Filter-Typen (Vadim-Varianten + Erweiterungen):
 *   'LP'     : Tiefpass – Steilheit über die Polzahl abgestuft:
 *                1p : ein 1-Pol-TPT             (6 dB/Oct, keine Resonanz)
 *                2p : 2-Pol-SVF (LP-Abgriff)    (12 dB/Oct, Resonanz über R)
 *                3p : SVF + 1× 1-Pol            (18 dB/Oct)
 *                4p : SVF + 2× 1-Pol            (24 dB/Oct)
 *   'HP'     : Hochpass  – 2-Pol-SVF, High-Abgriff (12 dB/Oct, Resonanz über R)
 *   'BP'     : Bandpass  – 2-Pol-SVF, Band-Abgriff (Resonanz = Bandbreite über R)
 *   'Ladder-org' : Ur-Filter (SVF-Lowpass, fest 4-polig, Resonanz über R). Der von
 *                @dpa bevorzugte „Ladder"; die Moog-k-Varianten wurden entfernt.
 *
 * Formeln:
 *   1-Pol-TPT : G=g/(1+g) ; v=(x−s)·G ; y=v+s ; s←y+v
 *   2-Pol-SVF : hp=(x−(2R+g)·s1−s2)/(1+2R·g+g²) ; bp=g·hp+s1 ; lp=g·bp+s2
 */

/** Pre-warp: g = tan(π·fc/fs) (Cutoff-Vorverzerrung der Bilineartransformation). */
export function prewarp(cutoffHz, sampleRate) {
    const fc = Math.min(Math.max(cutoffHz, 1), sampleRate * 0.49);
    return Math.tan(Math.PI * fc / sampleRate);
}

/** Resonanz-Mapping Q → SVF-Dämpfung R = 1/(2Q). Kleines R = hohe Resonanz. */
export function resToDamping(q) {
    return 1 / (2 * Math.max(0.05, q));
}

export class LadderCore {
    constructor(poles = 4, type = 'LP') {
        this.s1 = 0; this.s2 = 0;   // SVF-States
        this.z = [0, 0];            // States der seriellen 1-Pol-Stufen (3p/4p)
        this.type = type;           // 'LP' | 'HP' | 'BP' | 'Ladder-org'
        this.setPoles(poles);
    }

    setPoles(n) { this.poles = Math.max(1, Math.min(4, n | 0)); }
    setType(t) { this.type = t || 'LP'; }
    reset() { this.s1 = this.s2 = 0; this.z[0] = this.z[1] = 0; }

    /**
     * Ein Sample durch den Filter.
     * @param {number} x – Eingang
     * @param {number} g – Pre-warp aus {@link prewarp}
     * @param {number} R – SVF-Dämpfung aus {@link resToDamping}
     * @returns {number}
     */
    tick(x, g, R) {
        // 'Ladder-org' = der Ur-Filter (1ba15ad): resonanter SVF-Lowpass, fest 4-polig,
        // Resonanz über R=1/(2q) → stabil, runder Reso-Peak (kein Moog-Selbstosz-Pfeifen).
        const org = this.type === 'Ladder-org';
        const tp = org ? 'LP' : this.type;
        const np = org ? 4 : this.poles;

        const G = g / (1 + g);
        // 1-Pol-Sonderfall (keine SVF-Resonanz) für LP & HP: HP = x − LP(x).
        if (np === 1 && (tp === 'LP' || tp === 'HP')) {
            const v = (x - this.s1) * G;
            const ylp = v + this.s1;
            this.s1 = ylp + v;
            return tp === 'HP' ? x - ylp : ylp;
        }
        // 2-Pol-TPT-SVF: alle drei Abgriffe gleichzeitig, Resonanz über R.
        const denom = 1 + 2 * R * g + g * g;
        const hp = (x - (2 * R + g) * this.s1 - this.s2) / denom;
        const bp = g * hp + this.s1; this.s1 = g * hp + bp;
        const lp = g * bp + this.s2; this.s2 = g * bp + lp;
        let out = tp === 'HP' ? hp : tp === 'BP' ? bp : lp;
        // Zusatz-Pole (3p/4p) als serielle 1-Pol-Stufen IM CHARAKTER des Typs.
        const extra = np - 2;
        for (let j = 0; j < extra; j++) {
            const v = (out - this.z[j]) * G;
            const ylp = v + this.z[j];
            this.z[j] = ylp + v;
            out = tp === 'HP' ? out - ylp : ylp;
        }
        return out;
    }
}
