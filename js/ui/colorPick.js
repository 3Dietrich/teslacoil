/**
 * colorPick.js – Die eine Frage: „steht gerade ein Farbwähler dieses Panels offen?"
 *
 * WARUM es die Frage überhaupt gibt (@dpa 20260716_174111): „bei Farbeingabe mit Pipette
 * kann man auch über Enter nicht die Farbe übernehmen … ich glaube der Pipettenschalter
 * hat den Fokus, der eigentlich nicht gebraucht wird und evtl. die Eingabe rückgängig
 * macht".
 *
 * Der Fokus war die richtige Spur, nur andersherum: `<input type="color">` klappt einen
 * Wähler auf, der NICHT im DOM liegt (Browser-/OS-Fenster mit Pipette darin). Für unsere
 * Settings-Panels sieht jeder Klick darin – und vor allem der Klick, mit dem man ihn
 * wieder schließt – aus wie ein Klick irgendwo draußen. Unser Außenklick-Handler machte
 * daraufhin das Panel zu und setzte sein Ziel auf null; die gerade gepickte Farbe hatte
 * dann niemanden mehr, dem sie gehörte, und Enter griff ins Leere.
 *
 * Solange der Wähler offen ist, bleibt sein `<input>` das aktive Element – das ist der
 * einzige Anhaltspunkt, den uns die Plattform lässt (es gibt kein 'pickeropen'-Event).
 * Genau darauf stützt sich die Ausnahme.
 *
 * @param {HTMLElement} panel – Panel, dessen Farbfelder gemeint sind
 * @returns {boolean}
 */
export function colorPickerBusy(panel) {
  const a = document.activeElement;
  return !!(a && a.tagName === 'INPUT' && a.type === 'color' && panel.contains(a));
}
