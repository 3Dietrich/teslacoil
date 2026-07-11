/**
 * DebugPanel.js – "Debug"-Werkzeug (KEIN Sound-Parameter): bündelt auf einen
 * Klick Audio (WAV) + Screenshot (alle sichtbaren Canvas-Elemente zu einem
 * PNG gestapelt) + Zustand (state.toJSON()) + einen frei eingegebenen
 * Begleit-Prompt zu Dateien `teslacoil_debug_<name>.*` – zum Hochladen an
 * die KI ("hörst du das Zwitschern bei Step 3?").
 *
 * debugName/debugPrompt liegen in der OPTIK-Ebene (LAYOUT_KEYS): kein
 * Sound-Snapshot-Recall, überleben aber einen Reload.
 */
import { DebugRecorder } from '../audio/DebugRecorder.js';
import { encodeWav } from '../dsp/wavEncoder.js';

export class DebugPanel {
    /** @param {import('../core/State.js').State} state @param {import('../engine/TeslaEngine.js').TeslaEngine} engine */
    constructor(state, engine) {
        this.state = state;
        this.engine = engine;
        this.recorder = new DebugRecorder(engine.ctx, engine.master.volume);
        this._lastRecording = null;   // Float32Array | null – letzte gestoppte Aufnahme
        this.element = this._build();
    }

    _build() {
        const box = document.createElement('div'); box.className = 'debug-panel';

        const nameRow = document.createElement('label'); nameRow.className = 'select-field';
        const nameLab = document.createElement('span'); nameLab.textContent = 'Name';
        const nameIn = document.createElement('input'); nameIn.type = 'text'; nameIn.className = 'gs-text';
        nameIn.placeholder = 'z.B. filter-bug'; nameIn.value = this.state.get('debugName');
        nameIn.addEventListener('input', () => this.state.set('debugName', nameIn.value));
        nameRow.appendChild(nameLab); nameRow.appendChild(nameIn);

        const promptLab = document.createElement('div'); promptLab.className = 'gs-lab'; promptLab.textContent = 'Begleit-Prompt an die KI';
        const prompt = document.createElement('textarea'); prompt.className = 'debug-prompt gs-text';
        prompt.rows = 3; prompt.placeholder = 'z.B. "hörst du das Zwitschern bei Step 3?"';
        prompt.value = this.state.get('debugPrompt');
        prompt.addEventListener('input', () => this.state.set('debugPrompt', prompt.value));

        const recBtn = document.createElement('button'); recBtn.className = 'pb-btn';
        const status = document.createElement('span'); status.className = 'debug-status';
        const setRecUI = () => {
            recBtn.textContent = this.recorder.recording ? '⏹ Stop' : '⏺ Rec';
            recBtn.classList.toggle('debug-rec-on', this.recorder.recording);
        };
        recBtn.title = 'Audio parallel am Master abgreifen (Hörweg unberührt) – Start/Stop';
        recBtn.addEventListener('click', () => {
            if (this.recorder.recording) {
                this._lastRecording = this.recorder.stop();
                const secs = this._lastRecording.length / this.engine.ctx.sampleRate;
                status.textContent = `${secs.toFixed(1)} s aufgenommen`;
            } else {
                this.recorder.start();
                status.textContent = 'nimmt auf …';
            }
            setRecUI();
        });
        setRecUI();

        const saveBtn = document.createElement('button'); saveBtn.className = 'pb-btn pb-ic-new';
        saveBtn.textContent = 'Debug speichern';
        saveBtn.title = 'Audio (WAV) + Screenshot (PNG) + Zustand (JSON) + Prompt (TXT) einzeln herunterladen';
        saveBtn.addEventListener('click', () => this._saveBundle());

        const row1 = document.createElement('div'); row1.className = 'debug-row';
        row1.appendChild(recBtn); row1.appendChild(status);
        const row2 = document.createElement('div'); row2.className = 'debug-row';
        row2.appendChild(saveBtn);

        box.appendChild(nameRow);
        box.appendChild(promptLab); box.appendChild(prompt);
        box.appendChild(row1); box.appendChild(row2);
        return box;
    }

    /** Alle sichtbaren Canvas-Elemente (Scopes/Reflections/Seq/Meter) zu EINEM PNG stapeln.
     *  Pragmatisch statt Voll-DOM-Screenshot (kein html2canvas o.ä. → keine externe Lib). */
    _captureCanvasesPng() {
        const canvases = [...document.querySelectorAll('canvas')]
            .filter((c) => c.offsetParent !== null && c.width > 0 && c.height > 0);
        if (!canvases.length) return null;
        const w = Math.max(...canvases.map((c) => c.width));
        const h = canvases.reduce((sum, c) => sum + c.height + 4, 0);
        const out = document.createElement('canvas'); out.width = w; out.height = h;
        const cx = out.getContext('2d');
        cx.fillStyle = '#0e1116'; cx.fillRect(0, 0, w, h);
        let y = 0;
        for (const c of canvases) { cx.drawImage(c, 0, y); y += c.height + 4; }
        return out.toDataURL('image/png');
    }

    _download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    _saveBundle() {
        const name = (this.state.get('debugName') || 'debug').trim().replace(/[^a-z0-9_-]+/gi, '_') || 'debug';

        // Zustand: state.toJSON() – für die KI direkt lesbar (wertvollster Teil).
        this._download(new Blob([JSON.stringify(this.state.toJSON(), null, 2)], { type: 'application/json' }),
            `teslacoil_debug_${name}.json`);

        // Begleit-Prompt (@dpas Notiz/Frage an die KI).
        const prompt = this.state.get('debugPrompt') || '';
        if (prompt.trim()) {
            this._download(new Blob([prompt], { type: 'text/plain' }), `teslacoil_debug_${name}.txt`);
        }

        // Screenshot: alle sichtbaren Canvas-Elemente gestapelt.
        const png = this._captureCanvasesPng();
        if (png) {
            const b64 = png.split(',')[1];
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            this._download(new Blob([arr], { type: 'image/png' }), `teslacoil_debug_${name}.png`);
        }

        // Audio: letzte gestoppte Aufnahme (falls vorhanden) als WAV.
        if (this._lastRecording && this._lastRecording.length) {
            const wav = encodeWav(this._lastRecording, this.engine.ctx.sampleRate);
            this._download(new Blob([wav], { type: 'audio/wav' }), `teslacoil_debug_${name}.wav`);
        }
    }

    mount(parent) { parent.appendChild(this.element); }
}
