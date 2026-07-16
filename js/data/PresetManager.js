/**
 * PresetManager.js – 3-Ebenen-Presets mit sauberer Recall-Sequenz.
 *
 *   • Ensemble-Snapshot : ALLE State-Werte (global)
 *   • Skalen-Preset     : nur die 12-Ton-Maske
 *   (Control-Presets je Modul: später)
 *
 * Recall-Disziplin (NI-Reaktor-Lehre): Clock stoppen → State laden → Defaults
 * für fehlende Felder → UI + Engine folgen über State-Subscription → neu starten.
 */
import { downloadJSON, safeFilename } from '../core/fileIO.js';

export class PresetManager {
    /** Kennung der Snapshot-DATEI (Export/Import). Seit 20260715, ältere Exporte haben keine. */
    static SNAP_FILE_KIND = 'teslacoil-snapshot';

    /**
     * @param {import('../core/State.js').State} state
     * @param {import('../engine/TeslaEngine.js').TeslaEngine} engine
     */
    constructor(state, engine) {
        this.state = state;
        this.engine = engine;
        this.snapKey = 'teslacoil_snapshots';
        this.scaleKey = 'teslacoil_scales';
        this.layoutKey = 'teslacoil_layouts';
        this.groupSnapKey = 'teslacoil_group_snaps';   // { Gruppenname: [ {name, values} ] }
        this.p2Key = 'teslacoil_p2';                   // P2-Bündel: [ {name, slots:[12]} ]
    }

    /* ── Gruppen-Snapshots (nur die Sound-Parameter EINER Gruppe) ──
     * Eigenes System, verwaltet über die Gruppen-Einstellungen. Rein Sound, keine
     * Optik. `keys` liefert der Aufrufer (die in dieser Gruppe gezeigten State-Keys). */
    _readGroupSnaps() { try { return JSON.parse(localStorage.getItem(this.groupSnapKey)) || {}; } catch { return {}; } }
    _writeGroupSnaps(o) { localStorage.setItem(this.groupSnapKey, JSON.stringify(o)); }
    listGroupSnaps(group) { return this._readGroupSnaps()[group] || []; }
    _pickValues(keys) { const v = {}; for (const k of keys) v[k] = this.state.get(k); return v; }

    /** Regler-Meta (Range/Kurve/Farbe) NUR für die Knob-Keys dieser Gruppe herausziehen. */
    _pickMeta(metaKeys) {
        const all = this.state.get('knobMeta') || {};
        const out = {};
        for (const k of metaKeys || []) if (all[k] !== undefined) out[k] = all[k];
        return out;
    }

    saveGroupSnap(group, name, keys, metaKeys) {
        const all = this._readGroupSnaps();
        const list = all[group] || [];
        // Snapshot trägt die Sound-Werte UND die Control-Settings (knobMeta) der Gruppe.
        const entry = { name, values: this._pickValues(keys), meta: this._pickMeta(metaKeys) };
        const at = list.findIndex((s) => s.name === name);
        if (at >= 0) list[at] = entry; else list.push(entry);   // Upsert bei Namensgleichheit
        all[group] = list; this._writeGroupSnaps(all);
        return list;
    }
    updateGroupSnap(group, index, keys, metaKeys) {
        const all = this._readGroupSnaps();
        const list = all[group] || [];
        if (!list[index]) return false;
        list[index] = { ...list[index], values: this._pickValues(keys), meta: this._pickMeta(metaKeys) };
        all[group] = list; this._writeGroupSnaps(all);
        return true;
    }
    recallGroupSnap(group, index) {
        const snap = this.listGroupSnaps(group)[index];
        if (!snap || !snap.values) return false;
        // Einzeln setzen (kein '*'): nur die Keys dieser Gruppe, UI folgt pro Key.
        for (const [k, v] of Object.entries(snap.values)) this.state.set(k, v);
        // Control-Settings (knobMeta) der Gruppe wiederherstellen (falls gespeichert).
        if (snap.meta && Object.keys(snap.meta).length) {
            this.state.set('knobMeta', { ...this.state.get('knobMeta'), ...snap.meta });
        }
        return true;
    }

