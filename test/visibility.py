#!/usr/bin/env python3
"""
visibility.py – Wächter für „welches Control zeigt sich wann" (@dpa 20260715).

Diese Regeln leben verstreut in app.js (updateDistVisibility, updateHoldVisibility, …)
und sind genau die Sorte, die still zurückkommt: ein Key in der Liste vergessen und
ein Regler ist für immer weg – oder einer steht da, der nichts tut.

Achtung beim Erweitern: data-ctrl ist TYP-PRÄFIXIERT ('k:' Knob, 's:' Select,
't:' Toggle, 'u:' Sonder-Control). Ein Selektor [data-ctrl='distMix'] trifft nie.

Startet den Server selbst. Lauf: python3 test/visibility.py
"""
import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8137

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("SKIP: playwright fehlt (pip install playwright && playwright install chromium)")
    sys.exit(0)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    fails = []

    def check(name, ok, detail=""):
        print(f"  {'✓' if ok else '✗'} {name}" + (f"\n    {detail}" if not ok and detail else ""))
        if not ok:
            fails.append(name)

    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={"width": 1500, "height": 950})
        pg.goto(f"http://127.0.0.1:{PORT}/", wait_until="load")
        pg.wait_for_timeout(1500)

        def vis(key):
            return pg.evaluate(
                "(k) => { const e=[...document.querySelectorAll('[data-ctrl]')]"
                ".find(e => e.dataset.ctrl.split(':')[1] === k); "
                "return !!e && getComputedStyle(e).display !== 'none'; }", key)

        def set_state(patch):
            pg.evaluate("(p) => { const l=JSON.parse(localStorage.getItem('teslacoil_live')||'{}'); "
                        "Object.assign(l,p); localStorage.setItem('teslacoil_live',JSON.stringify(l)); }", patch)
            pg.reload(wait_until="load")
            pg.wait_for_timeout(1100)

        # ── Distortion: 'aktiv' aus → bis auf Dry/Wet alles weg (@dpa 20260715) ──
        set_state({"distEnabled": False})
        check("Dist aus: Dry/Wet bleibt", vis("distMix"))
        check("Dist aus: Drive weg", not vis("distDrive"))
        check("Dist aus: Out weg", not vis("distOut"))
        check("Dist aus: Kennlinien-Menü weg", not vis("distMode"))
        set_state({"distEnabled": True})
        for k in ("distDrive", "distOut", "distMode", "distMix"):
            check(f"Dist an: {k} da", vis(k))

        # ── Hold-Slide: nur bei Hold. 'Slide-Form' ist raus (@dpa 20260715) ──
        set_state({"ampHold": False})
        check("Hold aus: Slide weg", not vis("ampHoldGlide"))
        set_state({"ampHold": True})
        check("Hold an: Slide da", vis("ampHoldGlide"))
        check("Slide-Form existiert nicht mehr",
              pg.evaluate("()=>![...document.querySelectorAll('[data-ctrl]')]"
                          ".some(e=>e.dataset.ctrl.endsWith(':ampHoldCurve'))"))

        br.close()
    srv.shutdown()

    print(f"\n{'ALLE GRÜN ✅' if not fails else 'FEHLER: ' + ', '.join(fails)}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
