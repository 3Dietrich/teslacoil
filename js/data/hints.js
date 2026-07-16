/**
 * hints.js – Die Auslieferungs-Hilfetexte aller Controls (@dpa 20260716_174111:
 * „Bitte erzeuge für alle (alle) Controls helphints … diese hints sollten (zumindest das
 * deutsche) editierbar sein.. was meinst Du wäre dafür gut? ein externes file..?").
 *
 * WARUM HIER UND NICHT IN EINER JSON-DATEI: Die Seite läuft statisch (GitHub Pages).
 * Eine nachgeladene Datei könnte @dpa nie ändern, ohne zu committen – sie wäre ein
 * Nur-Lese-Ding mit dem Aufwand eines Schreib-Dings. Deshalb die Aufteilung, die im Rest
 * des Synths ohnehin gilt:
 *
 *   • Diese Datei = die GRUNDEINSTELLUNG. Sie kommt mit dem Programm und ändert sich nie
 *     unter dem User weg. „Eine Grundeinstellung die man einmal (nach)lädt und dann
 *     entscheidet ob man es so behält oder ob man zurück will" (@dpa).
 *   • `state.hintText` = die EIGENEN Texte. Ein Override je Control-Kennung; was hier
 *     nicht drinsteht, kommt aus dieser Tabelle. Der Rückweg ist deshalb immer da:
 *     Override löschen = wieder Auslieferung.
 *   • Beides zusammen ist eine eigene Kategorie im Datei-Bereich (ex- UND importierbar),
 *     genau wie Skala, P2 und Snapshot.
 *
 * DE UND EN STEHEN HIER NEBENEINANDER – nicht in i18n.js. Der Grund ist der Preis der
 * i18n-Regel „der deutsche Text IST der Schlüssel": dort verliert ein umformulierter Satz
 * still seine Übersetzung. Ein Hilfetext ist aber genau das, was man umformuliert. Als
 * Paar {de, en} an einer Kennung hängt die Übersetzung am Control, nicht am Wortlaut –
 * @dpa kann den deutschen Text ändern, ohne dass das Englische wegbricht.
 *
 * Die Kennung ist die `data-ctrl`-Kennung des Controls (typ-präfixiert: k/s/t/u/x/n/b).
 */

/** @typedef {{de: string, en: string}} Hint */

