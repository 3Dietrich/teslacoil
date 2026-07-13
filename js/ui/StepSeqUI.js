/**
 * StepSeqUI.js – Kompaktes Step-Sequenzer-Widget (Filter & Amp).
 *
 * Zeigt die ersten `${which}SeqLen` Steps als Balken (Höhe = Wert 0..1). Bedienung:
 *   - Klick auf einen Step  → Gate an/aus (0 = off = kein Trigger).
 *     Beim Ausschalten wird die Höhe gemerkt und beim Einschalten wiederhergestellt.
 *   - Ziehen (> DRAG_THRESH) → „Env-Höhe" (Velocity/Depth) setzen; horizontales
 *     Wischen malt mehrere Steps.
 * Kopfzeile: Steps-Eingabe · Fill · set0 · ⚙ (Optik: Größe/BG/Farben mit Alpha).
 *
 * Optik (Größe/Farben) liegt je Seq-Typ GETRENNT in state.seqStyles[which] (Optik-
 * Ebene → im Layout gespeichert). Filter- und Amp-Seq verstellen sich damit nicht
 * mehr gegenseitig. Single Source of Truth = State: alle Werte in
 * `${which}SeqSteps/-Len`, Edits gehen über state.set → Recall/Snapshot/Auto-Save.
 */
import { fillSeq, SEQ_MAX } from '../dsp/stepSeq.js';
import { Knob } from './Knob.js';

const DRAG_THRESH = 4;   // px: darüber = Höhe ziehen, darunter = Klick (Gate toggeln)
// Per-Typ-Default: Balkenfarbe unterscheidet Filter (cyan) und Amp (orange).
const SEQ_DEFAULT = {
    filter: { w: 270, h: 64, bg: '#0e1116', col: 'rgba(90,209,255,1)' },
    amp: { w: 270, h: 64, bg: '#0e1116', col: 'rgba(255,159,90,1)' },
};

// Farbe ↔ Hex/Alpha (selbstenthalten, kein Import).
const parseHex = (rgba, fb) => { if (!rgba) return fb; const m = rgba.match(/\d+/g); if (!m) return fb; return '#' + [m[0], m[1], m[2]].map((v) => (+v).toString(16).padStart(2, '0')).join(''); };
const parseA = (rgba, fb = 1) => { const m = rgba && rgba.match(/[\d.]+/g); return m && m.length >= 4 ? parseFloat(m[3]) : fb; };
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

export class StepSeqUI {
    /**
     * @param {import('../core/State.js').State} state
     * @param {import('../engine/TeslaEngine.js').TeslaEngine} engine
     * @param {'filter'|'amp'} which
     */
    constructor(state, engine, which) {
        this.state = state;
        this.engine = engine;
        this.which = which;
        this._lenKey = which + 'SeqLen';
        this._stepsKey = which + 'SeqSteps';
        this._enKey = which + 'SeqEnabled';
        // Filter hat kein eigenes Bool mehr – 'an' heißt dort filterEnvTrig === 'seq'
        // (dreistufiger Env-Trig, @dpa 20260713). Amp bleibt beim einfachen Bool-Toggle.
        this._isOn = which === 'filter'
            ? () => this.state.get('filterEnvTrig') === 'seq'
            : () => !!this.state.get(this._enKey);
        this._lastH = new Array(SEQ_MAX).fill(1);  // gemerkte Höhe je Step (Gate-Toggle)
        this._lastPos = -2;
        this.element = this._build();
    }

    _steps() { return (this.state.get(this._stepsKey) || []).slice(); }
    _len() { return Math.max(1, Math.min(SEQ_MAX, this.state.get(this._lenKey) | 0)); }
    _write(arr) { this.state.set(this._stepsKey, arr); }
    _style() { return { ...SEQ_DEFAULT[this.which], ...((this.state.get('seqStyles') || {})[this.which] || {}) }; }
    _w() { return Math.max(120, Math.min(900, this._style().w | 0)); }
    _h() { return Math.max(32, Math.min(240, this._style().h | 0)); }

