/**
 * keyRoute.js – EINE Regel dafür, wann eine Taste dem fokussierten Element gehört
 * und wann dem globalen Shortcut (Space=Start/Stop, 'e'=Anordnen-Modus, Pfeile=BaseFrq).
 *
 * Die Regel fragt NICHT „welchen Tag hat das Ziel?" – das war der alte Fehler: ein
 * fokussiertes <select> (Menu-Switch) oder <input type=checkbox> ('aktiv') stellte
 * Space und 'e' tot, obwohl beide Elemente diese Tasten gar nicht brauchen. Sondern:
 *
 *     „Braucht dieses Element genau DIESE Taste für seine eigene Bedienung?"
 *
 * Daraus fallen genau drei Sorten Ziel:
 *
 *   'text'   – echte Eingabe (input[text|number|…], textarea, contenteditable):
 *              tippt Zeichen → Space, Buchstaben UND Pfeile (Cursor) bleiben lokal.
 *   'arrows' – wird MIT DEN PFEILEN bedient (select, input[range], Knob):
 *              nur die Pfeile bleiben lokal, Space/'e' gehören global.
 *   'none'   – Checkbox ('aktiv'), Buttons, Body: braucht keine dieser Tasten →
 *              alle globalen Shortcuts greifen.
 *
 * Dadurch darf der Fokus nach dem Bedienen ruhig auf dem Element stehen bleiben
 * (den braucht der Tab-Loop), ohne Space/'e' zu blockieren.
 *
 * Duck-typed (tagName/type/classList statt instanceof) → headless testbar.
 */

/** input-Typen, in die man KEINEN Text tippt. Alles andere ist Texteingabe. */
const NON_TEXT_INPUT = new Set([
    'checkbox', 'radio', 'range', 'color', 'button', 'submit', 'reset', 'file', 'image',
]);

/** Klassifiziert das Event-Ziel: 'text' | 'arrows' | 'none'. */
export function targetKind(el) {
    if (!el) return 'none';
    if (el.isContentEditable) return 'text';
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea') return 'text';
    if (tag === 'input') {
        const type = (el.type || 'text').toLowerCase();
        if (!NON_TEXT_INPUT.has(type)) return 'text';
        // Der Range-Slider (Master-Volume) ist das einzige Nicht-Text-input, das
        // die Pfeile selbst benutzt.
        return type === 'range' ? 'arrows' : 'none';
    }
    if (tag === 'select') return 'arrows';
    if (el.classList && el.classList.contains('knob-container')) return 'arrows';
    return 'none';
}

/** Space / 'e': gehören uns, ausser man tippt gerade echten Text. */
export const globalKeyOk = (el) => targetKind(el) !== 'text';

/** Pfeiltasten: gehören uns nur, wenn das Ziel sie nicht selbst zur Bedienung braucht. */
export const arrowKeyOk = (el) => targetKind(el) === 'none';
