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

/**
 * Frequenz in ein Oktavband [low, 2·low) falten (statt ±Oktave-Verschiebung):
 * multipliziert/halbiert mit 2, bis sie im Band liegt. So wählt ein Regler direkt
 * das Register als Hz-Bereich (z.B. low=30 → Band 30–60 Hz), egal welche Quell-Frequenz.
 * @param {number} freq
 * @param {number} low  – untere Bandgrenze in Hz (> 0)
 * @returns {number} gefaltete Frequenz in [low, 2·low)
 */
export function foldToBand(freq, low) {
    if (!(freq > 0) || !(low > 0)) return freq;
    let f = freq;
    while (f >= 2 * low) f /= 2;
    while (f < low) f *= 2;
    return f;
}

/**
 * Frequenz auf das Harmonie-Raster um baseHz ziehen – in BEIDE Richtungen:
 *   • hz ≥ baseHz → nächstes ganzzahliges Vielfache n·baseHz (n≥1): baseHz, 2·, 3· …
 *   • hz < baseHz → nächste Sub-Oktave baseHz/2^k (k≥0): baseHz, /2, /4, /8 …
 * So rasten tiefere Töne als die Basis auf Oktaven UNTER der Basis (statt fälschlich
 * nach oben auf die Basis zu klappen). @dpa: „Teiler <1 → 1/2, 1/4, 1/8 der BaseFrq".
 */
export function harmonicSnap(hz, baseHz) {
    if (baseHz <= 0 || hz <= 0) return hz;
    if (hz >= baseHz) return Math.max(1, Math.round(hz / baseHz)) * baseHz;
    const k = Math.max(0, Math.round(Math.log2(baseHz / hz)));   // 0 = Basis, 1 = /2, 2 = /4 …
    return baseHz / Math.pow(2, k);
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
