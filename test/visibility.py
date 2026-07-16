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
        check("Dist aus: Dry-Delay weg", not vis("distDryDelay"))
        set_state({"distEnabled": True})
        for k in ("distDrive", "distOut", "distMode", "distMix", "distDryDelay"):
            check(f"Dist an: {k} da", vis(k))

        # ── Hold-Slide: nur bei Hold. 'Slide-Form' ist raus (@dpa 20260715) ──
        set_state({"ampHold": False})
        check("Hold aus: Slide weg", not vis("ampHoldGlide"))
        set_state({"ampHold": True})
        check("Hold an: Slide da", vis("ampHoldGlide"))
        check("Slide-Form existiert nicht mehr",
              pg.evaluate("()=>![...document.querySelectorAll('[data-ctrl]')]"
                          ".some(e=>e.dataset.ctrl.endsWith(':ampHoldCurve'))"))

        # ── Der Obertöne-Schalter ist wieder raus (@dpa 20260716_023817, nach dem Hören) ──
        check("Filter: Obertöne-Schalter existiert nicht mehr",
              pg.evaluate("()=>![...document.querySelectorAll('[data-ctrl]')]"
                          ".some(e=>e.dataset.ctrl.endsWith(':lpHarmQuant'))"))

        # ── Base-Keyboard (@dpa 20260716_031100): bedienbar NUR bei Quelle 'Ton' ──
        set_state({"baseSrc": "Ton", "baseNote": "C"})
        pg.evaluate("()=>document.querySelectorAll('.base-keyboard .kb-key')[5].click()")
        check("Base-Keyboard: Klick wählt die Tonklasse (Quelle Ton)",
              pg.evaluate("()=>window.tesla.state.get('baseNote')") == "F")
        on = pg.evaluate("()=>[...document.querySelectorAll('.base-keyboard .kb-key')]"
                         ".map(k=>k.classList.contains('kb-on'))")
        check("Base-Keyboard: genau EIN Ton an (single, keine Maske)",
              on.count(True) == 1 and on[5], str(on))
        # Quelle Freq: reine Anzeige – 440 Hz muss als A dastehen und Klicks ignorieren.
        set_state({"baseSrc": "Freq", "baseHz": 440, "baseBand": 440, "baseNote": "F"})
        check("Base-Keyboard: bei Quelle Freq nur Anzeige",
              pg.evaluate("()=>document.querySelector('.base-keyboard').classList.contains('kb-readonly')"))
        on2 = pg.evaluate("()=>[...document.querySelectorAll('.base-keyboard .kb-key')]"
                          ".map(k=>k.classList.contains('kb-on'))")
        check("Base-Keyboard: 440 Hz wird als A angezeigt", on2.count(True) == 1 and on2[9], str(on2))
        pg.evaluate("()=>document.querySelectorAll('.base-keyboard .kb-key')[0].click()")
        check("Base-Keyboard: Klick bei Quelle Freq ändert nichts",
              pg.evaluate("()=>window.tesla.state.get('baseNote')") == "F")

        # ── Settings sind Rechtsklick-Sache: kein ⚙ mehr an den Gruppen (@dpa 20260716) ──
        check("Gruppen haben kein ⚙ mehr",
              pg.evaluate("()=>!document.querySelector('.group-settings-btn')"))
        check("Rechtsklick auf eine Gruppe öffnet ihre Settings", pg.evaluate("""()=>{
            const g = document.querySelector("[data-group='Filter']");
            g.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, clientX:10, clientY:10}));
            const pop = document.querySelector('.group-settings');
            const ok = !!pop; if (pop) pop.remove(); return ok;
        }"""))

        # ── Skaler: Quant ist raus (@dpa 20260715_224643), die ×…Base-Anzeige bleibt ──
        for k in ("rateQuant", "rateNumMax", "rateDenMax"):
            check(f"Skaler: {k} existiert nicht mehr",
                  pg.evaluate("(k)=>![...document.querySelectorAll('[data-ctrl]')]"
                              ".some(e=>e.dataset.ctrl.split(':')[1]===k)", k))
        check("Skaler: ×…Base-Anzeige da", pg.evaluate(
            "()=>{const e=document.querySelector(\"[data-ctrl='u:rate']\");"
            "return !!e && / Base$/.test(e.textContent.trim());}"))

        # ── Debug: aufgelöst in einzelne Controls (@dpa 20260715_223000) ──
        check("Debug: kein Sammel-Control mehr",
              pg.evaluate("()=>!document.querySelector(\"[data-ctrl='u:debug']\")"))
        for sel, name in [("x:debugName", "Name (Schrift-Eingabe)"),
                          ("n:debugNote", "Text"),
                          ("x:debugPrompt", "Text-Eingabe"),
                          ("b:debugRec", "Rec"),
                          ("b:debugRec2", "Rec2"),
                          ("b:debugSave", "Debug speichern")]:
            check(f"Debug: {name} ist ein eigenes Control",
                  pg.evaluate("(s)=>!!document.querySelector(`[data-ctrl='${s}']`)", sel))

        # Reihenfolge = Tab-Reihenfolge (@dpa: „mach zwischen Name und Rec den Text mit dazu").
        # NICHT über die .debug-ctrls-Zeile suchen: im e-Mode-Canvas ist die aufgelöst und
        # die Controls hängen direkt im Gruppen-Body (die DOM-Reihenfolge bleibt dabei).
        order = pg.evaluate(
            "()=>[...document.querySelectorAll(\"[data-group='Debug'] [data-ctrl]\")].map(e=>e.dataset.ctrl)")
        check("Debug: Text steht zwischen Name und Rec",
              order == ["x:debugName", "n:debugNote", "x:debugPrompt",
                        "b:debugRec", "b:debugRec2", "b:debugSave"], f"ist: {order}")

        # Tab in eine Schrift-Eingabe selektiert deren ganzen Inhalt. Start auf dem
        # Klapp-Knopf der Gruppe – das fokussierbare Element DAVOR in der Tab-Kette (ein
        # <div> nimmt keinen Fokus, von dort startete Tab wieder ganz vorn). Früher hing
        # das am ⚙ der Gruppe; das gibt es seit 20260716 nicht mehr (Settings = Rechtsklick).
        pg.evaluate("()=>{const i=document.querySelector(\"[data-ctrl='x:debugName'] input\");"
                    "i.value='alter-inhalt'; i.dispatchEvent(new Event('input',{bubbles:true}));"
                    "document.querySelector(\"[data-group='Debug'] .group-collapse\").focus();}")
        pg.keyboard.press("Tab")
        act = pg.evaluate("()=>{const i=document.activeElement; return {tag:i.tagName, "
                          "val:i.value||'', sel:(i.selectionEnd??0)-(i.selectionStart??0)};}")
        check("Debug: Tab landet auf der Name-Eingabe", act["val"] == "alter-inhalt", str(act))
        check("Debug: Tab selektiert den ganzen Textinhalt", act["sel"] == len("alter-inhalt"), str(act))

        # Die MEHRZEILIGE Eingabe ist ein <textarea> – sie muss in der Tab-Kette liegen
        # (@dpa 20260716_023817: „die Texteingabe ist noch nicht in der Tab selektier
        # Sequenz"). panelFocusables() listete nur input/select/button → Tab sprang vorbei.
        pg.evaluate("()=>{const t=document.querySelector(\"[data-ctrl='x:debugPrompt'] textarea\");"
                    "t.value='prompt-inhalt'; t.dispatchEvent(new Event('input',{bubbles:true}));"
                    "document.querySelector(\"[data-ctrl='x:debugName'] input\").focus();}")
        pg.keyboard.press("Tab")
        act2 = pg.evaluate("()=>{const i=document.activeElement; return {tag:i.tagName, "
                           "val:i.value||'', sel:(i.selectionEnd??0)-(i.selectionStart??0)};}")
        check("Debug: Tab erreicht die mehrzeilige Text-Eingabe",
              act2["tag"] == "TEXTAREA", str(act2))
        check("Debug: Tab selektiert auch dort den ganzen Inhalt",
              act2["sel"] == len("prompt-inhalt"), str(act2))

        # Der Vergrößerungs-Zipfel: frei in beide Richtungen, Minimum bleibt erreichbar.
        css = pg.evaluate("()=>{const t=document.querySelector(\"[data-ctrl='x:debugPrompt'] textarea\");"
                          "const s=getComputedStyle(t); return {r:s.resize, mw:s.minWidth, mh:s.minHeight};}")
        check("Debug: Text-Eingabe hat den Zipfel in beide Richtungen", css["r"] == "both", str(css))
        check("Debug: Text-Eingabe behält ein Minimum (~40x20)",
              css["mw"] == "40px" and css["mh"] == "20px", str(css))

        br.close()
    srv.shutdown()

    print(f"\n{'ALLE GRÜN ✅' if not fails else 'FEHLER: ' + ', '.join(fails)}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
