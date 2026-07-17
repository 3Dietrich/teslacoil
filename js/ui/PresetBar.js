/**
 * PresetBar.js – Transport + Snapshot/Skalen-Verwaltung.
 */
import { pickTextFile } from '../core/fileIO.js';
import { PickMenu } from './PickMenu.js';
import { icon } from './icons.js';
import { hint } from '../core/i18n.js';

export class PresetBar {
    /**
     * @param {import('../engine/TeslaEngine.js').TeslaEngine} engine
     * @param {import('../data/PresetManager.js').PresetManager} presets
     */
    constructor(engine, presets) {
        this.engine = engine;
        this.presets = presets;
        this.element = document.createElement('div');
        this.element.className = 'presetbar';
        this._build();
    }

    _build() {
        // Transport
        this._playBtn = this._btn('', () => this.toggle(), 'play-btn');
        // War als eigener Hint im Header untergebracht – zog dort nur unnötig Platz,
        // gehört inhaltlich sowieso zum Start-Button (@dpa 20260713).
        hint(this._playBtn, 'Leertaste = Start/Stop');
        this._paintPlayBtn();
        this.element.appendChild(this._playBtn);

        // Sync: bei aktivem Schalter beginnen bei jedem Start alle Sequenzer bei Step 1.
        this._syncBtn = this._btn('', () => this._toggleSync(), 'sync-btn');
        // Icon + Wort (@dpa 20260714: die Schrift „Sync" bleibt so groß wie „Start", nur das
        // Zeichen davor darf groß sein). Seit 20260716_164359 ist es ein SVG – der alte
        // ⟲-Glyph war trotz font-size:18px „zu klein", weil er seine em-Box kaum füllte.
        this._syncBtn.appendChild(icon('sync'));
        this._syncBtn.appendChild(document.createTextNode(' Sync'));
        hint(this._syncBtn, 'Sync: bei jedem Start alle Sequenzer wieder bei Step 1 beginnen');
        this.element.appendChild(this._syncBtn);
        this._updateSyncBtn();
        this.engine.state.subscribe((key) => { if (key === '*' || key === 'syncOnStart') this._updateSyncBtn(); });

        // Panik/Reset (@dpa 20260715): Der normale Stop lässt alles sauber ausklingen –
        // dieser Knopf ist für den Ausnahmefall, dass doch mal etwas hängt. Er räumt hart
        // auf (Voices tot, Filter- und Reverb-Speicher genullt); Knacken ist dabei egal.
        this._panicBtn = this._btn('', () => this.engine.audioReset(), 'panic-btn');
        this._panicBtn.appendChild(icon('power'));
        this._panicBtn.appendChild(document.createTextNode(' Reset'));
        hint(this._panicBtn, 'Audio-Panik: alle Töne, Filter- und Hall-Fahnen sofort abwürgen (nur nötig, wenn nach dem Stop etwas hängt – knackt hörbar)');
        this.element.appendChild(this._panicBtn);

        const sep = () => { const s = document.createElement('span'); s.className = 'pb-sep'; this.element.appendChild(s); };
        sep();

        // Ensemble-Snapshots (@dpa 20260716_132014 – neu als PickMenu, s. js/ui/PickMenu.js):
        // Der geladene Snapshot steht auf dem Knopf und ist IN der Liste markiert; ein Klick
        // auf ihn lädt ihn erneut (der eigentliche Zweck, den das native <select> nicht
        // konnte). Überschreiben/Löschen hängen an ihrer Zeile, Neu/Export/Import in der
        // Fußzeile – die fünf Icons neben der Box sind damit weg.
        this._snapMenu = new PickMenu({
            label: 'Snapshot',
            empty: '— kein Snapshot —',
            title: 'Snapshot wählen · den markierten erneut wählen lädt ihn erneut',
            list: () => this.presets.listSnapshots(),
            current: () => this.engine.state.get('snapSel') || '',
            onPick: (i, it) => {
                this.engine.state.set('snapSel', it.name);   // erst merken (Optik-Key)…
                this.presets.recallSnapshot(i);              // …dann laden (Recall behält snapSel)
                this.refreshSnapshots();
            },
            onOpen: () => this._countUse('snapOpened'),
            onUpdate: (i) => { this.presets.updateSnapshot(i); this._updateSnapMark(); },
            // Umbenennen zieht `snapSel` nach: der gemerkte Name IST die Anzeige (Knopf,
            // Markierung, Dirty-Marker). Ohne das Nachziehen zeigte der Knopf nach dem
            // Umbenennen auf einen Namen, den es nicht mehr gibt → „— kein Snapshot —",
            // obwohl derselbe Snapshot noch geladen ist.
            onRename: (i, it, nm) => {
                const err = this.presets.renameSnapshot(i, nm);
                if (!err && this.engine.state.get('snapSel') === it.name) this.engine.state.set('snapSel', nm);
                this.refreshSnapshots();
                return err;
            },
            onDelete: (i, it) => {
                if (!confirm('Snapshot „' + it.name + '" löschen?')) return;
                this.presets.deleteSnapshot(i);
                if (this.engine.state.get('snapSel') === it.name) this.engine.state.set('snapSel', '');
                this.refreshSnapshots();
            },
            foot: [
                ['plus', 'Neu…', 'Aktuellen Zustand als neuen Snapshot speichern (gleicher Name = überschreiben)', () => {
                    const name = prompt('Snapshot-Name?', '');
                    if (name === null) return;
                    const list = this.presets.saveSnapshot(name);
                    // Nach dem Speichern direkt AUF den neuen Snapshot setzen (@dpa 20260713).
                    const nm = name || (list[list.length - 1] && list[list.length - 1].name) || '';
                    this.engine.state.set('snapSel', nm);
                    this.refreshSnapshots();
                }],
                ['export', 'Export', 'Geladenen Snapshot als JSON-Datei sichern', () => this.presets.exportSnapshot(this.engine.state.get('snapSel'))],
                // Gegenstück zum Export (@dpa 20260715): Snapshot aus einer Datei holen.
                // Gleicher Name = überschreiben (Upsert, wie „Neu"), danach direkt geladen –
                // sonst müsste man ihn nach dem Import erst noch von Hand auswählen.
                ['import', 'Import', 'Snapshot aus Datei laden (JSON) – gleicher Name überschreibt', async () => {
                    const f = await pickTextFile();
                    if (!f) return;
                    let res;
                    try { res = this.presets.importSnapshot(f.text); }
                    catch (e) { alert('Import nicht möglich:\n\n' + e.message); return; }
                    const i = res.list.findIndex((s) => s.name === res.name);
                    this.engine.state.set('snapSel', res.name);
                    if (i >= 0) this.presets.recallSnapshot(i);
                    this.refreshSnapshots();
                }],
            ],
        });
        this.element.appendChild(this._snapMenu.element);
        this._paintHints();
        this.engine.state.subscribe((key) => {
            if (key === '*' || key === 'snapOpened' || key === 'playUsed') this._paintHints();
        });
        // Live-Dirty-Marker: '*' sobald der aktuelle Zustand vom gewählten Snapshot
        // abweicht, '‼' bei >60 % Abweichung. rAF-entprellt (perf: nicht pro Event).
        this._snapMark = document.createElement('span'); this._snapMark.className = 'snap-dirty';
        this.element.appendChild(this._snapMark);
        this.engine.state.subscribe((key) => {
            if (key === '*' || key === 'snapSel') this.refreshSnapshots();
            this._scheduleSnapMark();
        });

        this.refreshSnapshots();
    }

