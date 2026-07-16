/**
 * icons.js – Die Icons des Synths als Inline-SVG.
 *
 * WARUM SVG statt Unicode-Glyphen (@dpa 20260716_164359, zum fünften Mal angemerkt:
 * „die Icons sind immer zu klein … immer nur Mikro prozentual" angepasst):
 *
 * Ein Glyph wie ⟲ (U+27F2) oder ⤢ (U+2922) füllt seine em-Box im Systemfont nur zu
 * einem Bruchteil aus – ⏻ (U+23FB) dagegen fast ganz. Bei EINER font-size rendert das
 * eine winzig und das andere passend. Genau das war zu sehen: `.sync-ico` stand auf
 * 18px und war „zu klein", `.panic-ico` auf 15px und war „ok". Am font-size zu drehen
 * kuriert darum immer nur ein Icon und verschiebt das Problem zum nächsten – die
 * Glyph-Metrik gehört uns nicht.
 *
 * Mit SVG gehört sie uns: jedes Icon zeichnet in dieselbe 24×24-viewBox und füllt sie
 * bis auf einen schmalen Rand. Ein Icon-Rahmen von N px zeigt also ein Icon von N px,
 * für ALLE Icons gleich. Das ist @dpas Regel „in deren Rahmen so groß wie möglich",
 * einmal an einer Stelle eingelöst statt Icon für Icon nachgezogen.
 *
 * currentColor: die Icons erben die Textfarbe ihres Buttons → die Aktions-Farben
 * (.pb-ic-load/-save/-new/…) wirken unverändert weiter.
 */

// Jedes Icon zeichnet in 24×24 und nutzt die Fläche bis ~2px Rand aus.
const PATHS = {
    // ⚙ Einstellungen – ein GEFÜLLTES Zahnrad: 8 trapezförmige Zähne an einem geschlossenen
    // Kranz, die Nabe per fill-rule="evenodd" ausgestanzt.
    // Zweimal danebengegriffen, @dpa beide Male: „sieht aus wie eine Sonne". Der Grund ist
    // nicht die Größe, sondern die Bauform: Striche, die von einer Mitte nach außen zeigen,
    // SIND das Sonnen-Piktogramm – egal wie dick, und auch mit Ring drumherum. Ein Zahnrad
    // entsteht erst, wenn die Zähne aus der Radfläche herauswachsen (geschlossene Kontur
    // mit Zahnfuß/-flanke/-spitze). Deshalb Polygon statt stroke.
    gear: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="'
        + 'M19.32 9.97 L22.80 9.90 L22.80 14.10 L19.32 14.03 L18.61 15.74 L21.12 18.15 '
        + 'L18.15 21.12 L15.74 18.61 L14.03 19.32 L14.10 22.80 L9.90 22.80 L9.97 19.32 '
        + 'L8.26 18.61 L5.85 21.12 L2.88 18.15 L5.39 15.74 L4.68 14.03 L1.20 14.10 '
        + 'L1.20 9.90 L4.68 9.97 L5.39 8.26 L2.88 5.85 L5.85 2.88 L8.26 5.39 L9.97 4.68 '
        + 'L9.90 1.20 L14.10 1.20 L14.03 4.68 L15.74 5.39 L18.15 2.88 L21.12 5.85 L18.61 8.26 Z '
        + 'M15.20 12.00 A3.2 3.2 0 1 0 8.80 12.00 A3.2 3.2 0 1 0 15.20 12.00 Z"/>',
    // ⟲ Sync – Kreispfeil gegen den Uhrzeigersinn (zurück auf Anfang).
    sync: '<path d="M3.4 12a8.6 8.6 0 1 1 2.52 6.08"/><path d="M3.4 5.6v6h6"/>',
    // ⏻ Reset/Panik – Power-Symbol (Bügel + Bruch oben).
    power: '<path d="M12 2.6v9.2"/><path d="M18.4 6.1a8.6 8.6 0 1 1-12.8 0"/>',
    // ⤢ Alles zeigen – Diagonalpfeile nach außen (aufklappen).
    expand: '<path d="M14.2 2.6h7.2v7.2M21.4 2.6l-8 8"/><path d="M9.8 21.4H2.6v-7.2M2.6 21.4l8-8"/>',
    // ⇄ Anordnen (e-Mode) – zwei gegenläufige Pfeile.
    arrange: '<path d="M2.6 8.4h18.8M16.6 3.4l4.8 5-4.8 5"/><path d="M21.4 15.6H2.6M7.4 10.6l-4.8 5 4.8 5"/>',
    // ✕ Schließen
    close: '<path d="M3.6 3.6l16.8 16.8M20.4 3.6L3.6 20.4"/>',
    // ↺ Laden (Recall) – Kreispfeil.
    load: '<path d="M3.4 12a8.6 8.6 0 1 1 2.52 6.08"/><path d="M3.4 5.6v6h6"/>',
    // ✎ Überschreiben/Umbenennen – Stift.
    edit: '<path d="M16.4 2.9l4.7 4.7L8.3 20.4l-5.7 1 1-5.7z"/><path d="M14.2 5.1l4.7 4.7"/>',
    // ＋ Neu
    plus: '<path d="M12 2.6v18.8M2.6 12h18.8"/>',
    // ⤓ Export (Datei sichern) – Pfeil auf die Grundlinie.
    export: '<path d="M12 2.6v13.6M6.4 10.6l5.6 5.6 5.6-5.6"/><path d="M2.6 21.4h18.8"/>',
    // ⤒ Import (Datei laden) – Pfeil von der Grundlinie weg.
    import: '<path d="M12 21.4V7.8M6.4 13.4L12 7.8l5.6 5.6"/><path d="M2.6 2.6h18.8"/>',
    // 🗑 Löschen
    trash: '<path d="M2.9 5.9h18.2M9.1 5.9V2.6h5.8v3.3"/><path d="M4.9 5.9l1.2 15.5h11.8l1.2-15.5"/><path d="M9.8 10v7M14.2 10v7"/>',
    // ▶ Start · ■ Stop (Transport)
    play: '<path d="M4.8 2.4l15.6 9.6-15.6 9.6z" fill="currentColor" stroke="none"/>',
    stop: '<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="1.6" fill="currentColor" stroke="none"/>',
    // ⇥ Fill (Muster über den Rest kacheln) · ⏮ set0 (zurück auf Step 0)
    fill: '<path d="M2.6 12h13.6M11.2 6.8l5 5.2-5 5.2"/><path d="M21.4 3.4v17.2"/>',
    rewind: '<path d="M21.4 3.6L7.6 12l13.8 8.4z" fill="currentColor" stroke="none"/><path d="M3.6 3.6v16.8"/>',
    // ▾ Klapp-Pfeil (PickMenu) – bleibt bewusst klein, er ist Beiwerk am Namen.
    caret: '<path d="M4.4 8.4L12 16.4l7.6-8"/>',
};

/**
 * Icon-SVG bauen.
 * @param {string} name  Schlüssel aus PATHS
 * @param {number} [size] Kantenlänge in px. Ohne Angabe füllt es seinen Rahmen (CSS).
 */
export function icon(name, size = 0) {
    const d = PATHS[name];
    if (!d) throw new Error('icon: unbekannt – ' + name);   // Tippfehler sofort sichtbar
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ico ico-' + name);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');   // der Button trägt das aria-label
    if (size) { svg.setAttribute('width', size); svg.setAttribute('height', size); }
    svg.innerHTML = d;
    return svg;
}

/** Namen aller Icons (für Tests/Übersicht). */
export const ICON_NAMES = Object.keys(PATHS);
