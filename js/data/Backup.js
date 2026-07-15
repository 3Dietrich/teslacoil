/**
 * Backup.js – Vollständige Sicherungen ALLER teslacoil-localStorage-Keys.
 *
 * Hintergrund (@dpa 20260714): „Werkeinstellung zurücksetzen" hatte den kompletten
 * Zustand vernichtet (Live + überschriebenes 'default'-Layout) und musste per RAM-
 * Forensik gerettet werden. Damit das nie wieder passiert, sichert der Synth den
 * kompletten Zustand automatisch mit gestaffelter Aufbewahrung und lässt sich vor
 * jedem Reset zusätzlich sichern.
 *
 * Bewusst rein-funktional (Storage wird als Parameter reingereicht) → headless
 * testbar (test/logic.test.mjs) mit einem Fake-Storage.
 */

/** Schlüssel des localStorage, die zum vollständigen Zustand gehören. */
export const BACKED_UP_KEYS = [
    'teslacoil_live',        // Boot-Zustand (Sound + Optik)
    'teslacoil_snapshots',   // Sound-Snapshots
    'teslacoil_scales',      // Skalen
    'teslacoil_layouts',     // Optik/Layouts (inkl. 'default')
    'teslacoil_group_snaps', // Gruppen-Snapshots
    'teslacoil_p2',          // P2-Bündel
];

/** Eigener Key, unter dem die Liste der Backups liegt. */
export const BACKUP_KEY = 'teslacoil_backups';

/** Kennung/Version der Backup-DATEI (Export). Nur damit erkennen wir sie beim Import. */
export const FILE_KIND = 'teslacoil-backup';
export const FILE_VERSION = 1;

/** Zeitfenster + Obergrenzen der gestaffelten Aufbewahrung (@dpa 20260714). */
export const WINDOWS = {
    minute: 60e3,          // < 1 min: max 2
    hour: 3600e3,          // < 1 h:  max 5 (inkl. der Minuten-Backups)
    day: 86400e3,          // 1 h–1 Woche: 1 pro Tag
    week: 7 * 86400e3,     // ab 1 Woche: 1 pro Woche
    maxMinute: 2,
    maxHour: 5,
};

/** Rohen Zustand aller Keys einsammeln (Werte bleiben als Strings, verlustfrei). */
export function captureState(storage) {
    const data = {};
    for (const k of BACKED_UP_KEYS) { const v = storage.getItem(k); if (v != null) data[k] = v; }
    return data;
}

/** Zustand vollständig zurückschreiben – fehlende Keys werden entfernt (echter Ersatz). */
export function restoreState(storage, data) {
    for (const k of BACKED_UP_KEYS) {
        if (data && data[k] != null) storage.setItem(k, data[k]);
        else storage.removeItem(k);
    }
}

/**
 * Backup-Liste gestaffelt ausdünnen. Erwartet Einträge {ts, ...}; gibt die zu
 * behaltenden zurück (neueste zuerst). Regeln:
 *   < 1 min:      max 2
 *   < 1 h:        max 5 (die Minuten-Backups zählen mit → nie >5 in der Stunde)
 *   1 h – 1 Woche: höchstens 1 pro Kalender-Tag-Bucket
 *   ab 1 Woche:   höchstens 1 pro Wochen-Bucket
 */
export function thinBackups(list, now, W = WINDOWS) {
    const sorted = [...list].sort((a, b) => b.ts - a.ts);   // neueste zuerst
    const keep = [];
    let minC = 0, hourC = 0, lastDay = null, lastWeek = null;
    for (const b of sorted) {
        const age = now - b.ts;
        if (age < W.minute) {
            if (minC < W.maxMinute && hourC < W.maxHour) { keep.push(b); minC++; hourC++; }
        } else if (age < W.hour) {
            if (hourC < W.maxHour) { keep.push(b); hourC++; }
        } else if (age < W.week) {
            const d = Math.floor(b.ts / W.day);
            if (d !== lastDay) { keep.push(b); lastDay = d; }
        } else {
            const w = Math.floor(b.ts / W.week);
            if (w !== lastWeek) { keep.push(b); lastWeek = w; }
        }
    }
    return keep;
}

/**
 * Kompletten Zustand als Datei-Objekt verpacken (für den Export).
 * Gleiche Nutzlast wie ein localStorage-Backup, nur mit Kennung + Version drumherum.
 */
export function serializeBackup(storage, now, label = '') {
    return { kind: FILE_KIND, version: FILE_VERSION, ts: now, label, data: captureState(storage) };
}

/**
 * Backup-Datei prüfen und entpacken. Wirft mit einer Meldung, die man dem User
 * direkt zeigen kann – ein Import ersetzt ALLES, da ist Rateraten das Letzte, was
 * man will (@dpa 20260715: lieber klar ablehnen als halb einlesen).
 * @param {string} text – Dateiinhalt
 * @returns {{ts:number,label:string,data:Object}}
 */
export function parseBackupFile(text) {
    let obj;
    try { obj = JSON.parse(text); }
    catch { throw new Error('Das ist keine gültige JSON-Datei.'); }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Die Datei enthält kein Backup-Objekt.');
    // Ein Snapshot hat 'state' statt 'data' – der häufigste Fehlgriff, also gezielt abfangen.
    if (obj.kind !== FILE_KIND) {
        if (obj.state) throw new Error('Das ist eine Snapshot-Datei, kein Backup.\nSnapshots lädst du über den ⤒-Button in der Snapshot-Leiste.');
        throw new Error('Das ist keine teslacoil-Backup-Datei.');
    }
    if (Number(obj.version) > FILE_VERSION) throw new Error('Die Datei stammt aus einer neueren teslacoil-Version.');
    if (!obj.data || typeof obj.data !== 'object') throw new Error('Die Backup-Datei enthält keine Daten.');
    // Nur bekannte Keys mit String-Werten übernehmen – so kann eine manipulierte
    // Datei keinen Fremd-Key in den localStorage schieben.
    const data = {};
    for (const k of BACKED_UP_KEYS) if (typeof obj.data[k] === 'string') data[k] = obj.data[k];
    if (!Object.keys(data).length) throw new Error('Die Backup-Datei enthält keine bekannten teslacoil-Daten.');
    return { ts: Number(obj.ts) || 0, label: String(obj.label || ''), data };
}

/** Backup-Liste lesen (defensiv – korrupte Daten → leere Liste). */
export function readBackups(storage) {
    try { return JSON.parse(storage.getItem(BACKUP_KEY)) || []; } catch { return []; }
}

/** Backup-Liste schreiben. */
export function writeBackups(storage, list) {
    storage.setItem(BACKUP_KEY, JSON.stringify(list));
}

/**
 * Neues Backup anlegen, ausdünnen und speichern. Bei Quota-Fehlern werden die
 * ältesten Backups so lange verworfen, bis es passt (der neue bleibt erhalten).
 * Gibt die gespeicherte (gedünnte) Liste zurück.
 */
export function pushBackup(storage, now, label = '') {
    const list = readBackups(storage);
    list.push({ ts: now, label, data: captureState(storage) });
    let arr = thinBackups(list, now);   // neueste zuerst
    for (;;) {
        try { writeBackups(storage, arr); break; }
        catch (e) { if (arr.length <= 1) throw e; arr = arr.slice(0, -1); }   // ältesten (am Ende) weglassen
    }
    return arr;
}