    /** Wie oft man einen Knopf benutzen darf, bevor sein atmender Hinweis geht. Zwei, weil
     *  einmal auch ein Verklicken sein kann (@dpa 20260717). */
    static HINT_USES = 2;

    /** Benutzen zählen – bis zur Grenze, dann bleibt der Zähler stehen. Kein Weiterzählen:
     *  der Wert ist ein Hinweis-Schalter, kein Protokoll darüber, was jemand wie oft tut. */
    _countUse(key) {
        const n = this.engine.state.get(key) || 0;
        if (n < PresetBar.HINT_USES) this.engine.state.set(key, n + 1);
    }

    /** Wer atmet noch? (s. `.breathe` in css/main.css) Beide Hinweise hängen an Optik-Keys
     *  → ein Backup/Optik-Recall kann sie mitbringen und auch wieder anschalten. */
    _paintHints() {
        const known = (key) => (this.engine.state.get(key) || 0) >= PresetBar.HINT_USES;
        if (this._playBtn) this._playBtn.classList.toggle('breathe', !known('playUsed'));
        if (this._snapMenu) this._snapMenu.element.classList.toggle('breathe', !known('snapOpened'));
    }

    _scheduleSnapMark() {
        if (this._markRaf) return;
        this._markRaf = requestAnimationFrame(() => { this._markRaf = null; this._updateSnapMark(); });
    }
    _updateSnapMark() {
        if (!this._snapMark) return;
        // Der geladene Snapshot ist der gemerkte Name (snapSel) – das Menü hält keine
        // eigene Auswahl, es zeigt diesen an.
        const want = this.engine.state.get('snapSel');
        const i = want ? this.presets.listSnapshots().findIndex((s) => s.name === want) : -1;
        const d = i >= 0 ? this.presets.snapshotDirty(i) : null;
        this._snapMark.textContent = (!d || !d.changed) ? '' : (d.frac > 0.6 ? '‼' : '*');
        this._snapMark.title = d && d.changed ? `${d.changed}/${d.total} Parameter gegenüber „${want}" verändert` : '';
    }

    /** Transport-Knopf zeichnen (Icon + Wort). Eine Stelle für beide Zustände: mit dem
     *  SVG-Icon darf hier kein textContent mehr gesetzt werden – das löschte das Icon. */
    _paintPlayBtn() {
        const on = this.engine.running;
        this._playBtn.textContent = '';
        this._playBtn.appendChild(icon(on ? 'stop' : 'play'));
        this._playBtn.appendChild(document.createTextNode(on ? ' Stop' : ' Start'));
        this._playBtn.classList.toggle('on', on);
    }

    toggle() {
        // Hier zählen, nicht im Klick-Handler: die Leertaste ruft dieselbe Stelle
        // (app.js) – wer mit Space startet, hat den Knopf genauso verstanden.
        this._countUse('playUsed');
        if (this.engine.running) this.engine.stop(); else this.engine.start();
        this._paintPlayBtn();
    }

    _toggleSync() { const st = this.engine.state; st.set('syncOnStart', !st.get('syncOnStart')); }
    _updateSyncBtn() { this._syncBtn.classList.toggle('on', !!this.engine.state.get('syncOnStart')); }

    refreshSnapshots() {
        if (this._snapMenu) this._snapMenu.refresh();
        this._updateSnapMark();
    }

    _btn(label, onClick, cls = '') {
        const b = document.createElement('button');
        b.className = 'pb-btn ' + cls;
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
    }

    mount(parent) { parent.appendChild(this.element); }
}
