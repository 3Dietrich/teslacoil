#!/usr/bin/env python3
"""shots.py – erzeugt die Bilder der Anleitung (anleitung_img/) reproduzierbar neu.

Kein Test, sondern ein Werkzeug: die Anleitung soll nicht mit von Hand
zusammengeklickten Screenshots veralten. Nach einer UI-Änderung einmal laufen
lassen, dann stimmen die Bilder wieder.

    python3 test/shots.py          (startet den Server selbst)

Headless-Falle (s. CLAUDE.md): `LadderFilter.load()` löst im headless Chromium
weder auf noch ab → `engine.start()` bleibt hängen, `engine.running` bleibt false.
Für Bilder egal – die UI wird unabhängig davon gebaut. Wir starten hier bewusst
KEINEN Transport, sondern setzen nur State-Werte (die UI folgt über '*'/Key-Events).
"""
import http.server
import socketserver
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'anleitung_img'
PORT = 8111

# Für die Bilder alles einschalten, was sonst hinter einem 'aktiv'-Haken versteckt
# liegt – eine Anleitung, die nur ausgegraute Gruppen zeigt, hilft niemandem.
SHOW_ALL = {
    'filterEnabled': True, 'distEnabled': True, 'reverbEnabled': True,
    'metroEnabled': True, 'baseTestOn': True, 'ampHold': True,
    'ampSeqEnabled': True, 'filterEnvTrig': 'seq',
    'scopeOn': True, 'specOn': True,
}

# (Dateiname, JS-Selektor). None = ganze Seite.
# 01 entsteht VOR SHOW_ALL – die Übersicht soll den echten Auslieferungszustand
# zeigen, den ein neuer Besucher bekommt (Werkseinstellung), nicht unseren Aufriss.
SHOTS = [
    ('02_kopfzeile.png', '.topbar'),
    ('03_transport.png', '.presetbar'),
    ('04_kette.png', '.fx-chain-wrap'),
    ('10_takt.png', '[data-group="Takt"]'),
    ('11_metronom.png', '[data-group="Metronom"]'),
    ('12_skaler.png', '[data-group="Skaler"]'),
    ('13_basefrq.png', '[data-group="Base-Frq"]'),
    ('14_audioosz.png', '[data-group="Audio-Osz"]'),
    ('15_filter.png', '[data-group="Filter"]'),
    ('16_distortion.png', '[data-group="Distortion"]'),
    ('17_envelope.png', '[data-group="Envelope"]'),
    ('18_reverb.png', '[data-group="Gate Reverb"]'),
    ('19_debug.png', '[data-group="Debug"]'),
    ('20_scopes.png', '.scopes'),
]


def serve():
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(ROOT), **k)
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    from playwright.sync_api import sync_playwright

    OUT.mkdir(exist_ok=True)
    httpd = serve()
    with sync_playwright() as p:
        br = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        pg = br.new_page(viewport={'width': 1600, 'height': 1100}, device_scale_factor=2)
        pg.goto(f'http://127.0.0.1:{PORT}/', wait_until='networkidle')
        pg.wait_for_function('window.tesla && window.tesla.state', timeout=10000)
        pg.wait_for_timeout(600)                        # Werkseinstellung ist da → Auslieferungsbild
        pg.screenshot(path=str(OUT / '01_overview.png'), full_page=True); print('ok   01_overview.png')
        pg.evaluate('(v) => { for (const [k, val] of Object.entries(v)) window.tesla.state.set(k, val); }', SHOW_ALL)
        pg.wait_for_timeout(400)

        for name, sel in SHOTS:
            try:
                if sel is None:
                    pg.screenshot(path=str(OUT / name), full_page=True)
                else:
                    pg.locator(sel).first.screenshot(path=str(OUT / name))
                print('ok  ', name)
            except Exception as e:                      # ein fehlendes Bild soll den Rest nicht killen
                print('FEHLT', name, '→', type(e).__name__, str(e).splitlines()[0])

        # Overlays/Modi, die einen Klick brauchen
        try:
            pg.click('.settings-btn'); pg.wait_for_timeout(250)
            pg.locator('.settings-window').screenshot(path=str(OUT / '05_einstellungen.png')); print('ok   05_einstellungen.png')
            pg.keyboard.press('Escape')
        except Exception as e:
            print('FEHLT 05_einstellungen.png →', e)

        try:
            pg.click('.arrange-btn'); pg.wait_for_timeout(300)
            pg.screenshot(path=str(OUT / '06_emode.png'), full_page=True); print('ok   06_emode.png')
            pg.click('.arrange-btn'); pg.wait_for_timeout(200)
        except Exception as e:
            print('FEHLT 06_emode.png →', e)

        # Regler-Einstellungen (Rechtsklick auf einen Knob) – ganze Seite, damit das
        # schwebende Panel samt Bezug zum Regler sichtbar ist.
        try:
            pg.locator('[data-ctrl="k:lpCutoff"] .knob-container, [data-ctrl="k:lpCutoff"]').first.click(button='right')
            pg.wait_for_timeout(250)
            # .knob-meta-editor trifft auch die Element-Settings (teilen sich die Klasse) → :not()
            pg.locator('.knob-meta-editor:not(.elem-settings)').screenshot(path=str(OUT / '07_reglersettings.png')); print('ok   07_reglersettings.png')
            pg.keyboard.press('Escape')
        except Exception as e:
            print('FEHLT 07_reglersettings.png →', e)

        # Gruppen-Einstellungen (Rechtsklick auf eine Gruppe)
        try:
            pg.locator('[data-group="Takt"] .group-title').click(button='right')
            pg.wait_for_timeout(250)
            pg.locator('.group-settings').first.screenshot(path=str(OUT / '08_gruppensettings.png')); print('ok   08_gruppensettings.png')
            pg.keyboard.press('Escape')
        except Exception as e:
            print('FEHLT 08_gruppensettings.png →', e)

        br.close()
    httpd.shutdown()


if __name__ == '__main__':
    sys.exit(main())
