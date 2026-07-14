/**
 * app.js – Bootstrap: State, Engine, UI-Verdrahtung, Render-Loop, Space-Toggle.
 *
 * Panel-Aufbau nach THEMATISCHEN GEBIETEN: jede Gruppe (Takt, Gate, Skaler …)
 * enthält ALLE zugehörigen Bedienelemente – Selects, Toggles, Regler und (beim
 * Skaler) das ON/OFF-Keyboard samt Skala-Presets. Nur Transport + Ensemble-
 * Snapshot sind global (oben).
 *
 * Recall-Disziplin: alle Controls sind bidirektional an den State gebunden.
 * onChange schreibt in den State; bei State-'*' (Recall) wird JEDES Control aus
 * dem State neu gesetzt → der octaver-Recall-Bug kann hier nicht auftreten.
 */
import { State } from './core/State.js';
import { TeslaEngine } from './engine/TeslaEngine.js';
import { Knob } from './ui/Knob.js';
import { KnobMetaEditor } from './ui/KnobMetaEditor.js';
import { ElementSettings } from './ui/ElementSettings.js';
import { Keyboard } from './ui/Keyboard.js';
import { StepSeqUI } from './ui/StepSeqUI.js';
import { Scopes } from './ui/Scopes.js';
import { DebugPanel } from './ui/DebugPanel.js';
import { PresetBar } from './ui/PresetBar.js';
import { PresetManager } from './data/PresetManager.js';
import { DIVISION_LABELS } from './core/TriggerDivider.js';
import { PITCH_WAVEFORMS } from './pitch/PitchOsc.js';
import { NOTE_NAMES } from './pitch/ScaleModel.js';
import { freqToMidi, midiToName, foldToBand } from './pitch/Scaler.js';
import { bestFraction } from './pitch/rateFraction.js';

/** 'von'-Anzeige: passende Note + Frequenz (P · F). */
const fromHzFormat = (hz) => `${midiToName(Math.round(freqToMidi(hz)))}·${Math.round(hz)}`;

