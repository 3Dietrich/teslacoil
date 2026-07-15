/**
 * fileIO.js – Echter Datei-Zugang (Download/Upload) für Backups & Snapshots.
 *
 * Hintergrund (@dpa 20260715): Die Einstellungen konnten Backups zwar anlegen und
 * laden, aber nur INNERHALB dieses Browsers (localStorage). Ein anderer Rechner, ein
 * geleerter Browserspeicher oder ein Profilwechsel – und alles wäre weg gewesen. Erst
 * der Datei-Zugang macht die Sicherung transportabel und überhaupt aufbewahrbar.
 *
 * Hier steckt bewusst NUR das Browser-/DOM-Zeug (Blob, <input type=file>), das sich
 * headless nicht testen lässt. Das Verpacken und vor allem das PRÜFEN der Dateien
 * liegt daneben in Backup.js / PresetManager – und ist dort headless getestet.
 */

/** JSON-Objekt als Datei-Download anbieten. */
export function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

/** Namen für einen Dateinamen entschärfen (Snapshot-Namen dürfen alles enthalten). */
export function safeFilename(name, fallback = 'teslacoil') {
    const s = String(name || '')
        .replace(/[^a-z0-9]/gi, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    return s || fallback;
}

/** Zeitstempel fürs Dateinamens-Suffix: YYYYMMDD_HHMMSS (lokale Zeit, wie in dd.md). */
export function fileStamp(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Datei-Auswahl öffnen und den Inhalt als Text liefern.
 * @returns {Promise<{name:string,text:string}|null>} null = abgebrochen/unlesbar
 */
export function pickTextFile(accept = 'application/json,.json') {
    return new Promise((resolve) => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = accept;
        inp.style.display = 'none';
        const done = (v) => { inp.remove(); resolve(v); };
        inp.addEventListener('change', () => {
            const f = inp.files && inp.files[0];
            if (!f) return done(null);
            const r = new FileReader();
            r.onload = () => done({ name: f.name, text: String(r.result) });
            r.onerror = () => done(null);
            r.readAsText(f);
        });
        // 'cancel' feuert beim Abbrechen des Dialogs. Ohne das bliebe das Promise
        // ewig offen und das <input> als Leiche im DOM hängen.
        inp.addEventListener('cancel', () => done(null));
        document.body.appendChild(inp);
        inp.click();
    });
}
