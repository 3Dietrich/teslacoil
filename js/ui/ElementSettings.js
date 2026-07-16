/**
 * ElementSettings.js – Schwebendes Settings-Panel für die Nicht-Knob-Controls.
 *
 * @dpa 20260714: „Es müssen nun alle Elemente Settings kriegen." Knobs haben ihren
 * KnobMetaEditor; hier bekommen die anderen Kategorien per Rechtsklick eigene Optik-
 * Settings – typ-abhängige Felder:
 *   • select   (MultiSchalter, z.B. Pitch-Wave / BaseFrq-Quelle): Label, Label an/aus,
 *              BG-Farbe, VG-Farbe, Größe (Schrift), Feldbreite.
 *   • toggle   (Schalter wie aktiv/hold): Label, Label-Position (oben/links/rechts/unten).
 *   • readout  (pure Texte, z.B. base-readout): Label, Label an/aus, Textgröße,
 *              Textfeld-Größe, Textfarbe.
 *   • text     (Schrift-Eingabe, z.B. Debug-Name/-Prompt): wie select + Feldhöhe.
 *              Breite/Höhe teilt sie sich mit dem Vergrößerungs-Zipfel der textarea –
 *              beide schreiben denselben ctrlStyles-Eintrag.
 *   • note     (reines Text-Element): sein Inhalt IST das Label.
 *   • button   (Rec/Debug speichern …): Label, Label-Position (Mitte = Default),
 *              VG/BG, Breite/Höhe.
 *
 * Das Panel ist rein optisch – es verstellt NIE einen Control-Wert (@dpa: „RM darf keine
 * Control Values verstellen."). Die eigentliche DOM-Anwendung liegt beim Aufrufer
 * (target.applyStyle) – so bleibt das Panel generisch. Persistenz über onApply(id, style)
 * → state.ctrlStyles (Optik-Ebene, LAYOUT_KEYS).
 */
import { makeDraggable } from './dragPanel.js';
import { hint, lang } from '../core/i18n.js';
import { colorPickerBusy } from './colorPick.js';
import { factoryHint } from '../data/hints.js';

export class ElementSettings {
  constructor(state) {
    this._state = state || null;
    this._target = null;
    this._build();
  }

