/**
 * dragPanel.js – Ein schwebendes Panel an seiner Titelleiste verschiebbar machen.
 *
 * @dpa 20260716_023817: „die Settings müssen verschoben werden können! via click und drag
 * auf deren [Kopfzeile]". Die Settings öffnen neben ihrem Control – und liegen damit
 * zwangsläufig über dem, was man beim Einstellen sehen will (Nachbarregler, Gruppe).
 * Statt die Aufklapp-Logik zu verkomplizieren: einfach wegschieben können.
 *
 * Bewusst ohne Persistenz: die Position gilt für dieses eine Öffnen. Beim nächsten Mal
 * erscheint das Panel wieder an seinem Control – dort erwartet man es.
 */

/**
 * @param {HTMLElement} panel  – das Panel (position: fixed, left/top in px)
 * @param {HTMLElement} handle – der Greifbereich (Titelleiste)
 */
export function makeDraggable(panel, handle) {
    handle.style.cursor = 'move';
    handle.addEventListener('mousedown', (e) => {
        // Der Schließen-Knopf (und alles andere Bedienbare) in der Leiste bleibt Klick.
        if (e.target.closest('button, input, select')) return;
        e.preventDefault();
        const r = panel.getBoundingClientRect();
        const ox = e.clientX - r.left, oy = e.clientY - r.top;
        const onMove = (ev) => {
            // Im Fenster halten: der Greifpunkt darf nicht hinter den Rand wandern, sonst
            // ist das Panel nicht mehr zurückzuholen.
            const x = Math.max(0, Math.min(window.innerWidth - 40, ev.clientX - ox));
            const y = Math.max(0, Math.min(window.innerHeight - 20, ev.clientY - oy));
            panel.style.left = x + 'px';
            panel.style.top = y + 'px';
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    });
}
