/**
 * SquareOsc.js – Audio-Oszillator als Pro-Trigger-Voice.
 *
 * Jeder Trigger erzeugt einen frischen OscillatorNode → startet IMMER bei
 * Wellen-t=0 (= eingebackene Start-Phase) → garantierte Phasen-Synchronität.
 * Wellenform wählbar (square/saw/sine/tri); bandlimitiert über PeriodicWave
 * (Harmonische je nach Frequenz). Amp-Envelope mit ~1 ms Attack/Release gegen
 * Knacken. Optionaler Lowpass (1p–4p) mit eigener Decay-Hüllkurve pro Voice.
 *
 * Poly-Limit: bei langer Amp-Env/Attack können aufeinanderfolgende Trigger
 * überlappen (natürliche Polyphonie). `polyMax` begrenzt, wie viele Voices
 * gleichzeitig klingen dürfen – bei Überschreiten wird die ÄLTESTE Voice
 * sanft gestohlen (FIFO, schnelles Release statt Knacken).
 */
import { oscCoefficients, harmonicsForFreq } from './pulseWave.js';

export class SquareOsc {
    /**
     * @param {AudioContext} ctx
     * @param {AudioNode} destination – Master-Input
     */
    constructor(ctx, destination) {
        this.ctx = ctx;
        this.destination = destination;
        this._voices = [];   // laufende Voices, älteste zuerst (für Poly-Limit/Stealing)
        // Wavetable-Cache: identische (duty,phase,N) nicht neu backen (CPU-sparsam).
        this._waveCache = new Map();
    }

    /** Gebackene PeriodicWave aus Cache holen oder erzeugen. */
    _wave(engine, param, phase, N) {
        // engine/param/phase grob quantisieren → Cache greift, solange Regler ruhen.
        const key = `${engine}_${Math.round(param * 200)}_${Math.round(phase * 200)}_${N}`;
        let w = this._waveCache.get(key);
        if (!w) {
            const { real, imag } = oscCoefficients(engine, param, phase, N);
            w = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
            if (this._waveCache.size > 256) this._waveCache.clear();
            this._waveCache.set(key, w);
        }
        return w;
    }

    /**
     * Einen Ton anschlagen (eine Voice pro Trigger). Laufen bereits `p.polyMax`
     * Voices gleichzeitig (lange Amp-Env/Attack → überlappende Trigger), wird
     * zuerst die ÄLTESTE Voice sanft gestohlen (FIFO) – so lässt sich mit
     * langer Env/Len bewusst ein Cluster bauen ODER die Polyphonie hart begrenzen.
     * @param {number} time   – AudioContext-Zeit des Triggers
     * @param {number} freq   – Tonhöhe in Hz
     * @param {number} dur    – Gesamtdauer (Envelope-Länge) in s
     * @param {object} p
     * @param {string} p.engine     – 'Square-PW' | 'Sine-FM'
     * @param {number} p.param       – Square-PW: Pulsweite ; Sine-FM: Feedback (0..1)
     * @param {number} p.startPhase – 0..1
     * @param {number} p.attack     – Attack in s (>=0.001)
     * @param {number} p.release    – ASR-Release in s NACH dem Len-Ende (0 = Anti-Klick)
     * @param {number} p.amp        – 0..1
     * @param {number} [p.polyMax]  – max. gleichzeitig klingende Voices (1..8)
     */
    trigger(time, freq, dur, p) {
        const polyMax = Math.max(1, Math.min(8, (p.polyMax | 0) || 8));
        while (this._voices.length >= polyMax) this._stealOldest(time);
        this._spawnVoice(time, Math.max(1, freq), dur, p);
    }

