/**
 * TriggerDivider.js – Wandelt BPM + Notenteilung in Triggerintervall (Sekunden).
 *
 * Reine Berechnung, keine Web-Audio-Abhängigkeit → headless testbar.
 *
 * 1/1  = ganze Note  = 4 Viertel
 * 1/4  = Viertel     = 1 Beat
 * 1/16 = Sechzehntel = 0.25 Beat
 */

/** Verfügbare Teilungen: label → Faktor in Vierteln (Beats). */
export const DIVISIONS = {
    '1/1': 4,
    '1/2': 2,
    '1/4': 1,
    '1/8': 0.5,
    '1/16': 0.25,
};

export const DIVISION_LABELS = Object.keys(DIVISIONS);

/**
 * Intervalldauer eines Triggers in Sekunden.
 * @param {number} bpm        – Tempo in BPM (Viertel pro Minute)
 * @param {string} division   – Schlüssel aus DIVISIONS, z.B. '1/16'
 * @returns {number} Sekunden pro Trigger
 */
export function triggerInterval(bpm, division) {
    const beats = DIVISIONS[division] ?? 1;
    const secPerBeat = 60 / Math.max(1e-6, bpm);
    return beats * secPerBeat;
}
