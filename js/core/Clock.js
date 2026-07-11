/**
 * Clock.js – Lookahead-Scheduler (sample-accurate, kein setInterval-Jitter).
 *
 * Ruft onTrigger(time, interval) für jeden Trigger im Vorausfenster auf.
 * Das Intervall liefert intervalFn() (Engine berechnet es aus BPM+Division),
 * sodass Tempo-/Teilungsänderungen sofort greifen.
 */
const LOOKAHEAD = 0.1;     // s im Voraus geplant
const TICK_MS = 25;        // Timer-Intervall

export class Clock {
    /**
     * @param {AudioContext} ctx
     * @param {(time:number, interval:number)=>void} onTrigger
     */
    constructor(ctx, onTrigger) {
        this.ctx = ctx;
        this.onTrigger = onTrigger;
        this.intervalFn = () => 0.5;
        this._timer = null;
        this._next = 0;
    }

    start() {
        if (this._timer) return;
        this._next = this.ctx.currentTime + 0.06;
        this._timer = setInterval(() => this._schedule(), TICK_MS);
        this._schedule();
    }

    stop() {
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
    }

    get running() { return !!this._timer; }

    _schedule() {
        const horizon = this.ctx.currentTime + LOOKAHEAD;
        // Schutz gegen Endlosschleife bei winzigen Intervallen
        let guard = 0;
        while (this._next < horizon && guard++ < 256) {
            const interval = Math.max(0.02, this.intervalFn());
            this.onTrigger(this._next, interval);
            this._next += interval;
        }
    }
}
