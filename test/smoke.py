"""
smoke.py – Browser-Integrationstest (Playwright, headless Chromium).

Prüft: lädt ohne Konsolen-/Page-Fehler, Audio läuft (Analyser liefert Signal),
Recall setzt Werte zurück. Startet selbst einen lokalen HTTP-Server.
"""
import http.server
import socketserver
import threading
import os
import sys
import functools

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8769

def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    httpd.daemon_threads = True
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd

def main():
    from playwright.sync_api import sync_playwright
    httpd = serve()
    errors = []
    fails = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=[
                "--autoplay-policy=no-user-gesture-required",
            ])
            page = browser.new_page()
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

            page.goto(f"http://127.0.0.1:{PORT}/index.html")
            page.wait_for_function("() => window.tesla && window.tesla.engine", timeout=5000)

            # UI da?
            knob_count = page.eval_on_selector_all(".knob-container", "els => els.length")
            key_count = page.eval_on_selector_all(".kb-key", "els => els.length")
            if knob_count < 10: fails.append(f"zu wenige Knobs: {knob_count}")
            if key_count != 12: fails.append(f"Keyboard nicht 12 Tasten: {key_count}")

            # Max-RMS über ein Zeitfenster (Ton ist nur einen Teil der Zeit an)
            def max_rms(frames=16, step=30):
                m = 0.0
                for _ in range(frames):
                    page.wait_for_timeout(step)
                    r = page.evaluate("""() => {
                        const d = window.tesla.engine.master.getWaveform();
                        let s=0; for (let i=0;i<d.length;i++) s+=d[i]*d[i];
                        return Math.sqrt(s/d.length);
                    }""")
                    if r and r > m: m = r
                return m

            # Audio starten und Signal messen
            page.evaluate("async () => { await window.tesla.engine.start(); }")
            rms = max_rms()
            running = page.evaluate("() => window.tesla.engine.running")
            if not running: fails.append("Engine läuft nicht nach start()")
            if not (rms and rms > 0.05): fails.append(f"kein Audiosignal (max RMS={rms})")

            cur = page.evaluate("() => window.tesla.engine.currentFreq")
            if not (cur and cur > 0): fails.append(f"currentFreq ungültig: {cur}")

            # Scale-Gating: alle Töne AUS → keine Trigger → Stille (Max über Fenster)
            page.evaluate("() => window.tesla.state.set('scaleMask', new Array(12).fill(0))")
            page.wait_for_timeout(400)  # laufende Voices ausklingen lassen
            rms_off = max_rms(frames=12, step=30)
            if rms_off > 0.02: fails.append(f"Scale-Gating greift nicht: OFF spielt weiter (max RMS={rms_off})")
            page.evaluate("() => window.tesla.state.set('scaleMask', new Array(12).fill(1))")
            page.wait_for_timeout(150)

            # DC-Block-Toggle: aus → an, Reroute ohne Fehler, Engine läuft weiter
            page.evaluate("() => window.tesla.state.set('dcBlock', false)")
            dc_off = page.evaluate("() => window.tesla.engine.master.dcEnabled")
            page.evaluate("() => window.tesla.state.set('dcBlock', true)")
            dc_on = page.evaluate("() => window.tesla.engine.master.dcEnabled")
            if dc_off is not False or dc_on is not True:
                fails.append(f"DC-Block-Toggle greift nicht (off={dc_off}, on={dc_on})")

            page.evaluate("() => window.tesla.engine.stop()")

            # Recall-Test: Snapshot, BPM ändern, Recall → Knob zurück?
            page.evaluate("() => window.tesla.presets.saveSnapshot('test')")
            page.evaluate("() => window.tesla.state.set('bpm', 200)")
            knob_after_set = page.evaluate("() => document.getElementById('knob_bpm').querySelector('.knob-value').textContent")
            page.evaluate("() => window.tesla.presets.recallSnapshot(window.tesla.presets.listSnapshots().length - 1)")
            page.wait_for_timeout(50)
            bpm_state = page.evaluate("() => window.tesla.state.get('bpm')")
            knob_after_recall = page.evaluate("() => document.getElementById('knob_bpm').querySelector('.knob-value').textContent")
            if bpm_state != 120: fails.append(f"Recall State BPM != 120: {bpm_state}")
            if knob_after_recall.strip() != "120": fails.append(f"Recall hat Knob-UI NICHT aktualisiert: '{knob_after_recall}' (octaver-Bug!)")

            browser.close()
    finally:
        httpd.shutdown()

    print("Konsolen-/Page-Fehler:", len(errors))
    for e in errors[:20]: print("   ⚠", e)
    if fails:
        print("\nFEHLGESCHLAGEN:")
        for f in fails: print("   ✗", f)
    if errors or fails:
        sys.exit(1)
    print("\n✅ Smoke-Test bestanden: lädt sauber, Audio erzeugt Signal, Recall aktualisiert UI.")

if __name__ == "__main__":
    main()
