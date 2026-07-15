/**
 * factory.js – Werkseinstellung: der Zustand, den ein NEUER Besucher bekommt.
 *
 * Hintergrund (@dpa 20260715): „Man soll das Instrument ja direkt spielen können."
 * Ein frischer Besucher landete bisher auf den Code-Defaults – kein Snapshot, keine
 * Skala, nacktes Layout. Jetzt liegt eine echte Werkseinstellung als Datei im Repo
 * (presets/factory.json, exportiert aus @dpas eigenem Stand) und wird beim ersten
 * Besuch eingespielt.
 *
 * Die zwei Regeln, die dabei zählen:
 *
 *  1. NUR beim allerersten Besuch. Wer schon einen eigenen Zustand hat, behält ihn –
 *     „jeder User hat sein eigenes System von Speicher". Ein Reload (auch cmd+shift+r)
 *     leert den localStorage nicht, findet also einen Zustand vor und rührt ihn nicht
 *     an. Die Werkseinstellung kann einem User seine Arbeit damit nie überschreiben.
 *  2. Fällt sie aus (Datei fehlt, offline, kaputt), bootet der Synth normal auf den
 *     Code-Defaults. Die Werkseinstellung ist ein Geschenk, keine Voraussetzung.
 *
 * Aktualisieren (@dpa: „würde es dann als Werkeinstellung updaten"): in den
 * Einstellungen „Als Datei sichern" → die Datei als presets/factory.json ins Repo
 * legen → pushen. Bestehende User behalten ihren Stand; neue bekommen den neuen,
 * und „Auf Werkseinstellung zurücksetzen" führt ab dann dorthin.
 */
import { BACKED_UP_KEYS, parseBackupFile } from './Backup.js';

/** Wo die Werkseinstellung liegt (relativ – die Seite läuft auch in Unterpfaden). */
export const FACTORY_URL = 'presets/factory.json';

/**
 * Hat dieser Browser schon einen eigenen teslacoil-Zustand?
 * Rein → headless getestet. Ein einziger bekannter Key genügt: dann war der User da.
 */
export function hasUserState(storage) {
    return BACKED_UP_KEYS.some((k) => storage.getItem(k) != null);
}

/**
 * Werkseinstellung holen und prüfen.
 * @returns {Promise<{ts:number,label:string,data:Object}|null>} null = nicht verfügbar
 */
export async function fetchFactory(url = FACTORY_URL, fetchFn = fetch) {
    try {
        const r = await fetchFn(url, { cache: 'no-cache' });
        if (!r || !r.ok) return null;
        return parseBackupFile(await r.text());
    } catch { return null; }
}
