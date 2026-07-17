/**
 * State.js – Single Source of Truth.
 *
 * Ein flaches Parameter-Objekt mit Defaults. UI schreibt hierhin, die Engine
 * liest hier (live, pro Trigger). Recall = Werte hier setzen → UI refresht aus
 * dem State, Engine folgt automatisch. So vermeiden wir den octaver-Recall-Bug
 * (dort wurde nur die Engine, nie die UI aktualisiert).
 */
import { makeSeqSteps } from '../dsp/stepSeq.js';
import { SCALE_PRESETS } from '../pitch/ScaleModel.js';

/** Default für die 12 skal2-Slots: ein paar musikalische Skalen vorbelegt, Rest chromatisch.
 *  Jeder Slot: { name (1–2 Zeichen), mask (12 bool), root (Versatz-Anker 0..11) }. */
function defaultSkal2Slots() {
    const seed = [
        ['Chr', SCALE_PRESETS.chromatic], ['Dur', SCALE_PRESETS.major], ['Mol', SCALE_PRESETS.minor],
        ['Pt5', SCALE_PRESETS.pentaMin], ['Oct', SCALE_PRESETS.octaves],
    ];
    return Array.from({ length: 12 }, (_, i) => ({
        name: seed[i] ? seed[i][0] : String(i + 1),
        mask: (seed[i] ? seed[i][1] : SCALE_PRESETS.chromatic).slice(),
        root: 0,
    }));
}

