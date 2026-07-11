import { fft } from '../dsp/fft.js';

/**
 * pulseWave.js – Bandlimitierte Pulswelle als Fourier-Koeffizienten.
 *
 * Reine Mathematik (keine Web-Audio-Abhängigkeit) → headless testbar.
 * Die zurückgegebenen {real, imag}-Arrays werden in SquareOsc an
 * `AudioContext.createPeriodicWave(real, imag)` übergeben.
 *
 * Pulswelle p(t) = +1 für 0≤t<duty, sonst -1 (DC-frei, n ab 1).
 *   a_n =  2·sin(2πn·duty) / (π·n)          (cos-Anteile)
 *   b_n =  2·(1-cos(2πn·duty)) / (π·n)      (sin-Anteile)
 * Start-Phase φ rotiert die Welle, sodass der Punkt φ bei t=0 liegt.
 */

/**
 * @param {number} duty   – Tastverhältnis 0..1 (Pulsweite)
 * @param {number} phase  – Start-Phase 0..1
 * @param {number} N       – Anzahl Harmonische (>=1)
 * @returns {{real: Float32Array, imag: Float32Array}}
 */
export function pulseCoefficients(duty, phase = 0, N = 64) {
    const d = Math.min(0.999, Math.max(0.001, duty));
    const len = Math.max(2, N + 1);
    const real = new Float32Array(len);
    const imag = new Float32Array(len);
    real[0] = 0; // DC entfernt
    imag[0] = 0;

    const twoPi = 2 * Math.PI;
    for (let n = 1; n < len; n++) {
        const a = (2 * Math.sin(twoPi * n * d)) / (Math.PI * n);
        const b = (2 * (1 - Math.cos(twoPi * n * d))) / (Math.PI * n);
        // Phasendrehung um φ: [a' ; b'] = R(2πnφ) · [a ; b]
        const ang = twoPi * n * phase;
        const cs = Math.cos(ang);
        const sn = Math.sin(ang);
        real[n] = a * cs - b * sn;
        imag[n] = a * sn + b * cs;
    }
    return { real, imag };
}

/**
 * Phasenverbiegung des Lesekopfs: y = x^k (Casio-CZ-artige Phase-Distortion).
 * Lineare Phase x∈[0,1) → verbogene Phase y∈[0,1). pw ist der „PW"-Regler:
 *   pw = 0.5 → k = 1  (neutral, Diagonale)
 *   pw < 0.5 → k > 1  (untere Kurve, „<1": Werte unter der Diagonale)
 *   pw > 0.5 → k < 1  (obere Kurve, „>1": Werte über der Diagonale)
 * Die Endpunkte 0 und 1 bleiben fix → die Welle bleibt periodisch.
 */
export function phaseWarp(x, pw) {
    const MAX_BEND = 6;                                   // Krümmung an den Extremen
    const k = Math.pow(MAX_BEND, (0.5 - pw) * 2);
    return Math.pow(x, k);
}

/** Grundwelle, normiert auf ±1, über einen Zyklus t∈[0,1). */
function baseSample(waveform, t) {
    switch (waveform) {
        case 'saw': return 2 * t - 1;
        case 'tri': return 1 - 4 * Math.abs(t - 0.5);
        case 'sine':
        default: return Math.sin(2 * Math.PI * t);
    }
}

/**
 * Phasenverzerrte Welle → PeriodicWave-Koeffizienten (Re-Baking via FFT).
 * Der Lesekopf wird über {@link phaseWarp} verbogen, die Grundwelle an den
 * verbogenen Phasen abgetastet und ins Spektrum transformiert → die Wellenform
 * wird hörbar „verbogen". DC wird entfernt; auf N Harmonische bandlimitiert.
 *
 * @param {'saw'|'sine'|'tri'} waveform
 * @param {number} pw    – Phasenverbiegung 0..1 (0.5 = neutral)
 * @param {number} phase – Start-Phase 0..1
 * @param {number} N     – Anzahl Harmonische
 * @param {number} [M=2048] – Tabellengröße (Zweierpotenz)
 */
