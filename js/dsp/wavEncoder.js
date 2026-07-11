/**
 * wavEncoder.js – Reiner Float32→PCM16-WAV-Encoder/Decoder (keine Web-Audio-
 * Abhängigkeit → headless testbar). Für das Debug-Werkzeug (C7): eine
 * Mono-Aufnahme (Float32Array, −1..1) wird zu WAV-Bytes gepackt, die die KI
 * per Node (`decodeWav`) direkt wieder einlesen/analysieren kann.
 */

/** Mono-Samples (Float32, −1..1) + Samplerate → WAV-Datei-Bytes (16-bit PCM). */
export function encodeWav(samples, sampleRate) {
    const n = samples.length;
    const buf = new ArrayBuffer(44 + n * 2);
    const view = new DataView(buf);
    const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + n * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);            // fmt-Chunk-Größe
    view.setUint16(20, 1, true);             // PCM
    view.setUint16(22, 1, true);             // 1 Kanal (mono)
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte-Rate (mono · 16-bit)
    view.setUint16(32, 2, true);             // Block-Align
    view.setUint16(34, 16, true);            // Bits/Sample
    writeStr(36, 'data');
    view.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(44 + i * 2, Math.round(s * (s < 0 ? 0x8000 : 0x7fff)), true);
    }
    return new Uint8Array(buf);
}

/** WAV-Bytes zurück zu { sampleRate, samples(Float32) } – für Tests/Analyse. */
export function decodeWav(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sampleRate = view.getUint32(24, true);
    const dataSize = view.getUint32(40, true);
    const n = dataSize / 2;
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) samples[i] = view.getInt16(44 + i * 2, true) / 0x8000;
    return { sampleRate, samples };
}
