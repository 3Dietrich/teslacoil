/**
 * i18n.js – Deutsch/Englisch umschalten (@dpa 20260716_164359: „Es soll sowohl für einen
 * deutschen, als auch english speaker alles Verständlich sein … Auf jeden Fall sollen alle
 * Help-Hints englisch / deutsch umgeschaltet werden").
 *
 * ZWEI Regeln, die dieses Modul trägt:
 *
 * 1. Der DEUTSCHE TEXT IST DER SCHLÜSSEL. Kein `t('hint.sync.title')`-Umbau: im Code steht
 *    weiter der lesbare deutsche Satz, EN[] übersetzt ihn. Fehlt eine Übersetzung, erscheint
 *    Deutsch – nie ein nackter Schlüssel. Der Preis: ändert jemand den deutschen Text, greift
 *    seine Übersetzung nicht mehr (sie fällt still auf Deutsch zurück). Dagegen steht der
 *    Wächter in test/logic.test.mjs, der EN[] gegen die im Code gefundenen Hints prüft.
 *
 * 2. Selbst ernannte Labels bleiben unangetastet (@dpa: „Die selbst ernennbaren Labels und
 *    Controls NICHT umbenennen"). Übersetzt wird nur, was das Instrument selbst sagt –
 *    Hints, Knöpfe, Settings-Beschriftungen. Was der User in `knobMeta`/`ctrlStyles`
 *    getippt hat, geht hier nie durch.
 *
 * Live-Umschaltung: `hint(el, text)` merkt sich das Element samt deutschem Original;
 * `setLang()` zeichnet alle gemerkten neu. Elemente, die aus dem DOM verschwinden, fallen
 * beim nächsten Durchlauf aus der Liste (kein Leak).
 */

export const LANGS = ['de', 'en'];

/**
 * DE → EN. Schlüssel = exakt der deutsche Text aus dem Code.
 * Kurz und im Ton des Instruments, nicht wörtlich rückübersetzt.
 */
