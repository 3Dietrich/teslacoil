/**
 * rateFraction.js – Beste rationale Approximation eines Verhältnisses.
 *
 * Die Skaler-Rate lässt sich als Bruch k/l der Base-Frequenz ausdrücken
 * (rate = base · k/l). `bestFraction` sucht das k/l, das ein Ziel-Verhältnis
 * am besten trifft – mit getrennt einstellbaren Obergrenzen für Zähler (kMax)
 * und Nenner (lMax). Reine Logik → headless testbar.
 */

/**
 * @param {number} ratio – Ziel-Verhältnis (rate/base), > 0
 * @param {number} kMax  – max. Zähler (>=1)
 * @param {number} lMax  – max. Nenner (>=1)
 * @returns {{k:number,l:number}} bester Bruch (gekürzt)
 */
export function bestFraction(ratio, kMax, lMax) {
    const km = Math.max(1, Math.floor(kMax));
    const lm = Math.max(1, Math.floor(lMax));
    const r = ratio > 0 ? ratio : 1e-9;
    let best = { k: 1, l: 1, err: Infinity };
    for (let l = 1; l <= lm; l++) {
        // Der bei diesem Nenner nächstliegende Zähler (geklemmt auf 1..km).
        const kIdeal = Math.round(r * l);
        for (const k of new Set([kIdeal, kIdeal - 1, kIdeal + 1, 1, km])) {
            if (k < 1 || k > km) continue;
            const err = Math.abs(k / l - r);
            // Bei Gleichstand den kleineren Nenner (einfacherer Bruch) bevorzugen.
            if (err < best.err - 1e-12) best = { k, l, err };
        }
    }
    return reduce(best.k, best.l);
}

/** Bruch kürzen (ggT). */
export function reduce(k, l) {
    const g = gcd(k, l) || 1;
    return { k: Math.round(k / g), l: Math.round(l / g) };
}

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
