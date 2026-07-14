/**
 * Knob.js – SVG-based rotary knob component
 * 
 * Drag to rotate (vertical = value change).
 * Supports linear, logarithmic, exponential mapping curves.
 * Mini-icon to open KnobMetaEditor for customisation.
 */
export class Knob {
    /**
     * @param {object} config
     * @param {string} config.label          – display label
     * @param {number} [config.value=0.5]    – initial value (normalised or mapped)
     * @param {number} [config.min=0]        – minimum value
     * @param {number} [config.max=1]        – maximum value
     * @param {number} [config.step=0]       – step size (0 = continuous)
     * @param {string} [config.curve='linear'] – mapping curve: 'linear','log','exp'
     * @param {string} [config.unit='']      – display unit
     * @param {number} [config.decimals=2]   – decimal places for display
     * @param {Function} [config.onChange]    – callback(value)
     * @param {Function} [config.onMetaClick]– callback to open meta-editor
     * @param {string} [config.id]           – unique id for the knob
     */
    constructor(config) {
        this.id = config.id || `knob_${Math.random().toString(36).slice(2, 8)}`;
        this.label = config.label ?? 'Knob';
        this._min = config.min ?? 0;
        this._max = config.max ?? 1;
        this._step = config.step ?? 0;
        this._curve = config.curve ?? 'linear';
        this._unit = config.unit ?? '';
        this._decimals = config.decimals ?? 2;
        this._viewSize = config.viewSize ?? 'medium';   // 'medium'|'small'|'large'|'none'
        this._color = config.color ?? '';               // '' = Standardfarbe
        this._labelPos = config.labelPos ?? 'bottom';   // 'bottom'|'top'|'left'|'right'|'off'
        this._bg = config.bg ?? '';                      // '' = kein Hintergrund (Knob-BG-Farbe, z.B. #232833)
        this._hideValue = !!config.hideValue;            // true = Zahlen-Anzeige weg (nur Dial+Label, spart Platz)
        this.formatValue = config.formatValue || null;
        this.onChange = config.onChange || null;
        this.onMetaClick = config.onMetaClick || null;

        // Internal normalised value (0‥1)
        this._normValue = this._valueToNorm(config.value ?? this._min);

        // Interaction state
        this._dragging = false;
        this._dragStartY = 0;
        this._dragStartNorm = 0;

        // DOM
        this.element = null;
        this._svgArc = null;
        this._valueDisplay = null;

        this._build();
    }

    /* ──────────────── Value Mapping ──────────────── */

    /**
     * Map a real value to normalised 0‥1 based on curve.
     */
    _valueToNorm(value) {
        // NaN/Infinity filtern (korrupte/geladene Werte) → auf min zurückfallen statt
        // NaN durch die ganze Kette zu schleppen (@dpa: „NaN filtern, nicht deckeln").
        if (!Number.isFinite(value)) value = this._min;
        const v = Math.max(this._min, Math.min(this._max, value));
        const range = this._max - this._min;
        if (range === 0) return 0;

        switch (this._curve) {
            case 'log': {
                // Logarithmic: good for frequency
                const minLog = Math.log(Math.max(this._min, 0.001));
                const maxLog = Math.log(Math.max(this._max, 0.001));
                return (Math.log(Math.max(v, 0.001)) - minLog) / (maxLog - minLog);
            }
            case 'exp': {
                // Exponential (inverse of log perception)
                const linear = (v - this._min) / range;
                return Math.pow(linear, 0.5); // square root for exp feel
            }
            default: {
                let norm = (v - this._min) / range;
                // Apply inverse skew: norm_display = norm_value^(1/skew)
                if (this._skew && this._skew !== 1) {
                    norm = Math.pow(norm, 1 / this._skew);
                }
                return norm;
            }
        }
    }