    /* ── Dirty-Messung: wie stark weicht der aktuelle Zustand vom gespeicherten
     * Snapshot ab? → { changed, total, frac }. Für die '*'/'‼'-Markierung im Menü. */
    _eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    _dirtyOf(values) {
        if (!values) return null;
        const keys = Object.keys(values);
        let changed = 0;
        for (const k of keys) if (!this._eq(this.state.get(k), values[k])) changed++;
        return { changed, total: keys.length, frac: keys.length ? changed / keys.length : 0 };
    }
    groupSnapDirty(group, index) { const s = this.listGroupSnaps(group)[index]; return s ? this._dirtyOf(s.values) : null; }
    snapshotDirty(index) { const s = this._read(this.snapKey)[index]; return s ? this._dirtyOf(s.state) : null; }
    deleteGroupSnap(group, index) {
        const all = this._readGroupSnaps();
        const list = all[group] || []; list.splice(index, 1);
        all[group] = list; this._writeGroupSnaps(all);
        return list;
    }

    /* ── Optische Layouts – die EINE Optik-Ebene (Gruppen: Reihenfolge, Stile,
     * Klapp-Zustand, Combos; Regler-Meta/-Farben/-Farb-Presets; Reflections-Anzeige) ──
     * Bewusst UNABHÄNGIG vom Ensemble-Snapshot: rein optisch, kein Sound-Recall.
     * Vollständigkeit: JEDER rein optische State-Key MUSS hier stehen, sonst wandert
     * er unbeabsichtigt in den Sound-Snapshot. */
    static LAYOUT_KEYS = [
        'groupOrder', 'groupPos', 'groupStyles', 'groupStylePresets', 'controlOrder', 'ctrlPos',
        'knobMeta', 'knobColorPresets', 'ctrlStyles',
        'reflW', 'reflH', 'reflBg', 'reflColL', 'reflColR',
        'scopeOn', 'specOn', 'scopeSync', 'scopeRange', 'specGain',
        'scaleSel', 'snapSel', 'layoutSel', 'comboSel', 'groupComboSel', 'knobColorSel', 'groupSnapSel', 'p2Sel',
        'seqStyles',
        // Hilfe-Blasen: Schalter, Verzögerung und @dpas eigene Texte (@dpa 20260716_174111).
        // Optik, kein Klang – ein Snapshot-Recall darf niemandem die Hilfe umschreiben.
        'hintsOn', 'hintDelay', 'hintText',
        // Globale Beschriftung (@dpa 20260716_204921).
        'labelColor', 'valueBg', 'labelSize',
        'skal2On', 'skal2Active', 'skal2Slots',
        'debugName', 'debugPrompt',
        // Sprache ist eine Anzeige-Einstellung, kein Klang (@dpa 20260716_164359: „wird auch
        // in Backups gespeichert – logisch"). Als LAYOUT_KEY landet sie im Backup und im
        // Optik-Layout, aber NICHT im Sound-Snapshot: ein Snapshot-Recall darf niemandem
        // die Sprache umstellen.
        'lang',
    ];

    /** Optische Felder aus einem State-Objekt herausziehen. */
    _pickLayout(src) {
        const out = {};
        for (const k of PresetManager.LAYOUT_KEYS) if (src[k] !== undefined) out[k] = src[k];
        return out;
    }

    listLayouts() { return this._read(this.layoutKey); }

    saveLayout(name) {
        const list = this._read(this.layoutKey);
        list.push({ name: name || `Layout ${list.length + 1}`, ts: Date.now(), layout: this._pickLayout(this.state.toJSON()) });
        this._write(this.layoutKey, list);
        return list;
    }

    /** Layout unter `name` speichern oder – falls vorhanden – überschreiben (Upsert).
     *  Für den automatischen Optik-Autospeicher ("default"): ein einziger, still
     *  gepflegter Slot statt manueller Speicherverwaltung. */
    saveOrUpdateLayout(name) {
        const list = this._read(this.layoutKey);
        const entry = { name, ts: Date.now(), layout: this._pickLayout(this.state.toJSON()) };
        const at = list.findIndex((l) => l.name === name);
        if (at >= 0) list[at] = entry; else list.push(entry);
        this._write(this.layoutKey, list);
        return list;
    }

    recallLayout(index) {
        const list = this._read(this.layoutKey);
        const it = list[index];
        if (!it || !it.layout) return false;
        // Einzeln setzen (nicht patch '*'): nur optische Keys, kein Sound-Recall.
        for (const [k, v] of Object.entries(it.layout)) this.state.set(k, v);
        return true;
    }

    /** Das Layout-Preset an `index` mit der aktuellen Optik überschreiben (Update). */
    updateLayout(index) {
        const list = this._read(this.layoutKey);
        if (!list[index]) return false;
        list[index] = { ...list[index], ts: Date.now(), layout: this._pickLayout(this.state.toJSON()) };
        this._write(this.layoutKey, list);
        return true;
    }