  _build() {
    const panel = document.createElement('div');
    panel.className = 'knob-meta-editor elem-settings';   // teilt die Optik des Knob-Editors
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="kme-header">
        <span class="kme-title">Element-Einstellungen</span>
        <button class="kme-close" title="Schließen">✕</button>
      </div>
      <div class="kme-body">
        <div class="kme-row kme-wide" data-f="label">
          <label>Label</label>
          <input type="text" class="es-label" maxlength="24" />
        </div>
        <!-- Zweispaltig wie der Regler-Editor (@dpa 20260716_011222: „bitte bei allen
             Controls prüfen und Platz sparen"). Versteckte Felder fallen aus dem Raster,
             die übrigen rücken auf – jeder Typ bekommt so ein dichtes Panel. -->
        <div class="kme-grid">
          <div class="kme-row" data-f="labelOn">
            <label>Label an</label>
            <input type="checkbox" class="es-labelon" />
          </div>
          <div class="kme-row" data-f="labelPos">
            <label>Label-Pos</label>
            <select class="es-labelpos">
              <option value="center">Mitte</option>
              <option value="top">Oben</option>
              <option value="left">Links</option>
              <option value="right">Rechts</option>
              <option value="bottom">Unten</option>
            </select>
          </div>
          <div class="kme-row" data-f="bg">
            <label>BG</label>
            <input type="color" class="es-bg" value="#222222" title="Hintergrundfarbe" />
            <button class="es-bg-clear kme-x" title="Hintergrundfarbe entfernen">✕</button>
          </div>
          <div class="kme-row" data-f="fg">
            <label>Text</label>
            <input type="color" class="es-fg" value="#dddddd" title="Vordergrund-/Textfarbe" />
            <button class="es-fg-clear kme-x" title="Vordergrundfarbe entfernen">✕</button>
          </div>
          <div class="kme-row" data-f="size">
            <label>Größe</label>
            <input type="number" class="es-size" min="7" max="28" step="1" title="Schriftgröße im Feld (px)" />
          </div>
          <div class="kme-row" data-f="fontSize">
            <label>Textgr.</label>
            <input type="number" class="es-fontsize" min="7" max="28" step="1" title="Textgröße (px)" />
          </div>
          <!-- 'Breite' wird beim Menü-Schalter zu 'Länge' und beim Keyboard zu 'Taste ↔'
               (s. open()); die Grenzen setzt open() gleich mit, weil eine Taste einen
               anderen Bereich braucht als ein Textfeld. -->
          <div class="kme-row" data-f="boxSize">
            <label>Breite</label>
            <input type="number" class="es-boxsize" min="20" max="1200" step="2" />
          </div>
          <div class="kme-row" data-f="boxH">
            <label>Höhe</label>
            <input type="number" class="es-boxh" min="16" max="1200" step="2" />
          </div>
          <!-- Nur beim Keyboard: Abstand ZWISCHEN den Tasten. Bei kleinen Tasten wirkte
               der feste Abstand viel zu groß (@dpa 20260716_132014). -->
          <div class="kme-row" data-f="gap">
            <label>Abstand</label>
            <input type="number" class="es-gap" min="0" max="10" step="1" title="Abstand zwischen den Tasten (0–10 px)" />
          </div>
        </div>
        <!-- Hilfe-Text dieses Controls (@dpa 20260716_174111: „diese hints sollten
             (zumindest das deutsche) editierbar sein"). Leer = die Auslieferung gilt;
             ✕ stellt sie wieder her. Eine bewusst leere Hilfe ist auch eine Ansage –
             deshalb unterscheidet das Feld zwischen „nichts eingetragen" und „leer". -->
        <div class="kme-row kme-wide kme-help-row">
          <label>Hilfe</label>
          <textarea class="es-help" rows="2" title="Hilfe-Blase dieses Controls. Leeren + ✕ = wieder der Auslieferungstext."></textarea>
          <button class="es-help-reset kme-x" title="Auslieferungstext wiederherstellen">✕</button>
        </div>
      </div>
    `;
    panel.querySelector('.kme-close').addEventListener('click', () => this.close());

    // Alle Felder wenden sofort an (live), wie beim Knob-Editor die Farbe/Ansicht.
    // Die Farbfelder brauchen dedizierte Handler: erst „aktiv"-Flag setzen, DANN _apply –
    // sonst sammelt _apply die Farbe noch vor dem Flag ein (Reihenfolge-Bug).
    const live = ['.es-label', '.es-labelon', '.es-labelpos', '.es-size', '.es-fontsize', '.es-boxsize', '.es-boxh', '.es-gap'];
    live.forEach((sel) => {
      const el = panel.querySelector(sel);
      const ev = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(ev, () => this._apply());
    });
    panel.querySelector('.es-bg').addEventListener('input', () => { this._bgOn = true; this._apply(); });
    panel.querySelector('.es-fg').addEventListener('input', () => { this._fgOn = true; this._apply(); });
    panel.querySelector('.es-bg-clear').addEventListener('click', () => { this._bgOn = false; this._apply(); });
    panel.querySelector('.es-fg-clear').addEventListener('click', () => { this._fgOn = false; this._apply(); });
    // Hilfe-Text: geht NICHT durch _apply/ctrlStyles – er ist eine eigene Kategorie
    // (state.hintText), damit er sich unabhängig sichern und zurücksetzen lässt.
    panel.querySelector('.es-help').addEventListener('input', () => this._applyHelp());
    panel.querySelector('.es-help-reset').addEventListener('click', () => this._resetHelp());

    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
      // Enter übernimmt – wie im Regler-Editor. Die Felder wirken zwar ohnehin live, aber
      // die Fußzeile verspricht „Enter = Übernehmen" (@dpa 20260716_174111: „dann haben
      // wir noch Enter"), und ein Versprechen, das nur der andere Editor einlöst, ist eins
      // zu viel.
      else if (e.key === 'Enter') { e.preventDefault(); this._apply(); }
    }, true);
    // Außenklick schließt (nicht bei Klick auf ein Element-Settings-Ziel selbst).
    // Ausnahme: ein offener Farbwähler – der lebt außerhalb des DOM, s. colorPick.js.
    document.addEventListener('mousedown', (e) => {
      if (!this.isOpen) return;
      if (panel.contains(e.target) || e.target.closest('[data-ctrl]')) return;
      if (colorPickerBusy(panel)) return;
      this.close();
    });

    document.body.appendChild(panel);
    this._panel = panel;
    makeDraggable(panel, panel.querySelector('.kme-header'));
  }

  get isOpen() { return this._panel.style.display !== 'none'; }

  /** Welche Felder sind für welchen Typ sichtbar? */
  _fieldsFor(type) {
    // select (@dpa 20260715, „Menu Switches: fehlt noch Größe + Label On/Off"):
    // 'size' gab es schon, ging aber nur auf die SCHRIFTgröße – gemeint war offenbar die
    // Größe des Schalters selbst. Beides ist jetzt da: 'size' = Schrift, 'boxSize' = Breite.
    if (type === 'select') return ['label', 'labelOn', 'bg', 'fg', 'size', 'boxSize'];
    if (type === 'toggle') return ['label', 'labelPos'];
    // Readouts tragen Live-Text (textContent wird laufend gesetzt) → nur Optik ohne
    // Struktur-Umbau: Textgröße, Feldbreite, Textfarbe. (Label/Label-an/aus würde jeden
    // Readout-Update umbauen – bewusst weggelassen, s. Commit.)
    if (type === 'readout') return ['fontSize', 'boxSize', 'fg'];
    // Schrift-Eingabe: wie ein Select, dazu die Höhe – Breite/Höhe schreibt auch der
    // Vergrößerungs-Zipfel hierher, das Panel ist der zweite Weg zur selben Größe.
    if (type === 'text') return ['label', 'labelOn', 'bg', 'fg', 'size', 'boxSize', 'boxH'];
    // Reines Text-Element: sein Inhalt IST das Label (@dpa 20260715_223000).
    if (type === 'note') return ['label', 'fontSize', 'boxSize', 'fg'];
    // Button (@dpa 20260715_223000): „Label, Label position (zusätzlich: mitte =
    // default), VG, BG, höhe, Breite".
    if (type === 'button') return ['label', 'labelPos', 'fg', 'bg', 'boxSize', 'boxH'];
    // Keyboard (@dpa 20260716_031100: „muss ein (special) control werden: man muss die
    // Größe und Farben ändern können"). Kein Label – seine Tasten sind seine Beschriftung.
    // boxSize/boxH = Breite/Höhe EINER Taste (nicht des ganzen Bretts): so bleibt es bei
    // 12 Tasten gleichmäßig, statt dass eine Gesamtbreite krumme Tasten erzeugt.
    if (type === 'keyboard') return ['bg', 'fg', 'boxSize', 'boxH', 'gap'];
    return ['label'];
  }

  /**
   * @param {{id:string, type:'select'|'toggle'|'readout', el:HTMLElement,
   *          defLabel?:string, applyStyle:(style:object)=>void}} target
   */
  open(target) {
    this._target = target;
    const style = (this._state && (this._state.get('ctrlStyles') || {})[target.id]) || {};
    const show = new Set(this._fieldsFor(target.type));
    this._panel.querySelectorAll('.kme-row[data-f]').forEach((row) => {
      row.style.display = show.has(row.dataset.f) ? '' : 'none';
    });

    this._panel.querySelector('.es-label').value = style.label ?? (target.defLabel || '');
    this._panel.querySelector('.es-labelon').checked = style.labelOn !== false;   // default an
    // 'Mitte' gibt es nur beim Button (Text IM Button) – bei einem Schalter, dessen Label
    // neben der Box sitzt, wäre die Option sinnlos. Default entsprechend: Button = Mitte.
    const posSel = this._panel.querySelector('.es-labelpos');
    posSel.querySelector('option[value="center"]').hidden = target.type !== 'button';
    posSel.value = style.labelPos || (target.type === 'button' ? 'center' : 'top');
    this._bgOn = !!style.bg;
    this._panel.querySelector('.es-bg').value = style.bg || '#222222';
    this._fgOn = !!style.fg;
    this._panel.querySelector('.es-fg').value = style.fg || '#dddddd';
    this._panel.querySelector('.es-size').value = style.size || '';
    this._panel.querySelector('.es-fontsize').value = style.fontSize || '';
    this._panel.querySelector('.es-boxsize').value = style.boxSize || '';
    this._panel.querySelector('.es-boxh').value = style.boxH || '';
    this._panel.querySelector('.es-gap').value = style.gap ?? '';
    // Beim Menü-Schalter heißt die Feldbreite 'Länge' (@dpa 20260716_011222, „z.B. bei
    // Filter Typ wichtig") – dasselbe Wort wie beim Fader, denn es ist dieselbe Geste:
    // wie lang darf das Ding werden. Wo es eine Feldhöhe daneben gibt (Text/Button),
    // bleibt das Paar Breite/Höhe – dort wäre 'Länge' mehrdeutig.
    const boxLab = this._panel.querySelector('.kme-row[data-f="boxSize"] label');
    if (boxLab) boxLab.textContent = target.type === 'select' ? 'Länge' : 'Breite';
    // Beim Keyboard geht es um EINE Taste – das muss dranstehen, sonst tippt man eine
    // Gesamtbreite ein und bekommt ein 12× so breites Brett. Und es braucht eigene
    // Grenzen (@dpa 20260716_132014: „Taste ↔ minimum 10, maximum 999 · Taste ↕ min 10,
    // max 500") – die Textfeld-Grenzen (20/1200) ließen 12 Tasten ins Uferlose wachsen
    // und verboten zugleich die schmalen, die @dpa in seiner 194px-Gruppe braucht.
    const wIn = this._panel.querySelector('.es-boxsize');
    const hIn = this._panel.querySelector('.es-boxh');
    const hLab = this._panel.querySelector('.kme-row[data-f="boxH"] label');
    const fgLab = this._panel.querySelector('.kme-row[data-f="fg"] label');
    if (target.type === 'keyboard') {
      if (boxLab) boxLab.textContent = 'Taste ↔';
      if (hLab) hLab.textContent = 'Taste ↕';
      if (fgLab) fgLab.textContent = 'Ton an';
      wIn.min = 10; wIn.max = 999; wIn.step = 1; hint(wIn, 'Breite EINER Taste (10–999 px)');
      hIn.min = 10; hIn.max = 500; hIn.step = 1; hint(hIn, 'Höhe EINER Taste (10–500 px)');
    } else {
      if (hLab) hLab.textContent = 'Höhe';
      if (fgLab) fgLab.textContent = 'Text';
      wIn.min = 20; wIn.max = 1200; wIn.step = 2; hint(wIn, 'Breite des Feldes (px)');
      hIn.min = 16; hIn.max = 1200; hIn.step = 2; hint(hIn, 'Höhe des Feldes (px)');
    }
    this._panel.querySelector('.kme-title').textContent = style.label ?? target.defLabel ?? 'Element';
    this._loadHelp(target.id);

    const rect = target.el.getBoundingClientRect();
    this._panel.style.left = `${rect.right + 10}px`;
    this._panel.style.top = `${rect.top}px`;
    this._panel.style.display = 'block';
    requestAnimationFrame(() => {
      const pr = this._panel.getBoundingClientRect();
      if (pr.right > window.innerWidth) this._panel.style.left = `${rect.left - pr.width - 10}px`;
      if (pr.bottom > window.innerHeight) this._panel.style.top = `${window.innerHeight - pr.height - 10}px`;
    });
  }

  close() { this._panel.style.display = 'none'; this._target = null; }

  /** Aktuelle Felder → Style-Objekt (nur die für den Typ relevanten + gesetzten). */
  _collect() {
    const t = this._target; if (!t) return {};
    const fields = new Set(this._fieldsFor(t.type));
    const s = {};
    const P = (sel) => this._panel.querySelector(sel);
    if (fields.has('label')) { const v = P('.es-label').value.trim(); if (v) s.label = v; }
    if (fields.has('labelOn')) s.labelOn = P('.es-labelon').checked;
    if (fields.has('labelPos')) s.labelPos = P('.es-labelpos').value;
    if (fields.has('bg') && this._bgOn) s.bg = P('.es-bg').value;
    if (fields.has('fg') && this._fgOn) s.fg = P('.es-fg').value;
    if (fields.has('size')) { const v = parseInt(P('.es-size').value); if (v) s.size = v; }
    if (fields.has('fontSize')) { const v = parseInt(P('.es-fontsize').value); if (v) s.fontSize = v; }
    if (fields.has('boxSize')) { const v = parseInt(P('.es-boxsize').value); if (v) s.boxSize = v; }
    if (fields.has('boxH')) { const v = parseInt(P('.es-boxh').value); if (v) s.boxH = v; }
    // Abstand 0 ist eine gültige Ansage („Tasten auf Stoß") – deshalb hier NICHT auf
    // Wahrheit prüfen wie oben, sonst fiele genau die 0 durchs Raster.
    if (fields.has('gap')) { const v = parseInt(P('.es-gap').value); if (Number.isFinite(v)) s.gap = Math.max(0, Math.min(10, v)); }
    return s;
  }

  _apply() {
    if (!this._target) return;
    const style = this._collect();
    this._target.applyStyle(style);
    this._panel.querySelector('.kme-title').textContent = style.label || this._target.defLabel || 'Element';
    if (this.onApply) this.onApply(this._target.id, style);
  }

  /* ── Hilfe-Text (eigene Kategorie: state.hintText) ── */

  /** Feld füllen: eigener Text, sonst der Auslieferungstext als Ausgangspunkt. */
  _loadHelp(id) {
    const own = (this._state && (this._state.get('hintText') || {})[id]);
    const help = this._panel.querySelector('.es-help');
    help.value = own != null ? own : factoryHint(id, lang());
    // Ist es (noch) der Auslieferungstext, sagt das der Platzhalter – sonst weiß man nicht,
    // ob man gerade sein eigenes liest oder das mitgelieferte.
    help.placeholder = factoryHint(id, lang()) || 'keine Hilfe hinterlegt';
  }

  _applyHelp() {
    if (!this._target || !this._state) return;
    const txt = this._panel.querySelector('.es-help').value;
    this._state.set('hintText', { ...this._state.get('hintText'), [this._target.id]: txt });
  }

  /** Zurück zur Auslieferung: den Override LÖSCHEN, nicht den Text hineinkopieren –
   *  sonst friert er auf dem heutigen Wortlaut ein und bekäme spätere Verbesserungen
   *  (und die Übersetzung!) nie mit. */
  _resetHelp() {
    if (!this._target || !this._state) return;
    const all = { ...this._state.get('hintText') };
    delete all[this._target.id];
    this._state.set('hintText', all);
    this._loadHelp(this._target.id);
  }
}
