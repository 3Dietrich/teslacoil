/**
 * Keyboard.js – Kompaktes 12-Ton sw-Keyboard (Skala-Editor) + Live-Tonanzeige.
 *
 * Tonklassen sind ABSOLUT (C…B nach A440). An/Aus wird durch ein halbtrans-
 * parentes Orange (0.4) markiert – die Tastenfarbe bleibt sichtbar. Darüber
 * surft die aktuell klingende Note/Frequenz smooth durch.
 *
 * Transponier-Modus („Anker"): Klick auf die Frequenzanzeige schaltet um. Dann
 * leuchtet der Skala-Anker; Klick auf einen Tonnamen VERSCHIEBT die ganze Skala
 * auf der Frequenzachse dorthin (Maske rotieren, Muster bleibt).
 *
 * skal2-Modus (rechts, bleibt auch im Anker-Modus an): dieselben 12 Tasten werden
 * zu 12 abrufbaren Skala-Slots. Unten (Name) = Slot laden (aktiver hervorgehoben,
 * Doppelklick = umbenennen). Oben (IO) = Ton an/aus wie immer (schreibt in den
 * aktiven Slot zurück). Der Versatz (Anker) wandert mit in den Slot. Die 12 Slots
 * zusammen = ein „P2" (über die Skaler-Gruppe speicher-/ladbar).
 */
import { NOTE_NAMES, rotateMask } from '../pitch/ScaleModel.js';
import { freqToMidi, midiToName } from '../pitch/Scaler.js';

const BLACK = new Set([1, 3, 6, 8, 10]); // C#, D#, F#, G#, A#

export class Keyboard {
    /**
     * @param {import('../core/State.js').State} state
     * @param {() => number} getFreq – aktuell klingende Frequenz
     * @param {() => number} [getBaseFreq] – Base-Frq für die Vielfach-Anzeige
     */
    constructor(state, getFreq, getBaseFreq = () => 0) {
        this.state = state;
        this.getFreq = getFreq;
        this.getBaseFreq = getBaseFreq;
        this.element = document.createElement('div');
        this.element.className = 'keyboard';
        this._keys = [];
        this._lastPc = -1;
        this._transpose = false;
        this._build();
        state.subscribe((k) => {
            if (['scaleMask', 'scaleRoot', 'skal2On', 'skal2Active', 'skal2Slots', '*'].includes(k)) this._refresh();
        });
    }

    _skal2() { return !!this.state.get('skal2On'); }

    _build() {
        // Kopfzeile: links die Frequenzanzeige (= Anker-Umschalter), rechts der skal2-Schalter.
        const head = document.createElement('div');
        head.className = 'kb-head';
        this._readout = document.createElement('div');
        this._readout.className = 'kb-readout kb-readout-hint';
        this._readout.title = 'Klick: Skala auf der Frequenzachse verschieben (Anker)';
        this._readout.textContent = '–';
        this._readout.addEventListener('click', () => this._toggleTranspose());
        head.appendChild(this._readout);

        this._skBtn = document.createElement('button');
        this._skBtn.className = 'pb-btn kb-skal2-btn';
        this._skBtn.textContent = 'skal2';
        this._skBtn.title = 'skal2: die 12 Tasten als abrufbare Skala-Slots (P2). Bleibt auch im Anker-Modus aktiv.';
        this._skBtn.addEventListener('click', () => this.state.set('skal2On', !this._skal2()));
        head.appendChild(this._skBtn);
        this.element.appendChild(head);

        const row = document.createElement('div');
        row.className = 'kb-keys';
        const mask = this.state.get('scaleMask');

        NOTE_NAMES.forEach((name, i) => {
            const key = document.createElement('button');
            key.className = 'kb-key ' + (BLACK.has(i) ? 'kb-black' : 'kb-white');
            key.dataset.index = String(i);
            // oben: Orange-Zustandsanzeige (aus/an) · unten: s/w-Tastenidentität + Note/Slot-Name
            key.innerHTML = `<span class="kb-ind"></span><span class="kb-id">${name}</span>`;
            key.title = name;
            key.classList.toggle('kb-on', !!mask[i]);
            key.addEventListener('click', (e) => this._onKey(i, e));
            key.addEventListener('dblclick', (e) => this._onDblKey(i, e));
            row.appendChild(key);
            this._keys.push(key);
        });
        this.element.appendChild(row);
        this._refresh();
    }

    _toggleTranspose() {
        this._transpose = !this._transpose;
        this.element.classList.toggle('kb-transpose-mode', this._transpose);
        // Reset: die zuletzt klingende Note NICHT selektiert lassen (sonst leuchtet
        // sie zusätzlich zum Anker). Live-Highlight startet neu.
        this._keys.forEach((k) => k.classList.remove('kb-active'));
        this._lastPc = -1;
        this._refresh();
    }

