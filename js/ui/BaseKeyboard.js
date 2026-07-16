/**
 * BaseKeyboard.js – 12-Ton-Brett für die Base-Frq-Gruppe (@dpa 20260716_031100).
 *
 * Bewusst NICHT das Skaler-Keyboard: dort ist jede Taste ein Schalter in einer Maske
 * (beliebig viele an), hier gibt es immer genau EINEN Ton – die Basis.
 *
 *   • Quelle 'Ton'  : die Tasten sind bedienbar, Klick wählt die Tonklasse
 *                     (single on/off – ein neuer Ton löst den alten ab).
 *   • sonst (Freq/Tempo): reine ANZEIGE – die tatsächlich klingende BaseFrq wird als
 *                     Tonklasse hervorgehoben. Man sieht also, wo eine frei eingestellte
 *                     Frequenz im Tonraum landet, ohne sie umrechnen zu müssen.
 *
 * Optik teilt es sich mit dem Skaler-Keyboard (.keyboard/.kb-key), inklusive der
 * Größen-/Farb-Variablen aus den Element-Settings.
 */
import { NOTE_NAMES } from '../pitch/ScaleModel.js';
import { freqToMidi } from '../pitch/Scaler.js';
import { hint } from '../core/i18n.js';

const BLACK = new Set([1, 3, 6, 8, 10]);

export class BaseKeyboard {
    /**
     * @param {import('../core/State.js').State} state
     * @param {() => number} getBaseFreq – die effektive BaseFrq (engine.baseFreq)
     */
    constructor(state, getBaseFreq) {
        this.state = state;
        this.getBaseFreq = getBaseFreq;
        this._lastPc = -1;
        this._lastSrc = null;

        this.element = document.createElement('div');
        this.element.className = 'keyboard base-keyboard';

        const row = document.createElement('div');
        row.className = 'kb-keys';
        this._keys = NOTE_NAMES.map((name, i) => {
            const key = document.createElement('button');
            key.className = 'kb-key ' + (BLACK.has(i) ? 'kb-black' : 'kb-white');
            key.type = 'button';
            const ind = document.createElement('div'); ind.className = 'kb-ind';
            const id = document.createElement('div'); id.className = 'kb-id'; id.textContent = name;
            key.appendChild(ind); key.appendChild(id);
            key.addEventListener('click', () => {
                // Nur im Ton-Modus bedienbar; sonst ist das Brett eine Anzeige.
                if (this.state.get('baseSrc') !== 'Ton') return;
                this.state.set('baseNote', name);
            });
            row.appendChild(key);
            return key;
        });
        this.element.appendChild(row);

        this.refresh();
        state.subscribe((key) => {
            if (key === '*' || key === 'baseSrc' || key === 'baseNote') this.refresh();
        });
    }

    /** Bedienbar oder Anzeige? Hängt allein an der Quelle. */
    refresh() {
        const src = this.state.get('baseSrc');
        this.element.classList.toggle('kb-readonly', src !== 'Ton');
        // Über die Hilfe-Blase (data-hint), nicht per title – sonst stünde neben der Blase
        // ein zweiter Tooltip, den der Schalter in der Kopfzeile nicht abschalten kann.
        // Zwei ganze Literale statt einem zusammengesetzten Satz: der deutsche Text IST
        // der i18n-Schlüssel (s. js/core/i18n.js).
        hint(this.element, src === 'Ton'
            ? 'Basis-Tonklasse wählen (←/→ schalten sie ebenfalls durch)'
            : 'Zeigt, auf welchem Ton die aktuelle BaseFrq liegt (wählbar nur bei Quelle „Ton")');
        this._lastSrc = src;
        this._lastPc = -1;   // Markierung im nächsten tick() neu setzen
        this.tick();
    }

    /** Läuft im Render-Loop: die klingende Basis wandert (Tempo-Quelle, Band, Glide …). */
    tick() {
        const src = this.state.get('baseSrc');
        if (src !== this._lastSrc) this.refresh();
        // Im Ton-Modus zeigt das Brett die GEWÄHLTE Klasse (die Basis ist per Definition
        // dieser Ton); sonst die, auf der die tatsächliche Frequenz liegt.
        const pc = src === 'Ton'
            ? Math.max(0, NOTE_NAMES.indexOf(this.state.get('baseNote')))
            : ((Math.round(freqToMidi(Math.max(1e-9, this.getBaseFreq()))) % 12) + 12) % 12;
        if (pc === this._lastPc) return;   // nur bei echtem Wechsel ins DOM fassen
        this._lastPc = pc;
        this._keys.forEach((k, i) => k.classList.toggle('kb-on', i === pc));
    }

    mount(parent) { parent.appendChild(this.element); }
}
