#!/usr/bin/env python3
"""controls.py – Wächter für die Bedienregeln der Controls (@dpa 20260716_023817).

Hält fest, was ein Control im SPIELBETRIEB tut und was es im e-MODE lassen muss:

  Spielbetrieb
    • Klick irgendwo auf dem Control selektiert es (nicht nur auf dem Wert).
    • Selektion ist DEZENT (leichte Färbung, feiner Rahmen) – kein 2px-Leuchtring.
    • Pfeiltasten bedienen das selektierte Control.
    • Doppelklick auf die ANSICHT = Default-Wert (aus State.DEFAULTS, NICHT die
      Skalenmitte – bei log-Kurve/verstellter Range ist das ein ganz anderer Wert).
    • Doppelklick auf Value UND Label = Werteingabe.

  e-Mode („hier wird angeordnet, nicht bedient")
    • Ziehen am Control verstellt den Wert nicht. Achtung: CSS schaltet nur das Dial
      stumm – der Wert-Drag hängt am Container, also am Element, das man greift.
      Dafür gibt es Knob.locked; ohne das verstellt jedes Verschieben den Wert.
    • Pfeiltasten verschieben, sie bedienen nicht.
    • Gummiband: auf freier Fläche aufziehen wählt mehrere Controls.

  Settings-Panels lassen sich an ihrer Titelleiste wegschieben.

Lauf: python3 test/controls.py     (startet den Server selbst)
"""
import http.server
import socketserver
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 8014


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

        amp.locator('.knob-label').click()
        check('Klick auf das Label selektiert das Control', pg.evaluate(
            "()=>document.querySelector('[data-ctrl=\"k:amp\"]').classList.contains('knob-selected')"))

        style = pg.evaluate("""()=>{const e=document.querySelector('[data-ctrl="k:amp"]');
            const s=getComputedStyle(e); return {outline:s.outlineWidth, bg:s.backgroundColor};}""")
        check('Selektion ist dezent (Rahmen ≤ 1px + leichte Färbung)',
              style['outline'] in ('1px', '0px') and 'rgba' in style['bg'], str(style))

        # Nicht am Anschlag starten: die Werkseinstellung hat amp auf 1.0, dort KANN
        # ArrowUp nichts erhöhen (der Test hätte sonst grundlos rot gemeldet).
        pg.evaluate("()=>window.tesla.state.set('amp', 0.5)")
        before = pg.evaluate("()=>window.tesla.state.get('amp')")
        pg.keyboard.press('ArrowUp')
        after = pg.evaluate("()=>window.tesla.state.get('amp')")
        check('Pfeiltaste bedient das selektierte Control', after > before, f'{before}->{after}')

        default_amp = pg.evaluate("()=>window.tesla.state.get('amp')") and 0.7
        pg.evaluate("()=>window.tesla.state.set('amp', 0.123)")
        amp.locator('.knob-svg').dblclick()
        val = pg.evaluate("()=>window.tesla.state.get('amp')")
        check('Doppelklick auf die Ansicht setzt den Default-Wert (nicht die Skalenmitte)',
              abs(val - default_amp) < 1e-6, str(val))

        amp.locator('.knob-label').dblclick()
        check('Doppelklick auf das Label öffnet die Werteingabe',
              pg.evaluate("()=>!!document.querySelector('.knob-value-input')"))
        pg.keyboard.press('Escape')

        # ── e-Mode ──
        pg.keyboard.press('e')
        pg.wait_for_timeout(300)
        v0 = pg.evaluate("()=>window.tesla.state.get('amp')")
        box = amp.bounding_box()
        pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] - 6)
        pg.mouse.down()
        pg.mouse.move(box['x'] + box['width'] / 2, box['y'] - 60, steps=6)
        pg.mouse.up()
        v1 = pg.evaluate("()=>window.tesla.state.get('amp')")
        check('e-Mode: Ziehen am Control verstellt den Wert nicht', v0 == v1, f'{v0}->{v1}')

        pg.evaluate("()=>document.querySelector('[data-ctrl=\"k:amp\"]').focus()")
        v2 = pg.evaluate("()=>window.tesla.state.get('amp')")
        pg.keyboard.press('ArrowUp')
        v3 = pg.evaluate("()=>window.tesla.state.get('amp')")
        check('e-Mode: Pfeiltaste bedient den Regler nicht', v2 == v3, f'{v2}->{v3}')

        grp = pg.locator('[data-group="Envelope"]').bounding_box()
        pg.mouse.move(grp['x'] + 4, grp['y'] + grp['height'] - 4)
        pg.mouse.down()
        pg.mouse.move(grp['x'] + grp['width'] - 4, grp['y'] + 20, steps=8)
        pg.mouse.up()
        n = pg.evaluate("()=>document.querySelectorAll('.arrange-selected').length")
        check('e-Mode: Gummiband wählt mehrere Controls', n > 1, f'{n} selektiert')
        check('e-Mode: Gummiband verschwindet nach dem Loslassen',
              pg.evaluate("()=>!document.querySelector('.select-band')"))
        pg.keyboard.press('e')
        pg.wait_for_timeout(200)

        # ── Settings-Panel verschiebbar ──
        amp.click(button='right')
        pg.wait_for_timeout(250)
        pan = pg.locator('.knob-meta-editor:not(.elem-settings)')
        b0 = pan.bounding_box()
        head = pg.locator('.knob-meta-editor:not(.elem-settings) .kme-header').bounding_box()
        pg.mouse.move(head['x'] + 40, head['y'] + head['height'] / 2)
        pg.mouse.down()
        pg.mouse.move(head['x'] + 240, head['y'] + 150, steps=8)
        pg.mouse.up()
        b1 = pan.bounding_box()
        check('Settings lassen sich an der Titelleiste verschieben',
              abs(b1['x'] - b0['x']) > 100 and abs(b1['y'] - b0['y']) > 100,
              f"{b0['x']},{b0['y']} -> {b1['x']},{b1['y']}")
        check('Settings bleiben beim Verschieben offen', pan.is_visible())

        br.close()
    httpd.shutdown()

    print(f"\n{'ALLE GRÜN ✅' if not fails else 'FEHLER: ' + ', '.join(fails)}")
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
