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
 *
 * Das Panel ist rein optisch – es verstellt NIE einen Control-Wert (@dpa: „RM darf keine
 * Control Values verstellen."). Die eigentliche DOM-Anwendung liegt beim Aufrufer
 * (target.applyStyle) – so bleibt das Panel generisch. Persistenz über onApply(id, style)
 * → state.ctrlStyles (Optik-Ebene, LAYOUT_KEYS).
 */
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
        <div class="kme-row" data-f="label">
          <label>Label</label>
          <input type="text" class="es-label" maxlength="24" />
        </div>
        <div class="kme-row" data-f="labelOn">
          <label>Label an</label>
          <input type="checkbox" class="es-labelon" />
        </div>
        <div class="kme-row" data-f="labelPos">
          <label>Label-Pos</label>
          <select class="es-labelpos">
            <option value="top">Oben</option>
            <option value="left">Links</option>
            <option value="right">Rechts</option>
            <option value="bottom">Unten</option>
          </select>
        </div>
        <div class="kme-row" data-f="bg">
          <label>BG-Farbe</label>
          <input type="color" class="es-bg" value="#222222" />
          <button class="es-bg-clear" title="entfernen">✕</button>
        </div>
        <div class="kme-row" data-f="fg">
          <label>Textfarbe</label>
          <input type="color" class="es-fg" value="#dddddd" />
          <button class="es-fg-clear" title="entfernen">✕</button>
        </div>
        <div class="kme-row" data-f="size">
          <label>Größe</label>
          <input type="number" class="es-size" min="7" max="28" step="1" />
        </div>
        <div class="kme-row" data-f="fontSize">
          <label>Textgröße</label>
          <input type="number" class="es-fontsize" min="7" max="28" step="1" />
        </div>
        <div class="kme-row" data-f="boxSize">
          <label>Feldbreite</label>
          <input type="number" class="es-boxsize" min="20" max="400" step="2" />
        </div>
        <div class="kme-actions">
          <button class="es-reset">Zurücksetzen</button>
        </div>
      </div>
    `;
    panel.querySelector('.kme-close').addEventListener('click', () => this.close());
    panel.querySelector('.es-reset').addEventListener('click', () => this._reset());

    // Alle Felder wenden sofort an (live), wie beim Knob-Editor die Farbe/Ansicht.
    // Die Farbfelder brauchen dedizierte Handler: erst „aktiv"-Flag setzen, DANN _apply –
    // sonst sammelt _apply die Farbe noch vor dem Flag ein (Reihenfolge-Bug).
    const live = ['.es-label', '.es-labelon', '.es-labelpos', '.es-size', '.es-fontsize', '.es-boxsize'];
    live.forEach((sel) => {
      const el = panel.querySelector(sel);
      const ev = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(ev, () => this._apply());
    });
    panel.querySelector('.es-bg').addEventListener('input', () => { this._bgOn = true; this._apply(); });
    panel.querySelector('.es-fg').addEventListener('input', () => { this._fgOn = true; this._apply(); });
    panel.querySelector('.es-bg-clear').addEventListener('click', () => { this._bgOn = false; this._apply(); });
    panel.querySelector('.es-fg-clear').addEventListener('click', () => { this._fgOn = false; this._apply(); });

    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
    }, true);
    // Außenklick schließt (nicht bei Klick auf ein Element-Settings-Ziel selbst).
    document.addEventListener('mousedown', (e) => {
      if (this.isOpen && !panel.contains(e.target) && !e.target.closest('[data-ctrl]')) this.close();
    });

    document.body.appendChild(panel);
    this._panel = panel;
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
    this._panel.querySelector('.es-labelpos').value = style.labelPos || 'top';
    this._bgOn = !!style.bg;
    this._panel.querySelector('.es-bg').value = style.bg || '#222222';
    this._fgOn = !!style.fg;
    this._panel.querySelector('.es-fg').value = style.fg || '#dddddd';
    this._panel.querySelector('.es-size').value = style.size || '';
    this._panel.querySelector('.es-fontsize').value = style.fontSize || '';
    this._panel.querySelector('.es-boxsize').value = style.boxSize || '';
    this._panel.querySelector('.kme-title').textContent = '⚙ ' + (style.label ?? target.defLabel ?? 'Element');

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
    return s;
  }

  _apply() {
    if (!this._target) return;
    const style = this._collect();
    this._target.applyStyle(style);
    this._panel.querySelector('.kme-title').textContent = '⚙ ' + (style.label || this._target.defLabel || 'Element');
    if (this.onApply) this.onApply(this._target.id, style);
  }

  _reset() {
    if (!this._target) return;
    const t = this._target;
    this._target.applyStyle({});
    if (this.onApply) this.onApply(t.id, {});
    this.open(t);   // Felder aus dem geleerten Style neu füllen
  }
}
