/**
 * StepSeqUI.js – Kompaktes Step-Sequenzer-Widget (Filter & Amp).
 *
 * Zeigt die ersten `${which}SeqLen` Steps als Balken (Höhe = Wert 0..1). Bedienung:
 *   - Klick auf einen Step  → Gate an/aus (0 = off = kein Trigger).
 *     Beim Ausschalten wird die Höhe gemerkt und beim Einschalten wiederhergestellt.
 *   - Ziehen (> DRAG_THRESH) → „Env-Höhe" (Velocity/Depth) setzen; horizontales
 *     Wischen malt mehrere Steps.
 * Kopfzeile: Steps-Eingabe · Fill · set0. Die Optik (Größe/BG/Farben mit Alpha) kommt
 * per RECHTSKLICK – wie überall sonst im Synth, s. _openSettings.
 *
 * Optik (Größe/Farben) liegt je Seq-Typ GETRENNT in state.seqStyles[which] (Optik-
 * Ebene → im Layout gespeichert). Filter- und Amp-Seq verstellen sich damit nicht
 * mehr gegenseitig. Single Source of Truth = State: alle Werte in
 * `${which}SeqSteps/-Len`, Edits gehen über state.set → Recall/Snapshot/Auto-Save.
 */
import { fillSeq, SEQ_MAX } from '../dsp/stepSeq.js';
import { icon } from './icons.js';
import { hint } from '../core/i18n.js';
import { MiniSettings } from './MiniSettings.js';

const DRAG_THRESH = 4;   // px: darüber = Höhe ziehen, darunter = Klick (Gate toggeln)
// Per-Typ-Default: Balkenfarbe unterscheidet Filter (cyan) und Amp (orange).
const SEQ_DEFAULT = {
    filter: { w: 270, h: 64, bg: '#0e1116', col: 'rgba(90,209,255,1)' },
    amp: { w: 270, h: 64, bg: '#0e1116', col: 'rgba(255,159,90,1)' },
};

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
        this._settings = new MiniSettings(which === 'amp' ? 'Amp-Sequenzer' : 'Filter-Sequenzer');
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
        hint(num, 'Sequenz-Länge (1…' + SEQ_MAX + ' Steps)');
        num.addEventListener('change', () => {
            let v = Math.round(parseFloat(num.value) || 1);
            v = Math.max(1, Math.min(SEQ_MAX, v));
            num.value = v; this.state.set(this._lenKey, v);
        });
        this._num = num;
        const fill = document.createElement('button');
        fill.className = 'pb-btn seq-ic'; fill.appendChild(icon('fill'));
        hint(fill, 'Fill: sichtbares Muster über den unsichtbaren Rest wiederholen');
        fill.addEventListener('click', () => this._write(fillSeq(this._steps(), this._len())));
        const s0 = document.createElement('button');
        s0.className = 'pb-btn seq-ic'; s0.appendChild(icon('rewind'));
        hint(s0, 'set0: der nächste Trigger startet wieder bei Step 1');
        s0.addEventListener('click', () => this.engine.resetSeq(this.which));
        // Kein ⚙ mehr in der Kopfzeile (@dpa 20260716_174111: „settings-Icons weg").
        // Die Settings kommen per Rechtsklick – das ist die eine Regel im ganzen Synth,
        // ein Icon daneben war die Ausnahme, die man sich extra merken musste.
        head.appendChild(lab); head.appendChild(num); head.appendChild(fill); head.appendChild(s0);

        const cv = document.createElement('canvas'); cv.className = 'seq-canvas';
        cv.width = this._w(); cv.height = this._h();
        this._cv = cv;
        this._wire(cv);

        box.appendChild(head); box.appendChild(cv);
        // Rechtsklick irgendwo auf dem Seq-Widget (auch dem Canvas) = Settings öffnen
        // (@dpa 20260714), ohne Step-Werte zu verstellen (button-Check im _wire) und ohne
        // auf die Gruppen-Settings durchzufallen. Anker = Mausposition.
        box.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 }) };
            this._openSettings(anchor);
        });
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
            if (e.button !== 0) return;   // nur linke Taste editiert Steps – RM ist Settings-Aufruf
            e.preventDefault();
            const p = at(e);
            start = p; dragging = false; idx0 = this._stepAtX(p.x);
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }

    /** Optik: Größe (Breite/Höhe), BG-Farbe, Balkenfarbe (mit Alpha).
     *  ALLES gilt je Seq-Typ (Filter/Amp getrennt) – Schreiben nur in seqStyles[which].
     *  Das Panel ist ab 20260716_174111 das geteilte MiniSettings (Titelleiste zum Ziehen,
     *  zweispaltig, ESC/Außenklick) – vorher ein handgebautes Popover, das an einem Label
     *  hing und einspaltig in die Höhe wuchs. */
    _openSettings(anchor) {
        const patch = (p) => this.state.set('seqStyles', { ...(this.state.get('seqStyles') || {}), [this.which]: { ...this._style(), ...p } });
        this._settings.open(anchor, (f) => {
            f.num('Breite', { min: 120, max: 900, get: () => this._style().w, set: (v) => patch({ w: v }) });
            f.num('Höhe', { min: 32, max: 240, get: () => this._style().h, set: (v) => patch({ h: v }) });
            f.color('BG', { get: () => this._style().bg, set: (v) => patch({ bg: v }), title: 'Hintergrund der Anzeige' });
            f.colorA(this.which === 'amp' ? 'Amp' : 'Filter', {
                get: () => this._style().col, set: (v) => patch({ col: v }),
                fallback: this.which === 'amp' ? '#ff9f5a' : '#5ad1ff',
            });
        });
    }
    _closeSettings() { this._settings.close(); }

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