const EN = {
    // ── Transport ──
    'Leertaste = Start/Stop': 'Spacebar = start/stop',
    'Sync: bei jedem Start alle Sequenzer wieder bei Step 1 beginnen':
        'Sync: restart every sequencer at step 1 on each start',
    'Audio-Panik: alle Töne, Filter- und Hall-Fahnen sofort abwürgen (nur nötig, wenn nach dem Stop etwas hängt – knackt hörbar)':
        'Audio panic: kill all notes, filter and reverb tails at once (only needed if something hangs after stop – clicks audibly)',
    'Start': 'Start', 'Stop': 'Stop', 'Sync': 'Sync', 'Reset': 'Reset',

    // ── Kopfzeile ──
    'Einstellungen': 'Settings',
    'Anordnen-Modus (Taste „e"): Elemente frei ziehen · Klick/Tab wählt aus · Pfeiltasten verschieben (10px, Shift = 1px) · hier wird nichts bedient':
        'Arrange mode (key “e”): drag elements freely · click/tab selects · arrow keys move (10px, shift = 1px) · nothing is operated here',
    'Ausgangspegel (dBFS, Peak-Hold)': 'Output level (dBFS, peak hold)',
    'Master Vol': 'Master vol',

    // ── Kette ──
    'Alles zeigen (umbrechen statt scrollen)': 'Show all (wrap instead of scroll)',
    'Effekt – ziehen zum Umsortieren': 'Effect – drag to reorder',
    'Quelle Metronom – ziehen; Position bestimmt, wo es in die Kette einspeist (ganz hinten = parallel)':
        'Metronome source – drag; its position sets where it feeds into the chain (last = parallel)',
    'Kette': 'Chain',

    // ── Snapshot/Skala/P2/Combo-Menüs ──
    'Snapshot wählen · den markierten erneut wählen lädt ihn erneut':
        'Pick a snapshot · picking the marked one again reloads it',
    'Skala wählen · die markierte erneut wählen lädt sie erneut':
        'Pick a scale · picking the marked one again reloads it',
    'Slot-Satz wählen · den markierten erneut wählen lädt ihn erneut':
        'Pick a slot set · picking the marked one again reloads it',
    'Farb-Combo wählen · den markierten erneut wählen wendet ihn erneut an':
        'Pick a colour combo · picking the marked one again reapplies it',
    'Sound + Control-Settings dieser Gruppe als neuen Snapshot speichern':
        'Save this group\'s sound + control settings as a new snapshot',
    'Gruppen-Snapshot wählen · den markierten erneut wählen lädt ihn erneut':
        'Pick a group snapshot · picking the marked one again reloads it',
    'Neu…': 'New…', 'Export': 'Export', 'Import': 'Import',
    'Aktuellen Zustand als neuen Snapshot speichern (gleicher Name = überschreiben)':
        'Save the current state as a new snapshot (same name = overwrite)',
    'Geladenen Snapshot als JSON-Datei sichern': 'Save the loaded snapshot as a JSON file',
    'Snapshot aus Datei laden (JSON) – gleicher Name überschreibt':
        'Load a snapshot from a file (JSON) – same name overwrites',
    'Aktuelle Maske als neue Skala speichern': 'Save the current mask as a new scale',
    'Die 12 Slots als neues P2 speichern': 'Save the 12 slots as a new P2',
    'Aktuelle Farben als neuen Combo speichern': 'Save the current colours as a new combo',
    'Aktuelle Farbe + Hintergrund als Preset speichern':
        'Save the current colour + background as a preset',
    'Gespeicherte Regler-Farbe wählen (Standard = Farbe verwerfen)':
        'Pick a saved knob colour (Default = discard colour)',

    // ── Layout-Cluster ──
    'Layout laden (Recall)': 'Load layout (recall)',
    'Ausgewähltes Layout mit aktueller Optik überschreiben (Update)':
        'Overwrite the selected layout with the current look (update)',
    'Als neues Layout speichern': 'Save as a new layout',
    'Layout exportieren (JSON)': 'Export layout (JSON)',
    'Ausgewähltes Layout löschen': 'Delete the selected layout',

    // ── Gruppen / Controls ──
    'Ein-/Ausklappen': 'Collapse/expand',
    'Ziehen zum Verschieben · Rechtsklick = Einstellungen': 'Drag to move · right-click = settings',
    'Klick = auswählen (dann Pfeiltasten), Doppelklick = Wert eingeben':
        'Click = select (then arrow keys), double-click = type a value',
    'Hintergrund der Anzeige': 'Display background',

    // ── Beschriftung, global (@dpa 20260716_204921) ──
    'Beschriftung': 'Labels',
    'Gilt für ALLE Beschriftungen und Werte-Anzeigen auf einmal. Leer bzw. ✕ = wie ausgeliefert. Einzelne Regler-Farben bleiben davon unberührt (Rechtsklick auf den Regler).':
        'Applies to ALL labels and value readouts at once. Empty or ✕ = as shipped. Individual knob colours stay untouched (right-click the knob).',
    'Vorgabe entfernen (wieder wie ausgeliefert)': 'Remove the setting (back to as shipped)',
    'Schrift': 'Text',
    'Wert-BG': 'Value BG',
    'Größe': 'Size',
    'Schriftgröße der Beschriftungen (6–12 px, leer = wie ausgeliefert)':
        'Font size of the labels (6–12 px, empty = as shipped)',

    // ── Hilfe-Blasen (@dpa 20260716_174111) ──
    // Die Hilfetexte der Controls selbst stehen NICHT hier, sondern als {de,en}-Paar in
    // js/data/hints.js – sie hängen an der Control-Kennung statt am Wortlaut, damit ein
    // umformulierter Text seine Übersetzung nicht verliert. Hier steht nur die Bedienung
    // des Hilfe-Systems.
    'Hilfe': 'Help',
    'Hilfe-Blasen ein-/ausschalten (die Verzögerung steht in den Einstellungen)':
        'Turn help bubbles on/off (the delay lives in the settings)',
    'Wie lange die Maus stillstehen muss, bis die Hilfe-Blase erscheint. Den Text jedes Controls ändert man in dessen Einstellungen (Rechtsklick), „Alle zurücksetzen" holt die mitgelieferten Texte zurück.':
        'How long the mouse must rest before the help bubble appears. Each control’s text is edited in its own settings (right-click); “Reset all” brings the shipped texts back.',
    'Verzögerung der Hilfe-Blase in Millisekunden (0 = sofort)':
        'Delay of the help bubble in milliseconds (0 = instantly)',
    'Alle zurücksetzen': 'Reset all',
    'Alle selbst geschriebenen Hilfetexte verwerfen (die mitgelieferten gelten wieder)':
        'Discard all self-written help texts (the shipped ones apply again)',
    'Alle eigenen Hilfetexte verwerfen?': 'Discard all your own help texts?',
    'Es sind keine eigenen Hilfetexte gespeichert.': 'There are no self-written help texts stored.',
    'Hilfetexte sichern': 'Save help texts',
    'Nur die selbst geschriebenen Hilfetexte als eigene JSON-Datei herunterladen':
        'Download only the self-written help texts as their own JSON file',
    'Hilfetexte laden': 'Load help texts',
    'Hilfetexte aus einer teslacoil-Hilfetext-Datei einlesen (ersetzt nur die Texte, sonst nichts)':
        'Read help texts from a teslacoil help-text file (replaces only the texts, nothing else)',
    'Hilfetexte laden?': 'Load help texts?',
    'Die eigenen Hilfetexte werden ersetzt. Sound, Optik und Snapshots bleiben unberührt.':
        'Your own help texts will be replaced. Sound, look and snapshots stay untouched.',
    'Import nicht möglich:': 'Import not possible:',
    'Standard': 'Default',
    'Eigene Farbe verwerfen (Regler nimmt wieder die Grundfarbe)':
        'Discard the custom colour (knob returns to the base colour)',
    'Schließen': 'Close',
    'Anzeige an/aus': 'Display on/off',

    // ── Step-Sequenzer ──
    'Fill: sichtbares Muster über den unsichtbaren Rest wiederholen':
        'Fill: repeat the visible pattern across the hidden remainder',
    'set0: der nächste Trigger startet wieder bei Step 1':
        'set0: the next trigger starts at step 1 again',

    // ── Skaler-Keyboard ──
    'Klick: Skala auf der Frequenzachse verschieben (Anker)':
        'Click: shift the scale along the frequency axis (anchor)',
    'Anker: Skala auf der Frequenzachse verschieben (Transponier-Modus).':
        'Anchor: shift the scale along the frequency axis (transpose mode).',
    'base=c: Skala relativ zur Basis (do re mi); der Klang folgt der BaseFreq.':
        'base=c: scale relative to the base (do re mi); the sound follows the base freq.',
    'skal2: die 12 Tasten als abrufbare Skala-Slots (P2). Bleibt auch im Anker-Modus aktiv.':
        'skal2: the 12 keys as recallable scale slots (P2). Stays active in anchor mode too.',

    // ── Debug ──
    'Audio parallel am Master abgreifen (Hörweg unberührt) – Start/Stop':
        'Tap audio in parallel at the master (listening path untouched) – start/stop',
    'Zweite Aufnahme zum Vergleich (vorher/nachher) – Start/Stop':
        'Second take for comparison (before/after) – start/stop',
    'Beide Aufnahmen verwerfen (Rec und Rec2 leeren)': 'Discard both takes (clear Rec and Rec2)',
    'Audio (WAV, beide Aufnahmen) + Screenshot (PNG) + Zustand (JSON) + Prompt (TXT) einzeln herunterladen':
        'Download audio (WAV, both takes) + screenshot (PNG) + state (JSON) + prompt (TXT) separately',

    // ── Einstellungen ──
    'Auto-Restore ist aktiv: Sound- und Optik-Zustand werden automatisch gesichert und beim Neuladen/Aktualisieren wiederhergestellt.':
        'Auto-restore is on: sound and layout state are saved automatically and restored when you reload or refresh.',
    'Entfernt den Gleichanteil aus dem Ausgangssignal (Lautsprecherschutz). Ein Puls-Synth erzeugt ihn zwangsläufig – aus lassen nur, wenn man ihn wirklich braucht.':
        'Removes the DC offset from the output signal (speaker protection). A pulse synth inevitably produces one – only switch this off if you really need to.',
    'Automatisch nach jeder Ruhephase gesichert (max. 2/Min, 5/Std, 1/Tag, 1/Woche). Ein Backup zu laden ersetzt den KOMPLETTEN Zustand (Sound, Optik, Snapshots, Skalen, Layouts).':
        'Saved automatically after every idle phase (max. 2/min, 5/hour, 1/day, 1/week). Loading a backup replaces the COMPLETE state (sound, look, snapshots, scales, layouts).',
    'Den kompletten Zustand als Datei sichern oder von einer Datei einlesen – unabhängig vom Browserspeicher, übertragbar auf andere Rechner. Einlesen ersetzt ebenfalls ALLES.':
        'Save the complete state to a file or read it back from one – independent of browser storage, portable to other machines. Reading also replaces EVERYTHING.',
    'Datei': 'File',
    'Als Datei sichern': 'Save as file',
    'Auf Werkseinstellung zurücksetzen': 'Reset to factory settings',
    '— keine Backups —': '— no backups —',
    '— Backup wählen —': '— pick a backup —',
    'Fertig': 'Done',
    'Anordnen-Modus – Element klicken/ziehen (10px-Raster · Shift 1px · Pfeiltasten)':
        'Arrange mode – click/drag an element (10px grid · shift 1px · arrow keys)',
    'Gewähltes Backup wiederherstellen (ersetzt alles) und neu laden':
        'Restore the selected backup (replaces everything) and reload',
    'Sofort ein Backup des aktuellen Zustands anlegen': 'Take a backup of the current state now',
    'Kompletten Zustand (Sound, Optik, Snapshots, Skalen, Layouts) als JSON-Datei herunterladen':
        'Download the complete state (sound, look, snapshots, scales, layouts) as a JSON file',
    'Zustand aus einer teslacoil-Backup-Datei wiederherstellen (ersetzt alles)':
        'Restore the state from a teslacoil backup file (replaces everything)',
    'ALLES verwerfen und die ausgelieferte Werkseinstellung laden (vorher wird automatisch gesichert)':
        'Discard EVERYTHING and load the shipped factory settings (a backup is taken first)',
    'Backups': 'Backups',
    'Laden': 'Load',
    'Datei laden': 'Load file',
    'Jetzt sichern': 'Back up now',
    'Als Datei sichern': 'Save as file',
    'Sprache': 'Language',
    'Sprache der Hinweise und Beschriftungen (selbst vergebene Namen bleiben unverändert)':
        'Language of hints and labels (names you gave yourself stay untouched)',
    'Ausgang': 'Output',

    // ── Element-/Regler-Settings ──
    'Breite EINER Taste (10–999 px)': 'Width of ONE key (10–999 px)',
    'Höhe EINER Taste (10–500 px)': 'Height of ONE key (10–500 px)',
    'Breite des Feldes (px)': 'Width of the field (px)',
    'Höhe des Feldes (px)': 'Height of the field (px)',
};

