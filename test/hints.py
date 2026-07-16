#!/usr/bin/env python3
"""hints.py – Wächter für die Hilfe-Blasen (@dpa 20260716_174111).

Was hier festgenagelt ist:
  • Die Blase erscheint erst NACH der eingestellten Verzögerung – nicht sofort.
  • Der Schalter in der Kopfzeile schaltet sie wirklich ab („falls das aufpopen stört").
  • Ein eigener Text sticht die Auslieferung; ✕ in den Settings holt sie zurück (der
    Override wird GELÖSCHT, nicht überschrieben – sonst bekäme das Control spätere
    Verbesserungen und die Übersetzung nie mit).
  • Kein `title` mehr an den Controls: das wäre ein zweiter, unabschaltbarer Tooltip
    neben der Blase – genau das, was @dpa loswerden wollte.
  • Die Blase liegt auf `pointer-events: none`. Ohne das verdeckt sie den Zeiger,
    löst ihr eigenes mouseout aus und flackert.

Lauf: python3 test/hints.py     (startet den Server selbst)
"""
import http.server
import socketserver
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 8023


def main():
    from playwright.sync_api import sync_playwright

    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(ROOT), **k)
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    fails = []

    def check(name, ok, info=''):
        print(('  ✓ ' if ok else '  ✗ ') + name + (f'   [{info}]' if info and not ok else ''))
        if not ok:
            fails.append(name)

    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1600, 'height': 1100})
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(f'http://127.0.0.1:{PORT}/', wait_until='networkidle')
        pg.wait_for_function('window.tesla && window.tesla.state', timeout=10000)
        pg.wait_for_timeout(600)

        set_state = lambda **kw: pg.evaluate(
            "(o)=>{for(const [k,v] of Object.entries(o)) window.tesla.state.set(k,v);}", kw)

        bubble = pg.locator('.hint-bubble')
        tempo = pg.locator('[data-ctrl="k:bpm"]')

        # ── Verzögerung: erst nichts, dann die Blase ──
        set_state(hintsOn=True, hintDelay=400, hintText={})
        tempo.hover()
        pg.wait_for_timeout(150)
        check('Vor Ablauf der Verzögerung ist keine Blase da', bubble.count() == 0)
        pg.wait_for_timeout(600)
        check('Nach der Verzögerung erscheint die Blase', bubble.count() == 1)
        txt = bubble.text_content() if bubble.count() else ''
        check('Die Blase zeigt den Auslieferungstext des Reglers', 'BpM' in txt, txt[:60])
        check('Die Blase fängt keine Maus-Ereignisse ab (sonst flackert sie)',
              pg.evaluate("()=>getComputedStyle(document.querySelector('.hint-bubble')).pointerEvents") == 'none')

        # ── Kein zweiter, nativer Tooltip ──
        check('Controls tragen kein title mehr (kein Doppel-Tooltip)',
              pg.evaluate("()=>!document.querySelector('[data-ctrl] [title]') && !document.querySelector('[data-ctrl][title]')"))

        # ── Global aus ──
        pg.mouse.move(5, 5)
        pg.wait_for_timeout(100)
        set_state(hintsOn=False)
        tempo.hover()
        pg.wait_for_timeout(700)
        check('Ausgeschaltet erscheint keine Blase', bubble.count() == 0)

        # ── Eigener Text schlägt die Auslieferung ──
        pg.mouse.move(5, 5)
        set_state(hintsOn=True, hintDelay=0, hintText={'k:bpm': 'Mein eigener Text'})
        tempo.hover()
        pg.wait_for_timeout(300)
        check('Ein eigener Text sticht die Auslieferung',
              bubble.count() == 1 and bubble.text_content() == 'Mein eigener Text',
              bubble.text_content() if bubble.count() else 'keine Blase')

        # ── Settings: Feld zeigt den eigenen Text, ✕ holt die Auslieferung zurück ──
        pg.mouse.move(5, 5)
        pg.wait_for_timeout(100)
        tempo.click(button='right')
        pg.wait_for_timeout(250)
        check('Der Regler-Editor hat ein Hilfe-Feld', pg.locator('.kme-help').count() == 1)
        check('Das Hilfe-Feld zeigt den eigenen Text',
              pg.locator('.kme-help').input_value() == 'Mein eigener Text')
        pg.locator('.kme-help-reset').click()
        pg.wait_for_timeout(200)
        check('✕ löscht den Override (statt den Text einzufrieren)',
              pg.evaluate("()=>!('k:bpm' in (window.tesla.state.get('hintText')||{}))"))
        check('Das Feld zeigt danach wieder die Auslieferung',
              'BpM' in pg.locator('.kme-help').input_value())

        # ── Tippen legt einen Override an ──
        pg.locator('.kme-help').fill('Kurz und knapp')
        pg.wait_for_timeout(200)
        check('Tippen speichert den eigenen Text',
              pg.evaluate("()=>(window.tesla.state.get('hintText')||{})['k:bpm']") == 'Kurz und knapp')

        check('keine JS-Fehler', not errors, '; '.join(errors[:2]))
        br.close()

    httpd.shutdown()
    if fails:
        print(f'\n{len(fails)} Prüfung(en) FEHLGESCHLAGEN: ' + ', '.join(fails))
        sys.exit(1)
    print('\nHilfe-Blasen: alles grün ✅')


if __name__ == '__main__':
    main()