export function warpedCoefficients(waveform, pw, phase = 0, N = 64, M = 2048) {
    const re = new Float64Array(M);
    const im = new Float64Array(M);
    for (let i = 0; i < M; i++) {
        let ph = phaseWarp(i / M, pw) + phase;
        ph -= Math.floor(ph);
        re[i] = baseSample(waveform, ph);
    }
    fft(re, im, -1); // Vorwärts-DFT: X[n] = Σ s[i]·e^{-j2πni/M}
    const len = Math.max(2, Math.min(N + 1, M / 2));
    const real = new Float32Array(len);
    const imag = new Float32Array(len);
    // a_n = (2/M)·Re(X[n]) (cos), b_n = −(2/M)·Im(X[n]) (sin); DC = 0.
    for (let n = 1; n < len; n++) {
        real[n] = (2 / M) * re[n];
        imag[n] = -(2 / M) * im[n];
    }
    return { real, imag };
}

/**
 * Selbst-FM-rückkoppelnder Sinus (DX-/C15-artiger Feedback-Operator):
 *   y[i] = sin(2π·phase[i] + β·y[i−1])
 * Für FESTEN Feedback-Wert ist das eine statische periodische Welle → über ein
 * paar Zyklen einschwingen lassen, den letzten Zyklus per FFT ins Spektrum.
 * fb = 0 → reiner Sinus; fb → 1 → zunehmend sägezahn-artig.
 *
 * @param {number} fb    – Feedback 0..1
 * @param {number} phase – Start-Phase 0..1
 * @param {number} N     – Anzahl Harmonische
 * @param {number} [M=2048] – Tabellengröße (Zweierpotenz)
 */
export function fmCoefficients(fb, phase = 0, N = 64, M = 2048) {
    const beta = Math.max(0, fb) * Math.PI;     // Modulationsindex 0..π
    const re = new Float64Array(M);
    const im = new Float64Array(M);
    const twoPi = 2 * Math.PI;
    let y = 0;
    const WARMUP = 3;                            // Einschwingen → periodische Lösung
    for (let pass = 0; pass < WARMUP; pass++) {
        const record = pass === WARMUP - 1;
        for (let i = 0; i < M; i++) {
            y = Math.sin(twoPi * (i / M + phase) + beta * y);
            if (record) re[i] = y;
        }
    }
    fft(re, im, -1);
    const len = Math.max(2, Math.min(N + 1, M / 2));
    const real = new Float32Array(len);
    const imag = new Float32Array(len);
    for (let n = 1; n < len; n++) {
        real[n] = (2 / M) * re[n];
        imag[n] = -(2 / M) * im[n];
    }
    return { real, imag };
}

/**
 * Wellenform-Koeffizienten je OSC-Engine.
 * - 'Square-PW' : Pulswelle, `param` = PW (Tastverhältnis) – analytisch, beliebig N.
 * - 'Sine-FM'   : selbst-FM-Sinus, `param` = Feedback 0..1 (Sinus → Sägezahn).
 *
 * @param {'Square-PW'|'Sine-FM'} engine
 * @param {number} param  – Square-PW: Pulsweite ; Sine-FM: Feedback
 * @param {number} phase  – Start-Phase 0..1
 * @param {number} N      – Anzahl Harmonische
 * @returns {{real: Float32Array, imag: Float32Array}}
 */
export function oscCoefficients(engine, param, phase = 0, N = 64) {
    if (engine === 'Sine-FM') return fmCoefficients(param, phase, N);
    return pulseCoefficients(param, phase, N); // 'Square-PW' (Default)
}

/**
 * Sinnvolle Harmonischen-Anzahl für eine Frequenz, damit nichts über Nyquist
 * aliased. Bei tiefen Frequenzen begrenzt, bei hohen reduziert.
 * @param {number} freq
 * @param {number} sampleRate
 * @param {number} [cap=512]
 */
export function harmonicsForFreq(freq, sampleRate, cap = 512) {
    const nyq = sampleRate / 2;
    const n = Math.floor(nyq / Math.max(1, freq));
    return Math.min(cap, Math.max(1, n));
}
