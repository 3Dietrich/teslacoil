/**
 * GateReverb.js – Gated Reverb über ConvolverNode mit synthetischer Impulsantwort.
 *
 * Erzeugt eine dichte Hall-„Wolke", die nach `len` Sekunden HART abreißt
 * (= gated): die Impulsantwort endet schlicht → kein Ausklang. Sitzt als
 * Insert im Bus (… → input → [dry + wet] → output → Master).
 *
 * Controls:
 *   density   – Dichte der Reflexionen (Menge der „reverbDelays", 0..1)
 *   len       – Länge der Hall-Wolke in s
 *   attack    – Einschwing-ANTEIL am Anfang der Wolke (0 = sofort voll, 1 = über ganze Länge)
 *   release   – Ausfade-Anteil am ENDE der Wolke kurz vor dem Abriss (0 = flaches Gate, 1 = Decay)
 *   seed      – fester Random-Seed → reproduzierbare Wolke (kein Random-Sprung beim Regeln)
 *   shelf     – HighShelf auf dem Hall-Anteil (freq + boost dB, neutral bei 0 dB, keine Resonanz)
 *   preDelay  – Vorverzögerung der Reflections (ms)
 *   mix       – Dry/Wet 0..1 ; wetVol – Wet-Pegel (>1 = „Gas geben")
 *
 * Als Effekt-Slot konzipiert: später können weitere Reverbs/Effekte über den
 * Umschalter [Bypass, Gate Reverb, …] hinzukommen.
 */