    /** Gehaltene Voice umstimmen UND ihren Sustain bis `t+dur` verlängern, OHNE die
     *  Amp-Env neu anzuschlagen. Für 'hold': der Amp klingt DURCHGEHEND, nur die
     *  Tonhöhe steppt. Solange retune() nachkommt, erreicht die Note nie ihr Release
     *  (kein wiederkehrender langsamer Attack). Ein laufender Attack wird sanft
     *  fortgeführt (kein Sprung), danach hält sie auf vollem Amp bis zum neuen Len-Ende.
     *  @param glide 0 = harter Pitch-Sprung, >0 = τ-Glide (s). */
    retune(freq, time, dur, glide = 0) {
        const v = this._voices[this._voices.length - 1];
        if (!v) return;
        const f = Math.max(1, freq);
        const t = Math.max(this.ctx.currentTime, time);
        try {
            // Pitch-Step
            const p = v.osc.frequency;
            if (glide > 0) { p.cancelScheduledValues(t); p.setTargetAtTime(f, t, glide); }
            else p.setValueAtTime(f, t);
            // Sustain verlängern: geplantes Release/Stop verwerfen und neu setzen.
            const g = v.gain.gain;
            if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else g.cancelScheduledValues(t);
            if (t < v.attackEnd) g.linearRampToValueAtTime(v.amp, v.attackEnd); // Attack sanft zu Ende
            else g.setValueAtTime(v.amp, t);                                    // sonst direkt Amp halten
            const susEnd = Math.max(v.attackEnd, t + Math.max(0.005, dur || 0));
            g.setValueAtTime(v.amp, susEnd);
            g.exponentialRampToValueAtTime(0.0001, susEnd + v.release);
            v.osc.stop(susEnd + v.release + 0.01);
        } catch { /* Voice evtl. schon beendet */ }
    }

    /** Älteste Voice sanft stehlen: Ramp auf ~0 in 5 ms, dann Stop/Disconnect (kein Knacken). */
    _stealOldest(time) {
        const v = this._voices.shift();
        if (!v) return;
        const t = Math.max(this.ctx.currentTime, time);
        const gain = v.gain.gain, release = 0.005;
        try {
            if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(t); else gain.cancelScheduledValues(t);
            gain.linearRampToValueAtTime(0.0001, t + release);
            v.osc.stop(t + release + 0.001);
        } catch { /* Voice evtl. schon beendet */ }
    }

    /** Eine einzelne Oszillator-Voice bauen und mit Amp-Envelope abspielen. */
    _spawnVoice(time, freq, dur, p) {
        const ctx = this.ctx;
        // Hohe Obertongrenze → tiefe Töne behalten scharfe Ecken (Sub/Infra),
        // hohe Töne werden durch harmonicsForFreq automatisch bandlimitiert.
        const N = harmonicsForFreq(freq, ctx.sampleRate, 2048);
        const wave = this._wave(p.engine || 'Square-PW', p.param, p.startPhase || 0, N);

        const osc = ctx.createOscillator();
        osc.setPeriodicWave(wave);
        osc.frequency.value = Math.max(1, freq);

        const g = ctx.createGain();
        const attack = Math.max(0, p.attack);          // 0 = senkrechter, „ungeglätteter" Einsatz
        const amp = Math.max(0, Math.min(1, p.amp));
        const aEnd = time + attack;

        // Attack: 0 = harter Anschlag, sonst lineare Rampe auf amp.
        if (attack <= 0) g.gain.setValueAtTime(amp, time);
        else { g.gain.setValueAtTime(0, time); g.gain.linearRampToValueAtTime(amp, aEnd); }

        // ASR (@dpa): KEIN Decay, KEIN Sustain-Level – nach dem Attack hält die Note
        // IMMER auf vollem Amp bis zum Len-Ende (Len = Gate-Zeit). Danach fällt sie
        // exponentiell im Release (Regler) aus – das Release hängt HINTER der Len,
        // setzt sie also nie zurück (Überlappung/polyMax dürfen davon wachsen).
        const release = Math.max(0.003, p.release || 0);   // 0 = nur ~3 ms Anti-Klick
        const susEnd = Math.max(aEnd, time + dur);
        g.gain.setValueAtTime(amp, susEnd);                // Sustain = Amp bis Len-Ende
        g.gain.exponentialRampToValueAtTime(0.0001, susEnd + release);
        const stopAt = susEnd + release + 0.01;

        // Der Lowpass-Filter sitzt global im Bus (TPT-Ladder, AudioWorklet) – NICHT
        // pro Voice. Hier geht die Voice direkt an das (Bus-)Ziel.
        osc.connect(g);
        g.connect(this.destination);

        osc.start(time);
        osc.stop(stopAt);

        // amp/release/attackEnd merken → retune() (hold) kann Sustain sauber verlängern.
        const voice = { osc, gain: g, amp, release, attackEnd: aEnd };
        this._voices.push(voice);
        osc.onended = () => {
            try { osc.disconnect(); g.disconnect(); } catch { /* noop */ }
            const idx = this._voices.indexOf(voice);
            if (idx >= 0) this._voices.splice(idx, 1);
        };
    }

    /** Alle laufenden Voices sofort stoppen. */
    panic() {
        for (const v of this._voices) {
            try { v.osc.stop(); v.osc.disconnect(); v.gain.disconnect(); } catch { /* noop */ }
        }
        this._voices.length = 0;
    }
}
