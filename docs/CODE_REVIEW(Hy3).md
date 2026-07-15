# Code-Review – Tesla-Coil (modularer Web-Synth)

> Review durch GitHub Copilot (Modell: Tencent Hy3, free), 2026-07-15.
> Fokus: am vorhandenen Code (hauptsächlich mit Claude Opus erstellt) beanstandbare
> Stellen – von echten Bugs bis Architektur/Stil. Reine Logik/DSP ist headless
> getestet (`node test/logic.test.mjs`), Audio-Module nicht.

---

## Fazit

Solider, durchdachter Code mit klarer Architektur:
- **State = Single Source of Truth** (UI schreibt, Engine liest live).
- **Headless-testbare DSP-Logik** (`js/pitch/`, `js/dsp/`, `js/core/`).
- **Saubere Engine-Verdrahtung** (`TeslaEngine` baut die Kette, reagiert auf State-Änderungen).

Trotzdem gibt es Beanstandbares – von kritischen Bugs bis totem Code.

---

## 🔴 Echte Probleme

### 1. ~~`quantizeToScale` prüft `scale.hasActive`, das nirgends definiert ist~~ — ZURÜCKGEZOGEN
**Korrektur (2026-07-15):** `ScaleModel` hat den Getter `get hasActive() { return
this.mask.some(Boolean); }` (in `js/pitch/ScaleModel.js`). `scale.hasActive` existiert
also – der vermutete Bug existiert **nicht**. Fehlalarm beim ersten Scan.

### 2. ~~`baseFreq` wird in `TeslaEngine` nie zugewiesen~~ — ZURÜCKGEZOGEN
**Korrektur (2026-07-15):** `baseFreq` ist ein **Getter** (Zeile ~485 in
`js/engine/TeslaEngine.js`), der live aus dem State berechnet wird. Keine Zuweisung
nötig, `this.baseFreq` funktioniert korrekt. Fehlalarm beim ersten Scan.

### 3. ~~`Clock`-Guard bei hohem Tempo zu knapp~~ — ZURÜCKGEZOGEN
**Korrektur (2026-07-15):** Mit dem Debug-Bundle `teslacoil_debug_tempo_240_1_16_`
(`bpm=240, division=1/16`, Intervall ≈ 0,0156 s) getestet → TXT-Log: „keine
Aussetzer [OK]". Der vermutete Guard-Griff (`guard++ < 256` in `js/core/Clock.js`)
tritt in der Praxis nicht auf – der Lookahead-Puffer fängt das ab. Fehlalarm.

---

## 🟡 Architektur / Wartbarkeit

### 4. Duplizierte DSP-Logik (`ladderCore.js` ↔ `ladder-worklet.js`)
Im Code selbst dokumentiert: „bei Änderungen BEIDE synchron halten". Fragil – ein
vergessener Sync ist ein stummer Klang-Bug. Besser:
- `ladderCore.js` als reinen Rechen-Kern exportieren,
- im Worklet per Blob-URL mit `import` nachladen (Worklets *können* ES-Module, wenn
  man `addModule` einen Blob-URL aus einem `import`-fähigen Modul füttert),
- oder die `_tick`-Funktion in eine shared Datei auslagern, die beide per `import` nutzen.

### 5. `_onStateChange` ist ein riesiger `if`-Wald
~60 Zeilen verschachtelte Bedingungen in `js/engine/TeslaEngine.js`. Schwer lesbar,
fehleranfällig beim Erweitern. Ein `Map<key, handler>` oder ein kleines
Reducer-Pattern wäre wartbarer.

### 6. `State.js` voller DEPRECATED-Keys
`baseOct`, `tempoOct`, `baseOctave`, `metroDivision`, `metroCutoffOct`, `metroRoute`
(letzteres ist noch in `SELECTS`!) hängen als toter Ballast im Default-Objekt. Die
Migration läuft ewig mit. Sauberer: ein `MIGRATIONS`-Array mit Versionierung statt
„Keys für immer behalten".

### 7. `metroRoute` ist in `SELECTS` definiert, aber tot
`CLAUDE.md`: „Route-Select entfällt" – die Engine nutzt `fxOrder` statt `metroRoute`.
Trotzdem ist `metroRoute` noch in `SELECTS` (`app.js`) und `DEFAULTS` (`State.js`)
→ verwirrender toter Code.

---

## 🟢 Stil / Kleinkram

### 8. Magische `1e-6` in `metroClock`
`js/engine/TeslaEngine.js`: `60 / Math.max(1e-6, state.get('bpm'))`. `bpm` hat
Slider-Min 40, also unkritisch – trotzdem eine magische Zahl ohne Erklärung.

### 9. `SquareOsc._wave` Cache wird bei >256 Einträgen komplett geleert
`js/audio/SquareOsc.js`: `if (this._waveCache.size > 256) this._waveCache.clear();`
→ bei Bewegung an mehreren Reglern ständiges Re-Baken. Besser: LRU oder nach
`engine/param` gruppieren.

---

## Was gut ist (Gegenbuch)

- **Lookahead-Scheduler** mit `try/catch` im Trigger (kein Stall) – vorbildlich.
- **`foldToBand`** statt ±Oktave – elegante Idee für Register-Wahl.
- **Backup-System** mit gestaffelter Aufbewahrung (`js/data/Backup.js`) – robust
  gegen Datenverlust (war nach dem „Werkeinstellung zurücksetzen"-Desaster nötig).
- **`cancelAndHoldAtTime`-Guards** überall – Anti-Knack-Disziplin ist konsequent.

---

## Prioritäten

1. Punkt 4 (DSP-Duplizierung) – mittelfristig für Wartbarkeit.
2. Punkt 5 (`_onStateChange` als `if`-Wald) – bei Gelegenheit refactoren.
3. Punkt 6 + 7 (toter Code) – aufräumen bei nächster Gelegenheit.
4. Punkt 8 + 9 (magische Zahl, Cache-Clear) – Stil, bei Bedarf.
