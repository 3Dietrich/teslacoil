/**
 * KnobMetaEditor.js – Schwebendes Panel zum Bearbeiten der Regler-Parameter.
 * Übernommen aus octaver, an teslacoil angepasst (deutsche Labels).
 *
 * Felder: Min, Max, Step, Kurve (linear/log/exp), Nachkommastellen, Skew, Einheit.
 * Mit kleiner Kurven-Vorschau. Öffnet neben dem Regler (⚙-Button).
 *
 * Hinweis (Recall): Geänderte Meta-Werte (Range/Kurve) sind aktuell NICHT Teil
 * des Snapshots – nur der Wert wird gespeichert. Reine Bedien-/Tuning-Hilfe.
 */
export class KnobMetaEditor {
  /** @param {import('../core/State.js').State} [state] – für die Farb-Presets (Optik). */
  constructor(state) {
    this._state = state || null;
    this._panel = null;
    this._currentKnob = null;
    this._curveCanvas = null;
    this._build();
  }

  _build() {
    const panel = document.createElement('div');
    panel.className = 'knob-meta-editor';
    panel.style.display = 'none';

    panel.innerHTML = `
      <div class="kme-header">
        <span class="kme-title">Regler-Einstellungen</span>
        <button class="kme-close" title="Schließen">✕</button>
      </div>
      <div class="kme-body">
        <div class="kme-row">
          <label>Name</label>
          <input type="text" class="kme-label" maxlength="18" title="Regler umbenennen (wie Gruppen)" />
        </div>
        <div class="kme-row">
          <label>Min</label>
          <input type="number" class="kme-min" step="any" />
        </div>
        <div class="kme-row">
          <label>Max</label>
          <input type="number" class="kme-max" step="any" />
        </div>
        <div class="kme-row">
          <label>Step</label>
          <input type="number" class="kme-step" step="any" min="0" />
        </div>
        <div class="kme-row">
          <label>Kurve</label>
          <select class="kme-curve">
            <option value="linear">Linear</option>
            <option value="log">Logarithmisch</option>
            <option value="exp">Exponentiell</option>
          </select>
        </div>
        <div class="kme-row">
          <label>Dezimalen</label>
          <input type="number" class="kme-decimals" min="0" max="6" step="1" />
        </div>
        <div class="kme-row">
          <label>Skew</label>
          <input type="number" class="kme-skew" min="0.1" max="10" step="0.1" value="1" />
        </div>
        <div class="kme-row">
          <label>Einheit</label>
          <input type="text" class="kme-unit" maxlength="8" />
        </div>
        <div class="kme-row">
          <label>Ansicht</label>
          <select class="kme-view">
            <option value="large">Groß</option>
            <option value="medium">Mittel</option>
            <option value="small">Klein</option>
            <option value="mini">Mini (Höhe + Breite)</option>
            <option value="none">Ohne Knob (nur Label + Wert)</option>
          </select>
        </div>
        <div class="kme-row">
          <label>Label</label>
          <select class="kme-labelpos" title="Label-Position">
            <option value="bottom">Unten</option>
            <option value="top">Oben</option>
            <option value="off">Aus</option>
          </select>
        </div>
        <div class="kme-row">
          <label>Knob-BG</label>
          <input type="color" class="kme-bg" value="#232833" />
          <button class="kme-bg-clear" title="Hintergrund entfernen">✕</button>
        </div>
        <div class="kme-row">
          <label>Farbe</label>
          <input type="color" class="kme-color" value="#5ad1ff" />
          <select class="kme-color-preset" title="Farbe wählen (Standard = zurücksetzen) – Tab/Pfeiltasten"></select>
          <button class="kme-color-save" title="Aktuelle Farbe als Preset speichern">💾</button>
          <button class="kme-color-del" title="Ausgewähltes Farb-Preset löschen">🗑</button>
        </div>
        <div class="kme-curve-preview">
          <canvas width="120" height="60"></canvas>
        </div>
        <div class="kme-actions">
          <button class="kme-apply">Übernehmen</button>
          <button class="kme-reset">Zurücksetzen</button>
        </div>
      </div>
    `;

    panel.querySelector('.kme-close').addEventListener('click', () => this.close());
    panel.querySelector('.kme-apply').addEventListener('click', () => this._apply());
    panel.querySelector('.kme-reset').addEventListener('click', () => this._reset());

    // Enter = Übernehmen · ESC = Schließen. Bewusst auf document-Ebene (mit isOpen-
    // Guard): beim Öffnen liegt der Fokus AUSSERHALB des Panels (auf dem ⚙-Button des
    // Reglers, der in einem anderen DOM-Teilbaum sitzt) → ein Panel-lokaler Handler
    // würde den Tastendruck nie sehen. So schließt ESC zuverlässig (wie „X"/Außenklick).
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
      else if (e.key === 'Enter') { e.preventDefault(); this._apply(); }
    }, true);

    panel.querySelector('.kme-curve').addEventListener('change', () => this._drawCurvePreview());
    panel.querySelector('.kme-skew').addEventListener('input', () => this._drawCurvePreview());
    // Farbe: eigenes Editieren markiert „custom".
    this._colorCustom = false;
    panel.querySelector('.kme-color').addEventListener('input', () => { this._colorCustom = true; });
    // Knob-BG: eigenes Editieren aktiviert den Hintergrund, ✕ entfernt ihn wieder.
    this._bgCustom = false;
    panel.querySelector('.kme-bg').addEventListener('input', () => { this._bgCustom = true; this._apply(); });
    panel.querySelector('.kme-bg-clear').addEventListener('click', () => { this._bgCustom = false; this._apply(); });
    // Label-Position sofort anwenden.
    panel.querySelector('.kme-labelpos').addEventListener('change', () => this._apply());
    // Farb-Preset-Menü: „Standard" (Index 0) verwirft die Farbe, sonst Preset anwenden.
    // Auswahl greift SOFORT (übernimmt am Regler) – rein per Tastatur bedienbar.
    panel.querySelector('.kme-color-preset').addEventListener('change', (e) => {
      const sel = e.target;
      if (sel.selectedIndex <= 0) { this._colorCustom = false; if (this._state) this._state.set('knobColorSel', ''); }
      else {
        const p = this._colorPresets()[sel.selectedIndex - 1];
        if (p) { panel.querySelector('.kme-color').value = p.color; this._colorCustom = true; if (this._state) this._state.set('knobColorSel', p.name); }
      }
      this._apply();
    });
    // Speichern-Icon: aktuelle Farbe als benanntes Preset ablegen (Optik-Ebene).
    panel.querySelector('.kme-color-save').addEventListener('click', () => this._saveColorPreset());
    // Löschen-Icon: ausgewähltes Farb-Preset entfernen.
    panel.querySelector('.kme-color-del').addEventListener('click', () => this._deleteColorPreset());

    this._curveCanvas = panel.querySelector('canvas');
    this._panel = panel;

    // Klick außerhalb schließt (außer auf einen ⚙-Button)
    document.addEventListener('mousedown', (e) => {
      if (this._panel.style.display !== 'none' && !this._panel.contains(e.target)) {
        if (!e.target.closest('.knob-meta-btn')) this.close();
      }
    });

    document.body.appendChild(panel);
  }

  /** Editor für einen Regler öffnen. @param {import('./Knob.js').Knob} knob */
  open(knob) {
    this._currentKnob = knob;
    const meta = knob.getMeta();

    this._panel.querySelector('.kme-label').value = meta.label || '';
    this._panel.querySelector('.kme-min').value = meta.min;
    this._panel.querySelector('.kme-max').value = meta.max;
    this._panel.querySelector('.kme-step').value = meta.step;
    this._panel.querySelector('.kme-curve').value = meta.curve;
    this._panel.querySelector('.kme-decimals').value = meta.decimals;
    this._panel.querySelector('.kme-skew').value = meta.skew || 1;
    this._panel.querySelector('.kme-unit').value = meta.unit;
    this._panel.querySelector('.kme-view').value = meta.viewSize || 'medium';
    this._colorCustom = !!meta.color;
    this._panel.querySelector('.kme-color').value = meta.color || '#5ad1ff';
    this._panel.querySelector('.kme-labelpos').value = meta.labelPos || 'bottom';
    this._bgCustom = !!meta.bg;
    this._panel.querySelector('.kme-bg').value = meta.bg || '#232833';
    this._fillColorPresets();
    this._panel.querySelector('.kme-title').textContent = `⚙ ${meta.label}`;

    const rect = knob.element.getBoundingClientRect();
    this._panel.style.left = `${rect.right + 10}px`;
    this._panel.style.top = `${rect.top}px`;
    this._panel.style.display = 'block';

    requestAnimationFrame(() => {
      const panelRect = this._panel.getBoundingClientRect();
      if (panelRect.right > window.innerWidth) {
        this._panel.style.left = `${rect.left - panelRect.width - 10}px`;
      }
      if (panelRect.bottom > window.innerHeight) {
        this._panel.style.top = `${window.innerHeight - panelRect.height - 10}px`;
      }
    });

    this._drawCurvePreview();
  }

  close() {
    this._panel.style.display = 'none';
    this._currentKnob = null;
  }

  /* ── Farb-Presets (Optik-Ebene, geteilte Regler-Farben) ── */
  _colorPresets() { return (this._state && this._state.get('knobColorPresets')) || []; }

  /** Menü neu befüllen: „Standard" + alle gespeicherten Farben (mit Farbtupfer). */
  _fillColorPresets() {
    const sel = this._panel.querySelector('.kme-color-preset');
    sel.innerHTML = '';
    const std = document.createElement('option'); std.textContent = '— Standard —'; sel.appendChild(std);
    const presets = this._colorPresets();
    presets.forEach((p) => {
      const o = document.createElement('option');
      o.textContent = `● ${p.name}`; o.value = p.name; o.style.color = p.color; sel.appendChild(o);
    });
    // Gemerkte Auswahl (Optik) wiederherstellen, sonst Standard.
    const want = this._state && this._state.get('knobColorSel');
    const idx = want ? presets.findIndex((p) => p.name === want) : -1;
    sel.selectedIndex = idx >= 0 ? idx + 1 : 0;
  }

  /** Ausgewähltes Farb-Preset löschen. */
  _deleteColorPreset() {
    if (!this._state) return;
    const sel = this._panel.querySelector('.kme-color-preset');
    const i = sel.selectedIndex - 1;
    const list = this._colorPresets();
    if (i < 0 || !list[i]) return;
    if (!confirm('Farb-Preset „' + list[i].name + '" löschen?')) return;
    const next = list.slice(); next.splice(i, 1);
    this._state.set('knobColorPresets', next);
    this._state.set('knobColorSel', '');
    this._fillColorPresets();
  }

  /** Aktuelle Farbe unter einem Namen als Preset speichern (in den State). */
  _saveColorPreset() {
    if (!this._state) return;
    const color = this._panel.querySelector('.kme-color').value;
    const name = prompt('Farb-Name?', color);
    if (name === null) return;
    const list = this._colorPresets().slice();
    const at = list.findIndex((p) => p.name === name);
    if (at >= 0) list[at] = { name, color }; else list.push({ name, color });
    this._state.set('knobColorPresets', list);
    this._state.set('knobColorSel', name);
    this._fillColorPresets();
  }

  get isOpen() { return this._panel.style.display !== 'none'; }

  _apply() {
    if (!this._currentKnob) return;
    this._currentKnob.setMeta({
      label: this._panel.querySelector('.kme-label').value.trim() || this._currentKnob.label,
      min: parseFloat(this._panel.querySelector('.kme-min').value) || 0,
      max: parseFloat(this._panel.querySelector('.kme-max').value) || 1,
      step: parseFloat(this._panel.querySelector('.kme-step').value) || 0,
      curve: this._panel.querySelector('.kme-curve').value,
      decimals: parseInt(this._panel.querySelector('.kme-decimals').value) || 0,
      skew: parseFloat(this._panel.querySelector('.kme-skew').value) || 1,
      unit: this._panel.querySelector('.kme-unit').value,
      viewSize: this._panel.querySelector('.kme-view').value,
      color: this._colorCustom ? this._panel.querySelector('.kme-color').value : '',
      labelPos: this._panel.querySelector('.kme-labelpos').value,
      bg: this._bgCustom ? this._panel.querySelector('.kme-bg').value : '',
    });
    this._panel.querySelector('.kme-title').textContent = `⚙ ${this._currentKnob.label}`;
    if (this.onApply) this.onApply(this._currentKnob);   // Meta in State persistieren
  }

  _reset() {
    if (!this._currentKnob) return;
    // Auf die ursprüngliche Reglerdefinition zurück (Fallback: generisch 0..1).
    const def = this._currentKnob._defaultMeta || { min: 0, max: 1, step: 0, curve: 'linear', decimals: 2, unit: '', viewSize: 'medium', color: '' };
    this._currentKnob.setMeta({ ...def });
    if (this.onApply) this.onApply(this._currentKnob);
    this.open(this._currentKnob);
  }

  _drawCurvePreview() {
    const canvas = this._curveCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const x = (i / 4) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      const y = (i / 4) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const curve = this._panel.querySelector('.kme-curve').value;
    ctx.strokeStyle = '#5ad1ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px <= w; px++) {
      const norm = px / w;
      let mapped;
      const skew = parseFloat(this._panel.querySelector('.kme-skew')?.value) || 1;
      switch (curve) {
        case 'log': mapped = Math.log(1 + norm * (Math.E - 1)); break;
        case 'exp': mapped = norm * norm; break;
        default: mapped = skew !== 1 ? Math.pow(norm, skew) : norm;
      }
      const y = h - mapped * h;
      if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '9px sans-serif';
    ctx.fillText('in', 2, h - 2);
    ctx.fillText('out', w - 18, 10);
  }
}
