/**
 * PickMenu.js – Auswahl-Menü für benannte Sachen (Snapshots, Combos, Farben …).
 *
 * @dpa 20260716_132014 über die alte Lösung (natives <select> + Icon-Reihe daneben):
 * „zum einen wollte ich keinen extra Eintrag ganz oben, sondern den Snapshot in der Liste
 * selektiert haben … Und die Reihe [Überschreiben, Neu, Upload, Download, Löschen] ist zu
 * lang, zu cryptisch, unansehlich."
 *
 * Zwei Dinge sind hier anders als beim <select>, und beide sind der Grund für dieses Widget:
 *
 * 1. ERNEUT WÄHLEN LÄDT ERNEUT. Ein natives <select> feuert kein 'change', wenn man den
 *    bereits gewählten Eintrag nochmal anklickt – deshalb stand der geladene Snapshot
 *    früher als Extra-Eintrag („↻ Name") auf dem Platzhalter, und die Box zeigte in der
 *    Liste auf nichts. Ein eigenes Menü hat das Problem nicht: JEDER Klick auf eine Zeile
 *    ist ein Klick, auch auf die markierte. Also ist der geladene Eintrag da, wo er
 *    hingehört – IN der Liste, markiert und beim Öffnen sichtbar gescrollt.
 *
 * 2. DIE AKTIONEN LIEGEN AM EINTRAG, nicht in einer Reihe daneben. Überschreiben und
 *    Löschen meinen immer eine BESTIMMTE Zeile – als Icon-Reihe daneben mussten sie erst
 *    erklären, worauf sie sich beziehen (auf den gemerkten Namen). In der Zeile ist das
 *    keine Frage mehr. Was die Liste als Ganzes betrifft (Neu / Import / Export), steht
 *    unten in der Fußzeile. Draußen bleibt nur noch der Knopf mit dem Namen.
 *
 * Rückgängig zu machen: das Widget ist rein additiv – wer die alte Cluster-Zeile zurück
 * will, baut wieder _cluster(...) statt new PickMenu(...) (s. PresetBar._build).
 */

import { icon } from './icons.js';
import { hint } from '../core/i18n.js';

/** @typedef {{name:string}} PickItem */

