/**
 * Keyboard.js – Kompaktes 12-Ton sw-Keyboard (Skala-Editor) + Live-Tonanzeige.
 *
 * Tonklassen sind ABSOLUT (C…B nach A440). An/Aus wird durch ein halbtrans-
 * parentes Orange (0.4) markiert – die Tastenfarbe bleibt sichtbar. Darüber
 * surft die aktuell klingende Note/Frequenz smooth durch.
 *
 * Transponier-Modus: Klick auf die Frequenzanzeige schaltet um. Dann leuchtet
 * der Skala-Anker (zunächst C); ein Klick auf einen Tonnamen VERSCHIEBT die
 * ganze Skala auf der Frequenzachse dorthin (mask rotieren, Muster bleibt).
 * Erneuter Klick auf die Anzeige → zurück zur normalen Ansicht (neue Position).
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
        state.subscribe((k) => { if (k === 'scaleMask' || k === 'scaleRoot' || k === '*') this._refresh(); });
    }

    _build() {
        // Frequenzanzeige = Schaltfläche für den Transponier-Modus (MouseOver-Hint).
        this._readout = document.createElement('div');
        this._readout.className = 'kb-readout kb-readout-hint';
        this._readout.title = 'Klick: Skala auf der Frequenzachse verschieben';
        this._readout.textContent = '–';
        this._readout.addEventListener('click', () => this._toggleTranspose());
        this.element.appendChild(this._readout);

        const row = document.createElement('div');
        row.className = 'kb-keys';
        const mask = this.state.get('scaleMask');

        NOTE_NAMES.forEach((name, i) => {
            const key = document.createElement('button');
            key.className = 'kb-key ' + (BLACK.has(i) ? 'kb-black' : 'kb-white');
            key.dataset.index = String(i);
            // oben: Orange-Zustandsanzeige (aus/an) · unten: s/w-Tastenidentität + Note
            key.innerHTML = `<span class="kb-ind"></span><span class="kb-id">${name}</span>`;
            key.title = name;
            key.classList.toggle('kb-on', !!mask[i]);
            key.addEventListener('click', () => this._onKey(i));
            row.appendChild(key);
            this._keys.push(key);
        });
        this.element.appendChild(row);
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

    /** Klick auf eine Taste: normal = An/Aus, im Transponier-Modus = Skala versetzen. */
    _onKey(i) {
        if (this._transpose) this._transposeTo(i);
        else this._toggle(i);
    }

    _toggle(i) {
        const mask = this.state.get('scaleMask').slice();
        mask[i] = mask[i] ? 0 : 1;
        this.state.set('scaleMask', mask);
    }

    /** Skala so verschieben, dass der bisherige Anker auf Tonklasse i landet. */
    _transposeTo(i) {
        const root = this.state.get('scaleRoot') | 0;
        const delta = ((i - root) % 12 + 12) % 12;
        if (delta) this.state.set('scaleMask', rotateMask(this.state.get('scaleMask'), delta));
        this.state.set('scaleRoot', i);
    }

    _refresh() {
        const mask = this.state.get('scaleMask');
        const root = this.state.get('scaleRoot') | 0;
        this._keys.forEach((k, i) => {
            k.classList.toggle('kb-on', !!mask[i]);
            k.classList.toggle('kb-anchor', this._transpose && i === root);
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
