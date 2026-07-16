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

/** Kleinster Wert, den „volle Dynamik" (Dyn 200) einem leisen Step lässt.
 *  @dpa 20260716_164359: „<50% = min (nicht aus!)" – ein Step unter der Hälfte wird
 *  ganz leise, aber er bleibt ein Ton. 0 wäre „off" und damit eine andere Aussage
 *  (kein Trigger), die dem Sequenzer nicht zusteht: was off ist, entscheidet das Muster. */
export const SEQ_DYN_MIN = 0.1;

/**
 * Dyn: die Dynamik-Spreizung eines Step-Werts (@dpa 20260716_164359).
 *
 *   dyn=0    → alles 100 %      (keine Dynamik – jeder Ton gleich laut)
 *   dyn=100  → wie eingestellt  (roher Step-Wert, neutral)
 *   dyn=200  → volle Dynamik    (>50 % → 100 %, <50 % → SEQ_DYN_MIN)
 *
 * Zwischen den drei Punkten wird linear geblendet, damit der Regler durchgehend
 * stetig ist (kein Sprung bei 100).
 *
 * Step-Wert 0 = „off" bleibt IMMER 0: Dyn regelt die Lautstärke der Töne, es
 * erfindet keine. Sonst würde dyn=0 („alles 100 %") aus jeder Pause einen Ton machen.
 */
export function seqDyn(v, dyn) {
    const s = Math.max(0, Math.min(1, v || 0));
    if (s <= 0) return 0;
    const t = Math.max(0, Math.min(200, dyn ?? 100)) / 100;
    // Die drei Stützstellen sind @dpas Ansage und werden EXAKT getroffen – nicht über die
    // Blend-Formel gerechnet: 1 + (0.2−1)·1 ergäbe 0.19999999999999996 statt „= eingestellt".
    if (t === 1) return s;
    const hard = s >= 0.5 ? 1 : SEQ_DYN_MIN;         // volle Dynamik: hart auf/ab
    if (t === 2) return hard;
    if (t < 1) return 1 + (s - 1) * t;               // 0 → 1 … 1 → s
    return s + (hard - s) * (t - 1);                 // 1 → s … 2 → hard
}

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
