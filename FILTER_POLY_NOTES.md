# Filter: Polyphonie & mono „smooth LP" – Entscheidungsvorlage

> Erstellt 20260711_031645 (Opus, Nacht-Session). @dpa-Frage aus [dd.md](dd.md):
> „Den Filter.. geht der auch polyphon? Mit Umschalter? … Bei Monophon hätte ich gern
> einen simplen smooth LP für die KeyTrack updates. bei polyphon brauchts den ja nicht."
>
> **Bewusst NICHT gebaut** – das ist eine Architektur- + Klang-Entscheidung, die dein
> Ohr/OK braucht (Lehre aus dem Filter-Abend: kein blindes Bauen von Audio-Struktur).

## Ist-Zustand
Der Filter ([LadderFilter.js](js/audio/LadderFilter.js)) sitzt **global im Bus**:
`Voices → LadderFilter → Distortion → Reverb → Master`. Also **ein** Filter für ALLE
Stimmen = **monophoner Filter**. Keytrack setzt den Basis-Cutoff pro Note (Sprung,
`setCutoffAt`), die Env sitzt als Multiplikator (`cutoffEnv`) drauf.

## Option A – Mono-Filter behalten + „smooth LP" für Keytrack (klein, sicher)
Nur die **Cutoff-Sprünge glätten**: `setCutoffAt` von hartem `setValueAtTime` auf
`setTargetAtTime(…, glide)` umstellen → der Basis-Cutoff *gleitet* zwischen den Noten
(Portamento-Filter). Env-Multiplikator bleibt unberührt (eigener Param).
- **Offen (dein Geschmack):** Glide-Zeit fest (~10–20 ms) ODER eigener „Glide"-Knopf?
- Aufwand klein, Risiko klein. **Sag „Glide ~15 ms" o.ä. und ich bau's in einem Schritt.**

## Option B – Polyphoner Filter (per Voice) – großer Umbau, „einiges beachten"
Der Filter wandert aus dem Bus **in jede Voice** ([SquareOsc.js](js/audio/SquareOsc.js)):
jede Stimme kriegt ihren eigenen Filter, der ihrer eigenen Note folgt.
Zu beachten / zu entscheiden:
1. **Worklet pro Voice** (CPU!) oder ein günstigerer Per-Voice-Filter (SVF ohne Worklet).
   Bei polyMax=8 + Overlap = bis 8+ Filter gleichzeitig. Perf-Wächter im Auge behalten.
2. **Keytrack/Env pro Voice** statt global → kein Glätten nötig (jede Note startet frisch).
3. **Resonanz/Selbstoszillation** pro Voice: teurer, aber „echt polyphon".
4. **Umschalter Mono⇄Poly** (UI-Toggle): Mono = jetziger Bus-Filter (+ Glide aus A),
   Poly = per-Voice. Beide Pfade müssen sauber koexistieren.
5. Distortion/Reverb bleiben global hinter der Voice-Summe.

## Empfehlung
Erst **Option A** (klein, sofort hörbar), dann in Ruhe entscheiden, ob **Option B**
den CPU-/Komplexitäts-Aufwand wert ist. Beides in getrennten Schritten, je mit
Hördurchgang – nicht batchen.