    _build() {
        const box = document.createElement('div'); box.className = 'seq group-extra';

        const head = document.createElement('div'); head.className = 'seq-head';
        const lab = document.createElement('span'); lab.className = 'seq-lab'; lab.textContent = 'Steps';
        const num = document.createElement('input'); num.type = 'number'; num.className = 'seq-steps';
        num.min = 1; num.max = SEQ_MAX; num.step = 1; num.value = this._len();
        num.title = 'Sequenz-Länge (1…' + SEQ_MAX + ' Steps)';
        num.addEventListener('change', () => {
            let v = Math.round(parseFloat(num.value) || 1);
            v = Math.max(1, Math.min(SEQ_MAX, v));
            num.value = v; this.state.set(this._lenKey, v);
        });
        this._num = num;
        const fill = document.createElement('button');
        fill.className = 'pb-btn seq-ic'; fill.textContent = '⇥';
        fill.title = 'Fill: sichtbares Muster über den unsichtbaren Rest wiederholen';
        fill.addEventListener('click', () => this._write(fillSeq(this._steps(), this._len())));
        const s0 = document.createElement('button');
        s0.className = 'pb-btn seq-ic'; s0.textContent = '⏮';
        s0.title = 'set0: der nächste Trigger startet wieder bei Step 1';
        s0.addEventListener('click', () => this.engine.resetSeq(this.which));
        const cog = document.createElement('button');
        cog.className = 'pb-btn seq-ic'; cog.textContent = '⚙';
        cog.title = 'Anzeige: Größe, Hintergrund- & Balkenfarbe (mit Alpha)';
        cog.addEventListener('click', () => this._openSettings(cog));
        head.appendChild(lab); head.appendChild(num); head.appendChild(fill); head.appendChild(s0); head.appendChild(cog);

        const cv = document.createElement('canvas'); cv.className = 'seq-canvas';
        cv.width = this._w(); cv.height = this._h();
        this._cv = cv;
        this._wire(cv);

        box.appendChild(head); box.appendChild(cv);
        this.refresh();
        return box;
    }

    _stepAtX(x) {
        const len = this._len();
        return Math.max(0, Math.min(len - 1, Math.floor((x / this._w()) * len)));
    }
    _heightAtY(y) { return Math.max(0, Math.min(1, 1 - y / this._h())); }

    _wire(cv) {
        let start = null, dragging = false, idx0 = -1;
        const at = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
        const onMove = (e) => {
            if (!start) return;
            const p = at(e);
            if (!dragging && (Math.abs(p.x - start.x) > DRAG_THRESH || Math.abs(p.y - start.y) > DRAG_THRESH)) dragging = true;
            if (dragging) {
                const arr = this._steps();
                const i = this._stepAtX(p.x);
                const h = this._heightAtY(p.y);
                arr[i] = h;
                if (h > 0) this._lastH[i] = h;
                this._write(arr);
            }
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (start && !dragging) {              // reiner Klick = Gate toggeln
                const arr = this._steps();
                if (arr[idx0] > 0) { this._lastH[idx0] = arr[idx0]; arr[idx0] = 0; }
                else { arr[idx0] = this._lastH[idx0] || 1; }
                this._write(arr);
            }
            start = null; dragging = false;
        };
        cv.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const p = at(e);
            start = p; dragging = false; idx0 = this._stepAtX(p.x);
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }

