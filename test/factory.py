#!/usr/bin/env python3
"""
factory.py – Wächter für die Werkseinstellung (@dpa 20260715).

Die eine Regel, die hier zählt: die Werkseinstellung darf einem User NIE seine
Arbeit überschreiben. Sie kommt beim allerersten Besuch und danach nie wieder –
auch nicht bei cmd+shift+r ("also nicht das 'cmd+shift+r' verändern!").

Geprüft wird:
  1. Erstbesuch: Werkseinstellung ist da (Snapshots/Skalen aus presets/factory.json).
  2. Reload: eigener Stand bleibt unangetastet.
  3. Hard-Reload (cmd+shift+r, Cache-Bypass): ebenfalls unangetastet.
  4. Sogar ein User, der ALLES gelöscht hat AUSSER einem Key, gilt als "war da".
  5. Fehlt presets/factory.json, bootet der Synth trotzdem (Code-Defaults).

Startet den Server selbst. Lauf: python3 test/factory.py
"""
import json
import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8136

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("SKIP: playwright fehlt (pip install playwright && playwright install chromium)")
    sys.exit(0)

# Schalter, mit dem der Test die Werkseinstellung "verschwinden" lässt (Fall 5).
HIDE_FACTORY = {"on": False}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_GET(self):
        if HIDE_FACTORY["on"] and "factory.json" in self.path:
            self.send_error(404)
            return
        super().do_GET()

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

    url = f"http://127.0.0.1:{PORT}/"
    with sync_playwright() as p:
        br = p.chromium.launch()

        # ── 1. Erstbesuch ──
        ctx = br.new_context()
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(url, wait_until="load")
        pg.wait_for_timeout(1500)
        snaps = pg.evaluate("() => (JSON.parse(localStorage.getItem('teslacoil_snapshots')||'[]')).length")
        scales = pg.evaluate("() => (JSON.parse(localStorage.getItem('teslacoil_scales')||'[]')).length")
        check("Erstbesuch: Werkseinstellung ist da (Snapshots)", snaps > 10, f"{snaps} Snapshots")
        check("Erstbesuch: Skalen sind da", scales > 5, f"{scales} Skalen")
        check("Erstbesuch: keine JS-Fehler", not errs, "; ".join(errs[:2]))

        # ── 2. Eigener Stand überlebt einen normalen Reload ──
        pg.evaluate("() => { const l = JSON.parse(localStorage.getItem('teslacoil_snapshots')); "
                    "l.push({name:'MEINS',ts:1,version:1,state:{bpm:123}}); "
                    "localStorage.setItem('teslacoil_snapshots', JSON.stringify(l)); }")
        mine_before = pg.evaluate("() => (JSON.parse(localStorage.getItem('teslacoil_snapshots'))).length")
        pg.reload(wait_until="load")
        pg.wait_for_timeout(1200)
        names = pg.evaluate("() => (JSON.parse(localStorage.getItem('teslacoil_snapshots')||'[]')).map(s=>s.name)")
        check("Reload: eigener Snapshot bleibt", "MEINS" in names, str(len(names)))
        check("Reload: Werkseinstellung hat NICHT überschrieben", len(names) == mine_before,
              f"vorher {mine_before}, jetzt {len(names)}")

        # ── 3. Hard-Reload (cmd+shift+r): Cache-Bypass, localStorage bleibt ──
        pg.evaluate("() => localStorage.setItem('teslacoil_live', JSON.stringify({bpm:77}))")
        pg.reload(wait_until="load")   # Playwright-Reload entspricht dem Neuladen
        pg.wait_for_timeout(400)
        pg.keyboard.press("Control+Shift+R")
        pg.wait_for_timeout(1500)
        bpm = pg.evaluate("() => JSON.parse(localStorage.getItem('teslacoil_live')||'{}').bpm")
        names2 = pg.evaluate("() => (JSON.parse(localStorage.getItem('teslacoil_snapshots')||'[]')).map(s=>s.name)")
        check("cmd+shift+r: eigener Live-Zustand bleibt (bpm=77)", bpm == 77, f"bpm={bpm}")
        check("cmd+shift+r: eigener Snapshot bleibt", "MEINS" in names2)
        ctx.close()

        # ── 4. Fast alles gelöscht, EIN Key übrig → gilt als "war schon da" ──
        ctx = br.new_context()
        pg = ctx.new_page()
        pg.goto(url, wait_until="load")
        pg.wait_for_timeout(1200)
        pg.evaluate("() => { for (const k of Object.keys(localStorage)) localStorage.removeItem(k); "
                    "localStorage.setItem('teslacoil_snapshots', '[]'); }")
        pg.reload(wait_until="load")
        pg.wait_for_timeout(1200)
        n = pg.evaluate("() => (JSON.parse(localStorage.getItem('teslacoil_snapshots')||'[]')).length")
        check("Ein Key übrig: Werkseinstellung drängt sich nicht auf", n == 0, f"{n} Snapshots")
        ctx.close()

        # ── 5. Werkseinstellung fehlt → Synth bootet trotzdem ──
        HIDE_FACTORY["on"] = True
        ctx = br.new_context()
        pg = ctx.new_page()
        errs2 = []
        pg.on("pageerror", lambda e: errs2.append(str(e)))
        pg.goto(url, wait_until="load")
        pg.wait_for_timeout(1500)
        built = pg.evaluate("() => !!document.querySelector('#app .pb-cluster, #app [data-ctrl]')")
        check("factory.json fehlt: Synth baut trotzdem auf", built)
        check("factory.json fehlt: keine JS-Fehler", not errs2, "; ".join(errs2[:2]))
        HIDE_FACTORY["on"] = False
        ctx.close()
        br.close()
    srv.shutdown()

    print(f"\n{'ALLE GRÜN ✅' if not fails else 'FEHLER: ' + ', '.join(fails)}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