    /**
     * Map normalised 0‥1 back to real value.
     */
    _normToValue(norm) {
        norm = Math.max(0, Math.min(1, norm));

        switch (this._curve) {
            case 'log': {
                const minLog = Math.log(Math.max(this._min, 0.001));
                const maxLog = Math.log(Math.max(this._max, 0.001));
                return Math.exp(minLog + norm * (maxLog - minLog));
            }
            case 'exp': {
                const linear = norm * norm;
                return this._min + linear * (this._max - this._min);
            }
            default: {
                // Apply skew: real_norm = display_norm^skew
                let mapped = norm;
                if (this._skew && this._skew !== 1) {
                    mapped = Math.pow(norm, this._skew);
                }
                return this._min + mapped * (this._max - this._min);
            }
        }
    }

    /* ──────────────── Value Access ──────────────── */

    get value() {
        let v = this._normToValue(this._normValue);
        if (this._step > 0) v = Math.round(v / this._step) * this._step;
        return v;
    }

    set value(v) {
        this._normValue = this._valueToNorm(v);
        this._updateVisual();
        if (this.onChange) this.onChange(this.value);
    }

    /** Anzeigetext direkt setzen, OHNE den Wert zu ändern (z.B. Band-Regler zeigt die
     *  tatsächliche gefaltete Frequenz live). Wird beim nächsten _updateVisual/Wert-
     *  Wechsel wieder überschrieben – für Live-Anzeigen daher pro Frame aufrufen. */
    showValue(text) { if (this._valueDisplay) this._valueDisplay.textContent = text; }

    get min() { return this._min; }
    set min(v) { this._min = v; this._updateVisual(); }

    get max() { return this._max; }
    set max(v) { this._max = v; this._updateVisual(); }

    get curve() { return this._curve; }
    set curve(v) {
        const oldVal = this.value;
        this._curve = v;
        this._normValue = this._valueToNorm(oldVal);
        this._updateVisual();
    }

    /* ──────────────── DOM Building ──────────────── */

