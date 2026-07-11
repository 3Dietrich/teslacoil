/**
 * filterMod.js – Reine Filter-Modulations-Mathematik (Keytrack + Env-Peak), ohne
 * Web-Audio-Abhängigkeit → headless testbar. Wird von TeslaEngine._onTrigger genutzt.
 */

/**
 * Keyboard-Tracking (musikalisch, MULTIPLIKATIV – nicht additiv!): eine Oktave
 * gespielte Tonhöhe verschiebt den Cutoff um eine Oktave. Bei 100 % folgt der Cutoff
 * 1:1 der Tonhöhe relativ zur Referenz `ref` (= untere Tonhöhe „von"); bei 0 % bleibt
 * er beim Knopfwert. (Additiv `cutoff+freq` war falsch: bei hohem Cutoff bewegte eine
 * Oktave den Cutoff nur wenige Halbtöne.)
 * @param {number} cutoff      – Grund-Cutoff bei der Referenz-Tonhöhe (Hz)
 * @param {number} keyTrackPct – 0..100
 * @param {number} freq        – gespielte OSC-Frequenz (Hz)
 * @param {number} ref         – Referenz-Tonhöhe (Hz), z. B. fromHz
 * @returns {number} effektiver Cutoff, auf [20, 20000] geklemmt
 */
export function keytrackCutoff(cutoff, keyTrackPct, freq, ref) {
    if (keyTrackPct <= 0 || !(ref > 0) || !(freq > 0)) return Math.max(20, Math.min(20000, cutoff));
    const factor = Math.pow(freq / ref, keyTrackPct / 100);
    return Math.max(20, Math.min(20000, cutoff * factor));
}

/**
 * Env als MULTIPLIKATOR auf den (keytrackenden) Basis-Cutoff – base-unabhängig, in
 * Oktaven: lpEnv=+1 öffnet um `octaves` Oktaven nach oben, −1 nach unten, 0 = ×1.
 * So kann die Env als eigener Parameter (cutoffEnv) unabhängig vom Keytrack-Basis-
 * Cutoff laufen; effektiver Cutoff = Basis · Multiplikator (im Worklet geklemmt).
 * @param {number} lpEnv   – −1..+1
 * @param {number} depth   – 0..1 (Filter-Seq-Step bzw. 1)
 * @param {number} [octaves=6] – Hub bei ±1
 * @returns {number} Multiplikator (>0)
 */
export function envPeakMult(lpEnv, depth, octaves = 6) {
    return Math.pow(2, lpEnv * depth * octaves);
}
