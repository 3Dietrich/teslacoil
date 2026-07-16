/**
 * rgba.js – Farbe ↔ Hex + Alpha.
 *
 * `<input type="color">` kann nur `#rrggbb` – es kennt keine Deckkraft. Wo eine Farbe
 * durchscheinen soll (Seq-Balken, Reverb-Reflections), speichern wir sie deshalb als
 * `rgba(...)` und zerlegen sie fürs Bedienen in „Farbwähler + Alpha-Regler". Diese drei
 * Funktionen sind der Übersetzer dazwischen.
 *
 * Lag vorher als private Kopie in StepSeqUI; seit die Reflections dieselbe Alpha-Bedienung
 * haben (@dpa 20260716_174111: „die Farben mit alpha (wie bei step sequ)") liegt es hier.
 */

/** 'rgba(90,209,255,.5)' → '#5ad1ff' (fb = Rückfallwert bei leer/unlesbar). */
export const parseHex = (rgba, fb) => {
  if (!rgba) return fb;
  const m = rgba.match(/\d+/g);
  if (!m) return fb;
  return '#' + [m[0], m[1], m[2]].map((v) => (+v).toString(16).padStart(2, '0')).join('');
};

/** 'rgba(90,209,255,.5)' → 0.5. Ohne vierten Wert (also 'rgb(...)') gilt `fb`. */
export const parseA = (rgba, fb = 1) => {
  const m = rgba && rgba.match(/[\d.]+/g);
  return m && m.length >= 4 ? parseFloat(m[3]) : fb;
};

/** '#5ad1ff' + 0.5 → 'rgba(90,209,255,0.5)'. */
export const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
