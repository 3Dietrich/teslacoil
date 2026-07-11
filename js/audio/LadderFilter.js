/**
 * LadderFilter.js – Web-Audio-Wrapper um den TPT-Ladder-Worklet.
 *
 * Sitzt GLOBAL im Bus (Voices → input → [Ladder] → output → Master). Solange
 * der Worklet noch nicht geladen oder der Filter „Aus" ist, läuft das Signal
 * über einen Bypass (input→output direkt). Der Cutoff wird pro Trigger als
 * Decay-Hüllkurve auf den `cutoff`-AudioParam geschedult.
 */
export class LadderFilter {
    /** @param {AudioContext} ctx */
    constructor(ctx) {
        this.ctx = ctx;
        this.input = ctx.createGain();   // Bus-Eingang
        this.output = ctx.createGain();  // Bus-Ausgang
        this.node = null;
        this.active = false;             // false = Bypass
        this._poles = 4;
        this.input.connect(this.output); // initialer Bypass bis Worklet bereit
    }

    /** Worklet-Modul laden (einmalig, async). */
    static async load(ctx) {
        await ctx.audioWorklet.addModule(new URL('./ladder-worklet.js', import.meta.url));
    }

    /** Worklet-Node erzeugen (nach erfolgreichem load). */
    build(poles = 4, q = 0.707, type = 'LP') {
        this._poles = poles;
        this._type = type;
        this.node = new AudioWorkletNode(this.ctx, 'tesla-ladder', {
            numberOfInputs: 1, numberOfOutputs: 1,
            channelCount: 1, channelCountMode: 'explicit', outputChannelCount: [1],
            processorOptions: { poles, type },
        });
        this.setReso(q);
        this._route();
    }

    get ready() { return !!this.node; }

    /** Filter ein-/ausschleifen (false → Bypass). */
    setActive(on) { this.active = !!on; this._route(); }

    _route() {
        try { this.input.disconnect(); } catch { /* noop */ }
        if (this.active && this.node) {
            this.input.connect(this.node);
            this.node.connect(this.output);
        } else {
            this.input.connect(this.output);
        }
    }

    setPoles(poles) {
        this._poles = poles;
        if (this.node) this.node.port.postMessage({ poles });
    }

    /** Filter-Typ setzen ('LP' | 'HP' | 'BP' | 'Ladder-org'). */
    setType(type) {
        this._type = type;
        if (this.node) this.node.port.postMessage({ type });
    }

    setReso(q) {
        if (this.node) this.node.parameters.get('q').setValueAtTime(Math.max(0.05, q), this.ctx.currentTime);
    }

    /** Statischer Cutoff (wenn keine Hüllkurve aktiv). */
    setCutoff(hz) {
        if (this.node) this.node.parameters.get('cutoff').setValueAtTime(Math.max(20, hz), this.ctx.currentTime);
    }

    /**
     * Cutoff sample-genau ZUM Trigger-Zeitpunkt setzen (nicht currentTime). Für
     * Keytrack ohne Env: pro aktivem Trigger genau EIN Sprung auf den effektiven
     * Cutoff, der bis zum nächsten Trigger stehen bleibt (kein Jitter, kein Ramp).
     * @param {number} glide – Glide-Zeitkonstante (τ) in s; 0 = harter Sprung
     */
    setCutoffAt(time, hz, glide = 0.015) {
        if (!this.node) return;
        const p = this.node.parameters.get('cutoff');
        const t = Math.max(this.ctx.currentTime, time);
        if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t);
        // Option A (@dpa): simpler Smooth-LP auf die Keytrack-Updates – der Basis-Cutoff
        // GLEITET zur neuen Note statt hart zu springen. Zeit per 'Glide'-Regler.
        if (glide > 0) p.setTargetAtTime(Math.max(20, hz), t, glide);
        else p.setValueAtTime(Math.max(20, hz), t);
    }

    /**
     * Attack-/Decay-Hüllkurve als MULTIPLIKATOR auf `cutoffEnv` (nicht auf den Basis-
     * Cutoff!). Steigt ab 1 in `attack` s auf `peakMult` und fällt in `decay` s
     * exponentiell auf 1 zurück. attack≈0 → sofort auf `peakMult` (reines Decay).
     * So läuft die Env unabhängig vom Basis-Cutoff (Keytrack) – beide multiplizieren
     * sich im Worklet, keiner überschreibt den anderen.
     */
    triggerEnvMult(time, peakMult, attack, decay) {
        if (!this.node) return;
        const p = this.node.parameters.get('cutoffEnv');
        // NIE in der Vergangenheit planen (sonst „springt" die Env vor dem Trigger).
        const t = Math.max(this.ctx.currentTime, time);
        const pk = Math.max(0.0001, peakMult);   // >0 (exponentialRamp erlaubt keine 0)
        const dec = Math.max(0.005, decay);
        if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t);
        if (attack > 0.001) {
            p.setValueAtTime(1, t);
            p.exponentialRampToValueAtTime(pk, t + attack);
            p.exponentialRampToValueAtTime(1, t + attack + dec);
        } else {
            p.setValueAtTime(pk, t);
            p.exponentialRampToValueAtTime(1, t + dec);
        }
    }
}
