/**
 * Scopes.js – Oszilloskop (Zeit) + Spektrum (FFT).
 *
 * Oszilloskop: speist vom Synth-Master. Trigger-Sync (steigende Nullflanke,
 * an/abschaltbar) + log Zeit-Range.
 * Spektrum: log-Frequenzachse; Eingang wählbar (Synth-Master ODER ein Audio-
 * Eingang/Mikrofon, z.B. um eine physische Tesla-Coil zu vergleichen) mit
 * eigenem Anzeige-Pegel (+volume / „Maximizer").
 */
export class Scopes {
    /**
     * @param {import('../engine/TeslaEngine.js').TeslaEngine} engine
     * @param {import('../core/State.js').State} [state] – Schalter/Regler in Optik persistieren.
     */
    constructor(engine, state) {
        this.engine = engine;
        this.master = engine.master;
        this.ctx = engine.ctx;
        this.sampleRate = this.ctx.sampleRate;
        this.state = state || null;
        const g = (k, d) => (this.state ? this.state.get(k) : d);

        // Oszilloskop (Startwerte aus dem State → Recall/Reset-fest)
        this.sync = !!g('scopeSync', true);
        this.range = g('scopeRange', 0.35);
        this.scopeOn = !!g('scopeOn', true);   // Anzeige aktiv (abschaltbar → spart CPU)
        this.specOn = !!g('specOn', true);
        // Spektrum-Eingang (NICHT persistiert – Mikro braucht Erlaubnis, transient)
        this._specAnalyser = null;   // null = Master-Analyser
        this._micStream = null;
        this._micSrc = null;
        this.specGain = g('specGain', 1);   // Anzeige-Pegel

        this.element = document.createElement('div');
        this.element.className = 'scopes';
        this._build();

        // Recall: bei '*' oder einem Scope-Key die UI aus dem State nachziehen.
        if (this.state) {
            const KEYS = ['scopeOn', 'specOn', 'scopeSync', 'scopeRange', 'specGain'];
            this.state.subscribe((key, _v, data) => { if (key === '*' || KEYS.includes(key)) this._applyState(data); });
        }
    }

    /** Kleiner Helfer: nur setzen, wenn ein State da ist (schreibt in die Optik-Ebene). */
    _set(key, val) { if (this.state) this.state.set(key, val); }

