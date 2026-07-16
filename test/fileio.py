#!/usr/bin/env python3
"""
fileio.py – Browser-Test des Datei-Zugangs (@dpa 20260715).

Prüft die Wege, die sich headless NICHT in logic.test.mjs abbilden lassen:
  1. Einstellungen: „Als Datei sichern" löst einen echten Download aus, und die
     Datei ist ein gültiges Backup mit den erwarteten Keys.
  2. Einstellungen: „Datei laden" nimmt eine Datei an und stellt den Zustand her
     (Nachweis über einen vorher gelöschten Marker).
  3. Snapshot-Leiste: ⤒ liest eine Snapshot-Datei ein → steht in der Liste + geladen.
  4. Falsche Datei am falschen Ort → klare Absage, KEIN Datenverlust.

Der Datei-Dialog wird über expect_file_chooser bedient: Das <input> entsteht erst
beim Klick (pickTextFile), es lässt sich also nicht vorher adressieren.

Startet den Server selbst. Lauf: python3 test/fileio.py
"""
import json
import os
import sys
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8134

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

    tmp = tempfile.mkdtemp(prefix="teslacoil_fileio_")
    with sync_playwright() as p:
        br = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = br.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        # Ein Handler für alle confirm/alert: Text merken, Verhalten über accept_dialogs
        # steuern (ein zweites pg.on() würde den ersten NICHT ersetzen).
        dialogs = []
        state = {"accept": True}

        def on_dialog(d):
            dialogs.append(d.message)
            d.accept() if state["accept"] else d.dismiss()

        pg.on("dialog", on_dialog)
        pg.goto(f"http://127.0.0.1:{PORT}/", wait_until="load")
        pg.wait_for_timeout(700)

        # Erkennbarer Marker, den wir durch Export→Import wiederfinden wollen.
        pg.evaluate("() => localStorage.setItem('teslacoil_snapshots',"
                    " JSON.stringify([{name:'MARKER',ts:1,version:1,state:{bpm:137}}]))")

        def open_settings():
            pg.click(".topbar-right button[title*='Einstellung']")
            pg.wait_for_selector(".settings-window", timeout=5000)

        # ── 1. Export ──
        open_settings()
        with pg.expect_download(timeout=8000) as dl:
            pg.click(".settings-window button:has-text('Als Datei sichern')")
        path = os.path.join(tmp, "backup.json")
        dl.value.save_as(path)
        with open(path) as f:
            data = json.load(f)
        check("Export: Datei ist ein teslacoil-Backup", data.get("kind") == "teslacoil-backup",
              f"kind={data.get('kind')}")
        check("Export: enthält Live- UND Snapshot-Zustand",
              "teslacoil_live" in data.get("data", {})
              and "MARKER" in data["data"].get("teslacoil_snapshots", ""))
        check("Export: Dateiname trägt Zeitstempel",
              dl.value.suggested_filename.startswith("teslacoil_backup_"),
              dl.value.suggested_filename)

        # ── 2. Import: Marker löschen, Datei laden, Marker muss zurück sein ──
        pg.evaluate("() => localStorage.setItem('teslacoil_snapshots', '[]')")
        with pg.expect_file_chooser(timeout=5000) as fc:
            pg.click(".settings-window button:has-text('Datei laden')")
        fc.value.set_files(path)
        pg.wait_for_timeout(2500)   # confirm + restore + location.reload()
        snaps = pg.evaluate("() => localStorage.getItem('teslacoil_snapshots') || ''")
        check("Import: Backup-Datei stellt den Zustand wieder her", "MARKER" in snaps, snaps[:80])
        check("Import: hat vorher gefragt (confirm)", any("laden?" in m for m in dialogs), str(dialogs))

        # ── 3. Snapshot-Import über „Import" in der Menü-Fußzeile ──
        # Seit 20260716_132014 ist die Icon-Reihe neben dem Snapshot-Menü weg (@dpa: „zu
        # lang, zu cryptisch, unansehlich"): Import/Export/Neu liegen in der Fußzeile des
        # PickMenus, also erst das Menü öffnen.
        def snap_foot(kind):
            """Knopf in der Fußzeile des Snapshot-Menüs anklicken (öffnet es vorher)."""
            pg.click(".pickmenu .pm-btn")
            pg.wait_for_selector(".pm-foot", timeout=3000)
            pg.click(f".pm-foot .pm-foot-btn:has(.pb-ic-{kind})")

        snap_path = os.path.join(tmp, "snap.json")
        with open(snap_path, "w") as f:
            json.dump({"kind": "teslacoil-snapshot", "name": "AusDatei", "ts": 1, "version": 1,
                       "state": {"bpm": 91}}, f)
        pg.reload(wait_until="load")
        pg.wait_for_timeout(700)
        with pg.expect_file_chooser(timeout=5000) as fc:
            snap_foot("import")
        fc.value.set_files(snap_path)
        pg.wait_for_timeout(900)
        names = pg.evaluate("() => (JSON.parse(localStorage.getItem('teslacoil_snapshots')||'[]')).map(s=>s.name)")
        check("Snapshot-Import: steht in der Liste", "AusDatei" in names, str(names))
        bpm = pg.evaluate("() => JSON.parse(localStorage.getItem('teslacoil_live')||'{}').bpm")
        check("Snapshot-Import: wurde auch geladen (bpm=91)", bpm == 91, f"bpm={bpm}")

        # ── 4. Backup-Datei in den Snapshot-Import → Absage, nichts kaputt ──
        dialogs.clear()
        state["accept"] = False
        before = pg.evaluate("() => localStorage.getItem('teslacoil_snapshots')")
        with pg.expect_file_chooser(timeout=5000) as fc:
            snap_foot("import")
        fc.value.set_files(path)
        pg.wait_for_timeout(900)
        after = pg.evaluate("() => localStorage.getItem('teslacoil_snapshots')")
        check("Falsche Datei: abgelehnt, Daten unberührt", before == after)
        check("Falsche Datei: Meldung sagt, wo sie hingehört",
              any("Backup-Datei" in m for m in dialogs), str(dialogs))

        check("keine JS-Fehler", not errors, "; ".join(errors[:3]))
        br.close()
    srv.shutdown()

    print(f"\n{'ALLE GRÜN ✅' if not fails else 'FEHLER: ' + ', '.join(fails)}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
