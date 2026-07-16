/**
 * MiniSettings.js – Das kleine Settings-Panel für die Anzeigen (Step-Seq, Reflections).
 *
 * WARUM es das gibt (@dpa 20260716_174111 über Seq- und Graph-Settings): „settings über
 * rechte Mouse verfügbar machen, settings-Icons weg · settings wie die anderen v.a.
 * verschiebbar machen" und „platzsparender bauen (wie andere Settings)".
 *
 * Beide Anzeigen hatten je ein handgebautes Popover: eigene Zeilen-Optik, eigenes
 * Verschieben (der Seq zog an einem Label, die Reflections gar nicht), eigener oder gar
 * kein Schließen-Weg, einspaltig und dadurch hoch. Zwei Sonderlocken für dieselbe Aufgabe.
 * Ab hier teilen sie sich das Aussehen und die Bedienung des Regler-Editors: Titelleiste
 * zum Ziehen (dragPanel.js), ✕/ESC/Außenklick schließt, zweispaltiges Raster, alles wirkt
 * sofort. Wer ein drittes solches Panel braucht, baut es hier – nicht daneben.
 *
 * Kein „Fertig"-Knopf: die Felder wirken live, er wäre nur noch eine Beruhigung
 * (dieselbe Entscheidung wie bei den anderen Settings, @dpa 20260716_132014).
 */
import { makeDraggable } from './dragPanel.js';
import { colorPickerBusy } from './colorPick.js';
import { Knob } from './Knob.js';
import { parseHex, parseA, hexA } from './rgba.js';

export class MiniSettings {
  /** @param {string} title – Titelzeile (zugleich der Griff zum Verschieben) */
  constructor(title) {
    this._title = title;
    this._panel = null;
  }

  get isOpen() { return !!this._panel; }

  /**
   * Öffnen. `build` bekommt die Feld-Helfer und beschreibt damit den Inhalt – das Panel
   * selbst weiß nichts über Seq oder Reverb.
   * @param {{getBoundingClientRect:()=>DOMRect}} anchor – woran es sich anlegt (meist die Maus)
   * @param {(f:{num:Function, color:Function, colorA:Function}) => void} build
   */
  open(anchor, build) {
    this.close();
    const panel = document.createElement('div');
    panel.className = 'knob-meta-editor mini-settings';
    panel.innerHTML = `
      <div class="kme-header">
        <span class="kme-title"></span>
        <button class="kme-close" title="Schließen">✕</button>
      </div>
      <div class="kme-body"><div class="kme-grid"></div></div>
    `;
    panel.querySelector('.kme-title').textContent = this._title;
    panel.querySelector('.kme-close').addEventListener('click', () => this.close());
    const grid = panel.querySelector('.kme-grid');

    const row = (label, ...els) => {
      const r = document.createElement('div'); r.className = 'kme-row';
      const l = document.createElement('label'); l.textContent = label;
      r.appendChild(l); els.forEach((e) => r.appendChild(e));
      grid.appendChild(r);
      return r;
    };

    /** Zahlenfeld. `get`/`set` sprechen direkt mit dem Besitzer (State o.ä.). */
    const num = (label, { min, max, get, set, title }) => {
      const i = document.createElement('input');
      i.type = 'number'; i.min = min; i.max = max; i.step = 1; i.value = get();
      if (title) i.title = title;
      i.addEventListener('input', () => {
        const v = parseInt(i.value);
        if (!isNaN(v)) set(Math.max(min, Math.min(max, v)));
      });
      row(label, i);
      return i;
    };

    /** Reiner Farbwähler (ohne Deckkraft) – z.B. der Hintergrund einer Anzeige. */
    const color = (label, { get, set, title }) => {
      const c = document.createElement('input');
      c.type = 'color'; c.value = get();
      if (title) c.title = title;
      c.addEventListener('input', () => set(c.value));
      row(label, c);
      return c;
    };

    /**
     * Farbwähler + Deckkraft, gespeichert als rgba() (@dpa 20260716_174111: „die Farben
     * mit alpha (wie bei step sequ)"). Der Alpha-Regler ist ein Mini-Knob ohne
     * Wertanzeige – er soll neben dem Farbfeld in die Zeile passen, nicht sie füllen.
     * Die Zeile ist breit (beide Spalten): Label + Farbe + Knob sprengen eine Zelle.
     */
    const colorA = (label, { get, set, fallback = '#5ad1ff' }) => {
      const c = document.createElement('input');
      c.type = 'color'; c.value = parseHex(get(), fallback);
      const knob = new Knob({
        label: 'A', min: 0, max: 1, step: 0.01, curve: 'linear', decimals: 2,
        viewSize: 'mini', hideValue: true, value: parseA(get(), 1),
        onChange: (v) => set(hexA(c.value, v)),
      });
      c.addEventListener('input', () => set(hexA(c.value, knob.value)));
      row(label, c, knob.element).classList.add('kme-wide');
    };

    build({ num, color, colorA });

    const r = anchor.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 280))}px`;
    panel.style.top = `${r.bottom + 4}px`;
    document.body.appendChild(panel);
    this._panel = panel;
    makeDraggable(panel, panel.querySelector('.kme-header'));
    // Im Bild halten – das Panel geht meist an der Maus auf, die auch am unteren Rand
    // stehen kann.
    requestAnimationFrame(() => {
      const pr = panel.getBoundingClientRect();
      if (pr.bottom > window.innerHeight) panel.style.top = `${Math.max(8, window.innerHeight - pr.height - 8)}px`;
    });

    // Außenklick/ESC schließen. Ein offener Farbwähler ist KEIN Außenklick (colorPick.js) –
    // sonst reißt der Klick, mit dem man ihn zumacht, das Panel mit weg.
    this._outside = (e) => {
      if (!this._panel || this._panel.contains(e.target)) return;
      if (colorPickerBusy(this._panel)) return;
      this.close();
    };
    this._onKey = (e) => { if (e.key === 'Escape' && this._panel) { e.stopPropagation(); this.close(); } };
    setTimeout(() => document.addEventListener('mousedown', this._outside, true), 0);
    document.addEventListener('keydown', this._onKey, true);
  }

  close() {
    if (!this._panel) return;
    this._panel.remove(); this._panel = null;
    document.removeEventListener('mousedown', this._outside, true);
    document.removeEventListener('keydown', this._onKey, true);
  }
}