    _build() {
        this._scopeCv = document.createElement('canvas');
        this._scopeCv.className = 'scope-canvas';
        this._specCv = document.createElement('canvas');
        this._specCv.className = 'scope-canvas';

        // ── Oszilloskop-Box ──
        const scopeBox = document.createElement('div');
        scopeBox.className = 'scope-box';
        const head = document.createElement('div'); head.className = 'scope-head';
        const onChk = document.createElement('input'); onChk.type = 'checkbox'; onChk.checked = this.scopeOn; onChk.title = 'Anzeige an/aus';
        onChk.addEventListener('change', () => { this.scopeOn = onChk.checked; this._scopeCv.style.display = this.scopeOn ? '' : 'none'; this._set('scopeOn', this.scopeOn); });
        this._onChk = onChk;
        head.appendChild(onChk);
        const title = document.createElement('div'); title.className = 'scope-title'; title.textContent = 'Oszilloskop';
        head.appendChild(title);

        const syncLabel = document.createElement('label'); syncLabel.className = 'scope-ctrl';
        const syncChk = document.createElement('input'); syncChk.type = 'checkbox'; syncChk.checked = this.sync;
        syncChk.addEventListener('change', () => { this.sync = syncChk.checked; this._set('scopeSync', this.sync); });
        this._syncChk = syncChk;
        const syncTxt = document.createElement('span'); syncTxt.textContent = 'Sync';
        syncLabel.appendChild(syncChk); syncLabel.appendChild(syncTxt);
        head.appendChild(syncLabel);

        const rngLabel = document.createElement('label'); rngLabel.className = 'scope-ctrl';
        this._rangeReadout = document.createElement('span'); this._rangeReadout.className = 'scope-range-readout';
        const rng = document.createElement('input'); rng.type = 'range'; rng.min = '0'; rng.max = '1'; rng.step = '0.001';
        rng.value = String(this.range); rng.className = 'scope-range';
        rng.addEventListener('input', () => { this.range = parseFloat(rng.value); this._set('scopeRange', this.range); });
        this._rng = rng;
        rngLabel.appendChild(this._rangeReadout); rngLabel.appendChild(rng);
        head.appendChild(rngLabel);

        scopeBox.appendChild(head);
        scopeBox.appendChild(this._scopeCv);
        this.element.appendChild(scopeBox);

        // ── Spektrum-Box ──
        const specBox = document.createElement('div');
        specBox.className = 'scope-box';
        const sHead = document.createElement('div'); sHead.className = 'scope-head';
        const sOnChk = document.createElement('input'); sOnChk.type = 'checkbox'; sOnChk.checked = this.specOn; sOnChk.title = 'Anzeige an/aus';
        sOnChk.addEventListener('change', () => { this.specOn = sOnChk.checked; this._specCv.style.display = this.specOn ? '' : 'none'; this._set('specOn', this.specOn); });
        this._sOnChk = sOnChk;
        sHead.appendChild(sOnChk);
        const sTitle = document.createElement('div'); sTitle.className = 'scope-title'; sTitle.textContent = 'Spektrum · log f';
        sHead.appendChild(sTitle);

        // Eingangs-Auswahl (Master / Mikrofon …)
        this._inSel = document.createElement('select'); this._inSel.className = 'scope-select';
        this._fillInputs([]);   // initial: Master + „Mikrofon aktivieren…"
        this._inSel.addEventListener('change', () => this._onInputChange());
        const inLabel = document.createElement('label'); inLabel.className = 'scope-ctrl';
        const inTxt = document.createElement('span'); inTxt.textContent = 'In'; inLabel.appendChild(inTxt); inLabel.appendChild(this._inSel);
        sHead.appendChild(inLabel);

        // Anzeige-Pegel
        const gLabel = document.createElement('label'); gLabel.className = 'scope-ctrl';
        this._gainReadout = document.createElement('span'); this._gainReadout.className = 'scope-range-readout'; this._gainReadout.textContent = '×1.0';
        const gain = document.createElement('input'); gain.type = 'range'; gain.min = '0.1'; gain.max = '8'; gain.step = '0.1';
        gain.value = String(this.specGain); gain.className = 'scope-range';
        this._gainReadout.textContent = `×${this.specGain.toFixed(1)}`;
        gain.addEventListener('input', () => { this.specGain = parseFloat(gain.value); this._gainReadout.textContent = `×${this.specGain.toFixed(1)}`; this._set('specGain', this.specGain); });
        this._gain = gain;
        gLabel.appendChild(this._gainReadout); gLabel.appendChild(gain);
        sHead.appendChild(gLabel);

        specBox.appendChild(sHead);
        specBox.appendChild(this._specCv);
        this.element.appendChild(specBox);

        this._applyState(this.state ? this.state.toJSON() : null);   // initiale Anzeige (Canvas-Sichtbarkeit)
    }

    /** UI + Felder aus dem State übernehmen (Recall). Schreibt NICHT in den State. */
    _applyState(data) {
        const d = data || {};
        if ('scopeOn' in d) this.scopeOn = !!d.scopeOn;
        if ('specOn' in d) this.specOn = !!d.specOn;
        if ('scopeSync' in d) this.sync = !!d.scopeSync;
        if ('scopeRange' in d) this.range = d.scopeRange;
        if ('specGain' in d) this.specGain = d.specGain;
        if (this._onChk) this._onChk.checked = this.scopeOn;
        if (this._sOnChk) this._sOnChk.checked = this.specOn;
        if (this._syncChk) this._syncChk.checked = this.sync;
        if (this._rng) this._rng.value = String(this.range);
        if (this._gain) this._gain.value = String(this.specGain);
        if (this._gainReadout) this._gainReadout.textContent = `×${this.specGain.toFixed(1)}`;
        if (this._scopeCv) this._scopeCv.style.display = this.scopeOn ? '' : 'none';
        if (this._specCv) this._specCv.style.display = this.specOn ? '' : 'none';
    }

    /* ── Spektrum-Eingang ── */

    _fillInputs(devices) {
        const sel = this._inSel;
        const prev = sel.value;
        sel.innerHTML = '';
        const mk = (val, label) => { const o = document.createElement('option'); o.value = val; o.textContent = label; sel.appendChild(o); };
        mk('master', 'Master (Synth)');
        if (devices.length) {
            devices.forEach((d, i) => mk('dev:' + d.deviceId, d.label || `Eingang ${i + 1}`));
        } else {
            mk('mic', 'Mikrofon aktivieren…');
        }
        if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
    }