    deleteLayout(index) {
        const list = this._read(this.layoutKey);
        list.splice(index, 1);
        this._write(this.layoutKey, list);
        return list;
    }

    exportLayout(name) {
        const data = { name: name || 'layout', ts: Date.now(), layout: this._pickLayout(this.state.toJSON()) };
        this._download(data, `teslacoil_layout_${(data.name).replace(/[^a-z0-9]/gi, '_')}.json`);
    }

    /**
     * Einmal-Seed: Übernimm die optischen Einstellungen aus dem Snapshot
     * "verschiebetest" in ein Layout-Preset (falls noch keine Layouts existieren).
     * @returns {boolean} true, wenn geseedet wurde
     */
    seedLayoutsFromSnapshot(snapName = 'verschiebetest') {
        if (this._read(this.layoutKey).length) return false;
        const snap = this._read(this.snapKey).find((s) => s.name === snapName);
        if (!snap || !snap.state) return false;
        const layout = this._pickLayout(snap.state);
        if (!Object.keys(layout).length) return false;
        this._write(this.layoutKey, [{ name: snapName, ts: Date.now(), layout }]);
        return true;
    }

    /* ── Ensemble-Snapshots ── */
    listSnapshots() { return this._read(this.snapKey); }

    /** State OHNE die optischen Layout-Keys (die leben getrennt in "Optik"). */
    _snapshotState() {
        const st = this.state.toJSON();
        for (const k of PresetManager.LAYOUT_KEYS) delete st[k];
        return st;
    }

    /**
     * Snapshot speichern. Existiert bereits einer mit gleichem Namen, wird er
     * ÜBERSCHRIEBEN (Upsert) – so lässt sich ein Snapshot einfach aktualisieren.
     */
    saveSnapshot(name) {
        const list = this._read(this.snapKey);
        const nm = name || `Snapshot ${new Date().toLocaleString()}`;
        const entry = { name: nm, ts: Date.now(), version: 1, state: this._snapshotState() };
        const at = list.findIndex((s) => s.name === nm);
        if (at >= 0) list[at] = entry; else list.push(entry);
        this._write(this.snapKey, list);
        return list;
    }

    /** Den Snapshot an `index` mit dem aktuellen Zustand überschreiben (Update). */
    updateSnapshot(index) {
        const list = this._read(this.snapKey);
        if (!list[index]) return false;
        list[index] = { ...list[index], ts: Date.now(), state: this._snapshotState() };
        this._write(this.snapKey, list);
        return true;
    }

    recallSnapshot(index) {
        const list = this._read(this.snapKey);
        const snap = list[index];
        if (!snap || !snap.state) return false;
        const wasRunning = this.engine.running;
        this.engine.stop();                 // 1) Transport anhalten
        // Optik NICHT anfassen: aktuelle Layout-Werte in den zu ladenden State übernehmen.
        const cur = this.state.toJSON();
        const merged = { ...snap.state };
        for (const k of PresetManager.LAYOUT_KEYS) merged[k] = cur[k];
        this.state.loadFromJSON(merged);     // 2+3) State + Defaults, emit '*' → UI & Engine folgen
        if (wasRunning) this.engine.start(); // 4) neu starten
        return true;
    }

    deleteSnapshot(index) {
        const list = this._read(this.snapKey);
        list.splice(index, 1);
        this._write(this.snapKey, list);
        return list;
    }

    exportSnapshot(name) {
        const snap = { kind: PresetManager.SNAP_FILE_KIND, name: name || 'teslacoil', ts: Date.now(), version: 1, state: this._snapshotState() };
        this._download(snap, `teslacoil_${safeFilename(snap.name)}.json`);
    }