/** Deterministischer RNG (mulberry32) → fester Seed = feste Random-Sequenz. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export class GateReverb {
    /** @param {AudioContext} ctx */
    constructor(ctx) {
        this.ctx = ctx;
        this.input = ctx.createGain();
        this.output = ctx.createGain();
        this.dry = ctx.createGain();
        this.wet = ctx.createGain();
        // Zwei parallele Convolver-„Slots" A/B mit eigenen Crossfade-Gains: bei einer
        // neuen IR wird sie in den INAKTIVEN Slot gerendert und dann sanft hineingefadet
        // (statt den laufenden Convolver hart zu ersetzen → kein Aussetzer/Knack).
        this.convA = ctx.createConvolver(); this.convA.normalize = true;
        this.convB = ctx.createConvolver(); this.convB.normalize = true;
        this.gA = ctx.createGain(); this.gB = ctx.createGain();
        this.mixSum = ctx.createGain();     // Summe der beiden Slots
        // Pre-Delay der Reflections (bis 1 s), vor den Convolvern.
        this.preDelay = ctx.createDelay(1.0);
        this.preDelay.delayTime.value = 0;
        // Neutraler HighShelf: freq + boost/cut in dB, keine Resonanz (nach der Summe).
        this.shelf = ctx.createBiquadFilter();
        this.shelf.type = 'highshelf';
        this.shelf.frequency.value = 400;
        this.shelf.gain.value = 0;

        // Trockenpfad bleibt immer durch; Hallpfad wird über wet ein-/ausgeblendet.
        this.input.connect(this.dry); this.dry.connect(this.output);
        this.input.connect(this.preDelay);
        this.preDelay.connect(this.convA); this.convA.connect(this.gA); this.gA.connect(this.mixSum);
        this.preDelay.connect(this.convB); this.convB.connect(this.gB); this.gB.connect(this.mixSum);
        this.mixSum.connect(this.shelf);
        this.shelf.connect(this.wet); this.wet.connect(this.output);

        this.active = false;
        this.mix = 0.35;       // Dry/Wet
        this.wetVol = 1;       // Wet-Pegel (Boost)
        this.wet.gain.value = 0;
        // Crossfade-Koaleszenz (s. rebuild): eine laufende Überblendung wird NIE
        // vorzeitig durch neue Reglerdaten ersetzt. Kommt während des Fades neuer
        // Input, wird nur ein „nachrechnen"-Wunsch gemerkt und nach Fade-Ende einmal
        // mit den JÜNGSTEN Werten ausgeführt → keine Aussetzer/Thrashing beim Ziehen.
        this._fadeMs = 80;     // Überblendzeit alt→neu (einstellbar)
        this._fading = false;  // läuft gerade eine Überblendung?
        this._pending = false; // kam währenddessen neuer Input? → danach neu rechnen
        this._fadeTimer = null;
        this._params = { density: 0.85, len: 0.3, attack: 0, release: 0.4, releaseShape: 0, seed: 1 };
        // Erste IR direkt in Slot A (ohne Crossfade); B startet stumm.
        this._cur = 'A';
        this._activeBuffer = this._renderIR();
        this.convA.buffer = this._activeBuffer;
        this.gA.gain.value = 1; this.gB.gain.value = 0;
        this._applyGains();
        if (this.onRebuild) this.onRebuild();
    }

    /** Hallpfad ein-/ausschleifen (Bypass = nur dry). */
    setActive(on) {
        this.active = !!on;
        this._applyGains();
    }

    /** Dry/Wet + Wet-Pegel setzen. */
    setMix(mix) { this.mix = Math.max(0, Math.min(1, mix)); this._applyGains(); }
    setWetVol(v) { this.wetVol = Math.max(0, v); this._applyGains(); }

    /** Gain-Stufen aus aktiv/mix/wetVol berechnen (gleichmäßiger Crossfade). */
    _applyGains() {
        const now = this.ctx.currentTime;
        const dry = this.active ? (1 - this.mix) : 1;
        const wet = this.active ? (this.mix * this.wetVol) : 0;
        this.dry.gain.setTargetAtTime(dry, now, 0.02);
        this.wet.gain.setTargetAtTime(wet, now, 0.02);
    }

    /** HighShelf: Grenzfrequenz + Anhebung/Absenkung (dB, 0 = neutral). */
    setShelf(hz, gainDb) {
        const now = this.ctx.currentTime;
        this.shelf.frequency.setTargetAtTime(Math.max(20, hz), now, 0.01);
        this.shelf.gain.setTargetAtTime(gainDb, now, 0.01);
    }

    /** Pre-Delay der Reflections in Millisekunden. */
    setPreDelay(ms) {
        this.preDelay.delayTime.setTargetAtTime(Math.max(0, ms) / 1000, this.ctx.currentTime, 0.01);
    }

    /** Überblendzeit alt→neu in Millisekunden (0 = fast sofort, aber knackfrei). */
    setXfade(ms) { this._fadeMs = Math.max(0, +ms || 0); }

    /** Parameter setzen und (koalesziert) einen IR-Neuaufbau anfordern. */
    set(params) {
        Object.assign(this._params, params);
        this._requestRebuild();
    }

    /**
     * Rebuild-Anforderung nach dem @dpa-Modell:
     *  - Die AKTIVE Instanz bleibt hörbar.
     *  - Läuft schon eine Überblendung, wird NICHT neu gestartet – wir merken uns
     *    nur „danach nochmal" (_pending). So kann kein hörbarer Slot mitten im Fade
     *    seinen Buffer verlieren (= die alte Ursache der Aussetzer beim Ziehen).
     *  - Erst wenn der Fade zu 100 % durch ist, wird – falls nötig – EINMAL mit den
     *    jüngsten Werten nachgerechnet.
     */
    _requestRebuild() {
        if (this._fading) { this._pending = true; return; }
        this._startFade();
    }

    /** Neue IR in den (stummen) inaktiven Slot rendern und linear einblenden. */
    _startFade() {
        const ir = this._renderIR();               // neue IR aus den aktuellen _params
        const now = this.ctx.currentTime;
        const dur = Math.max(0.005, this._fadeMs / 1000);
        // Inaktiver Slot = der mit Gain 0 (stumm, stabil) → dort neu befüllen; der
        // aktive Slot bleibt hörbar und geht erst am Fade-Ende auf 0.
        const toB = this._cur === 'A';             // aktiv A → wir blenden nach B
        const inConv = toB ? this.convB : this.convA;
        const inGain = toB ? this.gB : this.gA;
        const outGain = toB ? this.gA : this.gB;
        inConv.buffer = ir;
        inGain.gain.cancelScheduledValues(now);
        outGain.gain.cancelScheduledValues(now);
        inGain.gain.setValueAtTime(inGain.gain.value, now);
        outGain.gain.setValueAtTime(outGain.gain.value, now);
        inGain.gain.linearRampToValueAtTime(1, now + dur);
        outGain.gain.linearRampToValueAtTime(0, now + dur);
        this._cur = toB ? 'B' : 'A';
        this._activeBuffer = ir;
        this._fading = true;
        clearTimeout(this._fadeTimer);
        this._fadeTimer = setTimeout(() => this._fadeDone(), this._fadeMs + 20);
        if (this.onRebuild) this.onRebuild();
    }

    /** Fade fertig: alter Slot ist jetzt stumm & frei. Bei gemerktem Input neu rechnen. */
    _fadeDone() {
        this._fading = false;
        if (this._pending) { this._pending = false; this._startFade(); }
    }

    /** Synthetische, hart abreißende Impulsantwort erzeugen (seed-deterministisch). */
    _renderIR() {
        const { density, len, attack, release, releaseShape, seed } = this._params;
        const sr = this.ctx.sampleRate;
        const L = Math.max(1, Math.floor(Math.max(0.02, len) * sr));
        const ir = this.ctx.createBuffer(2, L, sr);
        const d = Math.max(0, Math.min(1, density));
        const aEnd = Math.max(0, Math.min(1, attack));       // Attack-Anteil am Anfang
        const fadeStart = 1 - Math.max(0, Math.min(1, release)); // Release-Anteil am Ende
        // Release-Kurve: 0 = linear (Potenz 1), 100 = „log" gefaked (Potenz 4 → schneller
        // Anfangsabfall, langer Schwanz). rG = (1 - x)^p, x = Fortschritt im Release-Fenster.
        const relPow = 1 + 3 * Math.max(0, Math.min(1, (releaseShape || 0) / 100));
        // Pro Kanal eigener, aber fester RNG-Strom (Seed + Kanal-Offset) → Stereo,
        // aber reproduzierbar: gleiche Parameter = exakt gleiche Wolke.
        for (let c = 0; c < 2; c++) {
            const rand = mulberry32((seed | 0) * 2654435761 + c * 40503);
            const buf = ir.getChannelData(c);
            for (let i = 0; i < L; i++) {
                const t = i / L;
                // Attack: linear 0→1 über [0, aEnd]. Release: 1→0 über [fadeStart, 1].
                const aG = t < aEnd ? (aEnd > 0 ? t / aEnd : 1) : 1;
                const rG = t >= fadeStart ? (release > 0 ? Math.pow(1 - (t - fadeStart) / release, relPow) : 1) : 1;
                const env = aG * rG;
                // Dichte = Wahrscheinlichkeit eines Reflexions-Taps (dünn ↔ voll).
                const tap = rand() < d ? (rand() * 2 - 1) : 0;
                buf[i] = tap * env;
            }
        }
        return ir;
    }

    /** Aktuelle Impulsantwort (für die Reflections-Anzeige). */
    getIR() {
        const b = this._activeBuffer;
        if (!b) return null;
        return { L: b.getChannelData(0), R: b.getChannelData(1), length: b.length, sampleRate: b.sampleRate };
    }
}