    async _onInputChange() {
        const v = this._inSel.value;
        if (v === 'master') { this._stopMic(); this._specAnalyser = null; return; }
        if (v === 'mic') { await this._useMic(null); return; }       // erst Erlaubnis holen
        if (v.startsWith('dev:')) { await this._useMic(v.slice(4)); }
    }

    async _useMic(deviceId) {
        try {
            const constraints = { audio: deviceId ? { deviceId: { exact: deviceId } } : true };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this._stopMic();
            this._micStream = stream;
            this._micSrc = this.ctx.createMediaStreamSource(stream);
            const an = this.ctx.createAnalyser(); an.fftSize = 8192; an.smoothingTimeConstant = 0.5;
            this._micSrc.connect(an);
            this._specAnalyser = an;
            // Geräteliste mit Labels nachladen (jetzt mit Erlaubnis sichtbar)
            const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
            this._fillInputs(devs);
        } catch (e) {
            console.warn('Mikro-Eingang nicht verfügbar:', e);
            this._specAnalyser = null;
            this._inSel.value = 'master';
        }
    }

    _stopMic() {
        if (this._micStream) this._micStream.getTracks().forEach((t) => t.stop());
        try { this._micSrc?.disconnect(); } catch { /* noop */ }
        this._micStream = null; this._micSrc = null;
    }

    /* ── Zeichnen ── */

    _fit(cv) {
        const dpr = window.devicePixelRatio || 1;
        const w = cv.clientWidth || 360, h = cv.clientHeight || 140;
        if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { g, w, h };
    }

    tick() { if (this.scopeOn) this._drawScope(); if (this.specOn) this._drawSpectrum(); }

    _windowSamples(total) {
        const minN = 16, maxN = total;
        const n = Math.round(minN * Math.pow(maxN / minN, this.range));
        return Math.max(minN, Math.min(maxN, n));
    }

    _findTrigger(data, searchLen) {
        for (let i = 1; i < searchLen; i++) if (data[i - 1] <= 0 && data[i] > 0) return i;
        return 0;
    }

    _drawScope() {
        const { g, w, h } = this._fit(this._scopeCv);
        g.clearRect(0, 0, w, h);
        g.strokeStyle = '#2a2f3a'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();

        const data = this.master.getWaveform();
        const total = data.length;
        const winN = this._windowSamples(total);

        if (this._rangeReadout) {
            const ms = (winN / this.sampleRate) * 1000;
            this._rangeReadout.textContent = ms >= 10 ? `${ms.toFixed(0)} ms` : `${ms.toFixed(2)} ms`;
        }

        let start = 0;
        if (this.sync) start = this._findTrigger(data, Math.max(1, total - winN));

        g.strokeStyle = '#5ad1ff'; g.lineWidth = 1.5;
        g.beginPath();
        for (let i = 0; i < winN; i++) {
            const x = (i / (winN - 1)) * w;
            const y = h / 2 - (data[start + i] ?? 0) * (h / 2) * 0.95;
            i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
    }

    _drawSpectrum() {
        const { g, w, h } = this._fit(this._specCv);
        g.clearRect(0, 0, w, h);

        const an = this._specAnalyser || this.master.analyser;
        const data = new Float32Array(an.frequencyBinCount);
        an.getFloatFrequencyData(data);
        const bins = data.length;
        const nyq = this.sampleRate / 2;
        const binHz = nyq / bins;
        const gainDb = 20 * Math.log10(Math.max(0.01, this.specGain)); // Anzeige-Pegel

        const fLow = 10;
        const logLo = Math.log(fLow), logHi = Math.log(nyq);

        g.fillStyle = this._specAnalyser ? '#6ee7a8' : '#ff9f5a'; // Mikro grün, Master orange
        let prevBin = 1;
        for (let px = 0; px < w; px++) {
            const f = Math.exp(logLo + (px / w) * (logHi - logLo));
            const bin = Math.min(bins - 1, Math.max(1, Math.round(f / binHz)));
            let db = -Infinity;
            const from = Math.min(prevBin, bin), to = Math.max(prevBin, bin);
            for (let b = from; b <= to; b++) if (data[b] > db) db = data[b];
            prevBin = bin + 1;
            const norm = Math.max(0, (db + gainDb + 100) / 100);
            const bh = Math.min(h, norm * h);
            g.fillRect(px, h - bh, 1, bh);
        }
    }

    mount(parent) { parent.appendChild(this.element); }
}
