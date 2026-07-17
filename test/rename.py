#!/usr/bin/env python3
"""
rename.py – Umbenennen in den Speicher-Menüs + die atmenden Hinweise (@dpa 20260717).

Die reine Namensregel (leer, schon vergeben, trimmen) steckt in
`PresetManager.renameIn` und ist in logic.test.mjs abgedeckt. Hier steht das, was
sich nur im Browser zeigt:

  1. 🏷 in der Zeile fragt den neuen Namen ab und schreibt ihn in den Speicher.
  2. `snapSel` wird NACHGEZOGEN – sonst zeigt der Knopf nach dem Umbenennen auf
     einen Namen, den es nicht mehr gibt („— kein Snapshot —"), obwohl derselbe
     Snapshot noch geladen ist. Genau das ist der Grund für diesen Wächter.
  3. Ein schon vergebener Name wird abgelehnt (Meldung) und verschmilzt NICHTS.
  4. Der atmende Hinweis (Snapshot-Knopf, Play) hört nach ZWEIMAL Benutzen auf und
     kommt auch nach dem Neuladen nicht zurück.

Startet den Server selbst. Lauf: python3 test/rename.py
"""
import json
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
        br = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = br.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        # EIN Dialog-Handler für prompt UND alert: `answer` ist die Antwort des nächsten
        # prompt (None = abbrechen), `msgs` sammelt alles Gesagte.
        msgs = []
        answer = {"text": "Neu"}

        def on_dialog(d):
            msgs.append(d.message)
            if d.type == "prompt":
                if answer["text"] is None:
                    d.dismiss()
                else:
                    d.accept(answer["text"])
            else:
                d.accept()

        pg.on("dialog", on_dialog)
        pg.goto(f"http://127.0.0.1:{PORT}/", wait_until="load")
        pg.wait_for_timeout(700)

        # Zwei Snapshots + einer davon geladen (snapSel) – der Ausgangszustand, in dem
        # das Nachziehen überhaupt eine Rolle spielt.
        pg.evaluate("""() => {
            localStorage.setItem('teslacoil_snapshots', JSON.stringify([
                {name:'Eins', ts:1, version:1, state:{bpm:100}},
                {name:'Zwei', ts:1, version:1, state:{bpm:120}},
            ]));
        }""")
        pg.reload(wait_until="load")
        pg.wait_for_timeout(700)

        def snap_row(name):
            """Zeile im Haupt-Snapshot-Menü holen (öffnet es, falls zu)."""
            if not pg.query_selector(".pm-pop"):
                pg.click(".presetbar .pm-btn")
                pg.wait_for_selector(".pm-pop", timeout=3000)
            return pg.wait_for_selector(f".pm-item[data-name='{name}']", timeout=3000)

        # ── 0. Snapshot laden, damit snapSel steht ──
        snap_row("Zwei").click()
        pg.wait_for_timeout(400)
        sel = pg.evaluate("() => JSON.parse(localStorage.getItem('teslacoil_live')||'{}').snapSel")
        check("Vorbedingung: „Zwei\" ist geladen (snapSel)", sel == "Zwei", f"snapSel={sel}")

        # ── 1. Umbenennen ──
        answer["text"] = "Zwei neu"
        row = snap_row("Zwei")
        row.query_selector(".pm-act.pm-ic-ren").click()
        pg.wait_for_timeout(400)
        names = pg.evaluate("() => JSON.parse(localStorage.getItem('teslacoil_snapshots')||'[]').map(s=>s.name)")
        check("Umbenennen: der neue Name steht im Speicher", names == ["Eins", "Zwei neu"], str(names))
        check("Umbenennen: hat vorher gefragt", any("Neuer Name" in m for m in msgs), str(msgs))

        # ── 2. snapSel nachgezogen (der eigentliche Punkt) ──
        sel = pg.evaluate("() => JSON.parse(localStorage.getItem('teslacoil_live')||'{}').snapSel")
        check("Umbenennen: snapSel geht mit", sel == "Zwei neu", f"snapSel={sel}")
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(200)
        btn = pg.inner_text(".presetbar .pm-name").strip()
        check("Umbenennen: der Knopf zeigt den neuen Namen (nicht „— kein Snapshot —\")",
              btn == "Zwei neu", f"Knopf={btn!r}")

        # ── 3. Schon vergebener Name → Absage, nichts verschmolzen ──
        msgs.clear()
        answer["text"] = "Eins"
        row = snap_row("Zwei neu")
        row.query_selector(".pm-act.pm-ic-ren").click()
        pg.wait_for_timeout(400)
        names = pg.evaluate("() => JSON.parse(localStorage.getItem('teslacoil_snapshots')||'[]').map(s=>s.name)")
        check("Vergebener Name: beide Snapshots leben noch", names == ["Eins", "Zwei neu"], str(names))
        check("Vergebener Name: sagt Bescheid", any("schon einen Eintrag" in m for m in msgs), str(msgs))

        # ── 4. Abbruch (ESC im prompt) ändert nichts ──
        answer["text"] = None
        row = snap_row("Zwei neu")
        row.query_selector(".pm-act.pm-ic-ren").click()
        pg.wait_for_timeout(300)
        names = pg.evaluate("() => JSON.parse(localStorage.getItem('teslacoil_snapshots')||'[]').map(s=>s.name)")
        check("Abbruch: Liste unverändert", names == ["Eins", "Zwei neu"], str(names))

        # ── 5. Der atmende Hinweis schafft sich selbst ab (@dpa 20260717) ──
        # Frischer Speicher = Erstbenutzer: Snapshot-Knopf UND Play atmen, bis sie
        # zweimal benutzt wurden. Geprüft wird die Klasse, nicht die Farbe: die
        # Animation läuft, ein Farbwert wäre nur eine Momentaufnahme.
        pg.evaluate("() => localStorage.clear()")
        pg.reload(wait_until="load")
        pg.wait_for_timeout(900)

        def breathes(sel):
            return pg.eval_on_selector(sel, "el => el.classList.contains('breathe')")

        check("Erstbesuch: Snapshot-Knopf atmet", breathes(".presetbar .pickmenu"))
        check("Erstbesuch: Play-Knopf atmet", breathes(".presetbar .play-btn"))
        check("Der Puls läuft wirklich (0,2 Hz = 5 s)",
              pg.eval_on_selector(".presetbar .play-btn",
                                  "el => getComputedStyle(el).animationDuration") == "5s")

        pg.click(".presetbar .pm-btn")   # 1. Mal
        pg.wait_for_timeout(200)
        pg.keyboard.press("Escape")
        check("Nach EINEM Mal atmet der Snapshot-Knopf noch", breathes(".presetbar .pickmenu"))
        pg.click(".presetbar .pm-btn")   # 2. Mal
        pg.wait_for_timeout(200)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(200)
        check("Nach ZWEI Mal ist der Hinweis weg", not breathes(".presetbar .pickmenu"))
        check("… und der Play-Knopf atmet unbeirrt weiter (eigener Zähler)",
              breathes(".presetbar .play-btn"))

        pg.click(".presetbar .play-btn")
        pg.wait_for_timeout(200)
        check("Play: nach einem Mal atmet er noch", breathes(".presetbar .play-btn"))
        pg.click(".presetbar .play-btn")
        pg.wait_for_timeout(200)
        check("Play: nach zwei Mal ist der Hinweis weg", not breathes(".presetbar .play-btn"))
        # Er darf nicht wiederkommen, wenn man die Seite neu lädt (der Zähler ist Optik
        # und liegt damit im gespeicherten Zustand).
        pg.reload(wait_until="load")
        pg.wait_for_timeout(900)
        check("Hinweis bleibt auch nach dem Neuladen weg",
              not breathes(".presetbar .pickmenu") and not breathes(".presetbar .play-btn"))

        check("keine JS-Fehler", not errors, str(errors[:2]))
        br.close()
    srv.shutdown()
    print(("FEHLER: " + ", ".join(fails)) if fails else "\nUmbenennen: alles grün ✅")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
