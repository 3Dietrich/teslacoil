#!/usr/bin/env python3
"""arrange.py – Wächter für e-Mode-Layout und Tasten-Zuständigkeit (@dpa 20260715).

Fängt zwei Fehler ab, die schon mehrfach still zurückkamen:

  873  Controls springen beim Betreten des e-Mode / beim Anclicken.
       Zwei unabhängige Ursachen, BEIDE müssen gefixt bleiben:
         a) setArranging() muss ERST einfrieren, DANN einblenden – sonst friert
            freezeGroup() die Controls auf dem frisch verschobenen Fluss fest.
         b) .free-canvas > [data-ctrl] braucht margin:0 – bei position:absolute
            setzt `top` die Margin-Box, gemessen wird die Border-Box.
       Ein margin-top an irgendeiner Control-Klasse bringt (b) sofort zurück.

  870  Space=Start/Stop und 'e'=e-Mode müssen greifen, auch wenn der Fokus nach
       dem Bedienen auf Select/Checkbox/Knob stehen bleibt – aber niemals beim
       Tippen. Regel: js/core/keyRoute.js.

Lauf:  python3 test/arrange.py        (Server auf :8000 wird selbst gestartet)

Audio-Hinweis: headless hängt LadderFilter.load(), darum wird engine.running nie
true und der Play-Button bleibt auf '■ Stop'. Der Transport wird deshalb über
gezählte engine.start/stop-Aufrufe geprüft, nicht über den Button.
"""
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

PORT = 8011
URL = f"http://localhost:{PORT}/"
fails = []


def check(name, cond, detail=""):
    print(f"  {'OK  ' if cond else 'FAIL'} {name}{'   ' + detail if detail and not cond else ''}")
    if not cond:
        fails.append(name)


# Echte Bildschirmposition jeder sichtbaren Einheit, pro Gruppe.
SNAP = """() => {
  const out = {};
  for (const g of document.querySelectorAll('.group'))
    for (const u of g.querySelectorAll('[data-ctrl]')) {
      if (u.offsetParent === null) continue;
      const r = u.getBoundingClientRect();
      out[g.dataset.group + '/' + u.dataset.ctrl] = [Math.round(r.left), Math.round(r.top)];
    }
  return out;
}"""

SPY = """() => {
  window.__t = 0;
  const e = window.tesla.engine;
  const s = e.start.bind(e), st = e.stop.bind(e);
  e.start = (...a) => { window.__t++; return s(...a); };
  e.stop  = (...a) => { window.__t++; return st(...a); };
}"""

srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = b.new_page(viewport={"width": 1600, "height": 1000})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.goto(URL, wait_until="networkidle")
        pg.wait_for_timeout(700)
        pg.evaluate(SPY)

        arranging = lambda: pg.evaluate("() => !!document.querySelector('.arranging')")
        taps = lambda: pg.evaluate("() => window.__t")

        # ── 873: kein Sprung beim Betreten des e-Mode ──
        print("\n-- 873: e-Mode darf nichts verschieben --")
        before = pg.evaluate(SNAP)
        pg.keyboard.press("e")
        pg.wait_for_timeout(300)
        mid = pg.evaluate(SNAP)
        moved = {k: (before[k], mid[k]) for k in before if k in mid and before[k] != mid[k]}
        for k, (a, c) in list(moved.items())[:10]:
            print(f"       {k}: {a} -> {c}  d=({c[0]-a[0]:+d},{c[1]-a[1]:+d})")
        check("'e' verschiebt kein sichtbares Control", not moved,
              f"{len(moved)} von {len(before)} gesprungen")

        # ── 873: kein Sprung beim reinen Anclicken (freezeGroup) ──
        print("\n-- 873: reiner Klick darf nichts verschieben --")
        t = pg.query_selector('.group[data-group="Filter"] [data-ctrl]')
        box = t.bounding_box()
        pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        pg.mouse.down()
        pg.wait_for_timeout(150)
        pg.mouse.up()
        pg.wait_for_timeout(300)
        after = pg.evaluate(SNAP)
        jumped = {k: (mid[k], after[k]) for k in mid if k in after and mid[k] != after[k]}
        for k, (a, c) in list(jumped.items())[:10]:
            print(f"       {k}: {a} -> {c}  d=({c[0]-a[0]:+d},{c[1]-a[1]:+d})")
        check("Klick ohne Bewegung verschiebt nichts", not jumped,
              f"{len(jumped)} von {len(mid)} gesprungen")
        pg.keyboard.press("e")
        pg.wait_for_timeout(250)

        # ── 870: Fokus auf einem Bedienelement tötet Space/'e' nicht ──
        print("\n-- 870: Space/'e' ueberleben den Fokus --")
        targets = {
            "Menu-Switch": '.group[data-group="Filter"] select',
            "Checkbox": '.group[data-group="Filter"] input[type=checkbox]',
            "Knob": ".knob-container",
        }
        for label, css in targets.items():
            el = pg.query_selector(css)
            el.focus()
            n = taps()
            pg.keyboard.press("Space")
            pg.wait_for_timeout(180)
            check(f"Space -> Transport, Fokus auf {label}", taps() == n + 1, f"{n} -> {taps()}")
            el.focus()
            pg.keyboard.press("e")
            pg.wait_for_timeout(160)
            on = arranging()
            pg.keyboard.press("e")
            pg.wait_for_timeout(160)
            check(f"'e' -> e-Mode an+aus, Fokus auf {label}", on and not arranging())

        # Space darf das fokussierte Element nicht zusätzlich schalten.
        chk = pg.query_selector('.group[data-group="Filter"] input[type=checkbox]')
        chk.focus()
        was = chk.is_checked()
        pg.keyboard.press("Space")
        pg.wait_for_timeout(180)
        check("Space schaltet die fokussierte Checkbox nicht mit", chk.is_checked() == was)

        # ── Gegenprobe: beim Tippen gehört alles dem Feld ──
        print("\n-- Gegenprobe: Tippen hat Vorrang --")
        pg.evaluate("""() => { const i=document.createElement('input'); i.type='text';
                               i.id='__probe'; document.body.appendChild(i); i.focus(); }""")
        n = taps()
        pg.keyboard.type("a b")
        pg.wait_for_timeout(180)
        check("Tippen: Space transportiert nicht", taps() == n)
        check("Tippen: Leerzeichen kommt im Feld an",
              pg.eval_on_selector("#__probe", "i => i.value") == "a b")
        pg.keyboard.type("e")
        pg.wait_for_timeout(150)
        check("Tippen: 'e' oeffnet den e-Mode nicht", not arranging())
        pg.evaluate("() => document.querySelector('#__probe').remove()")

        # ── Pfeile: nur wer sie bedient, behält sie ──
        print("\n-- Pfeile: Zustaendigkeit --")
        band0 = pg.evaluate("() => window.tesla.state.get('baseBand')")
        pg.query_selector('.group[data-group="Filter"] select').focus()
        pg.keyboard.press("ArrowDown")
        pg.wait_for_timeout(160)
        check("Select behaelt die Pfeile (baseBand unveraendert)",
              pg.evaluate("() => window.tesla.state.get('baseBand')") == band0)
        pg.evaluate("() => document.activeElement.blur()")
        pg.keyboard.press("ArrowUp")
        pg.wait_for_timeout(160)
        check("Body: Pfeil verdoppelt baseBand",
              abs(pg.evaluate("() => window.tesla.state.get('baseBand')") - band0 * 2) < 1e-6)

        # ── Fader: Gestalt + Länge (dd.md 815) ──
        # Die Längen-Zeile war schon einmal weg, weil die Gestalt-Namen an ZWEI Stellen
        # aufgezählt waren und beim Umbenennen auseinanderliefen (@dpa: „die Länge ist
        # wieder weg!"). Deshalb hier fest verdrahtet.
        print("\n-- Fader: Gestalt und Laenge --")
        K = '.knob-container#knob_bpm'
        ED = '.knob-meta-editor:not(.elem-settings)'
        pg.query_selector(K).click(button="right")
        pg.wait_for_timeout(250)
        len_row = lambda: pg.evaluate(
            "() => { const r = document.querySelector('.kme-row[data-f=\"faderLen\"]');"
            "        return !!r && r.style.display !== 'none'; }")
        size = lambda: pg.evaluate(
            f"() => {{ const r = document.querySelector('{K} .knob-svg').getBoundingClientRect();"
            f"         return {{ w: Math.round(r.width), h: Math.round(r.height) }}; }}")

        check("Knob: Laengen-Zeile versteckt", not len_row())
        for shape, axis in [("faderVert", "h"), ("faderHoriz", "w")]:
            pg.select_option(f"{ED} .kme-shape", shape)
            pg.wait_for_timeout(280)
            check(f"{shape}: Laengen-Zeile sichtbar", len_row())
            pg.fill(f"{ED} .kme-faderlen", "200")
            pg.wait_for_timeout(300)
            s = size()
            check(f"{shape}: Laenge wirkt auf der richtigen Achse", s[axis] == 200, s)
            other = "w" if axis == "h" else "h"
            check(f"{shape}: Querachse bleibt schmal", s[other] == 22, s)
        pg.select_option(f"{ED} .kme-shape", "knob")
        pg.wait_for_timeout(280)
        check("zurueck auf Knob: Zeile wieder versteckt", not len_row())
        d = size()
        check("zurueck auf Knob: wieder quadratisch", d["w"] == d["h"], d)
        pg.keyboard.press("Escape")

        if errs:
            print("\nJS-Fehler:", errs[:5])
            fails.append("js-errors")
        b.close()
finally:
    srv.terminate()

if fails:
    print(f"\n❌ {len(fails)} Fehler: {', '.join(fails)}")
    sys.exit(1)
print("\n✅ arrange-Test bestanden: kein e-Mode-Sprung, Space/'e' ueberleben den Fokus.")
