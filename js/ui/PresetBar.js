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

        // Ensemble-Snapshots
        this._snapSel = document.createElement('select');
        this._snapSel.className = 'pb-select';
        // Kompakter Cluster: Select + Icon-Buttons flach & aligned in einer Box.
        // Einheitliche Icon-Sprache (auch in Skala/Optik): ↺ laden · ✎ überschreiben ·
        // ＋ neu · ⤓ export – zusätzlich je Aktion eine Farbe, damit sie klar
        // unterscheidbar sind (glyph + Farbe, nicht nur ähnliche Rundpfeile).
        // Der geladene Snapshot ergibt sich aus dem gemerkten Namen (snapSel), da die Box
        // auf dem Platzhalter steht (Reselect-fähig). Icons wirken auf diesen.
        const curIdx = () => { const w = this.engine.state.get('snapSel'); return w ? this.presets.listSnapshots().findIndex((s) => s.name === w) : -1; };
        const cluster = this._cluster('Snapshot', this._snapSel, [
            ['✎', 'Geladenen Snapshot mit aktuellem Zustand überschreiben (Update)', () => {
                const i = curIdx();
                if (i >= 0) { this.presets.updateSnapshot(i); this._updateSnapMark(); }
            }, 'save'],
            ['＋', 'Als neuen Snapshot speichern (gleicher Name = überschreiben)', () => {
                const name = prompt('Snapshot-Name?', '');
                if (name !== null) {
                    const list = this.presets.saveSnapshot(name);
                    // Nach dem Speichern direkt AUF den neuen Snapshot setzen (@dpa 20260713).
                    const nm = name || (list[list.length - 1] && list[list.length - 1].name) || '';
                    this.engine.state.set('snapSel', nm);
                    this.refreshSnapshots();
                }
            }, 'new'],
            ['⤓', 'Geladenen Snapshot exportieren (JSON)', () => this.presets.exportSnapshot(this.engine.state.get('snapSel')), 'export'],
            ['🗑', 'Geladenen Snapshot löschen', () => {
                const i = curIdx(); const w = this.engine.state.get('snapSel');
                if (i >= 0 && confirm('Snapshot „' + w + '" löschen?')) { this.presets.deleteSnapshot(i); this.engine.state.set('snapSel', ''); this.refreshSnapshots(); }
            }, 'del'],
        ]);
        this.element.appendChild(cluster);
        // Live-Dirty-Marker: '*' sobald der aktuelle Zustand vom gewählten Snapshot
        // abweicht, '‼' bei >60 % Abweichung. rAF-entprellt (perf: nicht pro Event).
        this._snapMark = document.createElement('span'); this._snapMark.className = 'snap-dirty';
        this.element.appendChild(this._snapMark);
        // Auswahl LÄDT direkt (wie Combo/Gruppen-Snapshot – kein separater ↺-Button mehr)
        // und wird gemerkt (Optik). Der geladene Name steht im Platzhalter (↻ Name), die
        // Box selbst bleibt auf dem Platzhalter → dasselbe Element ERNEUT wählen feuert
        // wieder 'change' und stellt den Snapshot erneut her (@dpa 20260713).
        this._snapSel.addEventListener('change', () => {
            const i = this._snapSel.selectedIndex - 1;
            if (i >= 0) {
                this.engine.state.set('snapSel', this._snapSel.value);   // erst merken (Optik-Key)…
                this.presets.recallSnapshot(i);                          // …dann laden (Recall behält snapSel)
            } else {
                this.engine.state.set('snapSel', '');
            }
            this.refreshSnapshots();
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
        // Die Box steht auf dem Platzhalter → der geladene Snapshot ergibt sich aus dem
        // gemerkten Namen (snapSel), nicht aus selectedIndex.
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
        const sel = this._snapSel;
        const want = this.engine.state.get('snapSel');
        const exists = want && this.presets.listSnapshots().some((s) => s.name === want);
        sel.innerHTML = '';
        // Platzhalter trägt den geladenen Namen (↻ Name) → man sieht, was aktiv ist, und
        // die Box bleibt trotzdem auf Index 0, damit ein erneutes Wählen wieder feuert.
        const ph = document.createElement('option'); ph.textContent = exists ? `↻ ${want}` : '— Snapshot —'; sel.appendChild(ph);
        this.presets.listSnapshots().forEach((it) => { const o = document.createElement('option'); o.textContent = it.name; sel.appendChild(o); });
        sel.selectedIndex = 0;
        this._updateSnapMark();
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
