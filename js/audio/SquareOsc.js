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
import { slidePlan, slideFreqAt } from '../dsp/holdSlide.js';

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
     *  @param glide 0 = harter Pitch-Sprung, >0 = Slide-Dauer (s) bis zur Ankunft.
     *  @param wp   {engine,param,startPhase} – Wellenform-Parameter; werden bei JEDEM
     *              Retune neu angewandt (s.u.). */
    retune(freq, time, dur, glide = 0, wp = null) {
        const v = this._voices[this._voices.length - 1];
        if (!v) return;
        const f = Math.max(1, freq);
        const t = Math.max(this.ctx.currentTime, time);
        try {
            // Wellenform live nachziehen (@dpa 20260714): Im Hold wird die Voice NIE neu
            // angeschlagen – ohne das hier bliebe sie für immer auf der Wellenform vom
            // Anschlag. Engine/PW/FM wirkten dann gar nicht mehr (der Hold hält endlos:
            // _ampHoldUntil wird bei jedem Trigger weitergeschoben) → „Umschalten kommt
            // nie an". setPeriodicWave darf jederzeit gesetzt werden und lässt die
            // Amp-Env unberührt, der Hold bleibt also erhalten. Die Obertongrenze folgt
            // dabei der neuen Frequenz (wie beim frischen Anschlag → kein Aliasing).
            if (wp) {
                const N = harmonicsForFreq(f, this.ctx.sampleRate, 2048);
                v.osc.setPeriodicWave(this._wave(wp.engine || 'Square-PW', wp.param, wp.startPhase || 0, N));
            }
            // Pitch-Slide (@dpa 20260715): einpoliger LP auf ein überhöhtes, an der echten
            // Zielfrequenz gekapptes Ziel – die Rechnung dazu steht in dsp/holdSlide.js
            // (dort auch das Warum, und sie ist dort headless testbar).
            //
            // Startpunkt ist der IST-Wert bei t – bei einem Retune mitten im Slide also die
            // Frequenz, auf der der Ton in diesem Moment wirklich steht (_freqAt rechnet den
            // laufenden Plan nach). Vorher stand hier `v.freq`, das direkt auf das ZIEL
            // gesetzt wurde: kam ein Trigger vor dem Ende des Slides, rechnete der nächste
            // Slide von einem Ort aus, an dem der Ton nie war. Bei glide ≥ Trigger-Abstand
            // wurde die Bewegung dadurch immer kleiner – der Slide „funktionierte nicht mehr".
            //
            // setTargetAtTime ist selbst-verankernd (startet beim Ist-Wert) – anders als
            // linearRampToValueAtTime, das ab dem VORHERIGEN Ereignis rampt und den Slide
            // dadurch viel zu früh beginnen ließe (so gemessen, deshalb nicht verwendet).
            const p = v.osc.frequency;
            if (glide > 0) {
                const plan = slidePlan(this._freqAt(v, t), f, glide);
                if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t);
                p.setTargetAtTime(plan.target, t, plan.tau);
                p.setValueAtTime(f, t + glide);   // „limiten": hier ist die Kurve am Ziel → stetig
                v.slide = { plan, t0: t };        // → _freqAt: Ist-Wert eines laufenden Slides
            } else {
                p.cancelScheduledValues(t); p.setValueAtTime(f, t);
                v.slide = null;
            }
            v.freq = f;   // Ankunftsfrequenz (Anker, sobald kein Slide mehr läuft)
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

    /** Wo steht die Frequenz dieser Voice zur Zeit `t`? Läuft ein Slide, wird sein Plan
     *  nachgerechnet (identisch zu dem, was der AudioParam tut) – sonst ist es schlicht
     *  die zuletzt gesetzte Frequenz. `t` liegt durch den Clock-Lookahead meist in der
     *  Zukunft; genau deshalb wird gerechnet und nicht `frequency.value` gelesen (das
     *  gäbe den Wert von JETZT, nicht den bei t). */
    _freqAt(v, t) {
        if (v.slide) {
            const val = slideFreqAt(v.slide.plan, t - v.slide.t0);
            if (val != null) return val;
        }
        return v.freq ?? 1;
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
        // freq/slide mitführen: Ausgangspunkt für den Hold-Slide in retune() (s. _freqAt).
        const voice = { osc, gain: g, amp, release, attackEnd: aEnd, freq: Math.max(1, freq), slide: null };
        this._voices.push(voice);
        osc.onended = () => {
            try { osc.disconnect(); g.disconnect(); } catch { /* noop */ }
            const idx = this._voices.indexOf(voice);
            if (idx >= 0) this._voices.splice(idx, 1);
        };
    }

    /** Harter Audio-Reset (nur für den Reset-/Panik-Knopf, @dpa 20260715): Gain hart auf 0
     *  und alle Voices tot – auch eine per Clock-Lookahead in die ZUKUNFT geplante Voice
     *  (osc.start(t>now)) verstummt damit garantiert. Knacken ist hier ausdrücklich egal.
     *  Der normale stop() würgt NICHTS ab, dort klingt alles aus. */
    kill() {
        const now = this.ctx.currentTime;
        for (const v of this._voices) {
            try {
                v.osc.onended = null;                 // eigenes Aufräumen hier, kein doppeltes Splicen
                const g = v.gain.gain;
                g.cancelScheduledValues(now); g.setValueAtTime(0, now);
                v.osc.stop(now); v.osc.disconnect(); v.gain.disconnect();
            } catch { /* noop */ }
        }
        this._voices.length = 0;
    }
}
