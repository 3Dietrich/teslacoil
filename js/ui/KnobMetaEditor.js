/**
 * KnobMetaEditor.js – Schwebendes Panel zum Bearbeiten der Regler-Parameter.
 * Übernommen aus octaver, an teslacoil angepasst (deutsche Labels).
 *
 * Felder: Min, Max, Step, Kurve (linear/log/exp), Nachkommastellen, Skew, Einheit,
 * Gestalt (Knob / Fader waagerecht / Fader senkrecht) + Fader-Länge.
 * Mit kleiner Kurven-Vorschau. Öffnet per Rechtsklick auf den Regler.
 *
 * Hinweis (Recall): Geänderte Meta-Werte (Range/Kurve) sind aktuell NICHT Teil
 * des Snapshots – nur der Wert wird gespeichert. Reine Bedien-/Tuning-Hilfe.
 */
import { Knob } from './Knob.js';   // nur für Knob.migrateShape (alte Gestalt-Namen)
import { makeDraggable } from './dragPanel.js';
import { PickMenu } from './PickMenu.js';
import { colorPickerBusy } from './colorPick.js';
import { factoryHint } from '../data/hints.js';
import { lang } from '../core/i18n.js';
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
        <div class="kme-row kme-wide">
          <label>Name</label>
          <input type="text" class="kme-label" maxlength="18" title="Regler umbenennen (wie Gruppen)" />
        </div>
        <!-- Paarweise (@dpa 20260716_011222): eine 70px-Eingabe braucht keine eigene
             Zeile – zwei passende nebeneinander halbieren die Panel-Höhe. -->
        <div class="kme-grid">
          <div class="kme-row">
            <label>Min</label>
            <input type="number" class="kme-min" step="any" title="Kleinster Wert, den dieser Regler annehmen kann (linkes Ende der Skala)" />
          </div>
          <div class="kme-row">
            <label>Max</label>
            <input type="number" class="kme-max" step="any" title="Größter Wert, den dieser Regler annehmen kann (rechtes Ende der Skala)" />
          </div>
          <div class="kme-row">
            <label>Step</label>
            <input type="number" class="kme-step" step="any" min="0" title="Schrittweite der Pfeiltasten (0 = stufenlos)" />
          </div>
          <div class="kme-row">
            <label title="Nachkommastellen">Dez.</label>
            <input type="number" class="kme-decimals" min="0" max="6" step="1" title="Nachkommastellen der Wert-Anzeige" />
          </div>
          <div class="kme-row">
            <label>Kurve</label>
            <select class="kme-curve" title="Wie sich der Weg des Reglers auf den Wert abbildet – Linear (gleichmäßig), Log. (unten feiner), Exp. (oben feiner). Der Graph rechts zeigt die Form.">
              <option value="linear">Linear</option>
              <option value="log">Log.</option>
              <option value="exp">Exp.</option>
            </select>
          </div>
          <div class="kme-row">
            <label>Skew</label>
            <input type="number" class="kme-skew" min="0.1" max="10" step="0.1" value="1" title="Verzieht die lineare Kurve: &lt;1 spreizt unten, &gt;1 spreizt oben (1 = unverzogen)" />
          </div>
          <!-- Der eigene Default (@dpa 20260716_132014: „für default einen extra Eintrag in
               Settings … Ich setze es dann nach meinen Wünschen"). Beim ersten Anlegen steht
               hier der Auslieferungswert; Doppelklick auf die Ansicht springt hierhin. -->
          <div class="kme-row">
            <label>Default</label>
            <input type="number" class="kme-default" step="any" title="Wert, auf den ein Doppelklick auf Knob/Fader zurückspringt. Bleibt beim Verstellen von Min/Max erhalten (nur an die Range angelegt)." />
          </div>
          <div class="kme-row">
            <label>Einheit</label>
            <input type="text" class="kme-unit" maxlength="8" title="Einheit hinter dem Wert (z.B. Hz, %, s)" />
          </div>
          <div class="kme-row">
            <label>Label</label>
            <select class="kme-labelpos" title="Wo die Beschriftung sitzt (Aus = keine)">
              <option value="bottom">Unten</option>
              <option value="top">Oben</option>
              <option value="left">Links</option>
              <option value="right">Rechts</option>
              <option value="off">Aus</option>
            </select>
          </div>
          <!-- Erst Gestalt, dann was daraus folgt (@dpa 20260716_011222): beim Knob ist
               das die Ansicht (Größe), beim Fader seine Länge – dasselbe Feld-Nest. -->
          <div class="kme-row">
            <label>Gestalt</label>
            <select class="kme-shape" title="Runder Regler oder Fader (Richtung wählbar)">
              <option value="knob">Knob</option>
              <option value="faderHoriz">Fader waagerecht</option>
              <option value="faderVert">Fader senkrecht</option>
            </select>
          </div>
          <div class="kme-row" data-f="view">
            <label>Ansicht</label>
            <select class="kme-view" title="Größe des Dials („Ohne Knob" = nur Wert und Label, spart Platz)">
              <option value="large">Groß</option>
              <option value="medium">Mittel</option>
              <option value="small">Klein</option>
              <option value="mini">Mini</option>
              <option value="none">Ohne Knob</option>
            </select>
          </div>
          <div class="kme-row" data-f="faderLen">
            <label>Länge</label>
            <input type="number" class="kme-faderlen" min="24" max="400" step="4" title="Länge der Fader-Bahn in px" />
          </div>
        </div>
        <!-- „Farben" – EINE Zeile für alles Farbige (@dpa 20260716_204921: „Es wäre cooler
             wenn du VG und BG kompakt nebeneinander stellst (die farbanzeige ohne
             extradunklen Rand, Label darüber = wenig Platz) und rechts daneben, mit dem
             meisten Platz den Farbspeicher").
             Vorher stand BG oben rechts im Raster und „Farben" eine Zeile tiefer – zwei
             Orte für dieselbe Sache. Jetzt: Label über dem Wähler (das ist schmaler als
             daneben), beide Wähler nebeneinander, der Speicher bekommt den Rest.
             Mehrzahl, weil der Speicher BEIDE Farben ablegt (Bogen UND Hintergrund). -->
        <div class="kme-row kme-wide kme-color-row">
          <label>Farben</label>
          <span class="kme-col-cell">
            <span class="kme-col-lab">VG</span>
            <input type="color" class="kme-color" value="#5ad1ff" title="Farbe des Wertbogens / der Fader-Füllung" />
          </span>
          <span class="kme-col-cell">
            <span class="kme-col-lab">BG</span>
            <input type="color" class="kme-bg" value="#232833" title="Hintergrund hinter dem Regler" />
          </span>
          <button class="kme-bg-clear kme-x" title="Hintergrund entfernen">✕</button>
          <div class="kme-color-menu"></div>
        </div>
        <!-- Hilfe-Text dieses Reglers (@dpa 20260716_174111) – wie bei den anderen
             Controls: leer + ✕ = wieder der Auslieferungstext. -->
        <div class="kme-row kme-wide kme-help-row">
          <label>Hilfe</label>
          <textarea class="kme-help" rows="2" title="Hilfe-Blase dieses Reglers. ✕ = wieder der Auslieferungstext."></textarea>
          <button class="kme-help-reset kme-x" title="Auslieferungstext wiederherstellen">✕</button>
        </div>
        <div class="kme-curve-preview">
          <div class="kme-keyhint"><b>Enter</b> = Übernehmen<br><b>ESC</b> = Verlassen</div>
          <canvas width="72" height="34" title="Vorschau der Kurve: links Reglerweg, rechts der Wert"></canvas>
        </div>
      </div>
    `;

    panel.querySelector('.kme-close').addEventListener('click', () => this.close());

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
    // Farbe: eigenes Editieren markiert „custom" und wirkt SOFORT – wie der BG eine Zeile
    // tiefer. Dass hier das _apply() fehlte, war der eigentliche Grund für „Farbe nicht
    // speicherbar" (@dpa 20260716_174111): der Farbwähler änderte brav seinen Wert, aber
    // niemand trug ihn an den Regler, und beim Zumachen des Panels war er verloren.
    this._colorCustom = false;
    panel.querySelector('.kme-color').addEventListener('input', () => { this._colorCustom = true; this._apply(); });
    // Knob-BG: eigenes Editieren aktiviert den Hintergrund, ✕ entfernt ihn wieder.
    this._bgCustom = false;
    panel.querySelector('.kme-bg').addEventListener('input', () => { this._bgCustom = true; this._apply(); });
    panel.querySelector('.kme-bg-clear').addEventListener('click', () => { this._bgCustom = false; this._apply(); });
    // Label-Position sofort anwenden.
    panel.querySelector('.kme-labelpos').addEventListener('change', () => this._apply());
    // Hilfe-Text: eigene Kategorie (state.hintText), NICHT Teil des Regler-Metas – sonst
    // hinge er am Snapshot-/Layout-Recall statt für sich zu stehen.
    panel.querySelector('.kme-help').addEventListener('input', () => this._applyHelp());
    panel.querySelector('.kme-help-reset').addEventListener('click', () => this._resetHelp());
    // Gestalt/Länge wirken sofort (@dpa 20260715) – man will beim Einstellen sehen,
    // wie lang der Fader wird. Die Längen-Zeile zeigt sich nur bei shape='fader'.
    panel.querySelector('.kme-shape').addEventListener('change', () => { this._syncShapeRows(); this._apply(); });
    panel.querySelector('.kme-faderlen').addEventListener('input', () => this._apply());
    panel.querySelector('.kme-default').addEventListener('input', () => this._apply());

    // Farb-Presets als PickMenu (@dpa 20260716_132014) – dieselbe Bedienung wie bei den
    // Snapshots: der geladene Name steht auf dem Knopf, Überschreiben/Löschen hängen an
    // ihrer Zeile, „Neu…" unten. Damit sind Menü + Diskette + Mülleimer EIN Element.
    this._colorMenu = new PickMenu({
      empty: '— Standard —',
      title: 'Gespeicherte Regler-Farbe wählen (Standard = Farbe verwerfen)',
      list: () => this._colorPresets(),
      current: () => (this._state && this._state.get('knobColorSel')) || '',
      onPick: (i, p) => {
        panel.querySelector('.kme-color').value = p.color;
        this._colorCustom = true;
        // Ein Farb-Preset trägt jetzt BEIDE Farben (@dpa 20260716_132014: „Die
        // Speichersektion soll sich VG und BG Farbe speichern") – ein Regler-Look ist
        // das Paar aus Bogen und Hintergrund, einzeln gespeichert war es nur die Hälfte.
        // Ältere Presets haben kein `bg` → deren BG bleibt unangetastet.
        if (p.bg !== undefined) {
          this._bgCustom = !!p.bg;
          if (p.bg) panel.querySelector('.kme-bg').value = p.bg;
        }
        if (this._state) this._state.set('knobColorSel', p.name);
        this._apply();
      },
      onUpdate: (i) => {
        const list = this._colorPresets().slice();
        list[i] = { ...list[i], ...this._curColors() };
        if (this._state) this._state.set('knobColorPresets', list);
      },
      onDelete: (i, p) => {
        if (!confirm('Farb-Preset „' + p.name + '" löschen?')) return;
        const list = this._colorPresets().slice(); list.splice(i, 1);
        if (!this._state) return;
        this._state.set('knobColorPresets', list);
        if (this._state.get('knobColorSel') === p.name) this._state.set('knobColorSel', '');
      },
      // Fußzeile: [Icon-NAME, Text, Tooltip, Aktion] – vier Glieder, nicht drei.
      // Genau hier hing „Farbe nicht speicherbar (Menu öffnet nicht)" (@dpa 20260716_174111):
      // der zweite Eintrag stand noch in der alten dreigliedrigen Form, in der das erste
      // Feld der fertige Glyph war. Nach der Umstellung auf SVG-Icons landete deshalb
      // '— Standard —' als ICON-NAME bei icon() – das wirft („icon: unbekannt"), und der
      // Wurf riss das halb gebaute Menü mit: das Popup wurde nie eingehängt. Aus Sicht der
      // Bedienung passierte auf den Klick nichts. Wächter: test/colors.py.
      foot: [
        ['plus', 'Neu…', 'Aktuelle Farbe + Hintergrund als Preset speichern', () => this._saveColorPreset()],
        ['close', 'Standard', 'Eigene Farbe verwerfen (Regler nimmt wieder die Grundfarbe)', () => {
          this._colorCustom = false;
          if (this._state) this._state.set('knobColorSel', '');
          this._apply(); this._colorMenu.refresh();
        }],
      ],
    });
    panel.querySelector('.kme-color-menu').appendChild(this._colorMenu.element);

    this._curveCanvas = panel.querySelector('canvas');
    this._panel = panel;
    makeDraggable(panel, panel.querySelector('.kme-header'));

    // Klick außerhalb schließt. (Die frühere ⚙-Ausnahme ist weg – das Icon gibt es nicht
    // mehr, Settings kommen per Rechtsklick, und der schließt/öffnet sauber neu.)
    // ZWEI Ausnahmen, beide sind Bedienung DIESES Panels, nur außerhalb seines DOM:
    //  • das Farb-PickMenu (Popup an <body>, s. PickMenu.contains),
    //  • ein offener Farbwähler (s. colorPickerBusy) – der Klick, mit dem man ihn wieder
    //    zumacht, hätte sonst das Panel mit weggerissen und die Farbe verworfen.
    document.addEventListener('mousedown', (e) => {
      if (!this.isOpen) return;
      if (this._panel.contains(e.target)) return;
      if (this._colorMenu && this._colorMenu.contains(e.target)) return;
      if (colorPickerBusy(this._panel)) return;
      this.close();
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
    this._panel.querySelector('.kme-shape').value = Knob.migrateShape(meta.shape) || 'knob';
    this._panel.querySelector('.kme-faderlen').value = meta.faderLen ?? 80;
    // Kennt der Regler keinen eigenen Default (Knob ohne State-Bezug), steht hier die
    // Skalenmitte – „beim ersten Kreieren einfach Mittelwert" (@dpa 20260716_132014).
    this._panel.querySelector('.kme-default').value =
      meta.defaultValue != null ? meta.defaultValue : (meta.min + meta.max) / 2;
    this._syncShapeRows();
    this._colorCustom = !!meta.color;
    this._panel.querySelector('.kme-color').value = meta.color || '#5ad1ff';
    this._panel.querySelector('.kme-labelpos').value = meta.labelPos || 'bottom';
    this._bgCustom = !!meta.bg;
    this._panel.querySelector('.kme-bg').value = meta.bg || '#232833';
    this._colorMenu.refresh();
    this._loadHelp();
    this._panel.querySelector('.kme-title').textContent = meta.label;

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

  /* ── Hilfe-Text (eigene Kategorie: state.hintText) ── */

  /** Die Kennung, unter der dieser Regler seine Hilfe hat – dieselbe wie im e-Mode. */
  _hintId() {
    const el = this._currentKnob && this._currentKnob.element;
    return (el && el.dataset.ctrl) || '';
  }

  _loadHelp() {
    const id = this._hintId();
    const help = this._panel.querySelector('.kme-help');
    const own = id && this._state && (this._state.get('hintText') || {})[id];
    help.value = own != null ? own : factoryHint(id, lang());
    help.placeholder = factoryHint(id, lang()) || 'keine Hilfe hinterlegt';
  }

  _applyHelp() {
    const id = this._hintId();
    if (!id || !this._state) return;
    const txt = this._panel.querySelector('.kme-help').value;
    this._state.set('hintText', { ...this._state.get('hintText'), [id]: txt });
  }

  /** Override LÖSCHEN (nicht den Text hineinkopieren) – nur so bekommt der Regler
   *  spätere Verbesserungen und die Übersetzung weiterhin mit. */
  _resetHelp() {
    const id = this._hintId();
    if (!id || !this._state) return;
    const all = { ...this._state.get('hintText') };
    delete all[id];
    this._state.set('hintText', all);
    this._loadHelp();
  }

  /* ── Farb-Presets (Optik-Ebene, geteilte Regler-Farben) ── */
  _colorPresets() { return (this._state && this._state.get('knobColorPresets')) || []; }

  /** Was ein Preset speichert: Bogen-Farbe UND Hintergrund (@dpa 20260716_132014).
   *  Ein ausgeschalteter BG wird als '' abgelegt – das ist eine Aussage („kein
   *  Hintergrund"), kein fehlender Wert, und muss beim Anwenden auch so ankommen. */
  _curColors() {
    return {
      color: this._panel.querySelector('.kme-color').value,
      bg: this._bgCustom ? this._panel.querySelector('.kme-bg').value : '',
    };
  }

  /** Aktuelle Farben unter einem Namen als Preset speichern (in den State). */
  _saveColorPreset() {
    if (!this._state) return;
    const cols = this._curColors();
    const name = prompt('Farb-Name?', cols.color);
    if (name === null) return;
    const list = this._colorPresets().slice();
    const at = list.findIndex((p) => p.name === name);
    if (at >= 0) list[at] = { name, ...cols }; else list.push({ name, ...cols });
    this._state.set('knobColorPresets', list);
    this._state.set('knobColorSel', name);
    this._colorMenu.refresh();
  }

  get isOpen() { return this._panel.style.display !== 'none'; }

  /** Fader-Länge nur zeigen, wenn es ein Fader ist – bei einem Dial sagt sie nichts.
   *  Die Gestalt-Namen NICHT hier nochmal aufzählen: genau das ist beim Umbenennen
   *  ('faderW/H' → 'faderHoriz/Vert') auseinandergelaufen und die Längen-Zeile blieb
   *  für immer versteckt (@dpa: „die Länge ist wieder weg!"). Knob.isFaderShape ist
   *  die eine Wahrheit. */
  _syncShapeRows() {
    // Ansicht und Länge sind dasselbe Feld in zwei Ausprägungen (@dpa 20260716_011222:
    // „bei Gestalt Fader wird die Ansicht zu Länge") – immer genau eines davon zeigen.
    const fader = Knob.isFaderShape(this._panel.querySelector('.kme-shape').value);
    const lenRow = this._panel.querySelector('.kme-row[data-f="faderLen"]');
    const viewRow = this._panel.querySelector('.kme-row[data-f="view"]');
    if (lenRow) lenRow.style.display = fader ? '' : 'none';
    if (viewRow) viewRow.style.display = fader ? 'none' : '';
  }

  _apply() {
    if (!this._currentKnob) return;
    // Leeres Default-Feld heißt „keinen eigenen Default" → der Doppelklick fällt dann auf
    // die Skalenmitte zurück (Knob.js). Ein leeres Feld darf NICHT als 0 durchgehen.
    const defRaw = this._panel.querySelector('.kme-default').value.trim();
    const defVal = defRaw === '' ? null : parseFloat(defRaw);
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
      shape: this._panel.querySelector('.kme-shape').value,
      faderLen: parseInt(this._panel.querySelector('.kme-faderlen').value) || 80,
      color: this._colorCustom ? this._panel.querySelector('.kme-color').value : '',
      labelPos: this._panel.querySelector('.kme-labelpos').value,
      bg: this._bgCustom ? this._panel.querySelector('.kme-bg').value : '',
      defaultValue: Number.isFinite(defVal) ? defVal : null,
    });
    this._panel.querySelector('.kme-title').textContent = this._currentKnob.label;
    if (this.onApply) this.onApply(this._currentKnob);   // Meta in State persistieren
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
    // Keine 'in'/'out'-Beschriftung (@dpa 20260716_011222): der Graph soll die Kurvenform
    // zeigen, mehr will man hier nicht ablesen.
  }
}
