/**
 * Master.js – Master-Bus: DC-Block → Limiter → Volume → Destination (+ Analyser).
 *
 * Bei Pulswellen wichtig: DC-Block (Highpass) gegen Gleichanteil bei Duty≠50%,
 * Limiter als Sicherheits-Begrenzer.
 */
export class Master {
    /** @param {AudioContext} ctx */
    constructor(ctx) {
        this.ctx = ctx;

        this.input = ctx.createGain();
        this.input.gain.value = 1;

        // DC-Block / Rumpelfilter
        this.dcBlock = ctx.createBiquadFilter();
        this.dcBlock.type = 'highpass';
        this.dcBlock.frequency.value = 8;
        this.dcBlock.Q.value = 0.7;

        // Sicherheits-Limiter
        this.limiter = ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -3;
        this.limiter.knee.value = 6;
        this.limiter.ratio.value = 20;
        this.limiter.attack.value = 0.001;
        this.limiter.release.value = 0.05;

        this.volume = ctx.createGain();
        this.volume.gain.value = 0.8;

        this.analyser = ctx.createAnalyser();
        // Groß: feinere Frequenzauflösung im Sub/Infra-Bereich + längeres Scope-Fenster.
        this.analyser.fftSize = 8192;
        this.analyser.smoothingTimeConstant = 0.5;

        // Statischer Teil der Kette
        this.limiter.connect(this.volume);
        this.volume.connect(this.analyser);
        this.volume.connect(ctx.destination);

        // Umschaltbarer Eingang: input → [dcBlock] → limiter
        this.dcEnabled = true;
        this._reroute();
    }

    /** DC-Block ein/aus (zum Ausprobieren von Extremen). */
    setDcBlock(on) {
        this.dcEnabled = !!on;
        this._reroute();
    }

    _reroute() {
        try { this.input.disconnect(); } catch { /* noop */ }
        try { this.dcBlock.disconnect(); } catch { /* noop */ }
        if (this.dcEnabled) {
            this.input.connect(this.dcBlock);
            this.dcBlock.connect(this.limiter);
        } else {
            this.input.connect(this.limiter);
        }
    }

    setVolume(v) {
        this.volume.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.01);
    }

    getWaveform() {
        const d = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(d);
        return d;
    }

    getSpectrum() {
        const d = new Float32Array(this.analyser.frequencyBinCount);
        this.analyser.getFloatFrequencyData(d);
        return d;
    }
}