    /** Kleines Optik-Popup: Größe (Breite/Höhe), BG-Farbe, Balkenfarbe (mit Alpha).
     *  ALLES gilt je Seq-Typ (Filter/Amp getrennt) – Schreiben nur in seqStyles[which].
     *  Fenster ist per Linksklick auf ein Label verschiebbar, ESC/Außenklick schließt
     *  (kein „Fertig"-Button mehr nötig). */
    _openSettings(anchor) {
        this._closeSettings();
        const colKey = 'col';
        const patch = (p) => this.state.set('seqStyles', { ...(this.state.get('seqStyles') || {}), [this.which]: { ...this._style(), ...p } });
        const pop = document.createElement('div'); pop.className = 'group-settings seq-settings-pop';
        // Linksklick auf ein Label zieht das ganze Popup; Klick auf den Value/Regler
        // bleibt normale Bedienung (kein Drag-Konflikt, da eigener Listener auf dem Label).
        const wireDrag = (labelEl) => {
            labelEl.style.cursor = 'move';
            labelEl.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const sx = e.clientX, sy = e.clientY;
                const startL = parseFloat(pop.style.left) || 0, startT = parseFloat(pop.style.top) || 0;
                const onMove = (ev) => {
                    pop.style.left = Math.max(0, startL + (ev.clientX - sx)) + 'px';
                    pop.style.top = Math.max(0, startT + (ev.clientY - sy)) + 'px';
                };
                const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
            });
        };
        const row = (label, ...els) => {
            const r = document.createElement('div'); r.className = 'gs-row';
            const l = document.createElement('span'); l.className = 'gs-lab'; l.textContent = label;
            wireDrag(l);
            r.appendChild(l); els.forEach((e) => r.appendChild(e)); pop.appendChild(r);
        };
        const num = (key, min, max) => {
            const i = document.createElement('input'); i.type = 'number'; i.min = min; i.max = max; i.step = 1; i.className = 'gs-text'; i.value = this._style()[key];
            i.addEventListener('input', () => { const v = parseInt(i.value); if (!isNaN(v)) patch({ [key]: Math.max(min, Math.min(max, v)) }); });
            return i;
        };
        row('Breite', num('w', 120, 900));
        row('Höhe', num('h', 32, 240));
        const bg = document.createElement('input'); bg.type = 'color'; bg.value = this._style().bg;
        bg.addEventListener('input', () => patch({ bg: bg.value }));
        row('BG', bg);
        const col = document.createElement('input'); col.type = 'color'; col.value = parseHex(this._style()[colKey], '#5ad1ff');
        // Opaque-Regler: kleiner Knob OHNE Value-Anzeige statt Slider (spart rechts Platz).
        const alphaKnob = new Knob({
            label: 'A', min: 0, max: 1, step: 0.01, curve: 'linear', decimals: 2,
            viewSize: 'mini', hideValue: true, value: parseA(this._style()[colKey], 1),
            onChange: (v) => patch({ [colKey]: hexA(col.value, v) }),
        });
        col.addEventListener('input', () => patch({ [colKey]: hexA(col.value, alphaKnob.value) }));
        row(this.which === 'amp' ? 'Amp' : 'Filter', col, alphaKnob.element);
        const r = anchor.getBoundingClientRect();
        pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 220))}px`;
        pop.style.top = `${r.bottom + 4}px`;
        document.body.appendChild(pop); this._pop = pop;
        this._outside = (e) => { if (this._pop && !this._pop.contains(e.target) && e.target !== anchor) this._closeSettings(); };
        this._escClose = (e) => { if (e.key === 'Escape') this._closeSettings(); };
        setTimeout(() => document.addEventListener('mousedown', this._outside, true), 0);
        document.addEventListener('keydown', this._escClose, true);
    }
    _closeSettings() {
        if (this._pop) {
            this._pop.remove(); this._pop = null;
            document.removeEventListener('mousedown', this._outside, true);
            document.removeEventListener('keydown', this._escClose, true);
        }
    }

    /** Aus dem State neu zeichnen (Recall/Edit). Größe kann sich geändert haben. */
    refresh() {
        if (this._num && document.activeElement !== this._num) this._num.value = this._len();
        if (this._cv.width !== this._w()) this._cv.width = this._w();
        if (this._cv.height !== this._h()) this._cv.height = this._h();
        this._lastPos = -2;   // Neuzeichnen erzwingen
        this._draw();
    }

    /** Im Render-Loop: Playhead nur bei Positionswechsel neu zeichnen. */
    tick() {
        const on = this._isOn() && this.engine.running;
        const pos = on ? this.engine.seqPos(this.which) : -1;
        if (pos !== this._lastPos) { this._lastPos = pos; this._draw(); }
    }

    _draw() {
        const W = this._w(), H = this._h();
        const st = this._style();
        const barCol = st.col;
        const cx = this._cv.getContext('2d');
        const len = this._len();
        const steps = this._steps();
        const on = this._isOn() && this.engine.running;
        const pos = on ? this.engine.seqPos(this.which) : -1;
        const bw = W / len;
        cx.clearRect(0, 0, W, H);
        cx.fillStyle = st.bg; cx.fillRect(0, 0, W, H);
        for (let i = 0; i < len; i++) {
            const x = i * bw;
            const v = Math.max(0, Math.min(1, steps[i] || 0));
            if (i === pos) { cx.fillStyle = 'rgba(255,255,255,0.10)'; cx.fillRect(x, 0, bw, H); }
            // Bodenlinie (Off-Steps bleiben so sichtbar)
            cx.fillStyle = '#2a2f3a'; cx.fillRect(x + 0.5, H - 1, Math.max(1, bw - 1), 1);
            if (v > 0) {
                const bh = v * (H - 2);
                cx.fillStyle = i === pos ? '#8ff0c0' : barCol;
                cx.fillRect(x + 0.5, H - bh, Math.max(1, bw - 1), bh);
            }
            // Step-Trenner
            if (i > 0 && bw > 3) { cx.fillStyle = 'rgba(0,0,0,0.35)'; cx.fillRect(x, 0, 1, H); }
        }
        cx.strokeStyle = '#2a2f3a'; cx.strokeRect(0.5, 0.5, W - 1, H - 1);
    }
}
