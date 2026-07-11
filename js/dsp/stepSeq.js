/**
 * stepSeq.js – Reine Logik für die Step-Sequenzer (Filter & Amp).
 *
 * Ein Sequenzer ist ein fester Puffer von SEQ_MAX Werten (0..1). Sichtbar/aktiv
 * sind nur die ersten `length` Steps; alles dahinter ist die „unsichtbare"
 * Sequenz (wird von Fill befüllt, beim Aufziehen von Steps sichtbar).
 *
 * Wert je Step:
 *   0    = off  → kein Trigger (die alte Hüllkurve läuft weiter)
 *   >0   = Trigger mit dieser „Env-Höhe" (Velocity/Depth 0..1)
 *
 * Web-Audio-frei → headless testbar (test/logic.test.mjs).
 */

export const SEQ_MAX = 120;

/**
 * Default-Puffer bauen.
 *   'first' → nur Step 0 = 1, Rest 0 (Filter-Default: einmal triggern, dann laufen lassen)
 *   'full'  → alles 1        (Amp-Default: jeder Step voll)
 */
export function makeSeqSteps(mode) {
    const a = new Array(SEQ_MAX).fill(mode === 'full' ? 1 : 0);
    if (mode === 'first') a[0] = 1;
    return a;
}

/**
 * Nächste Position im Ringlauf.
 *   reset=true → 0 (der „set0"-Knopf: nächster Trigger fängt vorne an)
 *   sonst      → (pos+1) mod length
 * pos startet sinnvoll bei -1 → erster Trigger landet auf 0.
 */
export function seqAdvance(pos, length, reset) {
    const len = Math.max(1, Math.min(SEQ_MAX, length | 0));
    if (reset) return 0;
    return (((pos | 0) + 1) % len + len) % len;
}

/**
 * Fill: das sichtbare Muster [0..length) über den unsichtbaren Rest bis SEQ_MAX
 * kacheln. Nach dem Aufziehen von Steps wiederholt sich so der bisherige Inhalt.
 * Gibt einen NEUEN Array zurück (State-Immutabilität).
 */
export function fillSeq(steps, length) {
    const len = Math.max(1, Math.min(SEQ_MAX, length | 0));
    const out = new Array(SEQ_MAX);
    for (let i = 0; i < SEQ_MAX; i++) {
        const src = i < len ? i : i % len;
        const v = (steps && steps[src]) || 0;
        out[i] = Math.max(0, Math.min(1, v));
    }
    return out;
}
