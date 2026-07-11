/**
 * PresetBar.js – Transport + Snapshot/Skalen-Verwaltung.
 */
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
        this.element.appendChild(this._playBtn);

        // Sync: bei aktivem Schalter beginnen bei jedem Start alle Sequenzer bei Step 1.
        this._syncBtn = this._btn('⟲ Sync', () => this._toggleSync(), 'sync-btn');
        this._syncBtn.title = 'Sync: bei jedem Start alle Sequenzer wieder bei Step 1 beginnen';
        this.element.appendChild(this._syncBtn);
        this._updateSyncBtn();
        this.engine.state.subscribe((key) => { if (key === '*' || key === 'syncOnStart') this._updateSyncBtn(); });

        const sep = () => { const s = document.createElement('span'); s.className = 'pb-sep'; this.element.appendChild(s); };
        sep();

        // Ensemble-Snapshots
        this._snapSel = document.createElement('select');
        this._snapSel.className = 'pb-select';
        // Kompakter Cluster: Select + Icon-Buttons flach & aligned in einer Box.
        // Einheitliche Icon-Sprache (auch in Skala/Optik): ↺ laden · ✎ überschreiben ·
        // ＋ neu · ⤓ export – zusätzlich je Aktion eine Farbe, damit sie klar
        // unterscheidbar sind (glyph + Farbe, nicht nur ähnliche Rundpfeile).
        const cluster = this._cluster('Snapshot', this._snapSel, [
            ['✎', 'Ausgewählten Snapshot mit aktuellem Zustand überschreiben (Update)', () => {
                const i = this._snapSel.selectedIndex - 1;
                if (i >= 0) this.presets.updateSnapshot(i);
            }, 'save'],
            ['＋', 'Als neuen Snapshot speichern (gleicher Name = überschreiben)', () => {
                const name = prompt('Snapshot-Name?', '');
                if (name !== null) { this.presets.saveSnapshot(name); this.refreshSnapshots(); }
            }, 'new'],
            ['⤓', 'Snapshot exportieren (JSON)', () => this.presets.exportSnapshot(this._snapSel.value), 'export'],
            ['🗑', 'Ausgewählten Snapshot löschen', () => {
                const i = this._snapSel.selectedIndex - 1;
                if (i >= 0 && confirm('Snapshot „' + this._snapSel.value + '" löschen?')) { this.presets.deleteSnapshot(i); this.refreshSnapshots(); }
            }, 'del'],
        ]);
        this.element.appendChild(cluster);
        // Live-Dirty-Marker: '*' sobald der aktuelle Zustand vom gewählten Snapshot
        // abweicht, '‼' bei >60 % Abweichung. rAF-entprellt (perf: nicht pro Event).
        this._snapMark = document.createElement('span'); this._snapMark.className = 'snap-dirty';
        this.element.appendChild(this._snapMark);
        // Auswahl LÄDT direkt (wie Combo/Gruppen-Snapshot – kein separater ↺-Button mehr)
        // und wird gemerkt (Optik), damit das Dropdown nach Reset/Recall richtig steht.
        this._snapSel.addEventListener('change', () => {
            const i = this._snapSel.selectedIndex - 1;
            this.engine.state.set('snapSel', i >= 0 ? this._snapSel.value : '');
            if (i >= 0) this.presets.recallSnapshot(i);
        });
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
        const i = this._snapSel.selectedIndex - 1;
        const d = i >= 0 ? this.presets.snapshotDirty(i) : null;
        this._snapMark.textContent = (!d || !d.changed) ? '' : (d.frac > 0.6 ? '‼' : '*');
        this._snapMark.title = d && d.changed ? `${d.changed}/${d.total} Parameter gegenüber „${this._snapSel.value}" verändert` : '';
    }

    toggle() {
        if (this.engine.running) { this.engine.stop(); this._playBtn.textContent = '▶ Start'; this._playBtn.classList.remove('on'); }
        else { this.engine.start(); this._playBtn.textContent = '■ Stop'; this._playBtn.classList.add('on'); }
    }

    _toggleSync() { const st = this.engine.state; st.set('syncOnStart', !st.get('syncOnStart')); }
    _updateSyncBtn() { this._syncBtn.classList.toggle('on', !!this.engine.state.get('syncOnStart')); }

    refreshSnapshots() {
        this._fill(this._snapSel, this.presets.listSnapshots(), '— Snapshot —');
        const want = this.engine.state.get('snapSel');
        if (want && [...this._snapSel.options].some((o) => o.textContent === want)) this._snapSel.value = want;
        this._updateSnapMark();
    }

    _fill(sel, list, placeholder) {
        sel.innerHTML = '';
        const ph = document.createElement('option'); ph.textContent = placeholder; sel.appendChild(ph);
        list.forEach((it) => { const o = document.createElement('option'); o.textContent = it.name; sel.appendChild(o); });
    }

    _btn(label, onClick, cls = '') {
        const b = document.createElement('button');
        b.className = 'pb-btn ' + cls;
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
    }

    /** Kompakter Icon-Button mit Tooltip (title) und optionaler Aktions-Farbe. */
    _iconBtn(icon, title, onClick, kind = '') {
        const b = this._btn(icon, onClick, 'pb-icon' + (kind ? ' pb-ic-' + kind : ''));
        b.title = title;
        b.setAttribute('aria-label', title);
        return b;
    }

    /**
     * Flacher, aligned Preset-Cluster: kleines Label + Select + Icon-Buttons in
     * einer umrandeten Box (gleiche Höhe für Snapshot / Skala / Optik).
     * @param {string} label
     * @param {HTMLElement} sel
     * @param {[string,string,Function][]} icons – [glyph, title, onClick]
     */
    _cluster(label, sel, icons) {
        const box = document.createElement('div'); box.className = 'pb-cluster';
        const lab = document.createElement('span'); lab.className = 'pb-cluster-label'; lab.textContent = label;
        box.appendChild(lab); box.appendChild(sel);
        icons.forEach(([g, t, fn, kind]) => box.appendChild(this._iconBtn(g, t, fn, kind)));
        return box;
    }

    _labelWrap(label, el) {
        const w = document.createElement('label');
        w.className = 'pb-field';
        const s = document.createElement('span'); s.textContent = label;
        w.appendChild(s); w.appendChild(el);
        return w;
    }

    mount(parent) { parent.appendChild(this.element); }
}
