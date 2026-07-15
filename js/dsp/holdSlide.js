/**
 * holdSlide.js – die Mathematik des Hold-Pitch-Slides, als reine Funktionen.
 *
 * Der Slide ist ein einpoliger LP (exponentielle Annäherung) auf ein ÜBERHÖHTES Ziel,
 * das an der echten Zielfrequenz gekappt wird (@dpas Vorschlag 20260715: „das slide
 * smooth kann auch von einem (simplen LP-) Filter kommen … das ziel höher setzen und
 * dann limiten"). So bleibt der weiche LP-Einschwinger, der Slide kommt aber in
 * ENDLICHER Zeit exakt an – ein blankes setTargetAtTime käme nie an.
 *
 * Hier liegt die Rechnung getrennt vom AudioParam, aus zwei Gründen:
 *  1. sie ist headless testbar (Web-Audio-Module sind es nicht),
 *  2. SquareOsc kann damit den IST-Wert eines laufenden Slides bestimmen. Genau das
 *     braucht ein Retune mitten im Slide: als Startpunkt zählt, wo die Frequenz JETZT
 *     ist – nicht, wo der vorige Slide hinwollte (@dpa 20260715_224643: „Slide
 *     funktioniert nicht mehr"; mit dem alten Ziel als Anker rechnete jeder Folge-Slide
 *     von einem Ort aus, an dem der Ton nie war → bei glide ≥ Trigger-Abstand wurde die
 *     Bewegung immer kleiner, bis praktisch nichts mehr glitt).
 */

/** Form des Slides: Anzahl durchlaufener Zeitkonstanten bis zum Kappen.
 *  0.2 = nur der fast gerade Anfang der e-Kurve. Liegt FEST (@dpa 20260715:
 *  „den logarithmischen [Slide] will ich, der andere fest auf 0 und weg" – der
 *  Form-Regler ampHoldCurve ist raus). Die Zeit macht `ampHoldGlide`. */
export const SLIDE_L = 0.2;

/**
 * Slide-Plan von `from` nach `to` in `glide` Sekunden.
 * τ = glide/L; Überhöhung k = e^L/(e^L−1), damit f(glide) exakt `to` trifft
 * [aus f(glide) = from + k·(to−from)·(1−e^(−L)) ≟ to].
 * @returns {{from:number,to:number,glide:number,tau:number,target:number}}
 */
export function slidePlan(from, to, glide, L = SLIDE_L) {
    const k = Math.exp(L) / (Math.exp(L) - 1);
    return { from, to, glide, tau: glide / L, target: from + k * (to - from) };
}

/**
 * Frequenz `dt` Sekunden nach Slide-Beginn – exakt das, was der AudioParam tut:
 * setTargetAtTime(target, t0, tau), gekappt durch setValueAtTime(to, t0+glide).
 */
export function slideFreqAt(plan, dt) {
    if (!plan) return null;
    if (dt <= 0) return plan.from;
    if (dt >= plan.glide) return plan.to;
    return plan.target + (plan.from - plan.target) * Math.exp(-dt / plan.tau);
}
