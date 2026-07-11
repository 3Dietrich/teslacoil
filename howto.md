# Teslacoil – Kurzanleitung (Start)

Getakteter Puls-Synth im Browser. ES-Module → **muss über einen lokalen Webserver** laufen (nicht per Doppelklick / `file://`).

## Starten

Im Ordner `KI_html/teslacoil/`:

```bash
cd ~/Music/KI_html/teslacoil && python3 -m http.server 8000
```

Dann im Browser öffnen: <http://localhost:8000/>

Alles in einem Befehl (Server im Hintergrund + Browser öffnet automatisch):

```bash
cd ~/Music/KI_html/teslacoil && python3 -m http.server 8000 & sleep 1 && open http://localhost:8000/
```

Server später beenden: `kill %1` (oder Terminal schließen).

Alternativen: `npx serve` · VS Code „Live Server".

## Bedienen

- **Leertaste** = Start/Stop (Audio-Kontext startet beim ersten Klick/Start).
- **Snapshot** (oben, Icons): `↺` laden · `＋` speichern · `⤓` exportieren.
- **Optik** (Layout, oben): Gruppen-Position/Farben/Klapp-Zustand getrennt vom Sound speichern & laden.
- **Regler**: ziehen (hoch/runter) · Doppelklick = Wert eintippen · `⚙` am Regler = Range/Kurve.
- **Gruppen**: Titel ziehen = umsortieren · `▾` = ein-/ausklappen · `⚙` = Name/Farbe.

## Skala & Transponieren

- **Keyboard** (Gruppe *Skaler*): Taste anklicken = Ton an/aus.
- **Frequenzanzeige darüber anklicken** → Transponier-Modus: der Anker (zunächst **C**) leuchtet orange. Klick auf z. B. **F** verschiebt die ganze Skala auf der Frequenzachse dorthin (Muster bleibt). Nochmal auf die Anzeige klicken = zurück zur normalen Ansicht.
- **×ganze** (Master-Zeile): Frequenz-/Tonhöhen-Anzeigen als ganzzahliges Vielfaches der Base-Frq.

## Signalweg

Osz → Filter → Distortion → Gate-Reverb → Master.

- **Filter / Gate Reverb**: Haken **„aktiv"** = Bypass ein/aus.
- **Gate Reverb**: `Attack`/`Release` formen die Reflections, `LoShelf`+`Boost` (neutral bei 0 dB) und `Pre-Delay` für den Klangcharakter; Reflections-Anzeige unten.

## Tests

```bash
node test/logic.test.mjs
```