export const DEFAULTS = Object.freeze({
    // Takt
    bpm: 120,
    division: '1/8',
    syncOnStart: false,  // Transport: bei jedem Start alle Sequenzer wieder bei Step 0 beginnen
    // Gate (rhythmische Gebilde)
    gateEnabled: false,
    gateRate: 0.5,
    gateWidth: 0.5,
    // PitchOsc (S&H-Quelle)
    pitchRate: 0.5,
    fromHz: 110,         // "von": untere Tonhöhe als freie Frequenz (absolut)
    pitchRange: 12,      // Halbtöne über 'von'
    pitchWave: 'sine',
    pitchRandSeed: 1,    // Seed für die 'random'-Wellenform: gleicher Seed = feste Tonfolge
    // Skaler – BaseFrq aus wählbarer Quelle
    baseSrc: 'Freq',     // 'Freq' | 'Tempo' | 'Ton'
    baseHz: 55,          // Quelle 'Freq': freie Grundfrequenz (wird auf <= von begrenzt)
    baseNote: 'C',       // Quelle 'Ton': Tonklasse (C…B)
    baseOct: 0,          // DEPRECATED (nur Migration): Ton-Oktave
    tempoOct: 0,         // DEPRECATED (nur Migration): Tempo-Oktave
    baseOctave: 0,       // DEPRECATED (ersetzt durch baseBand-Faltung): ±Oktave-Verschiebung
    // Register-Wahl als Frequenzband statt ±Oktave (@dpa 20260711_125802): die effektive
    // BaseFrq (aus der Quelle) wird in [baseBand, 2·baseBand) gefaltet. Der Regler zeigt
    // „L–2L" und wählt so direkt den Hz-Bereich (z.B. 30 → 30–60 Hz), egal welche Quelle.
    baseBand: 55,
    harmonizeMix: 0,     // 0 = rein temperiert, 1 = voll auf n·baseHz
    // Test-Ton: reiner Sinus auf der effektiven BaseFrq, TROCKEN am Master (umgeht die
    // FX-Kette). Zum Vergleichs-Hören der Grundfrequenz zuschaltbar (Wunsch @dpa).
    baseTestOn: false,
    baseTestLevel: 0.2,
    // DEPRECATED (@dpa 20260715_224643: „Skaler: quant fest auf aus. die zahler nenner
    // controls alle raus. nur noch die ×… Base anzeige"). Die Rate wird nicht mehr auf
    // einen Bruch k/l der BaseFrq gerastet; Schalter und k max/l max-Regler sind weg.
    // Die Keys bleiben nur, damit alte Snapshots/Backups weiter laden – gelesen wird
    // keiner mehr (bestFraction lebt weiter in js/pitch/rateFraction.js).
    rateNumMax: 8,
    rateDenMax: 8,
    rateQuant: false,
    // Audio-Oszillator – zwei Engines
    oscEngine: 'Square-PW', // 'Square-PW' | 'Sine-FM'
    duty: 0.5,          // Square-PW: Pulsweite (PW)
    fmFeedback: 0,      // Sine-FM: Feedback 0..1 (Sinus → Sägezahn)
    // Poly-Limit: max. Anzahl gleichzeitig KLINGENDER Trigger-Voices (bei langer
    // Amp-Env/Attack überlappen aufeinanderfolgende Trigger = natürliche Polyphonie).
    // Wird die Grenze überschritten, wird die älteste Voice sanft gestohlen (FIFO).
    polyMax: 8,
    // Envelope
    attack: 0.003,
    ampDecay: 0,         // ASR-Release: Ausklingzeit NACH dem Len-Ende in s (0 = nur Anti-Klick).
                         // Kein Decay/Sustain-Level – die Note hält immer auf vollem Amp bis Len-Ende.
    ampHoldGlide: 0.05,  // Hold-Slide: Dauer (s) bis die gehaltene Voice die neue Tonhöhe
                         // ERREICHT. 0 = harter Sprung (das alte Verhalten). Nur im Hold
                         // wirksam – @dpa 20260715: „hold nur für Amp aussetzen, für
                         // freq = sliden".
    ampHoldCurve: 0,     // DEPRECATED (@dpa 20260715: „den logarithmischen [Slide] will ich,
                         // der andere fest auf 0 und weg"). Der Regler ist raus, die Slide-Form
                         // liegt fest bei 0 = fast gerade (SquareOsc: L = 0.2). Der Key bleibt
                         // nur, damit alte Snapshots/Backups mit ampHoldCurve: 0.5 weiter laden –
                         // gelesen wird er nicht mehr.
    ampHold: false,      // Hold: Amp-Env NICHT neu triggern, solange die laufende Note (envLen)
                         // über den nächsten Trigger hinausreicht → gehaltene Note klingt durch.
    envPercent: 0.6,     // Länge = Anteil des Trigger-Intervalls (globaler Master)
    // Pitch → Env-Länge: Skalierung in % je nach Tonhöhe im Fenster [von..von+range].
    // 100 % = neutral (Mitte), 1 % = sehr kurz, >100 = länger (bis max. Step-Länge).
    envPitchLo: 100,     // Faktor bei unterster Pitch (unipolar 0)
    envPitchHi: 100,     // Faktor bei oberster Pitch (unipolar 1)
    // Pitch → Amp: dämpft hohe Töne. 0 % = kein Einfluss (Amp-Multiplikator immer 1).
    // 100 % = Multiplikator läuft linear von 1 (tiefste Pitch, u=0) auf 0 (höchste, u=1).
    // Dazwischen interpoliert (Anteil des vollen Abfalls).
    ampPitchAmt: 0,
    // Lowpass-Filter auf dem OSC (Decay-Env pro Trigger, getriggert von Takt×Gate)
    filterEnabled: false, // 'aktiv'-Haken (aus = Bypass); ersetzt den früheren 'Aus'-Pol
    filterType: 'LP',    // 'LP' | 'HP' | 'BP' | 'Ladder-org' (SVF-Multimode-Kern)
    lpMode: '2p',        // '1p' | '2p' | '3p' | '4p'  (Polzahl/Steilheit nur für LP; Aus via 'aktiv')
    lpCutoff: 4000,      // Grund-Cutoff in Hz
    lpReso: 0.7,         // Resonanz (Q) – wirkt erst ab 2p
    lpEnv: 0.5,          // Hüllkurven-Hub: öffnet Cutoff um bis zu +6 Oktaven
    lpAttack: 0,         // Attack-Zeit der Filter-Hüllkurve in s (0 = sofort, reines Decay)
    lpDecay: 0.2,        // Decay-Zeit der Filter-Hüllkurve in s
    lpKeyTrack: 0,       // Keytrack: gespielte (skalierte+harmonisierte) Frequenz auf den
                         // Cutoff. 0 % = nur Cutoff, 100 % = Cutoff + gespielte Frequenz.
    lpGlide: 0.015,      // Glide-Zeitkonstante (τ, s) für Keytrack-Cutoff-Sprünge zwischen
                         // Noten ('Option A', @dpa). 0 = harter Sprung (kein Glide).
    // (Oberton-Raster auf dem Cutoff: 20260716_011222 als Test gebaut, 20260716_023817
    //  nach dem Hören wieder raus – „Obertöne aus und weg". Kein State-Key mehr; ein alter
    //  gespeicherter lpHarmQuant wird beim Laden schlicht ignoriert.)
    // Env-Trig (@dpa 20260713, ersetzt das alte Bool 'filterSeqEnabled'): dreistufig,
    // steuert WANN/WIE die Filter-Hüllkurve (lpEnv/lpAttack/lpDecay) getriggert wird.
    //   'off'  – Env komplett aus (kein Trigger, kein Cutoff-Hub)
    //   'each' – jeder Trigger löst die volle Env aus (Sequenzer ausgeblendet)
    //   'seq'  – Filter-Sequenzer steuert Env-Trigger + -Depth pro Step (bisheriges Verhalten)
    // Migration (app.js, boot()): altes filterSeqEnabled true→'seq', false→'each' (Bool
    // war NIE "Env aus", sondern "jeder Trigger volle Env" – 1:1-Verhaltenserhalt beim Laden
    // alter Zustände, s. @dpa-Regel „keine stillen Deckel auf User-Werte").
    filterEnvTrig: 'seq',
    // Filter-Sequenzer: pro Takt-Step Env-Trigger (>0) + Env-Depth (0..1).
    // Default: nur Step 0 = 100 %, Rest 0 → einmal triggern, dann Env laufen lassen.
    filterSeqLen: 8,
    filterSeqSteps: makeSeqSteps('first'),
    // FX-Ketten-Reihenfolge (Sound): frei umsteckbare Reihenfolge der drei Bus-FX.
    // voiceBus → fx[0] → … → Master. Live umsteckbar zum Ausprobieren (kein Speichern nötig).
    // Kette: Ketten-Knoten in Reihenfolge. Effekte (Filter/Distortion/Reverb) bilden den
    // Insert (voiceBus→…→Master); 'Metronom' ist eine Quelle, die am ihrer Position in die
    // Kette einspeist (steht sie hinter allen Effekten = parallel an den Master). @dpa 20260713.
    fxOrder: ['Filter', 'Distortion', 'Reverb', 'Metronom'],
    // Distortion (Effekt-Slot vor dem Reverb)
    distEnabled: false,  // 'aktiv'-Haken (aus = Bypass)
    distMode: 'Saturation', // 'Saturation' | 'Hard Clip' | 'Foldback'
    distDrive: 2,        // Vorverstärkung in die Kennlinie
    distOut: 1,          // Ausgangspegel
    distMix: 1,          // Dry/Wet-Crossfade (1 = reines Wet = Verhalten vor dem Regler)
    distDryDelay: 0,     // Versatz dry↔wet in SAMPLES (@dpa 20260715_223000, „Experiment"):
                         // >0 = dry später, <0 = wet später, 0 = beide Zweige neutral.
    // Gate-Reverb (fester Effekt; 'aktiv'-Haken = Bypass)
    reverbEnabled: false, // 'aktiv'-Haken (aus = Bypass)
    revMix: 0.35,        // Dry/Wet 0..1
    revWet: 1.0,         // Wet-Pegel ("Gas geben", bis 4×)
    revDensity: 0.85,    // Dichte der Reflexionen (Menge der reverbDelays)
    revLenPct: 1.0,      // Länge der Hall-Wolke relativ zum Trigger-Intervall (0..8×)
    revAttack: 0.0,      // Einschwing-Anteil am Anfang der Reflections (0 = sofort voll)
    revRelease: 0.0,     // Ausfade-Anteil am Ende (0 = flaches Gate, harter Abriss)
    revReleaseShape: 0,  // Release-KURVE 0..100 (@dpa 20260713): 0 = linear (wie bisher),
                         // 100 = „logarithmisch" (faked, schneller Anfangs-Abfall + langer Schwanz)
    revShelfFreq: 400,   // HighShelf-Grenzfrequenz auf dem Hall-Anteil (Hz)
    revShelfGain: 0,     // HighShelf-Anhebung/Absenkung (dB, 0 = neutral)
    revPreDelay: 0,      // Pre-Delay der Reflections (ms)
    revSeed: 1,          // fester Random-Seed der Hall-Wolke (gleiche Zahl = gleiche Wolke)
    revView: 'Beide',    // Reflections-Anzeige: 'L' | 'R' | 'Beide'
    // Reflections-Anzeige (Optik): Größe + Hintergrund + Kanalfarben, eigene Settings.
    // Die Kanalfarben tragen ihre Deckkraft selbst (rgba, @dpa 20260716_174111: „die Farben
    // mit alpha (wie bei step sequ)") – vorher stand hier Hex und die 0.30 klebte fest im
    // Zeichencode. Alte Snapshots mit '#rrggbb' liest reflCol() weiter (s. app.js).
    reflW: 334, reflH: 60,
    reflBg: '#0e1116',
    reflColL: 'rgba(90,209,255,0.3)', reflColR: 'rgba(255,159,90,0.3)',
    // Metronom (eigener getakteter Klick, umgeht die FX-Kette)
    metroEnabled: false,   // 'aktiv'-Haken
    metroDivision: '1/4',  // DEPRECATED (ersetzt durch metroL/metroM): alte feste Teilung
    // Metronom-Rate als freies Verhältnis l/m des Viertels (@dpa 20260713): Klickperiode
    // = (60/bpm) · (l/m). l,m ∈ [1,16] ganzzahlig. l=1,m=1 → Viertel (wie früher '1/4').
    metroL: 1,
    metroM: 1,
    metroLevel: 0.5,       // Ausgangspegel
    metroMorph: 0.5,       // Filter: 0=LP · 0.5=Bypass · 1=HP
    metroCutoff: 2000,     // Vadim-SVF-Cutoff (Hz)
    metroCutoffQuant: false, // AN: Cutoff wird durch metroCutBand ersetzt (an BaseFrq gefaltet)
    metroCutoffOct: 0,     // DEPRECATED (ersetzt durch metroCutBand-Faltung): Oktaver
    metroCutBand: 2000,    // Band-Regler: cutoff = BaseFrq in [L,2L) gefaltet (nur bei metroCutoffQuant)
    metroReso: 2,          // Vadim-SVF-Resonanz (Q)
    metroRoute: 'Parallel',// 'Parallel' (am Master, umgeht FX) | 'Vor Dist' (in die FX-Kette vor Distortion)
    // Amp-Sequenzer: pro Takt-Step Gate (>0) + Velocity (0..1) auf die Note.
    // Default: 16 Steps, alle 100 % → wie ohne Sequenzer.
    ampSeqEnabled: false,
    ampSeqLen: 16,
    ampSeqSteps: makeSeqSteps('full'),
    ampSeqDyn: 0,        // DEPRECATED (@dpa 20260716_164359): die alte bipolare Kurve −1..+1
                         // (0 = linear, 1 = v²). Ersetzt durch ampSeqDynPct mit @dpas eigener
                         // Skala 0/100/200. Bewusst ein NEUER Key statt einer Umrechnung: die
                         // Bereiche überlappen ([−1,1] vs [0,200]), eine Heuristik hätte einen
                         // gewollten neuen Dyn=1 stumm zu 100 umgedeutet. Alte Snapshots laden
                         // ihren ampSeqDyn weiterhin (er wird ignoriert) und bekommen für
                         // ampSeqDynPct den Default 100 = neutral – genau das, was der alte
                         // Default 0 (linear) klanglich tat.
    // Dyn (@dpa 20260716_164359), gleiche Skala für BEIDE Sequenzer:
    //   0 = alles 100 % · 100 = wie eingestellt · 200 = volle Dynamik (>50 %→100 %, <50 %→min).
    // Logik in dsp/stepSeq.js → seqDyn().
    ampSeqDynPct: 100,
    filterSeqDynPct: 100,
    // Pegel
    amp: 0.7,
    masterVol: 0.8,
    // Sprache der Hints/Beschriftungen: 'de' | 'en' (@dpa 20260716_164359). Siehe
    // js/core/i18n.js – selbst vergebene Labels bleiben davon unberührt.
    lang: 'de',
    dcBlock: true,       // DC-Block/Rumpelfilter aktiv (aus = Extreme erlaubt)
    // Skala-Maske (12 bool)
    scaleMask: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    // Lage der Skala auf der Frequenzachse (Transponier-Anker, 0 = C). Nur Position,
    // nicht das Intervallmuster – s. Transponier-Modus im Keyboard.
    scaleRoot: 0,
    // Base→C (Sound): Skala RELATIV zur BaseFreq. scaleMask wird dann als relatives Muster
    // (Index 0 = Basis = „do") interpretiert; effektiv klingend = rotateMask(scaleMask,
    // pcBase). Ändert sich die Basis, transponiert das Muster mit (immer „in der Base-Tonart").
    // Keyboard zeigt dann relative Namen (do re mi …), skal2 behält eigene Slot-Namen.
    baseToC: false,
    // skal2 (Optik-Ebene): die 12 Keyboard-Tasten werden zu 12 abrufbaren Skala-Slots.
    // skal2On schaltet den Modus, skal2Active = geladener Slot, skal2Slots = die 12
    // Slot-Definitionen. Ein Slot laden setzt scaleMask+scaleRoot; Ton-Toggle/Versatz
    // schreiben in den aktiven Slot zurück. Die 12 zusammen = ein „P2" (speicher-/ladbar).
    skal2On: false,
    skal2Active: 0,
    skal2Slots: defaultSkal2Slots(),
    // Anzeige-Option: Frequenz-/Tonhöhen-Anzeigen als Vielfaches der Base-Frq;
    // true = auf ganze Zahlen gerundet.
    intMultiples: false,
    // Regler-Meta (Range/Kurve/Einheit/Farbe/Ansicht je Knob-Key) – aus dem Edit-Fenster.
    // Gehört zur OPTIK-Ebene (s. PresetManager.LAYOUT_KEYS): rein optisch/bedien-bezogen,
    // NICHT im Sound-Snapshot → Snapshot-Recall lässt Reglerfarben/-skalen unangetastet.
    knobMeta: {},
    // Wiederverwendbare Regler-Farben (Optik): [{ name, color }].
    knobColorPresets: [],
    // Scopes-Schalter/Regler (Optik): Anzeige an/aus + Bedienwerte → Recall/Reset-fest.
    scopeOn: true, specOn: true, scopeSync: true, scopeRange: 0.35, specGain: 1,
    // Gemerkte Menü-Auswahlen (Optik): Name der zuletzt gewählten Einträge je Liste,
    // damit die Dropdowns nach Reset/Recall nicht auf dem Platzhalter stehen.
    scaleSel: '', snapSel: '', layoutSel: '', knobColorSel: '', p2Sel: '',
    // Wie oft Snapshot-Menü bzw. Start/Stop schon benutzt wurden (Optik). Nur dafür da,
    // den atmenden Hinweis auf diesen Knöpfen abzuschalten, sobald man sie gefunden hat
    // (@dpa 20260717: „Wenn man Snapshot zweimal aufgerufen hat, ist der Hinweis weg").
    // Zählen bis PresetBar.HINT_USES und bleiben dann stehen – kein Nutzungs-Protokoll.
    snapOpened: 0, playUsed: 0,
    // comboSel: DEPRECATED seit 20260716_174111 – die Combo-Anzeige gehört zur Gruppe, nicht
    // zum ganzen Synth (s. groupComboSel). Bleibt als Feld stehen, damit alte Backups laden;
    // die Farben selbst lagen ohnehin nie hier, sondern in groupStyles.
    comboSel: '',
    // Gemerkte Gruppen-Snapshot-Auswahl je Gruppe (Optik): { Gruppenname: SnapName }.
    // Damit das Snapshot-Menü in den Gruppen-Settings beim nächsten Öffnen auf dem
    // zuletzt geladenen/gespeicherten Snapshot steht (statt auf dem Platzhalter).
    groupSnapSel: {},
    // Dasselbe für die Farb-Combos: { Gruppenname: ComboName } (@dpa 20260716_174111).
    // Die Combo-LISTE bleibt global (groupStylePresets) – nur wer welchen trägt, ist
    // Sache der einzelnen Gruppe.
    groupComboSel: {},
    // ── Beschriftung, GLOBAL (@dpa 20260716_204921: „Da sie m.M.nach alle die gleiche
    // Farbe haben sollten muss man sie irgendwie global vorgeben") – Optik-Ebene.
    // '' bzw. 0 heißt „nichts vorgegeben": dann gilt der Wert aus dem Stylesheet, und ein
    // unangetastetes Instrument sieht aus wie immer. Deshalb kein Farb-Default hier.
    labelColor: '',      // Schriftfarbe ALLER Beschriftungen
    valueBg: '',         // Hintergrund hinter den Werte-Anzeigen
    labelSize: 0,        // Schriftgröße der Beschriftungen (6–12 px, 0 = wie ausgeliefert)
    // ── Hilfe-Blasen (@dpa 20260716_174111) – Optik-Ebene, also im Backup, nie im Sound ──
    hintsOn: true,       // global an/aus („falls das aufpopen der hints stört")
    hintDelay: 600,      // ms bis die Blase erscheint
    // EIGENE Hilfetexte je Control-Kennung: { 'k:bpm': 'mein Text' }. Was hier NICHT
    // steht, kommt aus der Auslieferung (js/data/hints.js) – ein Eintrag löschen ist
    // deshalb immer der Rückweg zum Original.
    hintText: {},
    // Panel-Gruppen: Reihenfolge, Stil (Name/Farben/Collapse), Farb-Combos.
    groupOrder: [],          // leer = Default-Reihenfolge (nur noch fürs initiale Einfließen)
    groupPos: {},            // name → { x, y } feste Panel-Position (Optik); leer = autoFlow
    groupStyles: {},         // name → { name, bg, headColor, collapsed }
    groupStylePresets: [],   // [{ name, bg, headColor }] – wiederverwendbare Combos
    // Reihenfolge der Controls INNERHALB einer Gruppe (experimenteller Arrange-Modus).
    // name → [ 'k:<knobKey>' | 'sat', … ]; leer/fehlend = Default-Reihenfolge.
    controlOrder: {},
    // Freies Gruppen-Canvas im e-Mode (@dpa 20260713): sobald ein Element bewegt wird,
    // wird die Gruppe zum Canvas – ALLE Einheiten (Regler, Selects, Toggles, Sequenzer,
    // Keyboard, Readouts …) absolut platziert, der Rahmen umschließt exakt die Fläche.
    // Struktur: { [Gruppenname]: { [data-ctrl-Kennung]: { x, y } } } in px. 10px-Raster,
    // Shift=1px. Rein optisch (LAYOUT_KEYS) – kein Sound.
    ctrlPos: {},
    // Element-Settings der Nicht-Knob-Controls (@dpa 20260714): Selects (MultiSchalter),
    // Toggles (aktiv/hold) und Readouts (pure Texte) bekommen per Rechtsklick eigene
    // Optik-Settings. Struktur: { [data-ctrl-Kennung]: { label, labelPos, bg, fg, size,
    // labelOn, fontSize, boxSize } } – nur gesetzte Felder. Rein optisch (LAYOUT_KEYS).
    ctrlStyles: {},
    // Step-Sequenzer-Optik – GETRENNT je Seq-Typ (modular: Filter- und Amp-Seq haben
    // eigene Größe/BG/Balkenfarbe, verstellen sich nicht mehr gegenseitig). Struktur:
    // { filter: {w,h,bg,col}, amp: {w,h,bg,col} }. Optik-Ebene (LAYOUT_KEYS) → im Layout
    // gespeichert. Altes flaches Format {w,h,bg,colFilter,colAmp} wird in app.js migriert.
    seqStyles: {
        filter: { w: 270, h: 64, bg: '#0e1116', col: 'rgba(90,209,255,1)' },
        amp: { w: 270, h: 64, bg: '#0e1116', col: 'rgba(255,159,90,1)' },
    },
    // Debug-Werkzeug (KEIN Sound-Parameter, s. PresetManager.LAYOUT_KEYS): Name +
    // Begleit-Prompt fürs "Debug speichern"-Bündel (Audio/Screenshot/Zustand/Text).
    debugName: '', debugPrompt: '',
});

export class State {
    constructor(init = {}) {
        this.data = { ...structuredCloneSafe(DEFAULTS), ...init };
        this._subs = new Set();
    }

    get(key) { return this.data[key]; }

    set(key, value) {
        if (this.data[key] === value) return;
        this.data[key] = value;
        this._emit(key, value);
    }

    /** Mehrere Keys auf einmal (z.B. beim Recall). */
    patch(obj) {
        for (const [k, v] of Object.entries(obj)) {
            this.data[k] = v;
        }
        this._emit('*', this.data);
    }

    subscribe(cb) { this._subs.add(cb); return () => this._subs.delete(cb); }
    _emit(key, value) { for (const cb of this._subs) cb(key, value, this.data); }

    toJSON() { return structuredCloneSafe(this.data); }
    /** Lade Snapshot-Werte, fehlende Felder fallen auf Defaults zurück. */
    loadFromJSON(json) {
        const merged = { ...structuredCloneSafe(DEFAULTS), ...(json || {}) };
        this.data = merged;
        this._emit('*', this.data);
    }
}

function structuredCloneSafe(o) {
    return JSON.parse(JSON.stringify(o));
}