/** Regler-Definitionen (State-Key → Konfiguration). */
const KNOBS = {
    bpm:          { label: 'Tempo', min: 40, max: 240, step: 1, curve: 'linear', unit: '', decimals: 0 },
    gateRate:     { label: 'Gate-Rate', min: 0.05, max: 8, curve: 'log', unit: 'Hz', decimals: 2 },
    gateWidth:    { label: 'Gate-Weite', min: 0.05, max: 0.95, curve: 'linear', unit: '', decimals: 2 },
    pitchRate:    { label: 'Rate', min: 0.05, max: 100, curve: 'log', unit: 'Hz', decimals: 2 },
    fromHz:       { label: 'Von', min: 20, max: 1000, curve: 'log', unit: 'Hz', decimals: 1, formatValue: fromHzFormat },
    pitchRange:   { label: 'Range', min: 1, max: 36, step: 1, curve: 'linear', unit: 'P', decimals: 0 },
    rateNumMax:   { label: 'k max', min: 1, max: 32, step: 1, curve: 'linear', unit: '', decimals: 0 },
    rateDenMax:   { label: 'l max', min: 1, max: 32, step: 1, curve: 'linear', unit: '', decimals: 0 },
    pitchRandSeed:{ label: 'Seed', min: 1, max: 999, step: 1, curve: 'linear', unit: '', decimals: 0 },
    baseHz:       { label: 'Base-Frq', min: 1, max: 500, curve: 'log', unit: 'Hz', decimals: 1 },
    baseBand:     { label: 'Band', min: 0.05, max: 8000, curve: 'log', unit: 'Hz', decimals: 2, formatValue: (v) => { const d = v < 20 ? 2 : 0; return `${v.toFixed(d)}–${(v * 2).toFixed(d)}`; } },
    harmonizeMix: { label: 'Harmonize', min: 0, max: 1, curve: 'linear', unit: '', decimals: 2 },
    baseTestLevel:{ label: 'Test-Vol', min: 0, max: 0.6, curve: 'linear', unit: '', decimals: 2 },
    duty:         { label: 'PW', min: 0.01, max: 0.99, curve: 'linear', unit: '', decimals: 2 },
    fmFeedback:   { label: 'FM', min: 0, max: 1, curve: 'linear', unit: '', decimals: 2 },
    polyMax:      { label: 'Poly', min: 1, max: 8, step: 1, curve: 'linear', unit: '', decimals: 0 },
    attack:       { label: 'Attack', min: 0, max: 0.05, step: 0.001, curve: 'linear', unit: 's', decimals: 3 },
    ampDecay:     { label: 'Release', min: 0, max: 16, curve: 'log', unit: 's', decimals: 3 },
    envPercent:   { label: 'Länge %', min: 0.05, max: 16, curve: 'linear', unit: '', decimals: 2 },
    envPitchLo:   { label: 'P→Len tief', min: 1, max: 200, step: 1, curve: 'linear', unit: '%', decimals: 0 },
    envPitchHi:   { label: 'P→Len hoch', min: 1, max: 200, step: 1, curve: 'linear', unit: '%', decimals: 0 },
    ampPitchAmt:  { label: 'P→Amp', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', decimals: 0 },
    lpCutoff:     { label: 'Cutoff', min: 20, max: 18000, curve: 'log', unit: 'Hz', decimals: 0 },
    lpReso:       { label: 'Reso', min: 0.1, max: 20, curve: 'log', unit: 'Q', decimals: 1 },
    lpEnv:        { label: 'Env', min: -1, max: 1, curve: 'linear', unit: '', decimals: 2 },
    lpAttack:     { label: 'Attack', min: 0, max: 8, curve: 'log', unit: 's', decimals: 3 },
    lpDecay:      { label: 'Decay', min: 0.005, max: 16, curve: 'log', unit: 's', decimals: 3 },
    lpKeyTrack:   { label: 'KeyTrack', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', decimals: 0 },
    lpGlide:      { label: 'Glide', min: 0, max: 1, curve: 'log', unit: 's', decimals: 3 },
    distDrive:    { label: 'Drive', min: 0.5, max: 50, curve: 'log', unit: '×', decimals: 1 },
    distOut:      { label: 'Out', min: 0, max: 2, curve: 'linear', unit: '', decimals: 2 },
    revMix:       { label: 'Dry/Wet', min: 0, max: 1, curve: 'linear', unit: '', decimals: 2 },
    revWet:       { label: 'Wet-Vol', min: 0, max: 4, curve: 'linear', unit: '×', decimals: 2 },
    revDensity:   { label: 'Density', min: 0, max: 1, curve: 'linear', unit: '', decimals: 4 },
    revLenPct:    { label: 'Len', min: 0, max: 16, curve: 'linear', unit: '×', decimals: 2 },
    revAttack:    { label: 'Attack', min: 0, max: 1, curve: 'linear', unit: '', decimals: 2 },
    revRelease:   { label: 'Release', min: 0, max: 1, curve: 'linear', unit: '', decimals: 2 },
    revReleaseShape: { label: 'Rel-Form', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', decimals: 0 },
    revShelfFreq: { label: 'HiShelf', min: 40, max: 8000, curve: 'log', unit: 'Hz', decimals: 0 },
    revShelfGain: { label: 'Boost', min: -18, max: 6, step: 0.5, curve: 'linear', unit: 'dB', decimals: 1 },
    revPreDelay:  { label: 'Pre-Delay', min: 0, max: 200, step: 1, curve: 'linear', unit: 'ms', decimals: 0 },
    revSeed:      { label: 'Seed', min: 1, max: 999, step: 1, curve: 'linear', unit: '', decimals: 0 },
    amp:          { label: 'Amp', min: 0, max: 1, curve: 'linear', unit: '', decimals: 2 },
    ampSeqDyn:    { label: 'Dyn', min: -1, max: 1, curve: 'linear', unit: '', decimals: 2 },
    masterVol:    { label: 'Volume', min: 0, max: 1, curve: 'linear', unit: '', decimals: 2 },
    metroL:       { label: 'l', min: 1, max: 16, step: 1, curve: 'linear', unit: '', decimals: 0 },
    metroM:       { label: 'm', min: 1, max: 16, step: 1, curve: 'linear', unit: '', decimals: 0 },
    metroLevel:   { label: 'Level', min: 0, max: 1, curve: 'linear', unit: '', decimals: 2 },
    metroMorph:   { label: 'LP↔HP', min: 0, max: 1, curve: 'linear', unit: '', decimals: 2 },
    metroCutoff:  { label: 'Cutoff', min: 50, max: 18000, curve: 'log', unit: 'Hz', decimals: 0 },
    metroCutBand: { label: 'Band', min: 20, max: 9000, curve: 'log', unit: 'Hz', decimals: 0, formatValue: (v) => `${Math.round(v)}–${Math.round(v) * 2}` },
    metroReso:    { label: 'Reso', min: 0.1, max: 20, curve: 'log', unit: 'Q', decimals: 1 },
};

const SELECTS = {
    division:  { label: 'Teilung', options: DIVISION_LABELS },
    metroDivision: { label: 'Teilung', options: DIVISION_LABELS },
    metroRoute: { label: 'Route', options: ['Parallel', 'Vor Dist', 'Vor Rev'] },
    pitchWave: { label: 'Pitch-Wave', options: PITCH_WAVEFORMS },
    baseSrc:   { label: 'BaseFrq-Quelle', options: ['Freq', 'Tempo', 'Ton'] },
    baseNote:  { label: 'Ton', options: NOTE_NAMES },
    oscEngine: { label: 'Engine', options: ['Square-PW', 'Sine-FM'] },
    filterType: { label: 'Typ', options: ['LP', 'HP', 'BP', 'Ladder-org'] },
    lpMode:    { label: 'Pole', options: ['1p', '2p', '3p', '4p'] },
    // MouseOver-Info pro Option (@dpa 20260713): sinnvoll gefüllt statt leer.
    filterEnvTrig: { label: 'Env-Trig', options: ['off', 'each', 'seq'], optionTitles: {
        off: 'Env aus', each: 'jeder Trigger volle Env', seq: 'Env-Trigger folgt Sequenzer',
    } },
    distMode:  { label: 'Distortion', options: ['Saturation', 'Hard Clip', 'Foldback'] },
    revView:    { label: 'Ansicht', options: ['L', 'R', 'Beide'] },
};
const TOGGLES = {
    gateEnabled:   { label: 'aktiv' },
    metroEnabled:  { label: 'aktiv' },
    filterEnabled: { label: 'aktiv' },
    ampSeqEnabled: { label: 'Seq' },
    ampHold:       { label: 'Hold' },      // Amp-Env nicht neu triggern solange Note (Len) hält
    distEnabled:   { label: 'aktiv' },
    reverbEnabled: { label: 'aktiv' },
    dcBlock:       { label: 'DC-Block' },
    intMultiples:  { label: '×ganze' },   // (nur noch Keyboard-Anzeige; kein globaler Schalter mehr)
    rateQuant:     { label: 'Quant' },     // lokal in Skaler: Rate float ↔ Bruch k/l
    baseToC:       { label: 'base=c' },    // Skala relativ zur Basis (do re mi); Klang folgt der Basis
    baseTestOn:    { label: 'Test-Ton' },  // trockener Sinus auf der BaseFrq (Vergleich)
    metroCutoffQuant: { label: 'Quant' },  // Metronom-Cutoff an BaseFrq gerastet (Oktaver statt Hz-Knob)
};

/** Gruppen = thematische Gebiete mit ALLEN zugehörigen Controls.
 *  Master ist global → liegt oben in der Transport-Zeile (nicht hier). */
const GROUPS = [
    { name: 'Takt', selects: ['division'], knobs: ['bpm'] },
    // (Gruppe 'Gate' entfernt – ersatzlos, @dpa. gateEnabled bleibt als State-Default
    //  false → Gate immer offen, ohne UI. Kein Sound-Effekt.)
    // Metronom: eigener getakteter Klick mit Vadim-SVF-Morph-Filter (LP↔HP).
    // Route-Select entfällt: das Metronom sitzt jetzt als Quelle in der Kette (Position
    // bestimmt das Einspeisen). @dpa 20260713.
    { name: 'Metronom', toggles: ['metroEnabled', 'metroCutoffQuant'], knobs: ['metroL', 'metroM', 'metroLevel', 'metroMorph', 'metroCutoff', 'metroCutBand', 'metroReso'], metro: true },
    // Seed sitzt inline neben dem Pitch-Wave-Select (nur bei 'random' sichtbar).
    { name: 'Skaler', selects: ['pitchWave'], inlineKnobs: ['pitchRandSeed'], knobs: ['pitchRate', 'fromHz', 'pitchRange', 'rateNumMax', 'rateDenMax'], scale: true },
    // Base-Frq: eigene Gruppe; Sichtbarkeit der Controls hängt von der Quelle ab.
    { name: 'Base-Frq', selects: ['baseSrc', 'baseNote'], toggles: ['baseTestOn'], knobs: ['baseBand', 'baseHz', 'harmonizeMix', 'baseTestLevel'], baseFrq: true },
    { name: 'Audio-Osz', selects: ['oscEngine'], knobs: ['duty', 'fmFeedback', 'polyMax'], osc: true },
    // Lowpass auf dem OSC: Cutoff (+ Reso ab 2p) mit Decay-Env (Takt×Gate).
    // Filter-Sequenzer steuert Env-Trigger + -Depth pro Step.
    { name: 'Filter', selects: ['filterType', 'lpMode', 'filterEnvTrig'], toggles: ['filterEnabled'], knobs: ['lpCutoff', 'lpReso', 'lpEnv', 'lpAttack', 'lpDecay', 'lpKeyTrack', 'lpGlide'], filter: true, seq: 'filter' },
    // Distortion: Effekt-Slot vor dem Reverb.
    { name: 'Distortion', selects: ['distMode'], toggles: ['distEnabled'], knobs: ['distDrive', 'distOut'], dist: true },
    // Envelope: P→Len als kleine „Satelliten" an der Länge. Amp-Sequenzer = Gate/Velocity.
    // Länge + P→Len sind jetzt NORMALE Controls (Satelliten-Untergruppe aufgelöst, @dpa
    // 20260713): envPercent (Länge), envPitchLo (P→Len tief), envPitchHi (P→Len hoch).
    { name: 'Envelope', toggles: ['ampSeqEnabled', 'ampHold'], knobs: ['attack', 'ampDecay', 'envPercent', 'envPitchLo', 'envPitchHi', 'ampPitchAmt', 'amp', 'ampSeqDyn'], seq: 'amp' },
    // Gate-Reverb: Effekt-Slot mit Umschalter; Regler nur sichtbar wenn aktiv.
    { name: 'Gate Reverb', selects: ['revView'], toggles: ['reverbEnabled'], knobs: ['revMix', 'revWet', 'revDensity', 'revLenPct', 'revAttack', 'revRelease', 'revReleaseShape', 'revShelfFreq', 'revShelfGain', 'revPreDelay', 'revSeed'], reverb: true },
    // Debug-Werkzeug (C7): KEIN Sound-Parameter – Audio/Screenshot/Zustand/Prompt
    // auf Klick bündeln, für @dpa zum Hochladen an die KI.
    { name: 'Debug', debug: true },
];

/** Sound-Parameter-Keys EINER Gruppe (für die Gruppen-Snapshots). Rein Sound:
 *  Selects/Toggles/Regler + Länge-Satelliten + Sequenzer-Keys + (Skaler) die Maske. */
function groupSoundKeys(grp) {
    const keys = [];
    (grp.selects || []).forEach((k) => keys.push(k));
    (grp.toggles || []).forEach((k) => keys.push(k));
    (grp.inlineKnobs || []).forEach((k) => keys.push(k));
    (grp.knobs || []).forEach((k) => keys.push(k));
    if (grp.lengthSat) { keys.push(grp.lengthSat.main); (grp.lengthSat.sats || []).forEach((k) => keys.push(k)); }
    // 'SeqEnabled'/-Äquivalent (ampSeqEnabled bzw. filterEnvTrig) steckt bereits in
    // toggles/selects der Gruppe – hier nur die reinen Sequenzer-Daten.
    if (grp.seq) keys.push(grp.seq + 'SeqLen', grp.seq + 'SeqSteps');
    if (grp.scale) keys.push('scaleMask', 'scaleRoot');
    return keys;
}

/** Regler-Keys EINER Gruppe (für die Control-Settings/knobMeta im Gruppen-Snapshot). */
function groupKnobKeys(grp) {
    const keys = [...(grp.inlineKnobs || []), ...(grp.knobs || [])];
    if (grp.lengthSat) { keys.push(grp.lengthSat.main); (grp.lengthSat.sats || []).forEach((k) => keys.push(k)); }
    return keys;
}

/** Dirty-Marker aus einer {changed,total,frac}-Messung: '' / '*' / '‼' (>60% verändert). */
const dirtyMark = (d) => (!d || !d.changed) ? '' : (d.frac > 0.6 ? '‼' : '*');

/** localStorage-Key für den automatisch gesicherten Live-Zustand (Sound + Optik). */
const LIVE_KEY = 'teslacoil_live';

function boot() {
    const state = new State();

    // ── Auto-Restore: letzten Live-Zustand wiederherstellen (sonst Default) ──
    // Vor dem UI-Aufbau, damit alle Controls direkt mit den gesicherten Werten
    // gebaut werden. Kein Default-Flash beim Reload/Aktualisieren mehr.
    try {
        const live = JSON.parse(localStorage.getItem(LIVE_KEY));
        if (live && typeof live === 'object') state.loadFromJSON(live);
    } catch { /* korrupter Live-State → beim Default bleiben */ }

    // Migration: die entfernten Moog-Ladder-Typen ('Ladder'/'Ladder-alt') auf den
    // verbliebenen SVF-Ladder ('Ladder-org') mappen, damit alte Zustände gültig bleiben.
    if (['Ladder', 'Ladder-alt'].includes(state.get('filterType'))) state.set('filterType', 'Ladder-org');
    // Migration: altes Bool 'filterSeqEnabled' → dreistufiges 'filterEnvTrig'. Das Bool
    // bedeutete NIE "Env aus" – false löste die Env bei JEDEM Trigger voll aus (='each'),
    // true ließ den Sequenzer steuern (='seq'). 1:1-Verhaltenserhalt für alte Zustände.
    if (state.get('filterSeqEnabled') !== undefined) {
        state.set('filterEnvTrig', state.get('filterSeqEnabled') ? 'seq' : 'each');
    }
    // Migration: die früheren per-Modus-Oktaven (baseOct/tempoOct) in den einen globalen
    // baseOctave falten → aktuelle Tonhöhe bleibt beim ersten Laden erhalten.
    {
        const src = state.get('baseSrc');
        const legacy = (src === 'Ton' ? state.get('baseOct') : src === 'Tempo' ? state.get('tempoOct') : 0) | 0;
        if (legacy) {
            state.set('baseOctave', Math.max(-6, Math.min(6, (state.get('baseOctave') | 0) + legacy)));
            state.set('baseOct', 0); state.set('tempoOct', 0);
        }
    }
    // Migration: altes flaches seqStyles {w,h,bg,colFilter,colAmp} → per-Typ getrennt
    // {filter:{w,h,bg,col}, amp:{w,h,bg,col}}. Größe/BG waren früher geteilt, sie werden
    // in BEIDE Typen kopiert; die je Typ eigene Balkenfarbe bleibt erhalten.
    {
        const ss = state.get('seqStyles');
        if (ss && (('colFilter' in ss) || ('colAmp' in ss) || !ss.filter)) {
            const w = ss.w ?? 270, h = ss.h ?? 64, bg = ss.bg ?? '#0e1116';
            state.set('seqStyles', {
                filter: { w, h, bg, col: ss.colFilter ?? 'rgba(90,209,255,1)' },
                amp: { w, h, bg, col: ss.colAmp ?? 'rgba(255,159,90,1)' },
            });
        }
    }
    // Migration: Metronom als Ketten-Knoten in fxOrder aufnehmen (ersetzt metroRoute).
    // Position aus der alten Route ableiten: 'Vor Dist'/'Vor Rev' → vor den Effekt, sonst
    // ans Ende (= parallel). @dpa 20260713.
    {
        const order = (state.get('fxOrder') || []).slice();
        if (!order.includes('Metronom')) {
            const r = state.get('metroRoute');
            const at = r === 'Vor Dist' ? order.indexOf('Distortion')
                : r === 'Vor Rev' ? order.indexOf('Reverb') : -1;
            if (at >= 0) order.splice(at, 0, 'Metronom'); else order.push('Metronom');
            state.set('fxOrder', order);
        }
    }

    // ── Auto-Save: jede Änderung (Sound + Optik) still sichern (leicht entprellt) ──
    let _liveTimer = null;
    const persistLive = () => {
        clearTimeout(_liveTimer);
        _liveTimer = setTimeout(() => {
            try { localStorage.setItem(LIVE_KEY, JSON.stringify(state.toJSON())); } catch { /* Quota o.ä. */ }
        }, 150);
    };
    state.subscribe(persistLive);

    const engine = new TeslaEngine(state);
    const presets = new PresetManager(state, engine);

    const root = document.getElementById('app');
    root.innerHTML = '';

    // Doppelklick auf ein editierbares Zahl-/Textfeld → kompletten Inhalt selektieren.
    document.addEventListener('dblclick', (e) => {
        const t = e.target;
        if (t instanceof HTMLInputElement && (t.type === 'number' || t.type === 'text')) t.select();
    });

    // ── Transport + Ensemble-Snapshot (global) ──
    const presetBar = new PresetBar(engine, presets);
    presetBar.mount(root);

    const metaEditor = new KnobMetaEditor(state);
    // Geänderte Regler-Meta in den State schreiben → wird im Snapshot gesichert.
    metaEditor.onApply = (knob) => {
        const key = knob.id.replace(/^knob_/, '');
        state.set('knobMeta', { ...state.get('knobMeta'), [key]: knob.getMeta() });
    };

    // Element-Settings für die Nicht-Knob-Controls (Selects/Toggles/Readouts, @dpa 20260714).
    // styleTargets: id (data-ctrl-Kennung) → { type, el, applyStyle }. applyStyle stylt das
    // konkrete DOM (typ-spezifisch, s. registerCtrlStyle); das Panel bleibt generisch.
    const elemSettings = new ElementSettings(state);
    const styleTargets = new Map();
    elemSettings.onApply = (id, style) => {
        const cur = { ...state.get('ctrlStyles') };
        if (style && Object.keys(style).length) cur[id] = style; else delete cur[id];
        state.set('ctrlStyles', cur);
    };
    // Ein Control als style-bar registrieren + gespeicherten Style sofort anwenden.
    // Rechtsklick öffnet die Element-Settings (kein Durchfallen auf die Gruppen-Settings,
    // KEINE Wert-Verstellung). @dpa: „RM darf keine Control Values verstellen."
    function registerCtrlStyle(id, type, el, applyStyle, defLabel) {
        styleTargets.set(id, { type, el, applyStyle });
        const saved = (state.get('ctrlStyles') || {})[id];
        if (saved) applyStyle(saved);
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            elemSettings.open({ id, type, el, defLabel, applyStyle });
        });
    }

    const knobsById = new Map();
    const ctrlBindings = new Map();   // key → (data) => UI aktualisieren (Selects/Toggles)
    const ctrlEls = new Map();        // key → DOM-Wrapper (für modusabhängiges Ein-/Ausblenden)
    const keyboard = new Keyboard(state, () => engine.currentFreq, () => engine.baseFreq);
    const baseReadout = document.createElement('div'); // zeigt effektive BaseFrq
    const baseSpeed = document.createElement('div');    // zeigt BpM/Hz/P (Freq-Modus)
    const rateReadout = document.createElement('div');  // Skaler-Rate als Vielfaches der BaseFrq
    const reflCanvas = document.createElement('canvas'); // Reverb-Reflections-Anzeige

    // ── Control-Builder (registrieren sich für den Recall) ──
    // Label-Drag für Controls OHNE Knob (@dpa 20260713): auf dem GANZEN Feld vertikal ziehen
    // ändert den Wert wie ein Regler. Ausgenommen ist das Value-Element selbst (Select/Checkbox
    // → normale Bedienung bleibt) und der e-Mode (dort verschiebt wireCtrlMove die Position).
    // WICHTIG (@dpa 20260714): e.preventDefault() im mousedown – sonst startet der Drag eine
    // TEXT-Selektion des Labels statt einer Wert-Änderung (genau der gemeldete Fehler). Der
    // sonst vom <label> ausgelöste Folge-Klick wird nach echtem Ziehen einmalig geschluckt.
    function wireLabelDrag(wrap, valueEl, makeApply) {
        wrap.addEventListener('mousedown', (e) => {
            if (arranging) return;
            if (e.button !== 0) return;   // nur linke Taste zieht – RM ist reiner Settings-Aufruf
            if (e.target === valueEl || valueEl.contains(e.target)) return;
            e.preventDefault();   // keine Text-Selektion beim Ziehen
            const startY = e.clientY;
            const apply = makeApply();
            let dragged = false;
            const onMove = (ev) => {
                const dy = startY - ev.clientY;
                if (!dragged && Math.abs(dy) < 4) return;   // Slop: kurzer Klick bleibt Klick
                dragged = true; apply(dy);
            };
            const onUp = () => {
                window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
                if (dragged) { const kill = (ce) => { ce.stopPropagation(); ce.preventDefault(); wrap.removeEventListener('click', kill, true); }; wrap.addEventListener('click', kill, true); }
            };
            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        });
    }
    function makeSelect(key) {
        const cfg = SELECTS[key];
        const wrap = document.createElement('label');
        wrap.className = 'select-field';
        const span = document.createElement('span'); span.textContent = cfg.label;
        const sel = document.createElement('select');
        cfg.options.forEach((o) => { const opt = document.createElement('option'); opt.value = o; opt.textContent = o; sel.appendChild(opt); });
        sel.value = state.get(key);
        // MouseOver-Info je nach gewählter Option (falls die Select-Def welche mitgibt,
        // z.B. Env-Trig off/each/seq) – live nachziehen bei Änderung/Recall.
        const applyTitle = () => { if (cfg.optionTitles) sel.title = cfg.optionTitles[sel.value] || ''; };
        applyTitle();
        sel.addEventListener('change', () => { state.set(key, sel.value); applyTitle(); });
        // Vertikal ziehen wechselt die Option (Trefferzone = ganzes Feld außer dem Select).
        span.classList.add('ctrl-label-drag');
        wrap.classList.add('ctrl-label-drag');
        wireLabelDrag(wrap, sel, () => {
            const baseIdx = cfg.options.indexOf(sel.value);
            return (dy) => {
                const idx = Math.max(0, Math.min(cfg.options.length - 1, baseIdx + Math.round(dy / 18)));
                if (cfg.options[idx] !== sel.value) { sel.value = cfg.options[idx]; state.set(key, sel.value); applyTitle(); }
            };
        });
        wrap.appendChild(span); wrap.appendChild(sel);
        wrap.dataset.ctrl = 's:' + key;   // Kennung für den Arrange-Modus
        ctrlBindings.set(key, (data) => { sel.value = data[key]; applyTitle(); });
        ctrlEls.set(key, wrap);
        // Element-Settings (Rechtsklick): Label, Schalter-BG/-VG-Farbe, Schriftgröße.
        registerCtrlStyle('s:' + key, 'select', wrap, (s) => {
            span.textContent = s.label || cfg.label;
            sel.style.background = s.bg || '';
            sel.style.color = s.fg || '';
            sel.style.fontSize = s.size ? s.size + 'px' : '';
        }, cfg.label);
        return wrap;
    }
    function makeToggle(key) {
        const cfg = TOGGLES[key];
        const wrap = document.createElement('label');
        wrap.className = 'select-field toggle-field';
        const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = state.get(key);
        chk.addEventListener('change', () => state.set(key, chk.checked));
        const span = document.createElement('span'); span.textContent = cfg.label;
        // Nach oben ziehen = an, nach unten = aus (wie ein Regler); Trefferzone = ganzes Feld
        // außer der Checkbox. Klick auf die Checkbox bleibt normale Bedienung.
        span.classList.add('ctrl-label-drag');
        wrap.classList.add('ctrl-label-drag');
        wireLabelDrag(wrap, chk, () => (dy) => {
            const want = dy > 10 ? true : dy < -10 ? false : chk.checked;
            if (want !== chk.checked) { chk.checked = want; state.set(key, want); }
        });
        wrap.appendChild(chk); wrap.appendChild(span);
        wrap.dataset.ctrl = 't:' + key;   // Kennung für den Arrange-Modus
        ctrlBindings.set(key, (data) => { chk.checked = !!data[key]; });
        // Element-Settings (Rechtsklick): Label + Label-Position (oben/links/rechts/unten).
        registerCtrlStyle('t:' + key, 'toggle', wrap, (s) => {
            span.textContent = s.label || cfg.label;
            wrap.classList.remove('tgl-label-top', 'tgl-label-bottom', 'tgl-label-left', 'tgl-label-right');
            if (s.labelPos) wrap.classList.add('tgl-label-' + s.labelPos);
        }, cfg.label);
        return wrap;
    }
    function makeKnob(key) {
        const def = KNOBS[key];
        const knob = new Knob({
            id: 'knob_' + key,
            label: def.label, min: def.min, max: def.max, step: def.step ?? 0,
            curve: def.curve, unit: def.unit, decimals: def.decimals, formatValue: def.formatValue,
            value: state.get(key),
            onChange: (val) => state.set(key, val),
            onMetaClick: (k) => metaEditor.open(k),
        });
        knob._defaultMeta = knob.getMeta();   // Original-Range/Kurve für „Zurücksetzen"
        knob.element.dataset.ctrl = 'k:' + key;   // Kennung für den Arrange-Modus
        // Rechtsklick = Settings (@dpa 20260711): öffnet den Meta-Editor dieses Reglers (wie
        // der ⚙ am Knob). stopPropagation, damit NICHT zusätzlich die Gruppen-Settings aufgehen.
        knob.element.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); metaEditor.open(knob); });
        knobsById.set(key, knob);
        ctrlEls.set(key, knob.element);
        return knob;
    }
    // Kleiner Icon-Button (glyph + title) – für die kompakten Preset-Cluster.
    // `kind` (load/save/new/export) gibt ihm eine Aktions-Farbe → klar unterscheidbar.
    function iconBtn(glyph, title, fn, kind = '') {
        const b = document.createElement('button'); b.className = 'pb-btn pb-icon' + (kind ? ' pb-ic-' + kind : '');
        b.textContent = glyph; b.title = title; b.setAttribute('aria-label', title);
        b.addEventListener('click', fn); return b;
    }
    // Flacher, aligned Preset-Cluster (gleiche Optik wie Snapshot/Optik).
    function presetCluster(label, sel, icons) {
        const box = document.createElement('div'); box.className = 'pb-cluster';
        const lab = document.createElement('span'); lab.className = 'pb-cluster-label'; lab.textContent = label;
        box.appendChild(lab); box.appendChild(sel);
        icons.forEach(([g, t, fn, kind]) => box.appendChild(iconBtn(g, t, fn, kind)));
        return box;
    }
    // Skaler-Rate als Bruch k/l der BaseFrq: bestFraction findet das k/l (mit den
    // Maxima rateNumMax/rateDenMax), das rate/base am besten trifft → rate = base·k/l,
    // im Rate-Bereich 0.05..4 Hz geklemmt. Idempotent (self-stabilisierend).
    function rateFrac(base, rate) {
        return bestFraction(rate / base, state.get('rateNumMax'), state.get('rateDenMax'));
    }
    function quantRate(base, rate) {
        if (!base || base <= 0) return rate;
        const { k, l } = rateFrac(base, rate);
        // Auf die AKTUELLE Rate-Regler-Range klemmen (via Meta erweiterbar), nicht auf
        // die feste Default-Range – sonst sprang die Rate bei Quant hart auf 4 Hz.
        const knob = knobsById.get('pitchRate');
        const lo = knob ? knob.min : KNOBS.pitchRate.min;
        const hi = knob ? knob.max : KNOBS.pitchRate.max;
        return Math.min(hi, Math.max(lo, base * k / l));
    }
    // ≈-Knopf: einmalig auf den besten Bruch des Verhältnisses rasten.
    function snapRateToBase() { state.set('pitchRate', quantRate(engine.baseFreq, state.get('pitchRate'))); }
    // ×ganze aktiv: den WERT (nicht nur die Anzeige) fortlaufend gerastet halten –
    // bei jeder Base- oder Rate-Änderung. Behebt „Anzeige ganzzahlig, Wert float".
    function syncRateQuant() {
        if (!state.get('rateQuant')) return;
        state.set('pitchRate', quantRate(engine.baseFreq, state.get('pitchRate')));
    }
    // Keys, die das Rate↔Base-Verhältnis beeinflussen → Nachrasten auslösen.
    const RATE_QUANT_KEYS = new Set(['pitchRate', 'rateQuant', 'rateNumMax', 'rateDenMax', 'baseSrc', 'baseHz', 'baseNote', 'baseBand', 'bpm']);
    // Keys, deren Umschalten Controls ein-/ausblendet → Gruppenhöhe ändert sich.
    const VIS_TOGGLE_KEYS = new Set(['filterEnabled', 'filterType', 'lpMode', 'reverbEnabled', 'distEnabled', 'distMode', 'metroEnabled', 'metroCutoffQuant', 'oscEngine', 'pitchWave', 'baseSrc', 'gateEnabled', 'baseTestOn']);
    function makeRateReadout() {
        const bar = document.createElement('div'); bar.className = 'group-extra rate-readout';
        rateReadout.className = 'rate-mult';
        // 'Quant'-Schalter (ersetzt den ≈-Button): AN = Rate auf besten Bruch k/l rasten
        // und als k/l anzeigen, AUS = freie Rate als Dezimal-Vielfaches.
        const q = makeToggle('rateQuant');
        q.title = 'Rate auf den besten Bruch k/l der BaseFrq quantisieren (Maxima: k max / l max)';
        bar.appendChild(rateReadout); bar.appendChild(q);
        return bar;
    }
    // Refresh-Hooks der Preset-Menüs (vom Recall aufrufbar). Bewusst HIER früh
    // deklariert (vor makeLayoutBar-Aufruf) – sonst TDZ ('let' vor Initialisierung).
    let scaleRefresh = () => {};
    let layoutRefresh = () => {};
    let p2Refresh = () => {};
    let p2Bar = null;   // Referenz für Sichtbarkeit (nur im skal2-Modus zeigen)
    let fxChainRender = () => {};

    // Skala-Presets (laden/sichern) – gehören in die Skaler-Gruppe.
    // Die getroffene Auswahl wird in der Optik gemerkt (state.scaleSel) → Recall/Reset-fest.
    function makeScaleBar() {
        const sel = document.createElement('select'); sel.className = 'pb-select';
        const refresh = () => {
            const want = state.get('scaleSel');
            const exists = want && presets.listScales().some((s) => s.name === want);
            sel.innerHTML = '';
            // Platzhalter trägt den geladenen Namen (↻ Name); Box bleibt auf Index 0, damit
            // ein ERNEUTES Wählen desselben Eintrags wieder feuert und neu lädt (@dpa 20260713).
            const ph = document.createElement('option'); ph.textContent = exists ? `↻ ${want}` : '— Skala —'; sel.appendChild(ph);
            presets.listScales().forEach((it) => { const o = document.createElement('option'); o.textContent = it.name; sel.appendChild(o); });
            sel.selectedIndex = 0;
        };
        scaleRefresh = refresh;   // vom Recall aufrufbar
        refresh();
        // Auswahl LÄDT direkt (wie Combo) und wird gemerkt – kein separater ↺-Button mehr.
        sel.addEventListener('change', () => {
            const i = sel.selectedIndex - 1;
            if (i >= 0) { state.set('scaleSel', sel.value); presets.recallScale(i); }
            else state.set('scaleSel', '');
            refresh();
        });
        const curIdx = () => { const w = state.get('scaleSel'); return w ? presets.listScales().findIndex((s) => s.name === w) : -1; };
        const bar = presetCluster('Skala', sel, [
            ['✎', 'Geladene Skala mit aktueller Maske überschreiben (Update)', () => { const i = curIdx(); if (i >= 0) presets.updateScale(i); }, 'save'],
            ['＋', 'Als neue Skala speichern', () => { const name = prompt('Skalen-Name?', ''); if (name !== null) { const list = presets.saveScale(name); state.set('scaleSel', name || (list[list.length - 1] && list[list.length - 1].name) || ''); refresh(); } }, 'new'],
            ['🗑', 'Geladene Skala löschen', () => { const i = curIdx(), w = state.get('scaleSel'); if (i >= 0 && confirm('Skala „' + w + '" löschen?')) { presets.deleteScale(i); state.set('scaleSel', ''); refresh(); } }, 'del'],
        ]);
        bar.classList.add('group-extra');
        return bar;
    }

    // P2 = die 12 skal2-Slots als benanntes Bündel (speichern/laden wie eine Skala,
    // nur der ganze Satz auf einmal). Nur im skal2-Modus sichtbar. Auswahl gemerkt (p2Sel).
    function makeP2Bar() {
        const sel = document.createElement('select'); sel.className = 'pb-select';
        const refresh = () => {
            const want = state.get('p2Sel');
            const exists = want && presets.listP2().some((s) => s.name === want);
            sel.innerHTML = '';
            const ph = document.createElement('option'); ph.textContent = exists ? `↻ ${want}` : '— P2 —'; sel.appendChild(ph);
            presets.listP2().forEach((it) => { const o = document.createElement('option'); o.textContent = it.name; sel.appendChild(o); });
            sel.selectedIndex = 0;
        };
        p2Refresh = refresh; refresh();
        sel.addEventListener('change', () => {
            const i = sel.selectedIndex - 1;
            if (i >= 0) { state.set('p2Sel', sel.value); presets.recallP2(i); }
            else state.set('p2Sel', '');
            refresh();
        });
        const curIdx = () => { const w = state.get('p2Sel'); return w ? presets.listP2().findIndex((s) => s.name === w) : -1; };
        const bar = presetCluster('P2', sel, [
            ['✎', 'Geladenes P2 mit den 12 aktuellen Slots überschreiben (Update)', () => { const i = curIdx(); if (i >= 0) presets.updateP2(i); }, 'save'],
            ['＋', 'Die 12 Slots als neues P2 speichern', () => { const name = prompt('P2-Name?', ''); if (name !== null) { const list = presets.saveP2(name); state.set('p2Sel', name || (list[list.length - 1] && list[list.length - 1].name) || ''); refresh(); } }, 'new'],
            ['🗑', 'Geladenes P2 löschen', () => { const i = curIdx(), w = state.get('p2Sel'); if (i >= 0 && confirm('P2 „' + w + '" löschen?')) { presets.deleteP2(i); state.set('p2Sel', ''); refresh(); } }, 'del'],
        ]);
        bar.classList.add('group-extra');
        bar.style.display = state.get('skal2On') ? '' : 'none';
        p2Bar = bar;
        return bar;
    }

    // Master-Vol (global) – sitzt jetzt in der Kopfzeile (Zeile 1, @dpa 20260713: die
    // vorher fast leere erste Zeile bekommt Inhalt). DC-Block bleibt unten in der
    // Transport-Zeile (Reihenfolge Start·Snapshot·Kette·DC), s. hdrRight-Aufbau unten.
    function makeMasterVolBar() {
        const bar = document.createElement('div'); bar.className = 'master-inline';
        // Volume als flacher Slider (statt Knob → spart Höhe). Label „Master Vol" in EINER
        // Zeile ÜBER dem Fader (@dpa 20260713) – kein separates „MASTER" mehr davor.
        const vol = document.createElement('input'); vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01;
        vol.className = 'mi-vol'; vol.value = state.get('masterVol');
        vol.addEventListener('input', () => state.set('masterVol', parseFloat(vol.value)));
        ctrlBindings.set('masterVol', (data) => { vol.value = data.masterVol; });
        const volWrap = document.createElement('label'); volWrap.className = 'pb-field';
        const vlab = document.createElement('span'); vlab.className = 'mi-title'; vlab.textContent = 'Master Vol'; volWrap.appendChild(vlab); volWrap.appendChild(vol);
        bar.appendChild(volWrap);
        return bar;
    }

    // Kette (Patchbay, @dpa 20260713): Quellen (OSC fest · Metronom ziehbar) mit Out•,
    // Effekte (Filter/Dist/Reverb) mit •in/out•, Ziele (Oscillator/Spectrum/Debug) mit •in.
    // Die ziehbaren Ketten-Knoten stehen in state.fxOrder; ihre Reihenfolge bestimmt die
    // Signalkette UND wo das Metronom einspeist (Route-Select entfällt). Bei Platzmangel
    // scrollt die Zeile; „⤢ alles" bricht sie stattdessen um (zeigt alles ohne Scrollen).
    const EFFECTS = new Set(['Filter', 'Distortion', 'Reverb']);
    const TARGETS = ['Oscillator', 'Spectrum', 'Debug'];   // Ziele = Anzeigen/Abgriffe (•in)
    let fxShowAll = false;
    function makeFxChainBar() {
        const wrap = document.createElement('div'); wrap.className = 'fx-chain-wrap';
        const lab = document.createElement('span'); lab.className = 'fx-chain-lab'; lab.textContent = 'Kette';
        const showAllBtn = iconBtn('⤢', 'Alles zeigen (umbrechen statt scrollen)', () => { fxShowAll = !fxShowAll; wrap.classList.toggle('fx-showall', fxShowAll); showAllBtn.classList.toggle('on', fxShowAll); });
        showAllBtn.classList.add('fx-showall-btn');
        const bar = document.createElement('div'); bar.className = 'fx-chain';
        let dragName = null;
        const clearMarks = () => bar.querySelectorAll('.fx-drop-mark').forEach((c) => c.classList.remove('fx-drop-mark'));
        const arrow = () => { const a = document.createElement('span'); a.className = 'fx-arrow'; a.textContent = '→'; bar.appendChild(a); };
        // Fester Knoten (Quelle/Ziel) – nicht ziehbar, mit Port-Punkten.
        const fixedNode = (name, kind) => {   // kind: 'src' | 'dst'
            const n = document.createElement('span'); n.className = 'fx-node fx-' + kind; n.dataset.node = name;
            n.innerHTML = (kind === 'dst' ? '<i class="fx-port fx-in"></i>' : '') + `<span class="fx-node-lab">${name}</span>` + (kind === 'src' ? '<i class="fx-port fx-out"></i>' : '');
            return n;
        };
        const render = () => {
            bar.innerHTML = '';
            // Quelle OSC (fest, immer Kopf)
            bar.appendChild(fixedNode('OSC', 'src'));
            const order = state.get('fxOrder') || [];
            order.forEach((name) => {
                arrow();
                const isEff = EFFECTS.has(name);
                const chip = document.createElement('span');
                chip.className = 'fx-node fx-chip ' + (isEff ? 'fx-eff' : 'fx-src');
                chip.dataset.fx = name; chip.draggable = true;
                chip.title = isEff ? 'Effekt – ziehen zum Umsortieren' : 'Quelle Metronom – ziehen; Position bestimmt, wo es in die Kette einspeist (ganz hinten = parallel)';
                chip.innerHTML = (isEff ? '<i class="fx-port fx-in"></i>' : '') + `<span class="fx-node-lab">${name}</span><i class="fx-port fx-out"></i>`;
                chip.addEventListener('dragstart', (e) => { dragName = name; chip.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', name); } catch { /* noop */ } });
                chip.addEventListener('dragend', () => { dragName = null; chip.classList.remove('drag'); clearMarks(); });
                chip.addEventListener('dragover', (e) => { e.preventDefault(); if (dragName && dragName !== name) { clearMarks(); chip.classList.add('fx-drop-mark'); } });
                chip.addEventListener('dragleave', () => chip.classList.remove('fx-drop-mark'));
                chip.addEventListener('drop', (e) => {
                    e.preventDefault(); clearMarks();
                    if (!dragName || dragName === name) return;
                    const arr = (state.get('fxOrder') || []).filter((x) => x !== dragName);
                    arr.splice(arr.indexOf(name), 0, dragName);   // vor das Ziel einsetzen
                    state.set('fxOrder', arr);
                });
                bar.appendChild(chip);
            });
            arrow();
            // „Out" = Master; zugleich End-Ablage (hier fallen lassen = ans Kettenende).
            const out = document.createElement('span'); out.className = 'fx-node fx-dst fx-out'; out.dataset.node = 'Out';
            out.innerHTML = '<i class="fx-port fx-in"></i><span class="fx-node-lab">Out</span>';
            out.addEventListener('dragover', (e) => { if (dragName) { e.preventDefault(); clearMarks(); out.classList.add('fx-drop-mark'); } });
            out.addEventListener('dragleave', () => out.classList.remove('fx-drop-mark'));
            out.addEventListener('drop', (e) => { e.preventDefault(); clearMarks(); if (!dragName) return; const arr = (state.get('fxOrder') || []).filter((x) => x !== dragName); arr.push(dragName); state.set('fxOrder', arr); });
            bar.appendChild(out);
            // Ziele (Anzeigen/Abgriffe am Master) – fest, nur zur Orientierung.
            const tsep = document.createElement('span'); tsep.className = 'fx-arrow fx-arrow-split'; tsep.textContent = '⇒'; bar.appendChild(tsep);
            TARGETS.forEach((t) => bar.appendChild(fixedNode(t, 'dst')));
        };
        fxChainRender = render; render();
        wrap.appendChild(lab); wrap.appendChild(bar); wrap.appendChild(showAllBtn);
        return wrap;
    }
    presetBar.element.appendChild(makeFxChainBar());
    // DC-Block ans Ende der Transport-Zeile (Reihenfolge Start·Snapshot·Kette·DC, @dpa 20260713).
    presetBar.element.appendChild(makeToggle('dcBlock'));

    // ── Optisches Layout-System (Gruppen-Stil/-Position/-Klappen) – eigenständig ──
    // Beim ersten Start optische Einstellungen aus Snapshot "verschiebetest" übernehmen.
    presets.seedLayoutsFromSnapshot('verschiebetest');
    // Optik-Speicher-Menü ist ausgeblendet: statt manueller Slots wird die Optik bei
    // jeder Änderung automatisch in EIN Layout "default" geschrieben (s. persistOptik).
    // makeLayoutBar() bleibt erhalten (Wiedereinblenden jederzeit möglich).
    const OPTIK_KEYS = new Set(PresetManager.LAYOUT_KEYS);
    let _optikTimer = null;
    const persistOptik = () => {
        clearTimeout(_optikTimer);
        _optikTimer = setTimeout(() => {
            try { presets.saveOrUpdateLayout('default'); } catch { /* Quota o.ä. */ }
        }, 300);
    };
    state.subscribe((key) => { if (key === '*' || OPTIK_KEYS.has(key)) persistOptik(); });

    // ── Kopfzeile Zeile 1 (rechts): Master Vol · Settings · CPU · e-Mode (@dpa 20260713:
    //    zieht in die vorher fast leere erste Zeile, Zeile 2 bleibt Start·Snapshot·Kette·DC). ──
    const settingsBtn = iconBtn('⚙', 'Einstellungen', () => openSettings());
    settingsBtn.classList.add('settings-btn');
    const arrBtn = iconBtn('⇄', 'Alle Elemente in Gruppen frei anordnen (experimentell) – dann per Drag umsortieren', () => setArranging(!arranging));
    arrBtn.classList.add('arrange-btn');
    const cpuEl = document.createElement('span'); cpuEl.className = 'hdr-cpu'; cpuEl.textContent = 'CPU –';
    const hdrRight = document.createElement('div'); hdrRight.className = 'topbar-right';
    hdrRight.appendChild(makeMasterVolBar());
    hdrRight.appendChild(settingsBtn); hdrRight.appendChild(cpuEl); hdrRight.appendChild(arrBtn);
    document.querySelector('.topbar').appendChild(hdrRight);

    // Audio-Last: echte Render-Kapazität des AudioContext (nur Chrome), sonst grobe UI-Last.
    let cpuLoad = 0, cpuHasAudio = false;
    (function initCpu() {
        const rc = engine.ctx.renderCapacity;
        if (rc && typeof rc.start === 'function') {
            try {
                rc.addEventListener('update', (e) => { cpuLoad = e.averageLoad || 0; });
                rc.start({ updateInterval: 0.5 });
                cpuHasAudio = true;
            } catch { /* nicht verfügbar → UI-Fallback im Frame-Loop */ }
        }
    })();

    // ── Ausgangs-Pegelmeter: fest an der rechten Kante, hoch & schmal, mit dB-Skala ──
    const levelMeter = document.createElement('canvas'); levelMeter.className = 'level-meter';
    levelMeter.width = 46; levelMeter.height = 340; levelMeter.title = 'Ausgangspegel (dBFS, Peak-Hold)';
    document.body.appendChild(levelMeter);
    const METER_DB_MIN = -48;
    const METER_TICKS = [0, -6, -12, -24, -36, -48];
    const dbToY = (db, H) => Math.round(H * (1 - (Math.max(METER_DB_MIN, Math.min(0, db)) - METER_DB_MIN) / -METER_DB_MIN));
    let meterPeak = 0, meterHold = 0, meterHoldAge = 0;
    function drawMeter() {
        const buf = engine.master.getWaveform();
        let peak = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; }
        meterPeak = Math.max(peak, meterPeak * 0.85);              // Ballistik (sanfter Abfall)
        if (peak >= meterHold) { meterHold = peak; meterHoldAge = 0; } // Peak-Hold
        else if (++meterHoldAge > 45) meterHold *= 0.92;
        const cx = levelMeter.getContext('2d');
        const W = levelMeter.width, H = levelMeter.height, barW = 16, x0 = 4;
        cx.clearRect(0, 0, W, H);
        cx.fillStyle = '#0e1116'; cx.fillRect(x0, 0, barW, H);
        // Füllung bis zum aktuellen Pegel (grün→gelb→rot).
        const y = dbToY(20 * Math.log10(Math.max(1e-4, meterPeak)), H);
        const grad = cx.createLinearGradient(0, H, 0, 0);
        grad.addColorStop(0, '#6ee7a8'); grad.addColorStop(0.75, '#ffcf7a'); grad.addColorStop(0.95, '#ff5a5a');
        cx.fillStyle = grad; cx.fillRect(x0, y, barW, H - y);
        // Peak-Hold-Linie.
        const hy = dbToY(20 * Math.log10(Math.max(1e-4, meterHold)), H);
        cx.fillStyle = '#e6ecf5'; cx.fillRect(x0, Math.max(0, hy - 1), barW, 2);
        // dB-Markierungen mit Beschriftung.
        cx.strokeStyle = '#2a2f3a'; cx.lineWidth = 1;
        cx.fillStyle = '#8a93a3'; cx.font = '9px ui-sans-serif, system-ui, sans-serif'; cx.textBaseline = 'middle';
        for (const tck of METER_TICKS) {
            const ty = dbToY(tck, H);
            cx.beginPath(); cx.moveTo(x0, ty + 0.5); cx.lineTo(x0 + barW, ty + 0.5); cx.stroke();
            cx.fillText(String(tck), x0 + barW + 3, Math.max(6, Math.min(H - 6, ty)));
        }
        cx.strokeStyle = '#2a2f3a'; cx.strokeRect(x0 + 0.5, 0.5, barW, H - 1);
    }

    let _settingsOverlay = null;
    function closeSettings() { if (_settingsOverlay) { _settingsOverlay.remove(); _settingsOverlay = null; } }
    function openSettings() {
        closeSettings();
        const ov = document.createElement('div'); ov.className = 'settings-overlay';
        // Klick auf den abgedunkelten Hintergrund schließt.
        ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeSettings(); });
        const win = document.createElement('div'); win.className = 'settings-window';

        const head = document.createElement('div'); head.className = 'sw-head';
        const t = document.createElement('span'); t.textContent = 'Einstellungen'; head.appendChild(t);
        const x = iconBtn('✕', 'Schließen', closeSettings); head.appendChild(x);
        win.appendChild(head);

        const note = document.createElement('p'); note.className = 'sw-note';
        note.textContent = 'Auto-Restore ist aktiv: Sound- und Optik-Zustand werden automatisch '
            + 'gesichert und beim Neuladen/Aktualisieren wiederhergestellt.';
        win.appendChild(note);

        const acts = document.createElement('div'); acts.className = 'sw-actions';
        const reset = document.createElement('button'); reset.className = 'pb-btn';
        reset.textContent = 'Auf Werkseinstellung zurücksetzen';
        reset.title = 'Gesicherten Live-Zustand verwerfen und Defaults laden';
        reset.addEventListener('click', () => {
            if (!confirm('Aktuellen Zustand verwerfen und auf Werkseinstellung zurücksetzen?')) return;
            try { localStorage.removeItem(LIVE_KEY); } catch { /* noop */ }
            state.loadFromJSON({});   // → DEFAULTS, UI folgt über '*' (Auto-Save sichert die Defaults neu)
            closeSettings();
        });
        acts.appendChild(reset);
        win.appendChild(acts);

        ov.appendChild(win);
        document.body.appendChild(ov);
        _settingsOverlay = ov;
    }

    function makeLayoutBar() {
        const sel = document.createElement('select'); sel.className = 'pb-select';
        const refresh = () => {
            sel.innerHTML = '';
            const ph = document.createElement('option'); ph.textContent = '— Layout —'; sel.appendChild(ph);
            presets.listLayouts().forEach((it) => { const o = document.createElement('option'); o.textContent = it.name; sel.appendChild(o); });
            const want = state.get('layoutSel');
            if (want && [...sel.options].some((o) => o.textContent === want)) sel.value = want;
        };
        layoutRefresh = refresh;
        refresh();
        sel.addEventListener('change', () => state.set('layoutSel', sel.selectedIndex > 0 ? sel.value : ''));
        return presetCluster('Optik', sel, [
            ['↺', 'Layout laden (Recall)', () => { const i = sel.selectedIndex - 1; if (i >= 0) presets.recallLayout(i); }, 'load'],
            ['✎', 'Ausgewähltes Layout mit aktueller Optik überschreiben (Update)', () => { const i = sel.selectedIndex - 1; if (i >= 0) presets.updateLayout(i); }, 'save'],
            ['＋', 'Als neues Layout speichern', () => { const name = prompt('Layout-Name?', ''); if (name !== null) { presets.saveLayout(name); refresh(); if (name) state.set('layoutSel', name); } }, 'new'],
            ['⤓', 'Layout exportieren (JSON)', () => presets.exportLayout(sel.value), 'export'],
            ['🗑', 'Ausgewähltes Layout löschen', () => { const i = sel.selectedIndex - 1; if (i >= 0 && confirm('Layout „' + sel.value + '" löschen?')) { presets.deleteLayout(i); state.set('layoutSel', ''); refresh(); } }, 'del'],
        ]);
    }

    // ── Panel: Gruppen-Boxen mit allen zugehörigen Controls ──
    const panel = document.createElement('div');
    panel.className = 'panel';
    const groupEls = new Map();   // Gruppenname → { g, body, title, collapseBtn, knobRow }
    const seqWidgets = [];        // Step-Sequenzer-Widgets (Filter/Amp) für refresh/tick
    let dragName = null;
    let arranging = false;        // experimenteller Arrange-Modus (Controls in Gruppen)
    let ctrlDrag = null;          // { row, el } während eines Control-Drags
    const arrangeRows = [];       // registrierte Sortier-Zeilen: { el, rowId }
    // ── Freies Verschieben (e-Mode): Raster + Auswahl + Pfeiltasten ──
    const GRID = 10;              // Raster-Schrittweite in px (Shift = 1px fein)
    // Auf das Raster rasten, ABER den (durch Shift entstandenen) Offset beibehalten:
    // gerastet wird relativ zu `rem` (dem Nachkomma-Rest im Raster). `fine` (Shift) = 1px.
    const snapAxis = (v, rem, fine) => fine ? Math.round(v) : Math.round((v - rem) / GRID) * GRID + rem;
    const mod = (v, m) => ((v % m) + m) % m;
    const freeGroups = new Set(); // Gruppen im Free-Canvas-Modus (Laufzeit; früh deklariert wg. TDZ)
    // e-Mode-Auswahl als MENGE (Block E, Multi-Select): enthält entweder mehrere Controls
    // ODER genau eine Gruppe – Gruppen haben eigene Positions-Logik und sind nicht mit
    // Controls mischbar.
    const selected = new Set();   // aktuell im e-Mode ausgewählte Elemente
    function clearSelection() { for (const s of selected) s.classList.remove('arrange-selected'); selected.clear(); }
    function addSelected(el) { if (el && !selected.has(el)) { selected.add(el); el.classList.add('arrange-selected'); } }
    function removeSelected(el) { if (selected.has(el)) { selected.delete(el); el.classList.remove('arrange-selected'); } }
    // additive = Shift/Cmd-Klick → Auswahl erweitern/toggeln; sonst frische Einzelauswahl.
    // el === null hebt die ganze Auswahl auf.
    function setSelected(el, additive = false) {
        if (!el) { clearSelection(); return; }
        const isGroup = el.classList.contains('group');
        const hasGroup = [...selected].some((s) => s.classList.contains('group'));
        // Gruppen immer einzeln; nicht additiv mit Controls kombinierbar.
        if (isGroup || hasGroup || !additive) { clearSelection(); addSelected(el); return; }
        // additiv unter Controls: an-/abwählen (Auswahl wächst/schrumpft).
        if (selected.has(el)) removeSelected(el); else addSelected(el);
    }
    for (const grp of GROUPS) {
        const g = document.createElement('div');
        g.className = 'group';
        g.dataset.group = grp.name;

        // Titelleiste: Klapp-Button + (ziehbarer) Name + Settings-Knopf
        const bar = document.createElement('div'); bar.className = 'group-title-bar';
        const collapseBtn = document.createElement('button'); collapseBtn.className = 'group-collapse'; collapseBtn.textContent = '▾'; collapseBtn.title = 'Ein-/Ausklappen';
        const h = document.createElement('div'); h.className = 'group-title'; h.textContent = grp.name; h.title = 'Ziehen zum Verschieben';
        const setBtn = document.createElement('button'); setBtn.className = 'group-settings-btn'; setBtn.textContent = '⚙'; setBtn.title = 'Gruppen-Einstellungen';
        bar.appendChild(collapseBtn); bar.appendChild(h); bar.appendChild(setBtn);
        g.appendChild(bar);

        const body = document.createElement('div'); body.className = 'group-body';

        // Selects + Toggles (+ optional inline-Regler) oben in der Gruppe
        const selKeys = grp.selects || [], togKeys = grp.toggles || [], inlineKeys = grp.inlineKnobs || [];
        let ctrls = null;
        if (selKeys.length || togKeys.length || inlineKeys.length) {
            ctrls = document.createElement('div'); ctrls.className = 'group-ctrls';
            selKeys.forEach((k) => ctrls.appendChild(makeSelect(k)));
            togKeys.forEach((k) => ctrls.appendChild(makeToggle(k)));
            // Inline-Regler (z.B. Skaler-Seed) direkt neben den Selects statt in der Regler-Reihe.
            inlineKeys.forEach((k) => makeKnob(k).mount(ctrls));
            body.appendChild(ctrls);
        }

        // Regler
        const knobRow = document.createElement('div'); knobRow.className = 'knob-row';
        (grp.knobs || []).forEach((k) => makeKnob(k).mount(knobRow));

        // Länge + Satelliten (P→Len) als kompakte Einheit. Das Cluster wandert als
        // Ganzes in der Reglerreihe (data-ctrl='sat'); die Satelliten (tief/hoch)
        // bilden INNEN eine eigene Sortier-Zeile → einzeln verschiebbar.
        if (grp.lengthSat) {
            const cluster = document.createElement('div'); cluster.className = 'sat-cluster';
            cluster.dataset.ctrl = 'sat';   // als eine Einheit im Arrange-Modus verschiebbar
            makeKnob(grp.lengthSat.main).mount(cluster);
            const sats = document.createElement('div'); sats.className = 'sat-knobs';
            grp.lengthSat.sats.forEach((k) => { const kn = makeKnob(k); kn.element.classList.add('knob-sat'); kn.mount(sats); });
            cluster.appendChild(sats);
            knobRow.appendChild(cluster);
            registerArrange(sats, grp.name + ':sats');   // tief/hoch untereinander umsortierbar
        }
        body.appendChild(knobRow);

        if (grp.scale) {
            // Alle Nicht-Regler-Einheiten sind ebenfalls frei verschiebbar (data-ctrl-Tag).
            body.appendChild(makeMovable(makeRateReadout(), 'u:rate'));
            keyboard.mount(body); makeMovable(keyboard.element, 'u:keyboard');
            body.appendChild(makeMovable(makeScaleBar(), 'u:scale'));
            body.appendChild(makeMovable(makeP2Bar(), 'u:p2'));
        }
        if (grp.baseFrq) {
            baseReadout.className = 'group-extra base-readout';
            baseSpeed.className = 'group-extra base-speed';
            body.appendChild(makeMovable(baseReadout, 'u:baseRead')); body.appendChild(makeMovable(baseSpeed, 'u:baseSpeed'));
            // Element-Settings (Rechtsklick) für die puren Text-Readouts: Textgröße/-farbe,
            // Feldbreite. Style bleibt am Element, nur der textContent wird live überschrieben.
            const readoutStyle = (el) => (s) => {
                el.style.fontSize = s.fontSize ? s.fontSize + 'px' : '';
                el.style.width = s.boxSize ? s.boxSize + 'px' : '';
                el.style.color = s.fg || '';
            };
            registerCtrlStyle('u:baseRead', 'readout', baseReadout, readoutStyle(baseReadout), 'Base-Readout');
            registerCtrlStyle('u:baseSpeed', 'readout', baseSpeed, readoutStyle(baseSpeed), 'Base-Speed');
        }
        if (grp.reverb) {
            reflCanvas.className = 'refl-canvas';
            reflCanvas.width = Math.max(80, state.get('reflW') | 0);
            reflCanvas.height = Math.max(24, state.get('reflH') | 0);
            const wrap = document.createElement('div'); wrap.className = 'group-extra refl-wrap';
            const rBtn = iconBtn('⚙', 'Reflections-Anzeige: Größe & Farben', (e) => openReflSettings(e.currentTarget));
            rBtn.classList.add('refl-settings-btn');
            wrap.appendChild(reflCanvas); wrap.appendChild(rBtn);
            body.appendChild(makeMovable(wrap, 'u:refl'));
        }
        if (grp.seq) {
            const w = new StepSeqUI(state, engine, grp.seq);
            makeMovable(w.element, 'u:seq' + grp.seq);
            seqWidgets.push(w);
            // Filter-Sequenzer hängt an Env-Trig ('seq') statt einem eigenen Toggle →
            // generisch über setVis()/ctrlEls sichtbar/unsichtbar (Block B).
            if (grp.seq === 'filter') ctrlEls.set('filterSeqWidget', w.element);
            body.appendChild(w.element);
        }
        if (grp.debug) {
            const dbg = new DebugPanel(state, engine);
            dbg.mount(body);
            if (body.lastElementChild) makeMovable(body.lastElementChild, 'u:debug');
        }
        g.appendChild(body);

        // Klappen / Settings
        collapseBtn.addEventListener('click', () => setGroupCollapsed(grp.name, !groupCollapsed(grp.name)));
        setBtn.addEventListener('click', () => openGroupSettings(grp.name, setBtn));
        // Rechtsklick irgendwo auf der Gruppe = Gruppen-Settings an der Mausposition
        // (@dpa 20260711: „rechte Maustaste als Settings-Aufruf"). Knobs fangen es selbst ab
        // (eigener Meta-Editor). Gilt auch im e-Mode.
        g.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const at = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 }) };
            openGroupSettings(grp.name, at);
        });
        // Verschieben per Pointer-Drag an der Titelleiste → FESTE x/y-Position (Optik).
        // Ein Drag, der auf einem Button (⚙/▾) beginnt, wird NICHT gestartet, damit der
        // Button-Klick (auch im e-Mode) erreichbar bleibt.
        bar.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            e.preventDefault();
            setSelected(g);   // im e-Mode auswählbar → Pfeiltasten bewegen diese Gruppe
            const pr = panel.getBoundingClientRect();
            const gr = g.getBoundingClientRect();
            const ox = e.clientX - gr.left, oy = e.clientY - gr.top;   // Greifpunkt-Offset
            // Raster-Phase aus der Start-Position (behält einen per-Shift gesetzten Offset).
            let remX = mod(parseFloat(g.style.left) || 0, GRID), remY = mod(parseFloat(g.style.top) || 0, GRID);
            g.classList.add('dragging');
            const onMove = (ev) => {
                let nx = Math.max(0, ev.clientX - pr.left - ox + panel.scrollLeft);
                let ny = Math.max(0, ev.clientY - pr.top - oy + panel.scrollTop);
                if (ev.shiftKey) { nx = Math.round(nx); ny = Math.round(ny); remX = mod(nx, GRID); remY = mod(ny, GRID); }
                else { nx = Math.max(0, snapAxis(nx, remX, false)); ny = Math.max(0, snapAxis(ny, remY, false)); }
                g.style.left = nx + 'px'; g.style.top = ny + 'px';
            };
            const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                g.classList.remove('dragging');
                const pos = { ...state.get('groupPos') };
                pos[grp.name] = { x: parseFloat(g.style.left) || 0, y: parseFloat(g.style.top) || 0 };
                state.set('groupPos', pos);   // Optik: Position bleibt fest
                sizePanel();
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });

        groupEls.set(grp.name, { g, body, title: h, collapseBtn });
        // Arrange-Zeilen: Selects/Toggles-Zeile + Regler-Zeile. Bewusst KEINE
        // Container-Blöcke mehr (die erzeugten störende „übergeordnete" Rahmen).
        // Beide Zeilen brechen um (flex-wrap) → bei schmaler Gruppe automatisch
        // mehrzeilig, in ALLEN Gruppen gleich (ersetzt manuelles Zeilen-Splitten).
        if (ctrls) registerArrange(ctrls, grp.name + ':ctrls');
        registerArrange(knobRow, grp.name + ':knobs');
        panel.appendChild(g);
    }
    root.appendChild(panel);

    // ── Gruppen: FESTE Positionen / Klappen / Farben (im State persistiert) ──
    const GROUP_GAP = 12;
    // Gruppen OHNE gespeicherte Position einmal ins Raster fließen (Shelf-Pack): links→
    // rechts, bei Panelbreite umbrechen. Neue Gruppen landen unter den bestehenden.
    function autoFlow(pos, names) {
        const panelW = panel.clientWidth || (window.innerWidth - 80);
        let startY = 0;
        for (const [n, e] of groupEls) if (pos[n]) startY = Math.max(startY, (pos[n].y || 0) + e.g.offsetHeight + GROUP_GAP);
        let x = 0, y = Object.keys(pos).length ? startY : 0, rowH = 0;
        for (const name of names) {
            const e = groupEls.get(name); if (!e) continue;
            const w = e.g.offsetWidth, h = e.g.offsetHeight;
            if (x > 0 && x + w > panelW) { x = 0; y += rowH + GROUP_GAP; rowH = 0; }
            pos[name] = { x, y };
            x += w + GROUP_GAP; rowH = Math.max(rowH, h);
        }
        return pos;
    }
    // Jede Gruppe an ihre feste x/y-Position setzen. Fehlende Positionen einmal einfließen
    // lassen und persistieren. Ein-/Ausblenden von Controls verschiebt danach NICHTS mehr.
    function applyGroupPositions() {
        const pos = { ...state.get('groupPos') };
        // Reihenfolge fürs initiale Fließen (groupOrder, sonst Einbau-Reihenfolge).
        const stored = state.get('groupOrder') || [];
        const order = [...groupEls.keys()].sort((a, b) => ((stored.indexOf(a) + 1 || 99) - (stored.indexOf(b) + 1 || 99)));
        const missing = order.filter((n) => !pos[n]);
        if (missing.length) autoFlow(pos, missing);
        for (const name of order) { const e = groupEls.get(name), p = pos[name]; if (e && p) { e.g.style.left = p.x + 'px'; e.g.style.top = p.y + 'px'; } }
        if (missing.length) state.set('groupPos', pos);   // neu geflossene Positionen festhalten
        sizePanel();
    }
    // Alias: der Recall/Init ruft weiterhin applyGroupOrder – jetzt = Positionen anwenden.
    function applyGroupOrder() { applyGroupPositions(); }
    function groupCollapsed(name) { const st = state.get('groupStyles')[name]; return !!(st && st.collapsed); }
    function setGroupStyle(name, patch) {
        const styles = { ...state.get('groupStyles') };
        styles[name] = { ...(styles[name] || {}), ...patch };
        state.set('groupStyles', styles);
    }
    function setGroupCollapsed(name, on) { setGroupStyle(name, { collapsed: on }); }
    function applyGroupStyles(data) {
        const styles = data.groupStyles || {};
        for (const [name, e] of groupEls) {
            const st = styles[name] || {};
            e.g.style.background = st.bg || '';
            e.title.style.color = st.headColor || '';
            e.title.textContent = st.name || name;
            // Vorschlagsbreite: setzt die Gruppenbreite fest → die flex-wrap-Reglerreihe
            // bricht so um, wie es die Controls zulassen (schmaler = mehr Zeilen, breiter
            // = eine volle Zeile). 0/leer = zurück auf CSS-Default (max-content, 380er Deckel).
            e.g.style.width = st.width ? st.width + 'px' : '';
            // Freies Canvas: kein 380er-Deckel (die Fläche kann breiter werden).
            e.g.style.maxWidth = st.width ? st.width + 'px' : (freeGroups.has(name) ? 'none' : '');
            // Vorschlagshöhe: nur ein MINIMUM (min-height) – die Gruppe wird nie kleiner
            // als ihr Inhalt (kein Abschneiden), lässt sich aber zum Ausrichten strecken.
            e.g.style.minHeight = st.height ? st.height + 'px' : '';
            const col = !!st.collapsed;
            e.body.style.display = col ? 'none' : '';
            e.collapseBtn.textContent = col ? '▸' : '▾';
        }
        sizePanel();   // Klappen ändert Gruppenhöhen → Spalten-Umbruch neu berechnen
    }
    // Absolutes Layout: der Container braucht eine explizite Höhe/Breite, um die
    // absolut positionierten Gruppen zu umschließen (Scroll bei Bedarf). Höhe/Breite =
    // unterster/rechtester Gruppenrand. Läuft debounced per rAF, nie pro Frame.
    let _sizeRaf = null;
    function sizePanel() {
        cancelAnimationFrame(_sizeRaf);
        _sizeRaf = requestAnimationFrame(() => {
            let maxB = 0, maxR = 0;
            for (const { g } of groupEls.values()) {
                maxB = Math.max(maxB, g.offsetTop + g.offsetHeight);
                maxR = Math.max(maxR, g.offsetLeft + g.offsetWidth);
            }
            panel.style.height = (maxB + 24) + 'px';
            panel.style.minWidth = (maxR + 8) + 'px';
        });
    }
    // Erst Stile (Breiten setzen die Gruppengröße), DANN Positionen einfließen lassen.
    applyGroupStyles(state.toJSON());
    applyGroupPositions();
    window.addEventListener('resize', sizePanel);

    // ── Arrange-Modus: ALLE Elemente innerhalb einer Gruppe per Drag umsortieren ──
    // (experimentell) Jede „Zeile" (Body-Blöcke, Selects/Toggles, Regler) ist eine
    // eigene Sortier-Ebene mit rowId. Verschachtelte Zeilen sind konfliktfrei, weil
    // ein Drop nur wirkt, wenn er in derselben Zeile begonnen hat (ctrlDrag.row).
    // Reihenfolgen landen in state.controlOrder (= Optik-Ebene) → Recall stellt sie her.
    function wireArrange(row, rowId) {
        row.addEventListener('dragover', (e) => {
            if (!arranging || !ctrlDrag || ctrlDrag.row !== row) return;
            e.preventDefault(); e.stopPropagation();
        });
        row.addEventListener('drop', (e) => {
            if (!arranging || !ctrlDrag || ctrlDrag.row !== row) return;
            e.preventDefault(); e.stopPropagation();
            const target = e.target.closest('[data-ctrl]');
            if (!target || target === ctrlDrag.el || target.parentElement !== row) return;
            const rect = target.getBoundingClientRect();
            const after = e.clientX > rect.left + rect.width / 2;
            row.insertBefore(ctrlDrag.el, after ? target.nextSibling : target);
            persistControlOrder(rowId, row);
        });
        // (Reorder-Drag entfällt – Controls werden jetzt FREI bewegt, s. wireCtrlMove.)
    }
    function registerArrange(el, rowId) {
        arrangeRows.push({ el, rowId }); wireArrange(el, rowId);
        [...el.children].forEach((c) => { if (c.dataset.ctrl) wireCtrlMove(c); });
    }
    // ── Freies Gruppen-Canvas (@dpa 20260713) ──────────────────────────────────────
    // Sobald in einer Gruppe ein Element bewegt wird, wird die Gruppe zum „Canvas":
    // alle Einheiten (Regler/Selects/Toggles/Sequenzer/Keyboard/Readouts …) werden
    // absolut platziert, die Wrapper-Reihen aufgelöst, der Rahmen umschließt EXAKT die
    // belegte Fläche (obere linke Ecke = Anker). 10px-Raster, Shift=1px.
    // (freeGroups ist oben deklariert.)
    // Einheiten (direkte body-Kinder mit data-ctrl) EINER freien Gruppe.
    function unitList(name) {
        const e = groupEls.get(name); if (!e) return [];
        return [...e.body.querySelectorAll(':scope > [data-ctrl]')];
    }
    // Gruppe ins Canvas überführen bzw. gespeicherte Positionen anwenden.
    function freezeGroup(name) {
        const e = groupEls.get(name); if (!e) return;
        const body = e.body;
        const stored = (state.get('ctrlPos') || {})[name] || {};
        if (!freeGroups.has(name)) {
            // Natürliche Positionen ALLER künftigen Einheiten im Fluss messen …
            const flat = [];
            for (const child of [...body.children]) {
                if (child.classList.contains('knob-row') || child.classList.contains('group-ctrls')) {
                    for (const c of [...child.children]) if (c.dataset.ctrl) flat.push(c);
                } else if (child.dataset.ctrl) { flat.push(child); }
            }
            // Versteckte Einheiten (display:none, z.B. Filter/Distortion 'aktiv' aus) VOR dem
            // Messen einblenden – sonst liefert getBoundingClientRect 0,0 und sie stapeln beim
            // Einfrieren links oben. Nach dem Positionieren wird der Versteckt-Zustand exakt
            // wiederhergestellt. So bekommt JEDES Control eine echte Flow-Position, unabhängig
            // von der momentanen on/off-Sichtbarkeit (dieselbe Isolation-Kante wie im e-Mode,
            // nur greift sie auch auf dem Boot-/Recall-Pfad). (@dpa 20260714)
            const wasHidden = new Set();
            flat.forEach((u) => { if (u.offsetParent === null) { wasHidden.add(u); u.style.display = ''; } });
            const br = body.getBoundingClientRect();
            const nat = new Map();
            flat.forEach((u) => { const r = u.getBoundingClientRect(); nat.set(u, { x: Math.round(r.left - br.left), y: Math.round(r.top - br.top) }); });
            // … dann Wrapper-Reihen auflösen (Einheiten direkt in den body hängen) …
            for (const child of [...body.children]) {
                if (child.classList.contains('knob-row') || child.classList.contains('group-ctrls')) {
                    for (const c of [...child.children]) if (c.dataset.ctrl) body.appendChild(c);
                    child.remove();
                }
            }
            body.classList.add('free-canvas');
            // … und absolut platzieren (gespeicherte Position gewinnt, sonst natürliche).
            flat.forEach((u) => {
                const p = stored[u.dataset.ctrl] || nat.get(u) || { x: 0, y: 0 };
                u.style.position = 'absolute'; u.style.left = Math.max(0, p.x) + 'px'; u.style.top = Math.max(0, p.y) + 'px';
            });
            // Versteckte wieder verstecken – sie tragen jetzt eine gültige left/top und
            // erscheinen beim Wiedereinblenden (Einschalten / e-Mode) am richtigen Platz.
            wasHidden.forEach((u) => { u.style.display = 'none'; });
            freeGroups.add(name);
        } else {
            unitList(name).forEach((u) => { const p = stored[u.dataset.ctrl]; if (p) { u.style.left = Math.max(0, p.x) + 'px'; u.style.top = Math.max(0, p.y) + 'px'; } });
        }
        sizeFreeGroup(name);
    }
    // body-Größe = Bounding-Box der SICHTBAREN Einheiten (Rahmen hugt den Inhalt).
    function sizeFreeGroup(name) {
        const e = groupEls.get(name); if (!e || !freeGroups.has(name)) return;
        let maxR = 0, maxB = 0;
        unitList(name).forEach((u) => {
            if (u.offsetParent === null) return;   // display:none überspringen
            maxR = Math.max(maxR, u.offsetLeft + u.offsetWidth);
            maxB = Math.max(maxB, u.offsetTop + u.offsetHeight);
        });
        e.body.style.width = maxR + 'px'; e.body.style.height = maxB + 'px';
        e.g.style.maxWidth = 'none';   // Canvas darf breiter als der 380er-Default werden
        sizePanel();
    }
    // Freies Verschieben EINER Einheit im e-Mode. Bewegt sich die erste Einheit einer
    // Gruppe, wird die Gruppe „frei". 10px-Raster, Shift=1px (Phase bleibt erhalten).
    function wireCtrlMove(el) {
        el.addEventListener('mousedown', (e) => {
            if (!arranging) return;
            if (e.target.closest('.knob-meta-btn')) return;   // ⚙ bleibt im e-Mode bedienbar
            e.preventDefault(); e.stopPropagation();
            // Shift/Cmd-Klick = additive Auswahl (Block E) → nur selektieren, KEIN Drag.
            if (e.shiftKey || e.metaKey) { setSelected(el, true); return; }
            // Normaler Klick auf ein NICHT-selektiertes Control → frische Einzelauswahl.
            // Klick auf ein bereits (mit-)selektiertes → ganze Auswahl gemeinsam ziehen.
            if (!selected.has(el)) setSelected(el);
            // Nur Controls bewegen (keine Gruppe); Anker garantiert enthalten.
            const movers = [...selected].filter((s) => s.dataset.ctrl && !s.classList.contains('group'));
            if (!movers.includes(el)) movers.push(el);
            // Betroffene Gruppen einfrieren, dann Start-Positionen sichern.
            const groups = new Set();
            const starts = new Map();
            for (const m of movers) {
                const nm = m.closest('.group') && m.closest('.group').dataset.group; if (!nm) continue;
                if (!freeGroups.has(nm)) freezeGroup(nm);   // erste Bewegung → Canvas
                groups.add(nm);
                starts.set(m, { x: parseFloat(m.style.left) || 0, y: parseFloat(m.style.top) || 0, name: nm });
            }
            // Untere Schranke fürs GEMEINSAME Delta: kein Element darf unter 0 rutschen →
            // so bleiben die relativen px-Abstände zwischen den Selektierten exakt erhalten.
            let minX = Infinity, minY = Infinity;
            for (const st of starts.values()) { minX = Math.min(minX, st.x); minY = Math.min(minY, st.y); }
            const aStart = starts.get(el) || { x: 0, y: 0 };
            const sx = e.clientX, sy = e.clientY;
            let remX = mod(aStart.x, GRID), remY = mod(aStart.y, GRID);
            // Drag-Slop (@dpa 20260714): Ein Selektier-Klick bewegt die Maus unvermeidlich ein
            // paar Pixel; ohne Schwelle rastet snapAxis (round(3.5)=4) schon dabei aufs nächste
            // 10er-Raster → das Element sprang beim bloßen Anklicken um 10px und verlor seinen
            // px-Offset. Erst ab >4px echter Bewegung beginnt das Verschieben; darunter bleibt
            // es ein reiner Klick (nur Auswahl, keine Positionsänderung, kein _pend).
            let started = false;
            movers.forEach((m) => m.classList.add('ctrl-moving'));
            const onMove = (ev) => {
                if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
                started = true;
                // Delta am Anker rastern (Shift = 1px), dann auf ALLE anwenden.
                let ax = aStart.x + (ev.clientX - sx), ay = aStart.y + (ev.clientY - sy);
                if (ev.shiftKey) { ax = Math.round(ax); ay = Math.round(ay); remX = mod(ax, GRID); remY = mod(ay, GRID); }
                else { ax = snapAxis(ax, remX, false); ay = snapAxis(ay, remY, false); }
                let dx = ax - aStart.x, dy = ay - aStart.y;
                dx = Math.max(dx, -minX); dy = Math.max(dy, -minY);   // Gruppe als Ganzes klemmen
                for (const [m, st] of starts) {
                    const x = st.x + dx, y = st.y + dy;
                    m.style.left = x + 'px'; m.style.top = y + 'px'; m._pend = { x, y };
                }
            };
            const onUp = () => {
                window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
                const all = { ...state.get('ctrlPos') };
                for (const [m, st] of starts) {
                    m.classList.remove('ctrl-moving');
                    const p = m._pend || { x: st.x, y: st.y };
                    all[st.name] = { ...(all[st.name] || {}), [m.dataset.ctrl]: p };
                }
                state.set('ctrlPos', all);
                for (const nm of groups) sizeFreeGroup(nm);
            };
            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        });
    }
    // Tag + Verdrahtung für Nicht-Regler-Einheiten (Sequenzer, Keyboard, Readouts …).
    function makeMovable(el, id) { if (el) { el.dataset.ctrl = id; wireCtrlMove(el); } return el; }
    // Gespeicherte Positionen anwenden (Init/Recall/Änderung): jede Gruppe mit Einträgen
    // wird eingefroren bzw. neu gesetzt.
    function applyCtrlPos(data) {
        const cp = (data && data.ctrlPos) || {};
        for (const name of Object.keys(cp)) if (cp[name] && Object.keys(cp[name]).length) freezeGroup(name);
    }
    // Ausgewähltes Element (Gruppe ODER Einheit) per Pfeiltaste bewegen (fine = Shift = 1px).
    function nudgeSelected(dx, dy, fine) {
        if (!selected.size) return;
        const step = fine ? 1 : GRID;
        // Gruppe (immer Einzelauswahl) hat eigene Positions-Logik.
        const groupSel = [...selected].find((s) => s.classList.contains('group'));
        if (groupSel) {
            const nm = groupSel.dataset.group;
            const pos = { ...state.get('groupPos') };
            const p = pos[nm] || { x: parseFloat(groupSel.style.left) || 0, y: parseFloat(groupSel.style.top) || 0 };
            pos[nm] = { x: Math.max(0, p.x + dx * step), y: Math.max(0, p.y + dy * step) };
            state.set('groupPos', pos);   // applyGroupPositions folgt via subscribe
            return;
        }
        // Controls: erst alle betroffenen Gruppen einfrieren (style.left/top gültig machen).
        const ctrls = [...selected].filter((s) => s.dataset.ctrl);
        const groups = new Set();
        for (const el of ctrls) { const nm = el.closest('.group') && el.closest('.group').dataset.group; if (nm) { if (!freeGroups.has(nm)) freezeGroup(nm); groups.add(nm); } }
        // Gemeinsames Delta klemmen, damit kein Element unter 0 rutscht → relative Abstände bleiben.
        let minX = Infinity, minY = Infinity;
        for (const el of ctrls) { minX = Math.min(minX, parseFloat(el.style.left) || 0); minY = Math.min(minY, parseFloat(el.style.top) || 0); }
        const mx = Math.max(dx * step, -minX), my = Math.max(dy * step, -minY);
        const all = { ...state.get('ctrlPos') };
        for (const el of ctrls) {
            const name = el.closest('.group') && el.closest('.group').dataset.group; if (!name) continue;
            const x = (parseFloat(el.style.left) || 0) + mx, y = (parseFloat(el.style.top) || 0) + my;
            el.style.left = x + 'px'; el.style.top = y + 'px';
            all[name] = { ...(all[name] || {}), [el.dataset.ctrl]: { x, y } };
        }
        state.set('ctrlPos', all);
        for (const nm of groups) sizeFreeGroup(nm);
    }
    function persistControlOrder(rowId, row) {
        const order = [...row.children].map((c) => c.dataset.ctrl).filter(Boolean);
        state.set('controlOrder', { ...state.get('controlOrder'), [rowId]: order });
    }
    function applyControlOrder(data) {
        const co = (data && data.controlOrder) || {};
        for (const { el, rowId } of arrangeRows) {
            const order = co[rowId]; if (!order) continue;
            // In gespeicherter Reihenfolge ans Ende hängen → stellt Sortierung her.
            order.forEach((id) => { const c = [...el.children].find((x) => x.dataset.ctrl === id); if (c) el.appendChild(c); });
        }
        sizePanel();   // Control-Umsortierung kann Gruppenhöhen ändern
    }
    let _arrangeHint = null;
    function setArranging(on) {
        arranging = on;
        panel.classList.toggle('arranging', on);
        arrBtn.classList.toggle('on', on);   // Kopfzeilen-Schalter spiegeln
        // Kein HTML5-Reorder-Drag mehr (Controls werden frei bewegt) → draggable aus.
        for (const { el } of arrangeRows) [...el.children].forEach((c) => { if (c.dataset.ctrl) c.draggable = false; });
        // Sichtbarkeit sofort neu anwenden (setVis() respektiert `arranging`): beim Betreten
        // wird ALLES sichtbar, beim Verlassen wieder die reale on/off-Stellung.
        refreshVisibility();
        if (on) {
            // Alle Gruppen SOFORT einfrieren (statt lazy beim ersten Klick) – dadurch misst
            // freezeGroup() für jedes Control eine echte Position (nichts mehr display:none)
            // UND es gibt keinen Layout-Sprung mehr beim ersten Anklicken einer Gruppe.
            for (const name of groupEls.keys()) freezeGroup(name);
        } else setSelected(null);   // Auswahl beim Verlassen aufheben
        // Sichtbarer Hinweis, dass hier verschoben statt bedient wird.
        if (on && !_arrangeHint) {
            _arrangeHint = document.createElement('div'); _arrangeHint.className = 'arrange-hint';
            _arrangeHint.textContent = '⇄ Anordnen-Modus – Element klicken/ziehen (10px-Raster · Shift 1px · Pfeiltasten)';
            document.body.appendChild(_arrangeHint);
        } else if (!on && _arrangeHint) { _arrangeHint.remove(); _arrangeHint = null; }
    }
    // ACHTUNG Reihenfolge: applyControlOrder/applyCtrlPos rufen freezeGroup(), das die
    // natürlichen Fluss-Positionen MISST. Das darf erst NACH refreshVisibility() laufen –
    // sonst misst es Gruppen, in denen (z.B. Filter „aktiv“ aus) noch alles sichtbar ist,
    // friert falsche Positionen ein → Controls sitzen beim Reload „tiefer“ und der Filter
    // blitzt kurz offen auf. Die beiden Apply-Aufrufe stehen deshalb weiter unten,
    // direkt hinter refreshVisibility(). (@dpa 20260714)

    // Farbe ↔ Hex/Alpha
    const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
    const parseHex = (rgba, fb) => { if (!rgba) return fb; const m = rgba.match(/\d+/g); if (!m) return fb; return '#' + [m[0], m[1], m[2]].map((v) => (+v).toString(16).padStart(2, '0')).join(''); };
    const parseA = (rgba, fb = 1) => { const m = rgba && rgba.match(/[\d.]+/g); return m && m.length >= 4 ? parseFloat(m[3]) : fb; };

    let _settingsPop = null;
    const _outsideClose = (e) => { if (_settingsPop && !_settingsPop.contains(e.target)) closeGroupSettings(); };
    function closeGroupSettings() { if (_settingsPop) { _settingsPop.remove(); _settingsPop = null; document.removeEventListener('mousedown', _outsideClose, true); } }
    function openGroupSettings(name, anchor) {
        closeGroupSettings();
        const st = state.get('groupStyles')[name] || {};
        const pop = document.createElement('div'); pop.className = 'group-settings';
        const row = (label, ...els) => { const r = document.createElement('div'); r.className = 'gs-row'; const l = document.createElement('span'); l.className = 'gs-lab'; l.textContent = label; r.appendChild(l); els.forEach((e) => r.appendChild(e)); pop.appendChild(r); };

        const nameIn = document.createElement('input'); nameIn.type = 'text'; nameIn.value = st.name || name; nameIn.className = 'gs-text';
        nameIn.addEventListener('input', () => setGroupStyle(name, { name: nameIn.value || name }));
        row('Name', nameIn);

        const bgCol = document.createElement('input'); bgCol.type = 'color'; bgCol.value = parseHex(st.bg, '#1c2027');
        const bgA = document.createElement('input'); bgA.type = 'range'; bgA.min = 0; bgA.max = 1; bgA.step = 0.01; bgA.value = parseA(st.bg, 1); bgA.className = 'gs-alpha';
        const bgApply = () => setGroupStyle(name, { bg: hexA(bgCol.value, parseFloat(bgA.value)) });
        bgCol.addEventListener('input', bgApply); bgA.addEventListener('input', bgApply);
        row('BG', bgCol, bgA);

        const hCol = document.createElement('input'); hCol.type = 'color'; hCol.value = parseHex(st.headColor, '#8a93a3');
        const hA = document.createElement('input'); hA.type = 'range'; hA.min = 0; hA.max = 1; hA.step = 0.01; hA.value = parseA(st.headColor, 1); hA.className = 'gs-alpha';
        const hApply = () => setGroupStyle(name, { headColor: hexA(hCol.value, parseFloat(hA.value)) });
        hCol.addEventListener('input', hApply); hA.addEventListener('input', hApply);
        row('Head', hCol, hA);

        // ── Größe: Vorschlagsbreite/-höhe der Gruppe. Breite steuert das Umbrechen
        //    der Reglerreihe (schmaler = mehr Zeilen, breiter = eine volle Zeile);
        //    Höhe ist nur ein Minimum (zum Ausrichten). 0 = automatisch (CSS-Default). ──
        const mkSize = (labelTxt, prop, max) => {
            const rng = document.createElement('input'); rng.type = 'range'; rng.min = 0; rng.max = max; rng.step = 2;
            rng.value = st[prop] || 0; rng.className = 'gs-alpha';
            const out = document.createElement('span'); out.className = 'gs-size-val';
            const fmt = (v) => (v > 0 ? v + 'px' : 'auto');
            out.textContent = fmt(+rng.value);
            rng.addEventListener('input', () => { const v = +rng.value; out.textContent = fmt(v); setGroupStyle(name, { [prop]: v || undefined }); });
            row(labelTxt, rng, out);
            return rng;
        };
        mkSize('Breite', 'width', 800);
        mkSize('Höhe', 'height', 800);

        // ── Combo (Farb-Preset): gleiche Bedienung wie ein Snapshot – laden per
        //    Menü-Auswahl, Icons für Überschreiben/Neu/Löschen direkt in der Zeile. ──
        const presetSel = document.createElement('select'); presetSel.className = 'gs-text gs-combo-sel';
        // Platzhalter-reflektiert (↻ Name) + Reselect (@dpa 20260713): Box bleibt auf Index 0,
        // der geladene Combo ergibt sich aus comboSel. Icons wirken auf diesen.
        const comboIdx = () => { const w = state.get('comboSel'); return w ? state.get('groupStylePresets').findIndex((p) => p.name === w) : -1; };
        const fillPresets = () => { const want = state.get('comboSel'); const exists = want && state.get('groupStylePresets').some((p) => p.name === want); presetSel.innerHTML = ''; const ph = document.createElement('option'); ph.textContent = exists ? `↻ ${want}` : '— Combo —'; presetSel.appendChild(ph); state.get('groupStylePresets').forEach((p) => { const o = document.createElement('option'); o.textContent = p.name; presetSel.appendChild(o); }); presetSel.selectedIndex = 0; };
        fillPresets();
        const curColors = () => ({ bg: hexA(bgCol.value, parseFloat(bgA.value)), headColor: hexA(hCol.value, parseFloat(hA.value)) });
        presetSel.addEventListener('change', () => { const i = presetSel.selectedIndex - 1; const p = i >= 0 ? state.get('groupStylePresets')[i] : null; state.set('comboSel', p ? p.name : ''); if (p) { setGroupStyle(name, { bg: p.bg, headColor: p.headColor }); bgCol.value = parseHex(p.bg, '#1c2027'); bgA.value = parseA(p.bg, 1); hCol.value = parseHex(p.headColor, '#8a93a3'); hA.value = parseA(p.headColor, 1); } fillPresets(); });
        const comboRow = document.createElement('div'); comboRow.className = 'gs-row gs-combo-row';
        const comboLab = document.createElement('span'); comboLab.className = 'gs-lab'; comboLab.textContent = 'Combo';
        comboRow.appendChild(comboLab); comboRow.appendChild(presetSel);
        [
            ['✎', 'Geladenen Combo mit den aktuellen Farben überschreiben', () => { const i = comboIdx(); if (i < 0) { alert('Erst einen Combo im Menü wählen.'); return; } const list = state.get('groupStylePresets').slice(); list[i] = { ...list[i], ...curColors() }; state.set('groupStylePresets', list); fillPresets(); }, 'save'],
            ['＋', 'Aktuelle Farben als neuen Combo speichern', () => { const pn = prompt('Combo-Name?', ''); if (pn) { state.set('groupStylePresets', [...state.get('groupStylePresets'), { name: pn, ...curColors() }]); state.set('comboSel', pn); fillPresets(); } }, 'new'],
            ['🗑', 'Geladenen Combo löschen', () => { const i = comboIdx(), w = state.get('comboSel'); if (i >= 0 && confirm('Combo „' + w + '" löschen?')) { const list = state.get('groupStylePresets').slice(); list.splice(i, 1); state.set('groupStylePresets', list); state.set('comboSel', ''); fillPresets(); } }, 'del'],
        ].forEach(([g, t, fn, kind]) => comboRow.appendChild(iconBtn(g, t, fn, kind)));
        pop.appendChild(comboRow);

        // ── Gruppen-Snapshot: eigenes Snapshot-System nur für die Sound-Parameter
        //    DIESER Gruppe (unabhängig vom globalen Ensemble-Snapshot & von der Optik). ──
        const grp = GROUPS.find((g) => g.name === name);
        if (grp) {
            const gsSel = document.createElement('select'); gsSel.className = 'gs-text gs-snap-sel';
            const remembered = () => (state.get('groupSnapSel') || {})[name] || '';
            const remember = (nm) => state.set('groupSnapSel', { ...state.get('groupSnapSel'), [name]: nm || '' });
            // Der geladene Snapshot ergibt sich aus dem gemerkten Namen (Box bleibt auf
            // Index 0, Platzhalter zeigt ↻ Name) → Reselect lädt erneut (@dpa 20260713).
            const gsIdx = () => { const w = remembered(); return w ? presets.listGroupSnaps(name).findIndex((s) => s.name === w) : -1; };
            const gsFill = () => {
                const want = remembered();
                const exists = want && presets.listGroupSnaps(name).some((s) => s.name === want);
                gsSel.innerHTML = '';
                const ph = document.createElement('option'); ph.textContent = exists ? `↻ ${want}` : '— Snapshot —'; gsSel.appendChild(ph);
                presets.listGroupSnaps(name).forEach((s) => { const o = document.createElement('option'); o.textContent = s.name; gsSel.appendChild(o); });
                gsSel.selectedIndex = 0;
            };
            const keys = () => groupSoundKeys(grp);
            const metaKeys = () => groupKnobKeys(grp);
            // Dirty-Marker: zeigt, ob der aktuelle Gruppen-Zustand vom geladenen
            // Snapshot abweicht ('*' = verändert, '‼' = >60% anders).
            const gsMark = document.createElement('span'); gsMark.className = 'gs-dirty';
            const updMark = () => {
                const i = gsIdx();
                const d = i >= 0 ? presets.groupSnapDirty(name, i) : null;
                gsMark.textContent = dirtyMark(d);
                gsMark.title = d && d.changed ? `${d.changed}/${d.total} Parameter gegenüber „${remembered()}" verändert` : '';
            };
            gsFill(); updMark();
            // Auswahl im Menü LÄDT direkt (kein separater Laden-Button mehr) und wird
            // gemerkt; erneutes Wählen desselben Eintrags lädt wieder.
            gsSel.addEventListener('change', () => {
                const i = gsSel.selectedIndex - 1;
                if (i >= 0) { remember(gsSel.value); presets.recallGroupSnap(name, i); }
                else remember('');
                gsFill(); updMark();
            });
            const gsRow = document.createElement('div'); gsRow.className = 'gs-row gs-snap-row';
            const gsLab = document.createElement('span'); gsLab.className = 'gs-lab'; gsLab.textContent = 'Snapshot';
            gsRow.appendChild(gsLab); gsRow.appendChild(gsSel); gsRow.appendChild(gsMark);
            [
                ['✎', 'Geladenen Gruppen-Snapshot überschreiben (Sound + Control-Settings)', () => { const i = gsIdx(); if (i >= 0) { presets.updateGroupSnap(name, i, keys(), metaKeys()); updMark(); } }, 'save'],
                ['＋', 'Sound + Control-Settings dieser Gruppe als neuen Snapshot speichern', () => { const nm = prompt('Snapshot-Name für „' + name + '"?', ''); if (nm) { presets.saveGroupSnap(name, nm, keys(), metaKeys()); remember(nm); gsFill(); updMark(); } }, 'new'],
                ['🗑', 'Geladenen Gruppen-Snapshot löschen', () => { const i = gsIdx(), w = remembered(); if (i >= 0 && confirm('Gruppen-Snapshot „' + w + '" löschen?')) { presets.deleteGroupSnap(name, i); remember(''); gsFill(); updMark(); } }, 'del'],
            ].forEach(([g, t, fn, kind]) => gsRow.appendChild(iconBtn(g, t, fn, kind)));
            pop.appendChild(gsRow);
        }

        // Combo speichern/überschreiben/löschen liegt jetzt als Icons in der Combo-Zeile
        // (gleiches Verhalten wie die Snapshot-Zeile) → hier nur noch „Fertig".
        const acts = document.createElement('div'); acts.className = 'gs-actions';
        const doneBtn = document.createElement('button'); doneBtn.className = 'pb-btn'; doneBtn.textContent = 'Fertig';
        doneBtn.addEventListener('click', closeGroupSettings);
        acts.appendChild(doneBtn); pop.appendChild(acts);

        const r = anchor.getBoundingClientRect();
        pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 280))}px`;
        pop.style.top = `${r.bottom + 4}px`;
        document.body.appendChild(pop);
        _settingsPop = pop;
        setTimeout(() => document.addEventListener('mousedown', _outsideClose, true), 0);
    }

    // ── Scopes ──
    const scopes = new Scopes(engine, state);
    scopes.mount(root);

    // ── State → UI Rückbindung (Recall!) ──
    function applyKnobMeta(data) {
        const metas = data.knobMeta || {};
        for (const [k, meta] of Object.entries(metas)) {
            const knob = knobsById.get(k);
            if (knob && meta) knob.setMeta(meta);
        }
    }
    applyKnobMeta(state.toJSON()); // initialer Stand

    // Modusabhängige Sichtbarkeit der Base-Frq-Controls (Quelle: Freq/Tempo/Ton).
    // Im e-Mode (arranging) wird die on/off-Stellung optisch ignoriert – ALLES anzeigen,
    // damit freezeGroup() jedem Control eine echte Position misst (keine überlagerten
    // display:none-Reste, die beim Wiedereinblenden an (0,0) springen).
    const setVis = (key, on) => { const el = ctrlEls.get(key); if (el) el.style.display = (arranging || on) ? '' : 'none'; };
    function updateBaseVisibility() {
        const src = state.get('baseSrc');
        setVis('baseHz', src === 'Freq');     // Freq: Grundfrequenz wichtig
        setVis('baseNote', src === 'Ton');    // Ton: Tonklasse
        // baseBand ist der Register-/Band-Regler für ALLE Quellen (immer sichtbar).
        setVis('baseTestLevel', state.get('baseTestOn')); // Test-Vol nur wenn Test-Ton an
        baseSpeed.style.display = src === 'Freq' ? '' : 'none';  // BpM/Hz/P nur im Freq-Modus
    }
    // Filter: 'aktiv' aus → bis auf Type ALLES ausblenden. 'aktiv' an: Pole-Select immer
    // (für alle Typen relevant), Resonanz beim LP erst ab 2p, bei HP/BP/Ladder immer.
    // Env-Trig dreistufig steuert zusätzlich Env/Att/Dec (aus bei 'off') und den
    // Sequenzer (nur sichtbar bei 'seq').
    const LP_MODES = ['1p', '2p', '3p', '4p'];
    function updateFilterVisibility() {
        const on = state.get('filterEnabled');
        const type = state.get('filterType');
        const poles = LP_MODES.indexOf(state.get('lpMode')) + 1; // 1..4
        const envTrig = state.get('filterEnvTrig'); // 'off' | 'each' | 'seq'
        const envOn = on && envTrig !== 'off';
        ['lpCutoff', 'lpKeyTrack'].forEach((k) => setVis(k, on));
        ['lpEnv', 'lpAttack', 'lpDecay'].forEach((k) => setVis(k, envOn));
        setVis('lpMode', on);   // Polzahl jetzt für ALLE Typen relevant (LP/HP/BP/Ladder)
        setVis('lpReso', on && (type !== 'LP' || poles >= 2));
        setVis('lpGlide', on);
        setVis('filterEnvTrig', on);
        setVis('filterSeqWidget', on && envTrig === 'seq');
    }
    // Distortion: Regler nur sichtbar, wenn 'aktiv'.
    function updateDistVisibility() {
        const on = state.get('distEnabled');
        ['distDrive', 'distOut'].forEach((k) => setVis(k, on));
    }
    // Metronom: Regler nur sichtbar, wenn 'aktiv'. Cutoff-Knob vs. Oktaver je nach
    // 'Quant' (AN = Oktaver an der BaseFrq, AUS = freier Cutoff-Knob wie bisher).
    function updateMetroVisibility() {
        const on = state.get('metroEnabled');
        const quant = state.get('metroCutoffQuant');
        ['metroLevel', 'metroMorph', 'metroReso'].forEach((k) => setVis(k, on));
        setVis('metroCutoff', on && !quant);
        setVis('metroCutBand', on && quant);
    }
    // Skaler: Seed-Regler nur bei 'random'-Wellenform sichtbar.
    function updatePitchWaveVis() { setVis('pitchRandSeed', state.get('pitchWave') === 'random'); }
    // OSC-Engine: PW nur bei Square-PW, FM-Regler nur bei Sine-FM.
    function updateOscVisibility() {
        const fm = state.get('oscEngine') === 'Sine-FM';
        setVis('duty', !fm);
        setVis('fmFeedback', fm);
    }
    // Reverb: Regler nur sichtbar, wenn 'aktiv'.
    function updateReverbVisibility() {
        const on = state.get('reverbEnabled');
        ['revMix', 'revWet', 'revDensity', 'revLenPct', 'revAttack', 'revRelease', 'revReleaseShape', 'revShelfFreq', 'revShelfGain', 'revPreDelay', 'revSeed'].forEach((k) => setVis(k, on));
        setVis('revView', on);
    }
    // Alle modusabhängigen Sichtbarkeiten neu anwenden – einmal an einer Stelle, damit
    // setArranging() sie beim Betreten/Verlassen des e-Mode identisch aufrufen kann.
    function refreshVisibility() {
        updateBaseVisibility();
        updateFilterVisibility();
        updateReverbVisibility();
        updateOscVisibility();
        updateDistVisibility();
        updateMetroVisibility();
        updatePitchWaveVis();
    }
    refreshVisibility();
    // Erst JETZT (finale Sichtbarkeit steht) die Positionen anwenden – siehe Kommentar
    // oben bei der verschobenen Reihenfolge.
    applyControlOrder(state.toJSON());
    applyCtrlPos(state.toJSON());

    // Reflections-Anzeige zeichnen: jede Reflexion = senkrechter Strich (Höhe = Pegel),
    // niedriges Alpha → dichte Wolken werden durch Überlagerung kräftiger.
    function drawReflections() {
        const ir = engine.reverb.getIR();
        const cx = reflCanvas.getContext('2d');
        const W = reflCanvas.width, H = reflCanvas.height;
        cx.clearRect(0, 0, W, H);
        cx.fillStyle = '#0e1116'; cx.fillRect(0, 0, W, H);
        if (!ir) return;
        // hex → rgba mit fester Deck-Alpha (selbst-enthalten, keine Definitions-Reihenfolge).
        const rgba = (hex, a) => { const n = parseInt((hex || '#5ad1ff').slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
        const cL = rgba(state.get('reflColL'), 0.30), cR = rgba(state.get('reflColR'), 0.30);
        const view = state.get('revView');
        const chans = view === 'L' ? [[ir.L, cL]]
            : view === 'R' ? [[ir.R, cR]]
                : [[ir.L, cL], [ir.R, cR]];
        const L = ir.length;
        for (const [d, color] of chans) {
            cx.strokeStyle = color; cx.lineWidth = 1; cx.beginPath();
            for (let i = 0; i < L; i++) {
                const a = Math.abs(d[i]);
                if (a < 0.002) continue;
                const x = (i / L) * W + 0.5;
                cx.moveTo(x, H); cx.lineTo(x, H - a * (H - 2));
            }
            cx.stroke();
        }
    }
    engine.reverb.onRebuild = drawReflections;
    // Reflections-Canvas-Größe aus dem State übernehmen und neu zeichnen.
    function applyReflSize() {
        reflCanvas.width = Math.max(80, Math.min(1200, state.get('reflW') | 0));
        reflCanvas.height = Math.max(24, Math.min(400, state.get('reflH') | 0));
        drawReflections();
    }
    // Kleines Popover: Breite/Höhe + Kanalfarben der Reflections-Anzeige (Optik).
    let _reflPop = null;
    const _reflOutside = (e) => { if (_reflPop && !_reflPop.contains(e.target)) closeReflSettings(); };
    function closeReflSettings() { if (_reflPop) { _reflPop.remove(); _reflPop = null; document.removeEventListener('mousedown', _reflOutside, true); } }
    function openReflSettings(anchor) {
        closeReflSettings();
        const pop = document.createElement('div'); pop.className = 'group-settings';
        const row = (label, ...els) => { const r = document.createElement('div'); r.className = 'gs-row'; const l = document.createElement('span'); l.className = 'gs-lab'; l.textContent = label; r.appendChild(l); els.forEach((e) => r.appendChild(e)); pop.appendChild(r); };
        const num = (key, min, max) => {
            const i = document.createElement('input'); i.type = 'number'; i.min = min; i.max = max; i.step = 1; i.className = 'gs-text'; i.value = state.get(key);
            i.addEventListener('input', () => { const v = parseInt(i.value); if (!isNaN(v)) state.set(key, Math.max(min, Math.min(max, v))); });
            return i;
        };
        const col = (key) => {
            const c = document.createElement('input'); c.type = 'color'; c.value = state.get(key);
            c.addEventListener('input', () => state.set(key, c.value));
            return c;
        };
        row('Breite', num('reflW', 80, 1200));
        row('Höhe', num('reflH', 24, 400));
        row('Farbe L', col('reflColL'));
        row('Farbe R', col('reflColR'));
        const acts = document.createElement('div'); acts.className = 'gs-actions';
        const done = document.createElement('button'); done.className = 'pb-btn'; done.textContent = 'Fertig';
        done.addEventListener('click', closeReflSettings); acts.appendChild(done); pop.appendChild(acts);
        const r = anchor.getBoundingClientRect();
        pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 280))}px`;
        pop.style.top = `${r.bottom + 4}px`;
        document.body.appendChild(pop); _reflPop = pop;
        setTimeout(() => document.addEventListener('mousedown', _reflOutside, true), 0);
    }
    applyReflSize();

    // Element-Settings (Selects/Toggles/Readouts) beim Recall neu anwenden – jede
    // registrierte id ihren gespeicherten Style, fehlende → Reset ({}).
    function applyCtrlStyles(data) {
        const styles = (data && data.ctrlStyles) || {};
        for (const [id, t] of styleTargets) t.applyStyle(styles[id] || {});
    }

    state.subscribe((key, value, data) => {
        if (key === '*') {
            applyKnobMeta(data);                              // erst Skala/Kurve …
            for (const [k, knob] of knobsById) knob.value = data[k];   // … dann Werte
            for (const upd of ctrlBindings.values()) upd(data);
            refreshVisibility();
            applyReflSize();
            applyGroupStyles(data);
            applyGroupPositions();
            applyControlOrder(data);
            applyCtrlPos(data);
            applyCtrlStyles(data);
        } else if (key === 'groupStyles') {
            applyGroupStyles(data);
        } else if (key === 'groupOrder' || key === 'groupPos') {
            applyGroupPositions();
        } else if (key === 'controlOrder') {
            applyControlOrder(data);
        } else if (key === 'ctrlPos') {
            applyCtrlPos(data);
        } else if (key === 'ctrlStyles') {
            applyCtrlStyles(data);
        } else if (key === 'baseSrc' || key === 'baseTestOn') {
            ctrlBindings.get(key)(data);
            updateBaseVisibility();
        } else if (key === 'lpMode' || key === 'filterType' || key === 'filterEnabled' || key === 'filterEnvTrig') {
            ctrlBindings.get(key)(data);
            updateFilterVisibility();
        } else if (key === 'reverbEnabled') {
            ctrlBindings.get(key)(data);
            updateReverbVisibility();
        } else if (key === 'distMode' || key === 'distEnabled') {
            ctrlBindings.get(key)(data);
            updateDistVisibility();
        } else if (key === 'metroEnabled' || key === 'metroCutoffQuant') {
            ctrlBindings.get(key)(data);
            updateMetroVisibility();
        } else if (key === 'oscEngine') {
            ctrlBindings.get(key)(data);
            updateOscVisibility();
        } else if (key === 'pitchWave') {
            ctrlBindings.get(key)(data);
            updatePitchWaveVis();
        } else if (key === 'revView') {
            ctrlBindings.get(key)(data);
            drawReflections();
        } else if (key === 'reflW' || key === 'reflH') {
            applyReflSize();
        } else if (key === 'reflColL' || key === 'reflColR') {
            drawReflections();
        } else if (key === 'knobMeta') {
            applyKnobMeta(data);
        } else if (knobsById.has(key)) {
            const knob = knobsById.get(key);
            if (knob.value !== value) knob.value = value;
        } else if (ctrlBindings.has(key)) {
            ctrlBindings.get(key)(data);
        }
        // ×ganze: den Rate-Wert bei jeder relevanten Änderung gerastet halten.
        // Bewusst NICHT bei '*' (Recall): sonst würde der gerade geladene pitchRate
        // sofort wieder überschrieben (= „Rate oft nicht recalled"-Bug).
        if (key !== '*' && RATE_QUANT_KEYS.has(key)) syncRateQuant();
        // Sequenzer-Widgets neu zeichnen (Recall oder Edit an Steps/Länge/aktiv).
        if (key === '*' || key === 'seqStyles' || key === 'filterEnvTrig' || /^(amp|filter)Seq/.test(key)) { seqWidgets.forEach((w) => w.refresh()); if (key === 'seqStyles') sizePanel(); }
        // Menü-Auswahlen nachziehen (Recall).
        if (key === '*' || key === 'scaleSel') scaleRefresh();
        if (key === '*' || key === 'layoutSel') layoutRefresh();
        if (key === '*' || key === 'p2Sel') p2Refresh();
        if (key === '*' || key === 'fxOrder') fxChainRender();
        // skal2-Modus: P2-Leiste nur dann zeigen; Höhenänderung → Layout nachrechnen.
        if (key === '*' || key === 'skal2On') { if (p2Bar) p2Bar.style.display = state.get('skal2On') ? '' : 'none'; sizePanel(); }
        // Sichtbarkeits-Umschalter (aktiv-Haken, Modus-Selects) ändern Gruppenhöhen
        // → Spalten-Umbruch des column-wrap-Layouts neu berechnen. '*'/order/styles
        // rufen sizePanel bereits selbst, daher hier nur die Einzel-Toggles.
        if (VIS_TOGGLE_KEYS.has(key)) { sizePanel(); freeGroups.forEach(sizeFreeGroup); }
    });

    // ── Tastatur: Space = Start/Stop, Pfeile = BaseFrq-Fernsteuerung (Ton-Modus) ──
    window.addEventListener('keydown', (e) => {
        // Textarea (Debug-Prompt) & contenteditable ausdrücklich ausnehmen: sonst
        // schluckt der Space-Transport-Toggle jedes Leerzeichen beim Tippen (startStop
        // muss vom Debug-Editor entkoppelt sein).
        const onBody = !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)
            && !(e.target instanceof HTMLTextAreaElement) && !e.target.isContentEditable
            && !(e.target.classList && e.target.classList.contains('knob-container'));
        if (e.key === 'Escape') {
            // Esc räumt auf: Overlays zu UND den Fokus abgeben – Eingabe verlassen,
            // Controls (v.a. Switches) deselektieren. Danach schaltet Space wieder
            // Start/Stop statt den zuletzt fokussierten Schalter zu toggeln.
            closeGroupSettings(); closeReflSettings(); closeSettings();
            clearSelection();   // im e-Mode: Auswahl aufheben (Block E)
            const ae = document.activeElement;
            if (ae && ae !== document.body && typeof ae.blur === 'function') ae.blur();
            return;
        }
        if (e.code === 'Space' && onBody) { e.preventDefault(); presetBar.toggle(); return; }
        // 'e' = Anordnen-Modus („Alle Elemente frei anordnen") an/aus. Nur auf dem Body
        // (nicht beim Tippen in Feldern) und ohne Modifier, damit Cmd/Ctrl+E unberührt bleiben.
        if (onBody && (e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault(); setArranging(!arranging); return;
        }
        // e-Mode + ausgewähltes Element: Pfeiltasten bewegen es im 10px-Raster (Shift = 1px).
        // Hat Vorrang vor der BaseFrq-Fernsteuerung, solange etwas ausgewählt ist.
        if (arranging && selected.size && e.key.startsWith('Arrow')) {
            const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
            if (d) { e.preventDefault(); nudgeSelected(d[0], d[1], e.shiftKey); return; }
        }

        // BaseFrq-Fernsteuerung (Band-Regler für ALLE Quellen):
        //   ↑/↓ = Band oktavweise (×2 / ÷2) verschieben, in JEDEM Modus.
        //   ←/→ = Tonklasse (nur im Ton-Modus).
        if (onBody && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            const f = e.key === 'ArrowUp' ? 2 : 0.5;
            state.set('baseBand', Math.max(0.05, Math.min(8000, state.get('baseBand') * f)));
            return;
        }
        if (state.get('baseSrc') === 'Ton' && onBody) {
            const pc = Math.max(0, NOTE_NAMES.indexOf(state.get('baseNote')));
            if (e.key === 'ArrowRight') { e.preventDefault(); state.set('baseNote', NOTE_NAMES[(pc + 1) % 12]); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); state.set('baseNote', NOTE_NAMES[(pc + 11) % 12]); }
        }
    });

    // ── Tab-Fokus-Loop: innerhalb der Panels wandert Tab/Shift+Tab modulo durch
    // ALLE sichtbaren Bedienelemente (Regler, Selects, Toggles, Buttons, Seq-Felder)
    // – ein „übersichtlicher Kreis". Außerhalb der Panels (Overlays/Kopfzeile) bleibt
    // das native Tab-Verhalten. Rein/­raus per Klick oder erstem Tab in ein Panel-Control.
    function panelFocusables() {
        return [...panel.querySelectorAll('.knob-container, select, input, button')]
            .filter((el) => el.offsetParent !== null && !el.disabled && el.tabIndex !== -1);
    }
    window.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const cur = document.activeElement;
        if (!cur || !panel.contains(cur)) return;   // nur innerhalb der Panels loopen
        const items = panelFocusables();
        const idx = items.indexOf(cur);
        if (idx === -1) return;
        e.preventDefault();
        const next = (idx + (e.shiftKey ? -1 : 1) + items.length) % items.length;
        items[next].focus();
    }, true);

    // ── Render-Loop ──
    // Band-Regler zeigen live die gefaltete Ist-Frequenz (kompakt formatiert).
    const _bandKnob = knobsById.get('baseBand');
    const _metroBandKnob = knobsById.get('metroCutBand');
    const fmtHz = (f) => (f < 10 ? f.toFixed(2) : f < 1000 ? f.toFixed(1) : Math.round(f) + '');
    let _cpuFrames = 0;
    function frame() {
        const t0 = performance.now();
        keyboard.tick();
        scopes.tick();
        drawMeter();
        for (const w of seqWidgets) w.tick();
        const bf = engine.baseFreq;
        baseReadout.textContent = `BaseFrq: ${midiToName(Math.round(freqToMidi(bf)))} · ${bf.toFixed(bf < 10 ? 2 : 1)} Hz`;
        // Band-Regler zeigen die TATSÄCHLICHE (gefaltete) Frequenz statt „L–2L" – kompakt,
        // damit der Control nicht breiter wird (@dpa 20260712). baseBand faltet die Quelle
        // (= engine.baseFreq), metroCutBand faltet die BaseFrq nochmal ins Metro-Cutoff-Band.
        if (_bandKnob) _bandKnob.showValue(fmtHz(bf));
        if (_metroBandKnob) _metroBandKnob.showValue(fmtHz(foldToBand(bf, state.get('metroCutBand'))));
        // Freq-Modus: zusammenhängende Speed-Werte (BpM 0.001..999, sonst '..'/'zu hoch'; Hz; P immer).
        if (baseSpeed.style.display !== 'none') {
            const bpm = bf * 60;
            const bpmStr = bpm < 0.001 ? '..' : bpm > 999 ? 'zu hoch' : bpm.toFixed(bpm < 10 ? 3 : 1);
            baseSpeed.textContent = `BpM ${bpmStr} · ${bf.toFixed(bf < 10 ? 2 : 1)} Hz · P ${Math.round(freqToMidi(bf))}`;
        }
        // Skaler-Rate als Verhältnis zur BaseFrq. Im Rast-Modus (×ganze) als Bruch k/l,
        // sonst als Dezimal-Vielfaches. Nur noch „×… Base" (kein Hz/=n mehr).
        const rate = state.get('pitchRate');
        let multStr = '×0';
        if (bf > 0) {
            if (state.get('rateQuant')) {
                const { k, l } = bestFraction(rate / bf, state.get('rateNumMax'), state.get('rateDenMax'));
                multStr = l === 1 ? `×${k}` : `×${k}/${l}`;
            } else {
                const m = rate / bf;
                multStr = `×${m.toFixed(m < 1 ? 3 : 2)}`;
            }
        }
        rateReadout.textContent = `${multStr} Base`;
        // Ohne echte Audio-Render-Kapazität: grobe UI-Last aus der Frame-Arbeitszeit.
        if (!cpuHasAudio) cpuLoad = cpuLoad * 0.9 + Math.min(1, (performance.now() - t0) / 16.7) * 0.1;
        if ((_cpuFrames++ % 15) === 0) {
            cpuEl.textContent = `${cpuHasAudio ? 'CPU' : 'UI~'} ${Math.round(cpuLoad * 100)}%`;
            cpuEl.title = cpuHasAudio
                ? 'Audio-Render-Last des AudioContext'
                : 'Grobe UI-Rechenlast (dieser Browser bietet keine echte Audio-CPU-Messung – nur Chrome via renderCapacity)';
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    window.tesla = { state, engine, presets };
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