let _lang = 'de';
/** Elemente, deren Hint übersetzt wird: el → deutscher Originaltext. */
const _hints = new Map();
/** Elemente, deren sichtbarer Text übersetzt wird: el → deutscher Originaltext. */
const _texts = new Map();
const _subs = new Set();

/** Aktuelle Sprache. */
export function lang() { return _lang; }

/** Übersetzen. Unbekanntes bleibt deutsch – lieber der Originalsatz als ein Schlüssel. */
export function t(de) {
    if (_lang === 'de' || de == null) return de;
    return EN[de] ?? de;
}

/**
 * Hint setzen und für die Live-Umschaltung merken.
 *
 * Seit 20260716_174111 steht der Text in `data-hint` statt in `title`: die Hilfe-Blase
 * (ui/HintBubble.js) zeigt ihn an, damit @dpa sie global abschalten und ihre Verzögerung
 * einstellen kann – beides gibt ein natives `title` nicht her. Ein zurückgebliebenes
 * `title` würde zusätzlich als zweiter, unabschaltbarer Tooltip erscheinen.
 *
 * `aria-label` bleibt: das ist der Weg zur Vorlesehilfe, nicht zur Optik.
 */
export function hint(el, de) {
    if (!el) return el;
    _hints.set(el, de);
    el.dataset.hint = t(de);
    if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', t(de));
    return el;
}

