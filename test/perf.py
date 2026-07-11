"""
perf.py – Render-Performance-Wächter (Playwright, headless Chromium).

Hintergrund: Der Render-Loop (frame()) zeichnet pro requestAnimationFrame die
Scopes/Meter/Reflections-Canvas. Ein Layout-Modell, das bei jedem Canvas-Repaint
ein globales Relayout erzwingt (z.B. CSS `columns`/multicol), lässt die FPS auf
~1 einbrechen → UI-Latenz + der Main-Thread-Clock-Scheduler wird ausgebremst
(Audio läuft „sau langsam"). Dieser Test misst die echte rAF-FPS und die
Gruppen-Breiten und schlägt Alarm, bevor so etwas wieder durchrutscht.

Startet selbst einen lokalen HTTP-Server. Läuft ohne Audio (misst nur den
Render-Loop; der läuft dauerhaft, auch ohne Start).
"""
import http.server
import socketserver
import threading
import os
import sys
import functools

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8770
MIN_FPS = 45          # unter diesem Wert gilt der Render-Loop als blockiert
MAX_NARROW_W = 220    # eine Ein-Regler-Gruppe darf nicht „spaltenbreit" sein


def serve():
    socketserver.TCPServer.allow_reuse_address = True
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    from playwright.sync_api import sync_playwright
    httpd = serve()
    fails = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_viewport_size({"width": 1600, "height": 1000})
            page.goto(f"http://127.0.0.1:{PORT}/index.html")
            page.wait_for_function("() => window.tesla && window.tesla.engine", timeout=15000)

            # Echte rAF-FPS über 1.5 s (Render-Loop läuft dauerhaft).
            fps = page.evaluate("""() => new Promise(res => {
                let n = 0; const t0 = performance.now();
                function f(){ n++; const dt = performance.now() - t0;
                    if (dt < 1500) requestAnimationFrame(f); else res(n / dt * 1000); }
                requestAnimationFrame(f);
            })""")
            if fps < MIN_FPS:
                fails.append(f"Render-Loop blockiert: {fps:.1f} FPS (< {MIN_FPS})")

            # Schmale Gruppe darf ihre natürliche Breite behalten (nicht spaltenbreit).
            takt_w = page.evaluate("""() => { const g = [...document.querySelectorAll('.group')]
                .find(x => x.dataset.group === 'Takt'); return g ? g.getBoundingClientRect().width : 0; }""")
            if takt_w > MAX_NARROW_W:
                fails.append(f"Gruppe 'Takt' zu breit: {takt_w:.0f}px (> {MAX_NARROW_W})")

            # Nach einem Collapse (löst sizePanel aus) bleibt der Loop flüssig.
            page.evaluate("() => window.tesla.state.set('groupStyles', {'Gate Reverb': {collapsed: true}})")
            page.wait_for_timeout(150)
            fps2 = page.evaluate("""() => new Promise(res => {
                let n = 0; const t0 = performance.now();
                function f(){ n++; const dt = performance.now() - t0;
                    if (dt < 800) requestAnimationFrame(f); else res(n / dt * 1000); }
                requestAnimationFrame(f);
            })""")
            if fps2 < MIN_FPS:
                fails.append(f"Render-Loop nach Collapse blockiert: {fps2:.1f} FPS")

            print(f"rAF-FPS idle={fps:.1f}  nach Collapse={fps2:.1f}  Takt-Breite={takt_w:.0f}px")
            browser.close()
    finally:
        httpd.shutdown()

    if fails:
        print("\nFEHLGESCHLAGEN:")
        for f in fails:
            print("   ✗", f)
        sys.exit(1)
    print("\n✅ Perf-Test bestanden: Render-Loop flüssig, Gruppen behalten schmale Breite.")


if __name__ == "__main__":
    main()