    _build() {
        const container = document.createElement('div');
        container.className = 'knob-container';
        container.id = this.id;
        container.tabIndex = 0; // Make focusable for keyboard events

        // SVG knob
        const size = 56;
        const cx = size / 2, cy = size / 2, r = 22;
        const startAngle = 225;  // degrees, 0 = right
        const endAngle = -45;
        const totalArc = 270;    // total sweep in degrees

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
        svg.classList.add('knob-svg');

        // Background track arc
        const trackArc = this._createArc(cx, cy, r, startAngle, startAngle - totalArc);
        trackArc.classList.add('knob-track');
        svg.appendChild(trackArc);

        // Value arc
        this._svgArc = this._createArc(cx, cy, r, startAngle, startAngle);
        this._svgArc.classList.add('knob-value-arc');
        svg.appendChild(this._svgArc);

        // Indicator dot
        this._indicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        this._indicator.classList.add('knob-indicator');
        this._indicator.setAttribute('r', '3');
        svg.appendChild(this._indicator);

        // Center circle
        const centerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        centerCircle.setAttribute('cx', cx);
        centerCircle.setAttribute('cy', cy);
        centerCircle.setAttribute('r', '10');
        centerCircle.classList.add('knob-center');
        svg.appendChild(centerCircle);

        container.appendChild(svg);

        // Value display
        this._valueDisplay = document.createElement('span');
        this._valueDisplay.className = 'knob-value';
        this._valueDisplay.title = 'Klick = auswählen (dann Pfeiltasten), Doppelklick = Wert eingeben';
        // Einfacher Klick auf den Anzeigewert: Regler auswählen → Pfeiltasten aktiv.
        this._valueDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            this.element.focus();
        });
        this._valueDisplay.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this._showValueInput();
        });
        container.appendChild(this._valueDisplay);

        // Label
        const labelEl = document.createElement('span');
        labelEl.className = 'knob-label';
        labelEl.textContent = this.label;
        this._labelEl = labelEl;   // Referenz: bei Umbenennung (setMeta) live aktualisieren
        container.appendChild(labelEl);

        // Meta-edit icon (small gear/settings icon)
        const metaBtn = document.createElement('button');
        metaBtn.className = 'knob-meta-btn';
        metaBtn.innerHTML = '⚙';
        metaBtn.title = 'Edit knob settings';
        metaBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onMetaClick) this.onMetaClick(this);
        });
        container.appendChild(metaBtn);

        // Interaction handlers
        svg.addEventListener('mousedown', (e) => this._onDragStart(e));
        svg.addEventListener('touchstart', (e) => this._onDragStart(e), { passive: false });

        // Wert-Drag auf dem GANZEN Knob-Element (@dpa 20260714, „volles Modell"): auch auf
        // Value, Label und der leeren Fläche ziehen = Wert ändern – nicht nur auf dem Dial.
        // Für Knobs OHNE Dial (viewSize:'none', z.B. „I max") ist das der EINZIGE Weg zu
        // ziehen; vorher selektierte ein Drag dort nur den Text. Ablauf:
        //   • Meta-Button (⚙) und das Dial (eigener Sofort-Drag) sind ausgenommen.
        //   • preventDefault → keine Text-Selektion beim Ziehen.
        //   • Slop (>4px): ein reiner Klick bleibt Klick (Value-Auswahl / Doppelklick-Eingabe,
        //     Label-Doppelklick = nichts); erst echtes Ziehen startet den Wert-Drag – relativ
        //     zum echten Startpunkt (nicht zum Slop-Punkt), damit nichts springt.
        container.addEventListener('mousedown', (e) => {
            if (this._dragging) return;
            if (e.target.closest('.knob-meta-btn')) return;   // ⚙ öffnet Settings
            if (e.target.closest('svg')) return;               // Dial: eigener Sofort-Drag oben
            e.preventDefault();
            const startEvt = e, sx = e.clientX, sy = e.clientY;
            const slopMove = (ev) => {
                if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
                document.removeEventListener('mousemove', slopMove);
                document.removeEventListener('mouseup', slopUp);
                this._onDragStart(startEvt);   // Drag relativ zum echten Start
                this._onDragMove(ev);          // erste Bewegung sofort anwenden
            };
            const slopUp = () => {
                document.removeEventListener('mousemove', slopMove);
                document.removeEventListener('mouseup', slopUp);
                // unter dem Slop → reiner Klick: die click/dblclick-Handler haben gegriffen.
            };
            document.addEventListener('mousemove', slopMove);
            document.addEventListener('mouseup', slopUp);
        });

        // Double-click on SVG to reset to center
        svg.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this._normValue = 0.5;
            this._updateVisual();
            if (this.onChange) this.onChange(this.value);
        });

        this.element = container;
        this._size = size;
        this._cx = cx;
        this._cy = cy;
        this._r = r;
        this._startAngle = startAngle;
        this._totalArc = totalArc;

        this._applyView();
        this._updateVisual();

        // Global mouse/touch handlers
        this._onDragMoveBound = (e) => this._onDragMove(e);
        this._onDragEndBound = (e) => this._onDragEnd(e);

        // Keyboard handler + sichtbare Selektion bei Fokus
        container.addEventListener('keydown', (e) => this._onKeyDown(e));
        container.addEventListener('focus', () => container.classList.add('knob-selected'));
        container.addEventListener('blur', () => container.classList.remove('knob-selected'));
    }

    /* ──────────────── Keyboard & Text Input ──────────────── */

    _onKeyDown(e) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            this._adjustValue(1, e);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            this._adjustValue(-1, e);
        }
    }

    /**
     * Pfeiltasten-Schrittweite mit Sondertasten:
     *   ⇧ Shift = grob (×10) · ⌥ Alt = fein (÷10) · ⌘/Ctrl = extra-fein (÷100)
     */
    _adjustValue(direction, e) {
        let step = this._step || (this._max - this._min) / 100;
        if (e.shiftKey) step *= 10;
        if (e.altKey) step /= 10;
        if (e.metaKey || e.ctrlKey) step /= 100;
        const newVal = this.value + direction * step;
        this.value = Math.max(this._min, Math.min(this._max, newVal));
    }

    _showValueInput() {
        const input = document.createElement('input');
        input.type = 'text';
        // Limit to configured decimals (max 2 if undefined, but preserves larger like 3 for Attack/Decay)
        const decs = this._decimals !== undefined ? Math.max(0, this._decimals) : 2;
        input.value = parseFloat(this.value.toFixed(decs));
        input.className = 'knob-value-input';

        this._valueDisplay.style.display = 'none';

        const finish = (commit) => {
            if (commit) {
                const val = parseFloat(input.value);
                if (!isNaN(val)) this.value = val;
            }
            input.remove();
            this._valueDisplay.style.display = '';
            this.element.focus();
        };

        input.addEventListener('blur', () => finish(true));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            if (e.key === 'Escape') { e.preventDefault(); finish(false); }
            e.stopPropagation(); // prevent triggering knob keydown
        });

        this.element.appendChild(input);
        input.focus();
        input.select();
    }

    /* ──────────────── SVG Helpers ──────────────── */

    _createArc(cx, cy, r, startDeg, endDeg) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-width', '4');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('d', this._describeArc(cx, cy, r, startDeg, endDeg));
        return path;
    }

    _describeArc(cx, cy, r, startDeg, endDeg) {
        const start = this._polarToCartesian(cx, cy, r, startDeg);
        const end = this._polarToCartesian(cx, cy, r, endDeg);
        const diff = startDeg - endDeg;
        const largeArc = Math.abs(diff) > 180 ? 1 : 0;
        const sweep = diff > 0 ? 1 : 0;

        if (Math.abs(diff) < 0.1) {
            // Near-zero arc
            return `M ${start.x} ${start.y} L ${start.x} ${start.y}`;
        }

        return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
    }

    _polarToCartesian(cx, cy, r, angleDeg) {
        const rad = (angleDeg * Math.PI) / 180;
        return {
            x: cx + r * Math.cos(rad),
            y: cy - r * Math.sin(rad),
        };
    }

    /* ──────────────── Ansicht (Größe + Farbe) ──────────────── */

    /** Größen-Klasse + Farb-Variable auf den Container anwenden. */
    _applyView() {
        if (!this.element) return;
        this.element.classList.remove('knob-size-medium', 'knob-size-mini', 'knob-size-small', 'knob-size-large', 'knob-size-none');
        this.element.classList.add('knob-size-' + (this._viewSize || 'medium'));
        this.element.classList.toggle('knob-hide-value', this._hideValue);
        // Farbe als CSS-Variable → Wertbogen/Indikator/Value nutzen sie (Fallback = Default).
        if (this._color) this.element.style.setProperty('--knob-accent', this._color);
        else this.element.style.removeProperty('--knob-accent');
        // Label-Position (@dpa 20260714): top = über dem Dial, left/right = seitlich neben
        // Dial+Value (Grid, s. CSS), off = ausgeblendet, sonst unten.
        this.element.classList.remove('knob-label-top', 'knob-label-off', 'knob-label-left', 'knob-label-right');
        if (this._labelPos === 'top') this.element.classList.add('knob-label-top');
        else if (this._labelPos === 'off') this.element.classList.add('knob-label-off');
        else if (this._labelPos === 'left') this.element.classList.add('knob-label-left');
        else if (this._labelPos === 'right') this.element.classList.add('knob-label-right');
        // Knob-BG-Farbe: eigener Hintergrund hinter dem Regler (nur wenn gesetzt → kein Layout-Sprung).
        this.element.classList.toggle('knob-has-bg', !!this._bg);
        if (this._bg) this.element.style.setProperty('--knob-bg', this._bg);
        else this.element.style.removeProperty('--knob-bg');
    }

    /* ──────────────── Visual Update ──────────────── */

    _updateVisual() {
        if (!this._svgArc) return;

        const valueDeg = this._startAngle - this._normValue * this._totalArc;
        this._svgArc.setAttribute('d',
            this._describeArc(this._cx, this._cy, this._r, this._startAngle, valueDeg)
        );

        // Indicator dot position
        const pos = this._polarToCartesian(this._cx, this._cy, this._r, valueDeg);
        this._indicator.setAttribute('cx', pos.x);
        this._indicator.setAttribute('cy', pos.y);

        // Value text
        const displayVal = this.value;
        let text;
        if (this.formatValue) {
            text = this.formatValue(displayVal);
        } else if (Math.abs(displayVal) >= 1000) {
            text = (displayVal / 1000).toFixed(1) + 'k';
        } else {
            text = displayVal.toFixed(this._decimals);
        }
        this._valueDisplay.textContent = this.formatValue ? text : text + this._unit;
    }

    /* ──────────────── Drag Interaction ──────────────── */

    _onDragStart(e) {
        e.preventDefault();
        this._dragging = true;
        this._dragStartY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
        this._dragStartNorm = this._normValue;

        document.addEventListener('mousemove', this._onDragMoveBound);
        document.addEventListener('mouseup', this._onDragEndBound);
        document.addEventListener('touchmove', this._onDragMoveBound, { passive: false });
        document.addEventListener('touchend', this._onDragEndBound);

        this.element.classList.add('knob-active');
    }

    _onDragMove(e) {
        if (!this._dragging) return;
        e.preventDefault();

        const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
        const dy = this._dragStartY - y; // positive = up = increase
        const sensitivity = e.shiftKey ? 600 : 200; // shift for fine control

        this._normValue = Math.max(0, Math.min(1,
            this._dragStartNorm + dy / sensitivity
        ));

        this._updateVisual();
        if (this.onChange) this.onChange(this.value);
    }

    _onDragEnd(e) {
        this._dragging = false;
        document.removeEventListener('mousemove', this._onDragMoveBound);
        document.removeEventListener('mouseup', this._onDragEndBound);
        document.removeEventListener('touchmove', this._onDragMoveBound);
        document.removeEventListener('touchend', this._onDragEndBound);

        this.element.classList.remove('knob-active');
    }

    /* ──────────────── Meta Configuration ──────────────── */

    /**
     * Get the meta-configuration for this knob.
     */
    getMeta() {
        return {
            min: this._min,
            max: this._max,
            step: this._step,
            curve: this._curve,
            skew: this._skew || 1,
            unit: this._unit,
            decimals: this._decimals,
            label: this.label,
            viewSize: this._viewSize,
            color: this._color,
            labelPos: this._labelPos,
            bg: this._bg,
        };
    }

    /**
     * Apply meta-configuration from the editor.
     */
    setMeta(meta) {
        const currentValue = this.value;
        if (meta.min !== undefined) this._min = meta.min;
        if (meta.max !== undefined) this._max = meta.max;
        if (meta.step !== undefined) this._step = meta.step;
        if (meta.curve !== undefined) this._curve = meta.curve;
        if (meta.skew !== undefined) this._skew = meta.skew;
        if (meta.unit !== undefined) this._unit = meta.unit;
        if (meta.decimals !== undefined) this._decimals = meta.decimals;
        if (meta.label !== undefined) { this.label = meta.label; if (this._labelEl) this._labelEl.textContent = meta.label; }
        if (meta.viewSize !== undefined) this._viewSize = meta.viewSize;
        if (meta.color !== undefined) this._color = meta.color;
        if (meta.labelPos !== undefined) this._labelPos = meta.labelPos;
        if (meta.bg !== undefined) this._bg = meta.bg;

        this._normValue = this._valueToNorm(
            Math.max(this._min, Math.min(this._max, currentValue))
        );
        this._applyView();
        this._updateVisual();
    }

    /* ──────────────── Serialisation ──────────────── */

    toJSON() {
        return {
            id: this.id,
            value: this.value,
            min: this._min,
            max: this._max,
            step: this._step,
            curve: this._curve,
            unit: this._unit,
            decimals: this._decimals,
            label: this.label,
        };
    }

    static fromJSON(json, onChange, onMetaClick) {
        return new Knob({ ...json, onChange, onMetaClick });
    }

    /**
     * Mount into a parent element.
     */
    mount(parent) {
        parent.appendChild(this.element);
    }

    /**
     * Remove from DOM.
     */
    unmount() {
        this.element?.remove();
    }
}