    /** Klick auf eine Taste. Verhalten hängt von Modus (Anker/skal2) und Klickzone ab. */
    _onKey(i, e) {
        if (this._transpose) { this._transposeTo(i); return; }   // Anker gilt in BEIDEN Modi
        if (this._skal2()) {
            // skal2 (kein Anker): oben (IO) = Ton toggeln, unten (Name) = Slot i laden.
            if (e && e.target.closest('.kb-ind')) this._toggle(i);
            else this._loadSlot(i);
            return;
        }
        this._toggle(i);
    }

    /** Doppelklick: im skal2-Modus den Slot-Namen umbenennen (1–2 Zeichen/Icon). */
    _onDblKey(i, e) {
        if (!this._skal2() || this._transpose) return;
        e.preventDefault(); e.stopPropagation();
        const slots = this.state.get('skal2Slots');
        const cur = (slots[i] && slots[i].name) || String(i + 1);
        const name = prompt('Slot-Name (kurz):', cur);
        if (name === null) return;
        const next = slots.map((s) => ({ ...s, mask: s.mask.slice() }));
        next[i] = { ...next[i], name: name.slice(0, 4) || String(i + 1) };
        this.state.set('skal2Slots', next);
    }

    _toggle(i) {
        const mask = this.state.get('scaleMask').slice();
        mask[i] = mask[i] ? 0 : 1;
        this.state.set('scaleMask', mask);
        if (this._skal2()) this._writeActiveSlot({ mask: mask.slice() });   // Edit in den Slot zurück
    }

    /** Slot i laden: Maske + Versatz aus dem Slot in den Live-Zustand. */
    _loadSlot(i) {
        const slots = this.state.get('skal2Slots');
        const s = slots[i];
        if (!s) return;
        this.state.set('skal2Active', i);
        this.state.set('scaleMask', s.mask.slice());
        this.state.set('scaleRoot', s.root | 0);
    }

    /** Skala so verschieben, dass der bisherige Anker auf Tonklasse i landet. */
    _transposeTo(i) {
        const root = this.state.get('scaleRoot') | 0;
        const delta = ((i - root) % 12 + 12) % 12;
        let mask = this.state.get('scaleMask');
        if (delta) { mask = rotateMask(mask, delta); this.state.set('scaleMask', mask); }
        this.state.set('scaleRoot', i);
        if (this._skal2()) this._writeActiveSlot({ mask: mask.slice(), root: i });  // Versatz in den Slot
    }

    /** Patch in den aktuell aktiven skal2-Slot schreiben (unveränderliche Kopie). */
    _writeActiveSlot(patch) {
        const a = this.state.get('skal2Active') | 0;
        const slots = this.state.get('skal2Slots').map((s) => ({ ...s, mask: s.mask.slice() }));
        if (!slots[a]) return;
        slots[a] = { ...slots[a], ...patch };
        this.state.set('skal2Slots', slots);
    }

    _refresh() {
        const mask = this.state.get('scaleMask');
        const root = this.state.get('scaleRoot') | 0;
        const sk = this._skal2();
        const active = this.state.get('skal2Active') | 0;
        const slots = this.state.get('skal2Slots') || [];
        this.element.classList.toggle('kb-skal2', sk);
        if (this._skBtn) this._skBtn.classList.toggle('pb-active', sk);
        this._keys.forEach((k, i) => {
            k.classList.toggle('kb-on', !!mask[i]);                    // IO = Live-Töne (beide Modi)
            k.classList.toggle('kb-anchor', this._transpose && i === root);
            k.classList.toggle('kb-slot-active', sk && i === active);  // aktiver Slot hervorgehoben
            const id = k.querySelector('.kb-id');
            if (id) id.textContent = sk ? ((slots[i] && slots[i].name) || String(i + 1)) : NOTE_NAMES[i];
            k.title = sk ? `Slot ${i + 1}: ${(slots[i] && slots[i].name) || i + 1} (Doppelklick = umbenennen)` : NOTE_NAMES[i];
        });
    }

    /** Pro Frame: aktive (absolute) Note hervorheben + Readout. */
    tick() {
        const f = this.getFreq();
        if (!f || f <= 0) return;
        const midi = Math.round(freqToMidi(f));
        const pc = ((midi % 12) + 12) % 12;
        // Live-Highlight nur im Normal-Modus (im Transponier-Modus leuchtet der Anker).
        const showPc = this._transpose ? -1 : pc;
        if (showPc !== this._lastPc) {
            this._keys.forEach((k, i) => k.classList.toggle('kb-active', i === showPc));
            this._lastPc = showPc;
        }
        if (this._transpose) {
            this._readout.textContent = `Verschieben – Anker: ${NOTE_NAMES[this.state.get('scaleRoot') | 0]}`;
        } else {
            this._readout.textContent = `${midiToName(midi)}  ·  ${f.toFixed(1)} Hz${this._multStr(f)}`;
        }
    }

    /** Vielfaches der Base-Frq (optional auf ganze Zahlen gerundet). */
    _multStr(f) {
        const base = this.getBaseFreq();
        if (!base || base <= 0) return '';
        const r = f / base;
        const int = this.state.get('intMultiples');
        return `  ·  ×${int ? Math.round(r) : r.toFixed(2)}`;
    }

    mount(parent) { parent.appendChild(this.element); }
}
