/**
 * DebugPanel.js – "Debug"-Werkzeug (KEIN Sound-Parameter): bündelt auf einen
 * Klick Audio (WAV) + Screenshot (alle sichtbaren Canvas-Elemente zu einem
 * PNG gestapelt) + Zustand (state.toJSON()) + einen frei eingegebenen
 * Begleit-Prompt zu Dateien `teslacoil_debug_<name>.*` – zum Hochladen an
 * die KI ("hörst du das Zwitschern bei Step 3?").
 *
 * NUR LOGIK, kein DOM (@dpa 20260715_223000: „es wäre schön wenn sich dieser Control
 * auflöst und alles in eigenen Control (typen) dann in der Gruppe steht"). Die
 * Bedienelemente baut app.js jetzt aus denselben generischen Fabriken wie alle
 * anderen Controls – damit sind sie einzeln verschiebbar, beschriftbar und stylbar.
 *
 * ZWEI Aufnahme-Slots (@dpa: „neben Rec soll ein zweites Rec2 hin, zum Vergleich von
 * vorher nachher"): 'a' und 'b' laufen unabhängig und landen als getrennte WAVs im
 * Bündel (…_a.wav / …_b.wav).
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
        // Pro Slot ein eigener Recorder + die letzte gestoppte Aufnahme.
        this.slots = {
            a: { rec: new DebugRecorder(engine.ctx, engine.master.volume), last: null },
            b: { rec: new DebugRecorder(engine.ctx, engine.master.volume), last: null },
        };
    }

    /** @param {'a'|'b'} slot */
    recording(slot) { return this.slots[slot].rec.recording; }

    /** Aufnahme dieses Slots starten/stoppen. @returns {number|null} Sekunden nach dem Stopp. */
    toggle(slot) {
        const s = this.slots[slot];
        if (s.rec.recording) {
            s.last = s.rec.stop();
            return s.last.length / this.engine.ctx.sampleRate;
        }
        s.rec.start();
        return null;
    }

    /** Länge der letzten Aufnahme dieses Slots in s (0 = noch keine). */
    lastSeconds(slot) {
        const l = this.slots[slot].last;
        return l && l.length ? l.length / this.engine.ctx.sampleRate : 0;
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

    saveBundle() {
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

        // Audio: beide Slots einzeln (a = vorher, b = nachher) – getrennte Dateien, damit
        // sich der Vergleich in der KI nicht erst aus einer Datei schneiden lässt.
        for (const slot of ['a', 'b']) {
            const buf = this.slots[slot].last;
            if (!buf || !buf.length) continue;
            const wav = encodeWav(buf, this.engine.ctx.sampleRate);
            this._download(new Blob([wav], { type: 'audio/wav' }), `teslacoil_debug_${name}_${slot}.wav`);
        }
    }
}
