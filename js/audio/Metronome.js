/**
 * Metronome.js – Getakteter „Knack" mit Vadim-SVF-Morph-Filter.
 *
 * Der Klick wird EINMAL pro Parameteränderung als AudioBuffer gerendert
 * (js/dsp/metroClick.js) und pro Taktschlag als BufferSource abgespielt –
 * günstig und sample-genau. Der Ausgang hängt direkt am Master (umgeht die
 * FX-Kette: der Metronom-Klick soll nicht durch Distortion/Reverb).
 */
import { renderMetroClick } from '../dsp/metroClick.js';

export class Metronome {
    /**
     * @param {AudioContext} ctx
     * @param {AudioNode} destination – i.d.R. master.input
     */
    constructor(ctx, destination) {
        this.ctx = ctx;
        this.out = ctx.createGain();
        this.out.gain.value = 0.5;
        this.out.connect(destination);
        this.buffer = null;
        this.peakOffset = 0;   // s: Lage des Haupt-Transienten im Buffer
    }

    /** Ausgangspegel (0..1). */
    setLevel(v) { this.out.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, 0.01); }

    /** Ausgang umstecken (Routing): parallel am Master oder in die FX-Kette. */
    setDestination(node) {
        try { this.out.disconnect(); } catch { /* noop */ }
        this.out.connect(node);
    }

    /** Klick-Buffer aus den aktuellen Parametern neu rendern (reiner Knack + Filter). */
    rebuild({ morph, cutoff, reso }) {
        const sr = this.ctx.sampleRate;
        const { data, peakIndex } = renderMetroClick({ sampleRate: sr, morph, cutoff, reso });
        const buf = this.ctx.createBuffer(1, data.length, sr);
        buf.copyToChannel(data, 0);
        this.buffer = buf;
        this.peakOffset = peakIndex / sr;
    }

    /** Einen Klick planen, so dass der Knack auf `time` (Taktschlag) fällt. */
    tick(time) {
        if (!this.buffer) return;
        const src = this.ctx.createBufferSource();
        src.buffer = this.buffer;
        src.connect(this.out);
        // Um den Vorschwinger früher starten → Transient landet auf dem Schlag.
        src.start(Math.max(this.ctx.currentTime, time - this.peakOffset));
    }
}
