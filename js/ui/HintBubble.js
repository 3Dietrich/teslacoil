/**
 * HintBubble.js – Die Hilfe-Blase am Mauszeiger.
 *
 * WARUM NICHT DAS NATIVE `title` (@dpa 20260716_174111: „Global im Header ein und
 * aussschaltbar (falls das aufpopen der hints stört) und in den Settings einen Punkt:
 * Help hint delay.. (wann das hint erscheint)?"): Ein `title` gehört dem Browser. Seine
 * Verzögerung ist nicht einstellbar, abschalten kann man ihn nur, indem man das Attribut
 * entfernt, und aussehen tut er wie das Betriebssystem, nicht wie dieses Instrument.
 * Beide Wünsche sind mit `title` also nicht erfüllbar – deshalb eine eigene Blase.
 *
 * EIN Listener für alles (Delegation), nicht einer pro Control: Controls entstehen und
 * verschwinden hier laufend (Sichtbarkeit, e-Mode, Recall). Ein Listener am Dokument sieht
 * auch die, die es beim Start noch gar nicht gab, und kann nichts leaken.
 *
 * Woher der Text kommt, entscheidet `resolve` (s. hints.js): erst @dpas eigener Text,
 * dann die Auslieferung. Die Blase selbst weiß davon nichts – sie zeigt nur an.
 */

const PAD = 12;   // Abstand zum Mauszeiger

export class HintBubble {
  /**
   * @param {object} cfg
   * @param {(el: HTMLElement) => string} cfg.resolve – Text für ein Element ('' = kein Hint)
   * @param {() => boolean} cfg.enabled               – Hints global an?
   * @param {() => number} cfg.delay                  – Verzögerung in ms
   */
  constructor(cfg) {
    this._cfg = cfg;
    this._el = null;
    this._timer = 0;
    this._target = null;

    // mouseover/-out statt mouseenter: die feuern nicht in der Capture-freien Delegation.
    document.addEventListener('mouseover', (e) => this._onOver(e));
    document.addEventListener('mouseout', (e) => { if (!e.relatedTarget || !this._target || !this._target.contains(e.relatedTarget)) this.hide(); });
    // Jede echte Handlung blendet die Blase weg – sie ist Hilfe, kein Kommentar zum Tun.
    document.addEventListener('mousedown', () => this.hide(), true);
    document.addEventListener('keydown', () => this.hide(), true);
    document.addEventListener('wheel', () => this.hide(), { passive: true });
    window.addEventListener('scroll', () => this.hide(), true);
  }

  /**
   * Das nächste Element unter der Maus, das etwas zu sagen hat.
   *
   * `data-ctrl` reicht als Kennung – jedes Control trägt sie ohnehin (für den e-Mode), und
   * sie ist zugleich der Schlüssel in die Hint-Tabelle. Ein zweites Attribut wäre eine
   * Kennung mehr, die man beim Anlegen eines Controls vergessen kann.
   * `closest` nimmt das INNERSTE: ein Knopf mit eigenem data-hint (z.B. Fill im Seq)
   * sticht damit den Hint des Controls, in dem er sitzt – das Spezifischere gewinnt.
   */
  _hintHost(node) {
    if (!(node instanceof Element)) return null;
    return node.closest('[data-hint], [data-ctrl]');
  }

  _onOver(e) {
    if (!this._cfg.enabled()) { this.hide(); return; }
    const host = this._hintHost(e.target);
    if (!host) { this.hide(); return; }
    const text = this._cfg.resolve(host);
    if (!text) { this.hide(); return; }
    if (host === this._target && this._el) return;   // schon dran, nicht neu aufziehen
    this.hide();
    this._target = host;
    const x = e.clientX, y = e.clientY;
    this._timer = setTimeout(() => this._show(text, x, y), Math.max(0, this._cfg.delay()));
  }

  _show(text, x, y) {
    const b = document.createElement('div');
    b.className = 'hint-bubble';
    b.textContent = text;
    document.body.appendChild(b);
    this._el = b;
    // Im Bild halten: unter dem Zeiger, sonst darüber; nie über den rechten Rand hinaus.
    const r = b.getBoundingClientRect();
    let left = x + PAD;
    if (left + r.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - r.width - 8);
    let top = y + PAD + 6;
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, y - r.height - PAD);
    b.style.left = left + 'px';
    b.style.top = top + 'px';
  }

  hide() {
    clearTimeout(this._timer);
    this._timer = 0;
    this._target = null;
    if (this._el) { this._el.remove(); this._el = null; }
  }
}