/** @type {Record<string, Hint>} */
export const HINTS = {
    // ── Takt ──
    'k:bpm': {
        de: 'Grundtempo in BpM – der Takt, aus dem alle Trigger, Längen und Sequenzer-Schritte abgeleitet werden.',
        en: 'Base tempo in BPM – the clock every trigger, length and sequencer step is derived from.',
    },
    's:division': {
        de: 'Teilung des Taktes: wie oft pro Viertel getriggert wird (1/1 = ganze Note, 1/16 = sechzehntel).',
        en: 'Clock division: how often a trigger fires per quarter note (1/1 = whole note, 1/16 = sixteenth).',
    },

    // ── Gate (ohne UI – Keys leben weiter, s. GROUPS) ──
    't:gateEnabled': {
        de: 'Gate ein: lässt nur innerhalb des Gate-Fensters Trigger durch. Aus = Gate immer offen.',
        en: 'Gate on: only lets triggers through inside the gate window. Off = gate always open.',
    },
    'k:gateRate': {
        de: 'Wie oft das Gate pro Sekunde auf- und zugeht (Hz) – unabhängig vom Takt.',
        en: 'How often the gate opens and closes per second (Hz) – independent of the clock.',
    },
    'k:gateWidth': {
        de: 'Anteil der Gate-Periode, in dem das Gate offen ist (0.5 = halbe Zeit offen).',
        en: 'Share of the gate period during which the gate is open (0.5 = open half the time).',
    },

    // ── Metronom ──
    't:metroEnabled': {
        de: 'Metronom ein – ein eigener getakteter Klick. Wo er in die Kette einspeist, bestimmt seine Position in der Kettenansicht.',
        en: 'Metronome on – its own clocked click. Where it feeds into the chain is set by its position in the chain view.',
    },
    't:metroCutoffQuant': {
        de: 'Klick-Cutoff an die BaseFrq rasten: statt freier Hz wird der Cutoff ein Vielfaches der Grundfrequenz (der Klick wird tonal).',
        en: 'Snap the click cutoff to the base frequency: instead of free Hz the cutoff becomes a multiple of the base (the click turns tonal).',
    },
    'k:metroL': {
        de: 'Zähler des Klick-Verhältnisses: die Klickperiode ist (60/Tempo)·(l/m). l=1, m=1 ergibt Viertel.',
        en: 'Numerator of the click ratio: the click period is (60/tempo)·(l/m). l=1, m=1 gives quarter notes.',
    },
    'k:metroM': {
        de: 'Nenner des Klick-Verhältnisses – zusammen mit l ein freies Verhältnis zum Viertel (z.B. 3/4 = Triolengefühl).',
        en: 'Denominator of the click ratio – together with l a free ratio to the quarter note (e.g. 3/4 = triplet feel).',
    },
    'k:metroLevel': {
        de: 'Pegel des Klicks.',
        en: 'Level of the click.',
    },
    'k:metroMorph': {
        de: 'Filterform des Klicks: 0 = Tiefpass (dumpf), 0.5 = Bypass, 1 = Hochpass (schnalzend).',
        en: 'Filter shape of the click: 0 = lowpass (dull), 0.5 = bypass, 1 = highpass (snappy).',
    },
    'k:metroCutoff': {
        de: 'Grenzfrequenz des Klick-Filters (Hz) – bestimmt, wie hell der Klick sitzt.',
        en: 'Cutoff of the click filter (Hz) – sets how bright the click sits.',
    },
    'k:metroCutBand': {
        de: 'Statt fester Hz: das Frequenzband, in das der gerastete Cutoff gefaltet wird (zeigt „L–2L").',
        en: 'Instead of fixed Hz: the frequency band the snapped cutoff is folded into (shows “L–2L”).',
    },
    'k:metroReso': {
        de: 'Resonanz des Klick-Filters (Q) – hohe Werte lassen den Klick pfeifen/klingeln.',
        en: 'Resonance of the click filter (Q) – high values make the click ring or whistle.',
    },
    's:metroDivision': {
        de: 'Alte feste Teilung des Metronoms – ersetzt durch das freie Verhältnis l/m.',
        en: 'Old fixed metronome division – replaced by the free l/m ratio.',
    },
    's:metroRoute': {
        de: 'Wo das Metronom in die Kette einspeist – heute über seine Position in der Kettenansicht.',
        en: 'Where the metronome feeds into the chain – nowadays set by its position in the chain view.',
    },

    // ── Skaler (Tonhöhen-Quelle) ──
    's:pitchWave': {
        de: 'Form, mit der die Tonhöhe wandert: sine/triangle/saw laufen gleichmäßig, random springt (Seed daneben legt die Folge fest).',
        en: 'Shape the pitch travels along: sine/triangle/saw move evenly, random jumps (the seed beside it fixes the sequence).',
    },
    'k:pitchRandSeed': {
        de: 'Startzahl der Zufallsfolge: gleiche Zahl = immer dieselbe Tonfolge. Nur bei Wellenform „random“.',
        en: 'Seed of the random sequence: same number = same note sequence every time. Only for waveform “random”.',
    },
    'k:pitchRate': {
        de: 'Wie schnell die Tonhöhe durch ihr Fenster wandert (Hz) – die Geschwindigkeit der Melodie, nicht des Taktes.',
        en: 'How fast the pitch travels through its window (Hz) – the speed of the melody, not of the clock.',
    },
    'k:fromHz': {
        de: 'Untere Kante des Tonhöhen-Fensters als absolute Frequenz. Die Anzeige nennt Note und Hz.',
        en: 'Lower edge of the pitch window as an absolute frequency. The readout names the note and the Hz.',
    },
    'k:pitchRange': {
        de: 'Wie viele Halbtöne das Fenster über „Von“ hinaufreicht (12 = eine Oktave).',
        en: 'How many semitones the window reaches above “from” (12 = one octave).',
    },

    // ── Base-Frq ──
    's:baseSrc': {
        de: 'Woher die Grundfrequenz kommt: Freq = frei eingestellt · Tempo = aus dem Takt abgeleitet · Ton = über das Tastenbrett gewählt.',
        en: 'Where the base frequency comes from: Freq = set freely · Tempo = derived from the clock · Ton = picked on the keyboard.',
    },
    's:baseNote': {
        de: 'Tonklasse der Basis bei Quelle „Ton“ – heute über das Base-Tastenbrett.',
        en: 'Pitch class of the base for source “Ton” – nowadays via the base keyboard.',
    },
    'k:baseHz': {
        de: 'Grundfrequenz bei Quelle „Freq“ (Hz).',
        en: 'Base frequency for source “Freq” (Hz).',
    },
    'k:baseBand': {
        de: 'Register: die Grundfrequenz wird in dieses Hz-Band gefaltet (30 → 30–60 Hz). Gilt für JEDE Quelle. ↑/↓ verschiebt es oktavweise.',
        en: 'Register: the base frequency is folded into this Hz band (30 → 30–60 Hz). Applies to EVERY source. ↑/↓ shifts it by octaves.',
    },
    'k:harmonizeMix': {
        de: 'Zieht die Töne von rein temperiert (0) auf ganzzahlige Vielfache der Basis (1) – aus Akkorden wird Obertonreihe.',
        en: 'Pulls the notes from equal temperament (0) onto integer multiples of the base (1) – chords become a harmonic series.',
    },
    't:baseTestOn': {
        de: 'Test-Ton: ein trockener Sinus auf der klingenden Grundfrequenz, direkt am Master vorbei an der FX-Kette – zum Vergleichshören.',
        en: 'Test tone: a dry sine on the sounding base frequency, straight to the master past the FX chain – for reference listening.',
    },
    'k:baseTestLevel': {
        de: 'Pegel des Test-Tons.',
        en: 'Level of the test tone.',
    },
    't:baseToC': {
        de: 'Skala relativ zur Basis lesen (do-re-mi statt fester Tonnamen) – die Maske wandert mit der Grundfrequenz mit.',
        en: 'Read the scale relative to the base (do-re-mi instead of fixed note names) – the mask travels with the base frequency.',
    },
    't:intMultiples': {
        de: 'Anzeige: ganzzahlige Vielfache der Basis auf dem Tastenbrett hervorheben.',
        en: 'Display: highlight integer multiples of the base on the keyboard.',
    },

    // ── Audio-Oszillator ──
    's:oscEngine': {
        de: 'Klangerzeuger: Square-PW = bandlimitierte Pulswelle (Pulsweite über PW) · Sine-FM = Sinus mit Rückkopplung (über FM).',
        en: 'Sound engine: Square-PW = band-limited pulse wave (width via PW) · Sine-FM = sine with feedback (via FM).',
    },
    'k:duty': {
        de: 'Pulsweite: Anteil der Periode im oberen Zustand. 0.5 = Rechteck, kleine Werte = dünn und nasal. Nur bei Square-PW.',
        en: 'Pulse width: share of the period in the high state. 0.5 = square, small values = thin and nasal. Square-PW only.',
    },
    'k:fmFeedback': {
        de: 'Wie stark der Sinus sich selbst moduliert – von rein (0) bis rau (1). Nur bei Sine-FM.',
        en: 'How strongly the sine modulates itself – from pure (0) to gritty (1). Sine-FM only.',
    },
    'k:polyMax': {
        de: 'Wie viele Töne gleichzeitig klingen dürfen. Kleine Werte schneiden die vorherige Note ab, große lassen Fahnen stehen.',
        en: 'How many notes may sound at once. Low values cut off the previous note, high ones let tails ring on.',
    },

    // ── Filter ──
    't:filterEnabled': {
        de: 'Filter ein. Aus = das Signal läuft komplett am Filter vorbei (kein Restaufwand).',
        en: 'Filter on. Off = the signal bypasses the filter entirely (no residual cost).',
    },
    's:filterType': {
        de: 'Filtertyp: LP lässt Tiefen durch · HP die Höhen · BP ein Band · Ladder-org ist der Ur-SVF-Tiefpass (fest 4-polig, stabil).',
        en: 'Filter type: LP passes lows · HP passes highs · BP a band · Ladder-org is the original SVF lowpass (fixed 4-pole, stable).',
    },
    's:lpMode': {
        de: 'Polzahl = Flankensteilheit: 1p ist sanft (6 dB/Okt), 4p schneidet hart (24 dB/Okt).',
        en: 'Pole count = slope: 1p is gentle (6 dB/oct), 4p cuts hard (24 dB/oct).',
    },
    's:filterEnvTrig': {
        de: 'Was die Filter-Hüllkurve auslöst: off = keine · each = jeder Trigger fährt sie voll · seq = der Sequenzer bestimmt Schritt und Tiefe.',
        en: 'What triggers the filter envelope: off = nothing · each = every trigger runs it fully · seq = the sequencer sets step and depth.',
    },
    'k:lpCutoff': {
        de: 'Grenzfrequenz (Hz) – die Basis, auf die Keytrack und Hüllkurve multiplikativ wirken.',
        en: 'Cutoff frequency (Hz) – the base that key tracking and the envelope act on multiplicatively.',
    },
    'k:lpReso': {
        de: 'Resonanz (Q): hebt den Bereich um den Cutoff an. Hohe Werte pfeifen. Bei LP erst ab 2 Polen wirksam.',
        en: 'Resonance (Q): lifts the region around the cutoff. High values whistle. For LP only effective from 2 poles.',
    },
    'k:lpEnv': {
        de: 'Wie weit die Hüllkurve den Cutoff zieht – positiv öffnet, negativ schließt sie ihn.',
        en: 'How far the envelope pulls the cutoff – positive opens it, negative closes it.',
    },
    'k:lpAttack': {
        de: 'Anstiegszeit der Filter-Hüllkurve (s) – 0 heißt: sofort am Ziel.',
        en: 'Attack time of the filter envelope (s) – 0 means: instantly at the target.',
    },
    'k:lpDecay': {
        de: 'Abfallzeit der Filter-Hüllkurve (s). Sie läuft zwischen Triggern frei aus.',
        en: 'Decay time of the filter envelope (s). It runs out freely between triggers.',
    },
    'k:lpKeyTrack': {
        de: 'Wie stark der Cutoff der Tonhöhe folgt: 0 % steht fest, 100 % wandert er mit der Note.',
        en: 'How strongly the cutoff follows the pitch: 0 % stays put, 100 % it travels with the note.',
    },
    'k:lpGlide': {
        de: 'Wie träge der Cutoff einem Sprung folgt (s) – 0 springt hart, größere Werte fahren weich nach.',
        en: 'How slowly the cutoff follows a jump (s) – 0 snaps hard, larger values glide across.',
    },
    'k:filterSeqDynPct': {
        de: 'Dynamik der Filter-Steps: 0 % = alle gleich (100 %) · 100 % = wie eingestellt · 200 % = volle Spreizung. Ein Step auf 0 bleibt aus.',
        en: 'Dynamics of the filter steps: 0 % = all equal (100 %) · 100 % = as set · 200 % = full spread. A step at 0 stays off.',
    },

    // ── Distortion ──
    't:distEnabled': {
        de: 'Distortion ein. Aus = Shaper und Crossfade sind ganz aus der Kette, nicht nur auf 0.',
        en: 'Distortion on. Off = shaper and crossfade leave the chain entirely, not just drop to 0.',
    },
    's:distMode': {
        de: 'Kennlinie: Saturation rundet weich (tanh) · Hard Clip köpft hart · Foldback faltet Überschüsse zurück (metallisch).',
        en: 'Transfer curve: saturation rounds softly (tanh) · hard clip cuts flat · foldback folds excess back (metallic).',
    },
    'k:distDrive': {
        de: 'Wie weit das Signal in die Kennlinie gefahren wird – der eigentliche Verzerrungsgrad.',
        en: 'How far the signal is driven into the curve – the actual amount of distortion.',
    },
    'k:distOut': {
        de: 'Ausgangspegel hinter dem Shaper – gleicht den Pegelgewinn durch Drive wieder aus.',
        en: 'Output level after the shaper – compensates the level gained through drive.',
    },
    'k:distMix': {
        de: 'Blende zwischen trocken und verzerrt. Bei 1 klingt nur der Effekt, bei 0 nur das Original.',
        en: 'Crossfade between dry and distorted. At 1 only the effect sounds, at 0 only the original.',
    },
    'k:distDryDelay': {
        de: 'Versatz zwischen trockenem und verzerrtem Zweig in Samples: positiv verzögert dry, negativ wet. Hörbar nur dazwischen (Dry/Wet ≈ 0.5) – als Kammfilter, nicht als Echo.',
        en: 'Offset between the dry and distorted branch in samples: positive delays dry, negative delays wet. Only audible in between (dry/wet ≈ 0.5) – as comb filtering, not echo.',
    },

    // ── Envelope ──
    't:ampSeqEnabled': {
        de: 'Amp-Sequenzer ein: die Step-Höhen bestimmen, ob und wie laut ein Trigger klingt. Aus = jeder Trigger klingt voll.',
        en: 'Amp sequencer on: the step heights decide whether and how loudly a trigger sounds. Off = every trigger sounds fully.',
    },
    't:ampHold': {
        de: 'Hold: die Hüllkurve wird nicht neu angeschlagen, solange die Note hält – neue Tonhöhen werden angefahren statt neu gestartet.',
        en: 'Hold: the envelope is not retriggered while the note holds – new pitches are glided to instead of restarted.',
    },
    'k:attack': {
        de: 'Anstiegszeit der Lautstärke (s). 0 = senkrechter Einsatz (klickt hörbar), größere Werte schleifen ihn an.',
        en: 'Attack time of the level (s). 0 = vertical onset (clicks audibly), larger values ease it in.',
    },
    'k:ampDecay': {
        de: 'Release: wie lange der Ton NACH dem Ende der Länge ausklingt (s). Verkürzt die Länge nie.',
        en: 'Release: how long the note fades out AFTER the length ends (s). Never shortens the length.',
    },
    'k:ampHoldGlide': {
        de: 'Slide: wie lange der gehaltene Ton zur neuen Tonhöhe braucht (s). Nur bei Hold.',
        en: 'Slide: how long the held note takes to reach the new pitch (s). Hold only.',
    },
    'k:envPercent': {
        de: 'Länge des Tons als Anteil des Trigger-Abstands: 1 = bis zum nächsten Trigger, größer = überlappend, kleiner = staccato.',
        en: 'Note length as a share of the trigger spacing: 1 = up to the next trigger, larger = overlapping, smaller = staccato.',
    },
    'k:envPitchLo': {
        de: 'Wie stark die Länge am UNTEREN Ende des Tonhöhen-Fensters abweicht (100 % = unverändert).',
        en: 'How much the length deviates at the LOW end of the pitch window (100 % = unchanged).',
    },
    'k:envPitchHi': {
        de: 'Wie stark die Länge am OBEREN Ende des Tonhöhen-Fensters abweicht (100 % = unverändert).',
        en: 'How much the length deviates at the HIGH end of the pitch window (100 % = unchanged).',
    },
    'k:ampPitchAmt': {
        de: 'Dämpft hohe Töne: 0 % kein Einfluss, 100 % läuft die Lautstärke über das Tonhöhen-Fenster linear auf null.',
        en: 'Attenuates high notes: 0 % no effect, 100 % the level falls linearly to zero across the pitch window.',
    },
    'k:amp': {
        de: 'Grundlautstärke der Stimmen, vor der FX-Kette.',
        en: 'Base level of the voices, before the FX chain.',
    },
    'k:ampSeqDynPct': {
        de: 'Dynamik der Amp-Steps: 0 % = alle gleich (100 %) · 100 % = wie eingestellt · 200 % = volle Spreizung. Ein Step auf 0 bleibt aus.',
        en: 'Dynamics of the amp steps: 0 % = all equal (100 %) · 100 % = as set · 200 % = full spread. A step at 0 stays off.',
    },

    // ── Gate Reverb ──
    't:reverbEnabled': {
        de: 'Gate-Reverb ein. Aus = die Hallfahne wird nicht berechnet.',
        en: 'Gate reverb on. Off = the tail is not computed at all.',
    },
    'k:revMix': {
        de: 'Blende zwischen trocken und Hall.',
        en: 'Crossfade between dry and reverb.',
    },
    'k:revWet': {
        de: 'Pegel des Hallanteils – dreht laut, ohne die Wolke neu zu bauen.',
        en: 'Level of the reverb signal – turns it up without rebuilding the cloud.',
    },
    'k:revDensity': {
        de: 'Wie dicht die Reflexionen liegen: dünn = einzelne Echos hörbar, dicht = geschlossene Fahne.',
        en: 'How densely the reflections sit: sparse = single echoes audible, dense = a closed tail.',
    },
    'k:revLenPct': {
        de: 'Länge der Hallfahne als Vielfaches des Takt-Abstands – das „Gate“ am Gate-Reverb.',
        en: 'Length of the tail as a multiple of the clock spacing – the “gate” in gate reverb.',
    },
    'k:revAttack': {
        de: 'Wie die Fahne einsetzt: 0 = sofort da, größere Werte fahren sie auf (Rückwärts-Effekt).',
        en: 'How the tail sets in: 0 = there at once, larger values swell it in (reverse effect).',
    },
    'k:revRelease': {
        de: 'Wie die Fahne endet: 0 = hart abgeschnitten (typisch Gate), größere Werte lassen sie ausgehen.',
        en: 'How the tail ends: 0 = cut off hard (classic gate), larger values let it fade.',
    },
    'k:revReleaseShape': {
        de: 'Form des Ausklangs: 0 % linear, 100 % erst schneller Abfall, dann langer Schwanz.',
        en: 'Shape of the fade: 0 % linear, 100 % a fast initial drop with a long tail.',
    },
    'k:revShelfFreq': {
        de: 'Grenzfrequenz des Kuhschwanz-Filters auf dem Hall – ab hier greift „Boost“.',
        en: 'Corner frequency of the shelf filter on the reverb – “boost” takes effect from here.',
    },
    'k:revShelfGain': {
        de: 'Anhebung/Absenkung des Halls oberhalb der Shelf-Frequenz (dB, 0 = neutral).',
        en: 'Boost/cut of the reverb above the shelf frequency (dB, 0 = neutral).',
    },
    'k:revPreDelay': {
        de: 'Wie lange der Hall nach dem Original einsetzt (ms) – der Abstand, der den Raum groß macht.',
        en: 'How long the reverb starts after the original (ms) – the gap that makes a room feel large.',
    },
    'k:revSeed': {
        de: 'Startzahl der Hallwolke: gleiche Zahl = exakt dieselbe Reflexionsfolge.',
        en: 'Seed of the reverb cloud: same number = exactly the same reflection pattern.',
    },
    's:revView': {
        de: 'Welche Kanäle die Reflections-Anzeige zeigt.',
        en: 'Which channels the reflections display shows.',
    },

    // ── Global ──
    'k:masterVol': {
        de: 'Ausgangslautstärke. Doppelklick = 0 dB (Unity) – der Bezugspunkt beim Pegeln, nicht der Auslieferungswert.',
        en: 'Output level. Double-click = 0 dB (unity) – the reference point when levelling, not the shipped value.',
    },
    't:dcBlock': {
        de: 'Gleichanteil am Ausgang entfernen. Nimmt unhörbaren Versatz weg, macht aber flache Plateaus schräg (sichtbar im Oszilloskop).',
        en: 'Remove DC offset at the output. Takes away inaudible bias, but tilts flat plateaus (visible on the scope).',
    },

    // ── Debug ──
    'x:debugName': {
        de: 'Name des Debug-Bündels – er landet in allen Dateinamen dieser Aufnahme.',
        en: 'Name of the debug bundle – it goes into every filename of this recording.',
    },
    'n:debugNote': {
        de: 'Überschrift über dem Prompt-Feld – reiner Text, frei änderbar.',
        en: 'Heading above the prompt field – plain text, freely editable.',
    },
    'x:debugPrompt': {
        de: 'Die Frage an die KI. Sie wird als .txt neben Audio, Bild und Zustand gelegt – so steht beim Hören dabei, worum es ging.',
        en: 'The question to the AI. It is saved as .txt next to audio, image and state – so what it was about is right there when listening.',
    },
    'b:debugRec': {
        de: 'Audio parallel am Master abgreifen (der Hörweg bleibt unberührt) – Start/Stop. Ein neuer Start verwirft den vorherigen Take.',
        en: 'Tap audio in parallel at the master (the listening path stays untouched) – start/stop. A new start discards the previous take.',
    },
    'b:debugRec2': {
        de: 'Zweite Aufnahme zum Vergleich (vorher/nachher). Es läuft immer nur eine der beiden.',
        en: 'Second recording for comparison (before/after). Only ever one of the two runs.',
    },
    'b:debugRecReset': {
        de: 'Beide Aufnahmen verwerfen (Rec und Rec2 leeren).',
        en: 'Discard both recordings (clear Rec and Rec2).',
    },
    'b:debugSave': {
        de: 'Alles einzeln herunterladen: Audio (WAV, beide Aufnahmen) + Screenshot (PNG) + Zustand (JSON) + Prompt (TXT).',
        en: 'Download everything separately: audio (WAV, both takes) + screenshot (PNG) + state (JSON) + prompt (TXT).',
    },
};

/** Kennungen aller Auslieferungs-Hints (für Tests/Übersicht). */
export const HINT_IDS = Object.keys(HINTS);

/**
 * Auslieferungstext einer Kennung in der gewünschten Sprache.
 * Fehlt das Englische, kommt Deutsch – nie ein leerer Tooltip (dieselbe Regel wie i18n).
 * @param {string} id   – data-ctrl-Kennung, z.B. 'k:bpm'
 * @param {string} lang – 'de' | 'en'
 * @returns {string} '' wenn die Kennung keinen Auslieferungs-Hint hat
 */
export function factoryHint(id, lang = 'de') {
    const h = HINTS[id];
    if (!h) return '';
    return (lang === 'en' ? h.en : h.de) || h.de || '';
}