    /**
     * Snapshot-Datei prüfen und entpacken (rein, ohne Storage → headless getestet).
     *
     * Akzeptiert bewusst auch Dateien OHNE `kind`: Exporte von vor 20260715 hatten
     * die Kennung noch nicht, die sollen weiter ladbar bleiben. Erkannt wird dann
     * an der Form (name + state).
     *
     * @param {string} text – Dateiinhalt
     * @returns {{name:string, state:Object}}
     */
    static parseSnapshotFile(text) {
        let obj;
        try { obj = JSON.parse(text); }
        catch { throw new Error('Das ist keine gültige JSON-Datei.'); }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Die Datei enthält kein Snapshot-Objekt.');
        // Ein volles Backup hat 'data' statt 'state' – der häufigste Fehlgriff.
        if (obj.data && !obj.state) throw new Error('Das ist eine komplette Backup-Datei, kein Snapshot.\nDie lädst du in den Einstellungen unter „Datei".');
        if (obj.kind && obj.kind !== PresetManager.SNAP_FILE_KIND) throw new Error('Das ist keine teslacoil-Snapshot-Datei.');
        if (!obj.state || typeof obj.state !== 'object' || Array.isArray(obj.state)) throw new Error('Die Datei enthält keinen Snapshot-Zustand.');
        // Optik-Keys rauswerfen: Ein Snapshot darf NIE das Layout anfassen (Trennung
        // Sound/Optik). Eine fremde oder handgebaute Datei könnte welche mitbringen.
        const state = { ...obj.state };
        for (const k of PresetManager.LAYOUT_KEYS) delete state[k];
        // Erst NACH dem Strippen auf „leer" prüfen: Eine Datei mit ausschließlich
        // Optik-Keys ist sonst formal nicht leer, hinterher aber schon – und ein leerer
        // Snapshot würde beim Recall den kompletten Sound-Zustand auf Defaults reißen.
        if (!Object.keys(state).length) throw new Error('Der Snapshot in der Datei ist leer (enthält keine Sound-Werte).');
        const name = String(obj.name || '').trim() || 'Import';
        return { name, state };
    }

    /**
     * Snapshot aus einer Datei übernehmen und speichern (Upsert wie saveSnapshot).
     * @param {string} text – Dateiinhalt
     * @returns {{name:string, list:Array}} gespeicherter Name + neue Liste
     */
    importSnapshot(text) {
        const { name, state } = PresetManager.parseSnapshotFile(text);
        const list = this._read(this.snapKey);
        const entry = { name, ts: Date.now(), version: 1, state };
        const at = list.findIndex((s) => s.name === name);
        if (at >= 0) list[at] = entry; else list.push(entry);
        this._write(this.snapKey, list);
        return { name, list };
    }

    /** JSON-Objekt als Datei-Download anbieten. */
    _download(obj, filename) { downloadJSON(obj, filename); }

    /* ── Skalen-Presets (nur Maske) ── */
    listScales() { return this._read(this.scaleKey); }

    saveScale(name) {
        const list = this._read(this.scaleKey);
        list.push({ name: name || `Skala ${list.length + 1}`, mask: this.state.get('scaleMask').slice() });
        this._write(this.scaleKey, list);
        return list;
    }

    recallScale(index) {
        const list = this._read(this.scaleKey);
        const sc = list[index];
        if (!sc) return false;
        this.state.set('scaleMask', sc.mask.slice());
        return true;
    }

    deleteScale(index) {
        const list = this._read(this.scaleKey);
        list.splice(index, 1);
        this._write(this.scaleKey, list);
        return list;
    }

    /** Das Skalen-Preset an `index` mit der aktuellen Maske überschreiben (Update). */
    updateScale(index) {
        const list = this._read(this.scaleKey);
        if (!list[index]) return false;
        list[index] = { ...list[index], mask: this.state.get('scaleMask').slice() };
        this._write(this.scaleKey, list);
        return true;
    }

    /* ── P2 = die 12 skal2-Slots als benanntes Bündel (wie Skalen-Presets, nur der
     *    ganze Satz auf einmal). Reine Optik-Preset-Ebene, im localStorage. ── */
    _cloneSlots(s) { return JSON.parse(JSON.stringify(s || [])); }
    listP2() { return this._read(this.p2Key); }
    saveP2(name) {
        const list = this._read(this.p2Key);
        list.push({ name: name || `P2 ${list.length + 1}`, slots: this._cloneSlots(this.state.get('skal2Slots')) });
        this._write(this.p2Key, list);
        return list;
    }
    recallP2(index) {
        const list = this._read(this.p2Key);
        const it = list[index];
        if (!it) return false;
        this.state.set('skal2Slots', this._cloneSlots(it.slots));
        return true;
    }
    updateP2(index) {
        const list = this._read(this.p2Key);
        if (!list[index]) return false;
        list[index] = { ...list[index], slots: this._cloneSlots(this.state.get('skal2Slots')) };
        this._write(this.p2Key, list);
        return true;
    }
    deleteP2(index) {
        const list = this._read(this.p2Key);
        list.splice(index, 1);
        this._write(this.p2Key, list);
        return list;
    }

    /* ── Storage ── */
    _read(key) {
        try { return JSON.parse(localStorage.getItem(key)) || []; }
        catch { return []; }
    }
    _write(key, list) { localStorage.setItem(key, JSON.stringify(list)); }
}