/** Sichtbaren Text setzen und merken (nur INSTRUMENT-Texte, nie User-Labels!). */
export function text(el, de) {
    if (!el) return el;
    _texts.set(el, de);
    el.textContent = t(de);
    return el;
}

/** Bei Sprachwechsel benachrichtigt werden (für Texte, die neu gebaut werden müssen). */
export function onLangChange(fn) { _subs.add(fn); return () => _subs.delete(fn); }

/** Sprache setzen und ALLES gemerkte neu zeichnen. */
export function setLang(l) {
    const next = LANGS.includes(l) ? l : 'de';
    if (next === _lang) return;
    _lang = next;
    for (const [el, de] of _hints) {
        if (!el.isConnected) { _hints.delete(el); continue; }   // aufgeräumt statt geleakt
        el.dataset.hint = t(de);
        if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', t(de));
    }
    for (const [el, de] of _texts) {
        if (!el.isConnected) { _texts.delete(el); continue; }
        el.textContent = t(de);
    }
    _subs.forEach((fn) => { try { fn(_lang); } catch { /* ein Abonnent darf den Rest nicht reißen */ } });
}

/** Nur für den Test-Wächter: die Schlüssel, die EN kennt. */
export const EN_KEYS = Object.keys(EN);
export function hasTranslation(de) { return Object.prototype.hasOwnProperty.call(EN, de); }
