/**
 * Scaler.js – Begradigt einen rohen Tonhöhenwert in eine feste Frequenz.
 *
 *   ① Skala-GATE  : Ton auf nächsten Halbton runden; ist dessen Tonklasse im
 *                   12-Ton-Keyboard AUS → kein Trigger (Pause, return null).
 *   ② Harmonisieren: aktive Frequenz auf n·BaseFrq ziehen, Mix 0..1 überblendet.
 *
 * Tonnamen sind ABSOLUT (A440-Stimmung): die zur Frequenz passende Note.
 * Reine Logik, headless testbar.
 */

const A440_MIDI = 69;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Frequenz → MIDI-Notennummer (Fließkomma), A4=440=69. */
export function freqToMidi(hz) {
    return A440_MIDI + 12 * Math.log2(Math.max(1e-9, hz) / 440);
}

/** MIDI → Frequenz. */
export function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - A440_MIDI) / 12);
}

/** MIDI → absoluter Notenname inkl. Oktave, z.B. 45 → "A2". */
export function midiToName(midi) {
    const m = Math.round(midi);
    const pc = ((m % 12) + 12) % 12;
    const oct = Math.floor(m / 12) - 1;
    return NAMES[pc] + oct;
}

/** Halbton → Frequenz (temperiert) relativ zu refHz. */
export function semitoneToHz(semitone, refHz) {
    return refHz * Math.pow(2, semitone / 12);
}

/** Frequenz auf nächstes ganzzahliges Vielfaches von baseHz ziehen (n>=1). */
export function harmonicSnap(hz, baseHz) {
    if (baseHz <= 0) return hz;
    const n = Math.max(1, Math.round(hz / baseHz));
    return n * baseHz;
}

/**
 * Liste der AKTIVEN MIDI-Töne im Fenster [von … von+range] (absolute Tonklassen).
 * @param {number} vonMidi  – untere Tonhöhe als MIDI
 * @param {number} range    – Spanne in Halbtönen
 * @param {import('./ScaleModel.js').ScaleModel} scale
 * @returns {number[]}
 */
export function activeMidis(vonMidi, range, scale) {
    const lo = Math.round(vonMidi);
    const hi = lo + Math.round(range);
    const out = [];
    for (let m = lo; m <= hi; m++) {
        const pc = ((m % 12) + 12) % 12;
        if (!scale || !scale.mask || scale.mask[pc]) out.push(m);
    }
    return out;
}

/**
 * Scale-Quantizer: verteilt den S&H-Wert GLEICHMÄSSIG auf die aktiven Töne des
 * Fensters – jeder Trigger trifft einen aktiven Ton (kein Rest durch die Skala).
 * @param {object} p
 * @param {number} p.unipolar     – S&H-Wert 0..1
 * @param {number} p.vonMidi      – untere Tonhöhe (MIDI)
 * @param {number} p.range        – Spanne in Halbtönen
 * @param {import('./ScaleModel.js').ScaleModel} p.scale
 * @param {number} p.baseHz       – Harmonisier-Grundfrequenz (<= von)
 * @param {number} p.harmonizeMix – 0..1
 * @returns {number|null} Frequenz, oder null wenn KEIN Ton aktiv ist
 */
export function quantizeToScale({ unipolar, vonMidi, range, scale, baseHz, harmonizeMix = 0 }) {
    const list = activeMidis(vonMidi, range, scale);
    if (list.length === 0) return null; // alle Töne aus → Stille

    const u = clamp01(unipolar);
    let idx = Math.floor(u * list.length);
    if (idx >= list.length) idx = list.length - 1; // u==1 sauber abfangen
    const midi = list[idx];

    const scaledHz = midiToFreq(midi);
    if (harmonizeMix <= 0 || baseHz <= 0) return scaledHz;
    const harmHz = harmonicSnap(scaledHz, baseHz);
    const mix = clamp01(harmonizeMix);
    return scaledHz * (1 - mix) + harmHz * mix;
}
