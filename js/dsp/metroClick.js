/**
 * metroClick.js – Metronom-„Knack" durch einen Vadim-TPT-SVF gefiltert.
 *
 * Reine Mathematik (keine Web-Audio-Abhängigkeit) → headless testbar. Rendert
 * einen kurzen Klick in ein Float32Array, das die Metronome-Audioklasse in einen
 * AudioBuffer kopiert und pro Taktschlag als BufferSource abspielt.
 *
 * „Knack auf den Punkt": vor dem Haupt-Transienten sitzt eine kleine
 * Gegenauslenkung (Vorschwinger). Der zurückgegebene `peakIndex` markiert den
 * Haupt-Transienten – die Engine startet die Quelle um diese Zeit früher, damit
 * der Knack exakt auf dem Taktschlag landet.
 *
 * Filter-Morph mit EINEM Regler (Wunsch @dpa):
 *   morph 0.0 → voller Lowpass · 0.5 → Bypass (trocken) · 1.0 → voller Highpass.
 * Cutoff + Resonanz kommen aus dem Vadim-SVF (ladderCore: prewarp, resToDamping).
 */
import { prewarp, resToDamping } from './ladderCore.js';

/**
 * Reiner Knack (keine Tonhöhe/Decay-Regler mehr – Wunsch @dpa): ein kurzer
 * Transient mit Vorschwinger; die Klangfarbe/„Länge" ergibt sich allein aus dem
 * Filter (Cutoff + Resonanz).
 *
 * @param {object} o
 * @param {number} o.sampleRate
 * @param {number} [o.morph]  0=LP · 0.5=Bypass · 1=HP
 * @param {number} [o.cutoff] Filter-Cutoff (Hz)
 * @param {number} [o.reso]   Resonanz (Q)
 * @param {number} [o.knack]  0..1: Länge/Stärke des Vorschwingers (fest 1 im Instrument)
 * @returns {{ data: Float32Array, peakIndex: number }}
 */
export function renderMetroClick({ sampleRate, morph = 0.5, cutoff = 2000, reso = 2, knack = 1 } = {}) {
    const sr = sampleRate;
    // Vorschwinger-Länge: 0.5..3 ms je nach Knack.
    const preSamples = Math.max(1, Math.round((0.5 + knack * 2.5) * sr / 1000));
    // Tail-Länge mit der Resonanz mitwachsen lassen: hohe Reso klingt lange nach –
    // ein fester 150-ms-Tail schnitt sie hart ab („Unterbrechung"). Jetzt bis ~1.5 s.
    const tailSec = Math.min(1.5, 0.12 + reso * 0.06);
    const tailSamples = Math.round(tailSec * sr);
    const N = preSamples + tailSamples;

    const raw = new Float32Array(N);
    // Gegenauslenkung: linear von 0 auf −0.5·knack, direkt vor dem Transienten.
    for (let i = 0; i < preSamples; i++) raw[i] = -0.5 * knack * (i / preSamples);
    // Kurzer, breitbandiger Knack (feste ~1.5 ms) – ohne Tonhöhe. Der Filter formt daraus
    // je nach Morph/Cutoff/Reso einen Tick (HP) oder dumpfen Schlag (LP).
    const tickTau = 0.0015;
    for (let i = preSamples; i < N; i++) raw[i] += Math.exp(-(i - preSamples) / (tickTau * sr));

    // Vadim-TPT-SVF (2-Pol): LP-/HP-Abgriff, Wet/Dry per Morph gemischt.
    const g = prewarp(cutoff, sr);
    const R = resToDamping(reso);
    const denom = 1 + 2 * R * g + g * g;
    const useHP = morph > 0.5;
    const wetMix = Math.min(1, Math.abs(morph - 0.5) / 0.5); // 0 in der Mitte → Bypass
    let s1 = 0, s2 = 0;

    const out = new Float32Array(N);
    // Sanftes Fade-Out über die letzten ~12 ms → kein harter Abriss der nachklingenden
    // Resonanz am Buffer-Ende (der wie eine „Unterbrechung" klang).
    const fadeSamples = Math.min(N, Math.round(0.012 * sr));
    for (let i = 0; i < N; i++) {
        const x = raw[i];
        const hp = (x - (2 * R + g) * s1 - s2) / denom;
        const bp = g * hp + s1; s1 = g * hp + bp;
        const lp = g * bp + s2; s2 = g * bp + lp;
        const wet = useHP ? hp : lp;
        let y = x * (1 - wetMix) + wet * wetMix;
        const tailLeft = N - i;
        if (tailLeft < fadeSamples) y *= tailLeft / fadeSamples;
        out[i] = y;
    }
    return { data: out, peakIndex: preSamples };
}
