#!/usr/bin/env python3
"""colors.py – Wächter für die Farb-Einstellungen der Controls (@dpa 20260716_174111:
„Farbe nicht speicherbar (Menu öffnet nicht)").

Die Kette, die dabei kaputt war, besteht aus vier Gliedern – jedes einzeln geprüft:

  1. Rechtsklick auf einen Regler öffnet den Editor.
  2. Der Farbwähler wirkt SOFORT auf den Regler (nicht erst bei Enter, und nicht nie:
     dem .kme-color fehlte als einzigem Feld das _apply()).
  3. Das Farb-Menü geht auf UND das Panel bleibt dabei stehen. Sein Popup hängt an
     <body>, also außerhalb des Panels – der Außenklick-Handler hielt das für einen
     Klick nach draußen und machte den Editor zu, sobald man eine Zeile anklickte.
  4. Ein gespeichertes Preset trägt BEIDE Farben (Bogen + Hintergrund) und lädt sie.

Lauf: python3 test/colors.py     (startet den Server selbst)
"""
import http.server
import socketserver
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 8016


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
        pg.goto(f'http://127.0.0.1:{PORT}/', wait_until='networkidle')
        pg.wait_for_function('window.tesla && window.tesla.state', timeout=10000)
        pg.wait_for_timeout(600)

        amp = pg.locator('[data-ctrl="k:amp"]')
        amp.click(button='right')
        pg.wait_for_timeout(200)
        panel = pg.locator('.knob-meta-editor:not(.elem-settings):not(.mini-settings)')
        check('Rechtsklick auf den Regler öffnet den Editor', panel.is_visible())

        # ── Der Farbwähler muss den Regler SOFORT einfärben ──
        pg.evaluate("""()=>{
            const c = document.querySelector('.kme-color');
            c.value = '#ff0000';
            c.dispatchEvent(new Event('input', {bubbles:true}));
        }""")
        pg.wait_for_timeout(150)
        col = pg.evaluate("()=>(window.tesla.state.get('knobMeta').amp||{}).color")
        check('Farbwähler färbt den Regler sofort (ohne Enter)', col == '#ff0000', str(col))

        # ── Das Farb-Menü: geht auf, und das Panel bleibt dabei stehen ──
        pg.locator('.kme-color-menu .pm-btn').click()
        pg.wait_for_timeout(200)
        check('Farb-Menü klappt auf', pg.locator('.pm-pop').is_visible())
        check('Panel bleibt offen, während das Menü offen ist', panel.is_visible())

        # ── Preset anlegen (Bogen + Hintergrund) ──
        pg.once('dialog', lambda d: d.accept('rot'))
        pg.locator('.pm-foot-btn', has_text='Neu').click()
        pg.wait_for_timeout(250)
        presets = pg.evaluate("()=>window.tesla.state.get('knobColorPresets')")
        check('„Neu…" legt ein Farb-Preset an', len(presets) >= 1, str(presets))
        check('Das Preset trägt die Bogenfarbe',
              bool(presets) and presets[-1].get('color') == '#ff0000', str(presets))
        check('Das Preset kennt das Feld für den Hintergrund',
              bool(presets) and 'bg' in presets[-1], str(presets))
        check('Panel steht nach dem Speichern noch', panel.is_visible())

        # ── Preset auf einen ANDEREN Regler laden ──
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(150)
        pg.locator('[data-ctrl="k:bpm"]').click(button='right')
        pg.wait_for_timeout(200)
        pg.locator('.kme-color-menu .pm-btn').click()
        pg.wait_for_timeout(200)
        pg.locator('.pm-item-name', has_text='rot').click()
        pg.wait_for_timeout(250)
        col2 = pg.evaluate("()=>(window.tesla.state.get('knobMeta').bpm||{}).color")
        check('Ein Klick auf die Preset-Zeile färbt den Regler', col2 == '#ff0000', str(col2))
        check('Panel überlebt die Auswahl aus dem Menü', panel.is_visible())

        br.close()

    httpd.shutdown()
    if fails:
        print(f'\n{len(fails)} Prüfung(en) FEHLGESCHLAGEN: ' + ', '.join(fails))
        sys.exit(1)
    print('\nFarb-Einstellungen: alles grün ✅')


if __name__ == '__main__':
    main()
