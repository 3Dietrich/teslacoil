/**
 * fxChain.js – Die Kette darf nie unvollständig sein (@dpa 20260716_232709: „Metronom
 * fehlt in der Kette! Die kette und ihre Verknüpfungen sind sehr wichtig!").
 *
 * WAS PASSIERT WAR: `fxOrder` ist ein SOUND-Parameter, steckt also in jedem Snapshot. Das
 * Metronom wurde erst am 20260713 zum Ketten-Knoten (vorher: `metroRoute`), und die
 * Migration, die es nachträgt, lief nur EINMAL beim Booten. Jeder ältere Snapshot trägt
 * deshalb eine Kette ohne Metronom – und ein Recall setzte diese Kette einfach ein: der
 * Knoten verschwand aus der Ansicht UND aus der Verdrahtung, ohne Fehler, ohne Weg zurück.
 * Gemessen an @dpas eigener Werkseinstellung betrifft das 43 von 51 Snapshots.
 *
 * DIE REGEL: Nicht der Snapshot bestimmt, WELCHE Knoten es gibt – nur ihre REIHENFOLGE.
 * Was der Snapshot nicht kennt, wird angehängt; was es nicht (mehr) gibt, fliegt raus.
 * Damit kann kein gespeicherter Zustand die Kette mehr beschädigen, egal wie alt er ist.
 *
 * Reine Logik, keine Web-Audio-Abhängigkeit → headless getestet (logic.test.mjs).
 */

/**
 * Eine gespeicherte Ketten-Reihenfolge auf die bekannten Knoten bringen.
 *
 * @param {string[]} order  – Reihenfolge aus Snapshot/State (darf lückenhaft/alt sein)
 * @param {string[]} known  – alle Knoten, die es geben MUSS (= State.DEFAULTS.fxOrder)
 * @returns {string[]} jeder bekannte Knoten genau einmal, in der Reihenfolge von `order`;
 *                     Fehlende hängen hinten an (in der Reihenfolge aus `known`).
 */
export function normalizeFxOrder(order, known) {
    const out = [];
    const seen = new Set();
    for (const name of Array.isArray(order) ? order : []) {
        // Unbekanntes (alter Name, Tippfehler) fällt weg – es hat keinen Knoten zum Stecken.
        // Doppeltes ebenso: ein Knoten kann nur an EINER Stelle in der Kette hängen.
        if (!known.includes(name) || seen.has(name)) continue;
        seen.add(name); out.push(name);
    }
    // Was der gespeicherte Stand nicht kannte, kommt ans Ende. Für das Metronom heißt das
    // „parallel" (s. TeslaEngine._rewireFX) – die harmloseste Stelle: es klingt, ohne sich
    // in einen fremden Effekt-Pfad zu drängen, den der User so nie eingestellt hat.
    for (const name of known) if (!seen.has(name)) out.push(name);
    return out;
}
