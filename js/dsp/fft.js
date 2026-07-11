/**
 * fft.js – Kompakte iterative Radix-2-FFT (in-place), reine Mathematik.
 *
 * Wird beim „Re-Baking" der phasenverzerrten Oszillator-Welle gebraucht
 * (pulseWave.js): Zeitsignal → Spektrum → PeriodicWave-Koeffizienten.
 * Headless testbar.
 */

/**
 * In-place FFT. Länge muss eine Zweierpotenz sein.
 * @param {Float64Array} re – Realteil (wird überschrieben)
 * @param {Float64Array} im – Imaginärteil (wird überschrieben)
 * @param {number} [sign=-1] – -1 = Vorwärts-DFT, +1 = inverse (ohne 1/N-Skalierung)
 */
export function fft(re, im, sign = -1) {
    const n = re.length;
    if ((n & (n - 1)) !== 0) throw new Error('FFT-Länge muss Zweierpotenz sein');

    // Bit-Reversal-Permutation
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            const tr = re[i]; re[i] = re[j]; re[j] = tr;
            const ti = im[i]; im[i] = im[j]; im[j] = ti;
        }
    }

    // Danielson-Lanczos
    for (let len = 2; len <= n; len <<= 1) {
        const ang = sign * 2 * Math.PI / len;
        const wpr = Math.cos(ang), wpi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let wr = 1, wi = 0;
            for (let k = 0; k < len / 2; k++) {
                const a = i + k, b = i + k + len / 2;
                const xr = re[b] * wr - im[b] * wi;
                const xi = re[b] * wi + im[b] * wr;
                re[b] = re[a] - xr; im[b] = im[a] - xi;
                re[a] += xr; im[a] += xi;
                const nwr = wr * wpr - wi * wpi;
                wi = wr * wpi + wi * wpr; wr = nwr;
            }
        }
    }
}
