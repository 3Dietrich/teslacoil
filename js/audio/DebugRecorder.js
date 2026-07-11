/**
 * DebugRecorder.js – Roher PCM-Tap für das Debug-Werkzeug (C7).
 *
 * Zapft PARALLEL am Master-Ausgang ab (Hörweg unberührt, Tap-Node läuft nur
 * in einen stummen Sink) und sammelt Float32-Samples während der Aufnahme.
 * ScriptProcessorNode statt AudioWorklet – bewusst, denn ein zweites
 * `audioWorklet.addModule()` ist für ein reines Dev-Werkzeug nicht nötig und
 * birgt in mancher Sandbox Hänger (s. LadderFilter-Erfahrung). Node/Sink
 * werden nur WÄHREND der Aufnahme erzeugt (kein Dauer-Overhead im Graph).
 */
export class DebugRecorder {
    /** @param {AudioContext} ctx @param {AudioNode} tapNode – z.B. master.volume */
    constructor(ctx, tapNode) {
        this.ctx = ctx;
        this.tapNode = tapNode;
        this._proc = null;
        this._sink = null;
        this._chunks = [];
        this._recording = false;
    }

    get recording() { return this._recording; }

    start() {
        if (this._recording) return;
        this._chunks = [];
        this._proc = this.ctx.createScriptProcessor(2048, 1, 1);
        this._sink = this.ctx.createGain();
        this._sink.gain.value = 0;   // stumm – nur damit der Processor getickt wird
        this.tapNode.connect(this._proc);
        this._proc.connect(this._sink);
        this._sink.connect(this.ctx.destination);
        this._proc.onaudioprocess = (e) => {
            if (this._recording) this._chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        };
        this._recording = true;
    }

    /** Aufnahme stoppen, alle Chunks zu EINEM Float32Array zusammenfügen. */
    stop() {
        this._recording = false;
        if (this._proc) {
            try { this.tapNode.disconnect(this._proc); this._proc.disconnect(); this._sink.disconnect(); } catch { /* noop */ }
            this._proc.onaudioprocess = null;
            this._proc = null; this._sink = null;
        }
        const total = this._chunks.reduce((n, c) => n + c.length, 0);
        const out = new Float32Array(total);
        let off = 0;
        for (const c of this._chunks) { out.set(c, off); off += c.length; }
        this._chunks = [];
        return out;
    }
}
