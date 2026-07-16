/**
 * PresetBar.js – Transport + Snapshot/Skalen-Verwaltung.
 */
import { pickTextFile } from '../core/fileIO.js';
import { PickMenu } from './PickMenu.js';

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
        this._playBtn = this._btn('▶ Start', () => this.toggle(), 'play-btn');
        // War als eigener Hint im Header untergebracht – zog dort nur unnötig Platz,
        // gehört inhaltlich sowieso zum Start-Button (@dpa 20260713).
        this._playBtn.title = 'Leertaste = Start/Stop';
        this.element.appendChild(this._playBtn);

        // Sync: bei aktivem Schalter beginnen bei jedem Start alle Sequenzer bei Step 1.
        this._syncBtn = this._btn('', () => this._toggleSync(), 'sync-btn');
        // Icon separat vom Wort (@dpa 20260714): nur der Reload-Glyph darf größer werden,
        // die Schrift „Sync" bleibt so groß wie „Start".
        this._syncBtn.innerHTML = '<span class="sync-ico">⟲</span> Sync';
        this._syncBtn.title = 'Sync: bei jedem Start alle Sequenzer wieder bei Step 1 beginnen';
        this.element.appendChild(this._syncBtn);
        this._updateSyncBtn();
        this.engine.state.subscribe((key) => { if (key === '*' || key === 'syncOnStart') this._updateSyncBtn(); });

        // Panik/Reset (@dpa 20260715): Der normale Stop lässt alles sauber ausklingen –
        // dieser Knopf ist für den Ausnahmefall, dass doch mal etwas hängt. Er räumt hart
        // auf (Voices tot, Filter- und Reverb-Speicher genullt); Knacken ist dabei egal.
        this._panicBtn = this._btn('', () => this.engine.audioReset(), 'panic-btn');
        this._panicBtn.innerHTML = '<span class="panic-ico">⏻</span> Reset';
        this._panicBtn.title = 'Audio-Panik: alle Töne, Filter- und Hall-Fahnen sofort abwürgen '
            + '(nur nötig, wenn nach dem Stop etwas hängt – knackt hörbar)';
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
            onUpdate: (i) => { this.presets.updateSnapshot(i); this._updateSnapMark(); },
            onDelete: (i, it) => {
                if (!confirm('Snapshot „' + it.name + '" löschen?')) return;
                this.presets.deleteSnapshot(i);
                if (this.engine.state.get('snapSel') === it.name) this.engine.state.set('snapSel', '');
                this.refreshSnapshots();
            },
            foot: [
                ['<span class="pm-fic pb-ic-new">＋</span>Neu…', 'Aktuellen Zustand als neuen Snapshot speichern (gleicher Name = überschreiben)', () => {
                    const name = prompt('Snapshot-Name?', '');
                    if (name === null) return;
                    const list = this.presets.saveSnapshot(name);
                    // Nach dem Speichern direkt AUF den neuen Snapshot setzen (@dpa 20260713).
                    const nm = name || (list[list.length - 1] && list[list.length - 1].name) || '';
                    this.engine.state.set('snapSel', nm);
                    this.refreshSnapshots();
                }],
                ['<span class="pm-fic pb-ic-export">⤓</span>Export', 'Geladenen Snapshot als JSON-Datei sichern', () => this.presets.exportSnapshot(this.engine.state.get('snapSel'))],
                // Gegenstück zum Export (@dpa 20260715): Snapshot aus einer Datei holen.
                // Gleicher Name = überschreiben (Upsert, wie „Neu"), danach direkt geladen –
                // sonst müsste man ihn nach dem Import erst noch von Hand auswählen.
                ['<span class="pm-fic pb-ic-import">⤒</span>Import', 'Snapshot aus Datei laden (JSON) – gleicher Name überschreibt', async () => {
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

    toggle() {
        if (this.engine.running) { this.engine.stop(); this._playBtn.textContent = '▶ Start'; this._playBtn.classList.remove('on'); }
        else { this.engine.start(); this._playBtn.textContent = '■ Stop'; this._playBtn.classList.add('on'); }
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
