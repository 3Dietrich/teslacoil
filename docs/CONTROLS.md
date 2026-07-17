# Die Control-Sorten von Teslacoil

> @dpa 20260716_132014: „eine Liste der Controls wäre in docs vielleicht hilfreich?"
>
> Diese Liste beschreibt die **Sorten** von Bedienelementen, nicht die einzelnen Regler –
> was welcher Regler tut, steht in der [Anleitung](../anleitung.md). Hier geht es darum,
> woraus die Oberfläche gebaut ist: Wer ein neues Control einbaut, findet hier, in welche
> Fabrik es gehört und was es dadurch geschenkt bekommt.

## Was alle Controls gemeinsam haben

Jedes Control – egal welcher Sorte – kann dasselbe:

| | |
|---|---|
| **Rechtsklick** | öffnet seine Einstellungen. Das ist die eine Regel, die man wissen muss; ⚙-Icons gibt es nirgends. |
| **Klick** | wählt es aus (dezent markiert: leichte Färbung + feiner Rahmen = der „Selektionsrahmen"). |
| **Pfeiltasten** | bedienen das ausgewählte Control. |
| **Tab** | geht im Kreis durch alle sichtbaren Controls. |
| **e-Mode** (Taste `e`) | frei verschiebbar, per Klick/Gummiband/Tab auswählbar. Dort wird **nichts** bedient. |
| **Optik** | Beschriftung, Farben und Maße liegen in der Optik-Ebene (`ctrlStyles` bzw. `knobMeta`) – sie überleben einen Snapshot-Recall unverändert. |

## Die Sorten

Jede Sorte hat ein Präfix in `data-ctrl` – das ist der Name, unter dem sie im DOM, in
`ctrlPos`/`ctrlStyles` und in den Tests auftaucht. **Ein Selektor ohne Präfix trifft nie**
(`[data-ctrl='distMix']` findet nichts, `[data-ctrl='k:distMix']` schon).

| Präfix | Sorte | Definiert in `js/app.js` | Einstellungen |
|---|---|---|---|
| `k:` | **Knob / Fader** – ein Zahlenwert | `KNOBS` | [KnobMetaEditor](../js/ui/KnobMetaEditor.js): Min/Max/Step/Dez., Kurve+Skew, **Default**, Einheit, Label-Position, Gestalt (Knob / Fader waagerecht / senkrecht) + Ansicht bzw. Länge, BG, Farbe |
| `s:` | **Menü-Schalter** – eine Auswahl aus festen Optionen | `SELECTS` | Label (+ an/aus), BG/Text-Farbe, Schriftgröße, Länge |
| `t:` | **Schalter** – an/aus | `TOGGLES` | Label, Label-Position |
| `x:` | **Schrift-Eingabe** – freier Text (`lines > 0` = mehrzeilig, mit Zipfel) | `TEXTS` | wie Menü-Schalter, dazu Höhe |
| `n:` | **Notiz** – reiner Text, trägt keinen Wert (sein Inhalt **ist** sein Label) | `NOTES` | Label, Textgröße, Breite, Textfarbe |
| `b:` | **Button** – löst eine Aktion aus | `BUTTONS` | Label, Label-Position (inkl. Mitte = Default), VG/BG, Breite/Höhe |
| `u:` | **Eigenbau** – alles, was kein generisches Feld ist (siehe unten) | einzeln | je nach Typ |

### Die `u:`-Eigenbauten

Sie werden nicht aus einer Fabrik gebaut, hängen aber über `registerCtrlStyle()` am
gleichen Settings-System:

| Kennung | Was | Typ der Einstellungen |
|---|---|---|
| `u:keyboard` | das 12-Ton-Brett des Skalers ([Keyboard.js](../js/ui/Keyboard.js)) – jede Taste ein Schalter in der Maske | `keyboard` |
| `u:baseKeys` | das Brett der Base-Frq ([BaseKeyboard.js](../js/ui/BaseKeyboard.js)) – immer genau **ein** Ton; bei Quelle ≠ `Ton` reine Anzeige | `keyboard` |
| `u:baseRead` | Anzeige „BaseFrq: G-4 · 1.55 Hz" | `readout` |
| `u:baseSpeed` | Anzeige „BpM · Hz · P" (nur im Freq-Modus) | `readout` |
| `u:rate` | Anzeige „×… Base" (Skaler-Rate als Vielfaches) | `readout` |
| `u:scale`, `u:p2` | die Speicher-Menüs von Skala und P2 | – |
| `sat` | das Längen-Cluster mit seinen Satelliten (bewegt sich als eine Einheit) | – |

**Keyboard** (kurz **KB**): Breite/Höhe in seinen Einstellungen meinen **EINE Taste**,
nicht das Brett – sonst werden die 12 Tasten krumm. Dazu kommt der Abstand zwischen den
Tasten (0–10 px). Beide Bretter teilen sich Optik und Einstellungen.

**Readouts** tragen laufend gesetzten Text, deshalb haben sie nur Optik ohne Struktur
(Textgröße/-farbe, Breite) – ein Label würde bei jedem Update wieder überschrieben.

## Speicher-Menüs (PickMenu)

Snapshot, Skala, P2, Combo, Gruppen-Snapshot und die Regler-Farben benutzen alle dasselbe
Widget ([PickMenu.js](../js/ui/PickMenu.js)) und werden dadurch gleich bedient: der
geladene Eintrag steht auf dem Knopf und ist in der Liste markiert (die beim Öffnen zu ihm
scrollt), ein Klick lädt ihn – auch der Klick auf den bereits geladenen. ✎/🏷/🗑 hängen an
ihrer Zeile, ＋ Neu (und beim Snapshot Export/Import) in der Fußzeile.

**Umbenennen** (🏷, `cfg.onRename`): den neuen Namen fragt das Menü selbst ab und reicht
ihn durch; der Aufrufer gibt eine Fehlermeldung zurück ('' = ging), die das Menü zeigt.
Die Namensregel steht EINMAL in `PresetManager.renameIn` (leer/vergeben → Absage, denn der
Name ist der Schlüssel dieser Listen) – der Aufrufer legt nur das Schreiben und das
**Nachziehen seines gemerkten Namens** darüber (`snapSel`, `scaleSel`, `p2Sel`,
`groupSnapSel`, `groupComboSel`, `knobColorSel`). Ohne dieses Nachziehen zeigt der Knopf
nach dem Umbenennen ins Leere („— kein Snapshot —"), obwohl derselbe Eintrag geladen ist.
Wächter: `test/rename.py`.

## Ein neues Control einbauen

1. **Parameter in [State.js](../js/core/State.js) anlegen** (Default!). Ohne ihn gibt es
   keinen Recall und keinen sinnvollen Default-Wert für den Doppelklick.
2. **In die passende Fabrik eintragen** (`KNOBS`/`SELECTS`/`TOGGLES`/`TEXTS`/`NOTES`/`BUTTONS`)
   und der Gruppe in `GROUPS` zuordnen. Damit ist es automatisch bidirektional gebunden,
   verschiebbar, benennbar und stylbar.
3. **Ist es rein optisch?** Dann MUSS sein State-Key in `PresetManager.LAYOUT_KEYS` –
   sonst landet er im Sound-Snapshot.
4. **Engine anschließen**: in `TeslaEngine._onStateChange` auf den Key reagieren.