export class PickMenu {
  /**
   * @param {object} cfg
   * @param {string} [cfg.label]        – Beschriftung links vom Knopf ('' = keine)
   * @param {string} [cfg.empty]        – Text, wenn nichts geladen ist
   * @param {()=>PickItem[]} cfg.list   – aktuelle Einträge (wird bei jedem Öffnen gefragt)
   * @param {()=>string} cfg.current    – Name des geladenen Eintrags ('' = keiner)
   * @param {(i:number, item:PickItem)=>void} cfg.onPick     – Zeile geklickt (auch die markierte)
   * @param {(i:number, item:PickItem)=>void} [cfg.onUpdate] – ✎ in der Zeile
   * @param {(i:number, item:PickItem)=>void} [cfg.onDelete] – 🗑 in der Zeile
   * @param {[string,string,Function][]} [cfg.foot]          – Fußzeile: [glyph+text, title, fn]
   * @param {string} [cfg.title]        – Tooltip des Knopfes
   */
  constructor(cfg) {
    this._cfg = cfg;
    this.element = document.createElement('div');
    this.element.className = 'pickmenu';
    if (cfg.label) {
      const lab = document.createElement('span');
      lab.className = 'pm-label'; lab.textContent = cfg.label;
      this.element.appendChild(lab);
    }
    const btn = document.createElement('button');
    btn.className = 'pm-btn'; btn.type = 'button';
    hint(btn, cfg.title || 'Auswählen · erneut wählen lädt erneut');
    this._name = document.createElement('span'); this._name.className = 'pm-name';
    const caret = document.createElement('span'); caret.className = 'pm-caret'; caret.appendChild(icon('caret'));
    btn.appendChild(this._name); btn.appendChild(caret);
    btn.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
    // Pfeiltasten/Enter am Knopf: Menü öffnen – der Knopf ist ein normales Bedienelement
    // in der Tab-Kette und darf nicht nur mit der Maus aufgehen.
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); this.open(); }
    });
    this.element.appendChild(btn);
    this._btn = btn;
    this._pop = null;
    this.refresh();
  }

  /** Knopf-Beschriftung = geladener Eintrag (das ist die Anzeige, die @dpa vermisst hat:
   *  „Vor allem wenn geschlossen: den letzten Snap anzeigen"). */
  refresh() {
    const cur = this._cfg.current() || '';
    const known = cur && this._cfg.list().some((it) => it.name === cur);
    this._name.textContent = known ? cur : (this._cfg.empty || '—');
    this._name.classList.toggle('pm-none', !known);
    if (this._pop) this._fill();
  }

  get isOpen() { return !!this._pop; }
  toggle() { if (this._pop) this.close(); else this.open(); }

  open() {
    this.close();
    const pop = document.createElement('div'); pop.className = 'pm-pop';
    const list = document.createElement('div'); list.className = 'pm-list';
    pop.appendChild(list);
    this._list = list;
    if (this._cfg.foot && this._cfg.foot.length) {
      const foot = document.createElement('div'); foot.className = 'pm-foot';
      this._cfg.foot.forEach(([ico, label, title, fn]) => {
        const b = document.createElement('button'); b.className = 'pm-foot-btn'; b.type = 'button';
        b.appendChild(icon(ico));
        b.appendChild(document.createTextNode(label));
        hint(b, title);
        b.addEventListener('click', (e) => { e.stopPropagation(); this.close(); fn(); });
        foot.appendChild(b);
      });
      pop.appendChild(foot);
    }
    document.body.appendChild(pop);
    this._pop = pop;
    this._fill();
    this._place();
    // Außenklick/ESC schließen. Der mousedown-Handler kommt erst im nächsten Tick, sonst
    // fängt er den Klick, der das Menü gerade geöffnet hat.
    this._outside = (e) => { if (this._pop && !this._pop.contains(e.target) && !this.element.contains(e.target)) this.close(); };
    this._onKey = (e) => { if (e.key === 'Escape' && this._pop) { e.stopPropagation(); this.close(); this._btn.focus(); } };
    setTimeout(() => document.addEventListener('mousedown', this._outside, true), 0);
    document.addEventListener('keydown', this._onKey, true);
  }

  close() {
    if (!this._pop) return;
    this._pop.remove(); this._pop = null; this._list = null;
    document.removeEventListener('mousedown', this._outside, true);
    document.removeEventListener('keydown', this._onKey, true);
  }

  /** Liste neu aufbauen; markierte Zeile in Sicht scrollen. */
  _fill() {
    const list = this._list; if (!list) return;
    list.innerHTML = '';
    const items = this._cfg.list();
    const cur = this._cfg.current() || '';
    if (!items.length) {
      const e = document.createElement('div'); e.className = 'pm-empty';
      e.textContent = 'noch nichts gespeichert';
      list.appendChild(e);
      return;
    }
    let curRow = null;
    items.forEach((it, i) => {
      const row = document.createElement('div'); row.className = 'pm-item';
      row.dataset.name = it.name;
      const isCur = it.name === cur;
      if (isCur) { row.classList.add('pm-current'); curRow = row; }
      const nm = document.createElement('span'); nm.className = 'pm-item-name'; nm.textContent = it.name;
      row.appendChild(nm);
      // Klick auf die Zeile lädt – auch auf der markierten (genau der Punkt, an dem das
      // native <select> versagt hat: es feuert dort kein 'change').
      row.addEventListener('click', (e) => { e.stopPropagation(); this.close(); this._cfg.onPick(i, it); this.refresh(); });
      const act = (name, title, fn, kind) => {
        const b = document.createElement('button'); b.className = 'pm-act pm-ic-' + kind; b.type = 'button';
        b.appendChild(icon(name)); b.setAttribute('aria-label', title); hint(b, title);
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(i, it); this.refresh(); this._fill(); });
        row.appendChild(b);
      };
      if (this._cfg.onUpdate) act('edit', `„${it.name}" mit dem aktuellen Zustand überschreiben`, this._cfg.onUpdate, 'save');
      if (this._cfg.onDelete) act('trash', `„${it.name}" löschen`, this._cfg.onDelete, 'del');
      list.appendChild(row);
    });
    // „Wenn die Liste groß ist, soll sie gescrollt werden, damit der markierte Snapshot
    // sofort zu sehen ist" (@dpa). 'nearest' scrollt NUR, wenn er wirklich außer Sicht ist.
    if (curRow) requestAnimationFrame(() => curRow.scrollIntoView({ block: 'nearest' }));
  }

  /** Unter dem Knopf, aber im Bild halten (die Liste kann lang werden). */
  _place() {
    const r = this._btn.getBoundingClientRect();
    const pop = this._pop;
    pop.style.left = '0px'; pop.style.top = '0px';
    const pr = pop.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - pr.width - 8));
    // Passt es unter den Knopf? Sonst darüber; reicht auch das nicht, oben andocken.
    let top = r.bottom + 4;
    if (top + pr.height > window.innerHeight - 8) {
      top = (r.top - pr.height - 4 >= 8) ? r.top - pr.height - 4 : Math.max(8, window.innerHeight - pr.height - 8);
    }
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }

  mount(parent) { parent.appendChild(this.element); return this.element; }
}
