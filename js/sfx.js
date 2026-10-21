// Effetti sonori sintetizzati (WebAudio, nessun file): esplosione, cannone, pickup, NOS. Si attivano al primo tocco (Parti).
let ctx = null, noise = null, muted = false;
try { muted = localStorage.getItem('taxi-bologna:mute') === '1'; } catch (e) { /* ignora */ }

export const sfx = {
  get muted() { return muted; },
  setMuted(m) { muted = m; try { localStorage.setItem('taxi-bologna:mute', m ? '1' : '0'); } catch (e) { /* ignora */ } },
  init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  },
  _n(dur, type, f0, f1, gain, q = 1) {
    if (!ctx || muted) return; const t = ctx.currentTime, src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; flt.type = type; flt.Q.value = q; flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); src.connect(flt).connect(g).connect(ctx.destination); src.start(t); src.stop(t + dur);
  },
  _t(dur, f0, f1, gain, wave = 'sine') {
    if (!ctx || muted) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = wave; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
  },
  boom(v = 1) { this._n(0.9, 'lowpass', 900, 70, 0.9 * v); this._t(0.5, 110, 28, 0.9 * v); },
  shot() { this._n(0.25, 'bandpass', 1800, 300, 0.4, 0.8); this._t(0.18, 150, 50, 0.5); },
  gun(v = 1) { this._n(0.07, 'bandpass', 2600, 1100, 0.2 * v, 1.2); },
  pickup() { this._t(0.12, 660, 880, 0.25, 'triangle'); setTimeout(() => this._t(0.16, 990, 1320, 0.25, 'triangle'), 90); },
  nos(level = 1) { this._n(0.8, 'bandpass', 400, 4000 + level * 1500, 0.5, 2); this._t(0.6, 120, 420 + 100 * level, 0.2, 'sawtooth'); },
  thud(v = 1) { this._t(0.22, 70, 28, 0.55 * v); this._n(0.2, 'lowpass', 220, 60, 0.35 * v); },
  ko() { this.boom(1); setTimeout(() => this.pickup(), 250); },
};
