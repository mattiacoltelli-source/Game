// Input: pulsanti touch (pointer events, multi-touch) + tastiera per i test su desktop.
export class Input {
  constructor() {
    this.btn = { left: false, right: false, gas: false, brake: false };
    this.keys = new Set();
    this.auto = false; // acceleratore automatico
    for (const el of document.querySelectorAll('[data-btn]')) {
      const name = el.dataset.btn, pts = new Set();
      const set = () => { this.btn[name] = pts.size > 0; el.classList.toggle('on', pts.size > 0); };
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); pts.add(e.pointerId); set(); if (navigator.vibrate && name !== 'x') { /* nessuna vibrazione: risparmio batteria */ } });
      const up = (e) => { pts.delete(e.pointerId); set(); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    addEventListener('keydown', (e) => { this.keys.add(e.code); });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); });
    this.override = null; // per i test automatici: {steer,throttle,brake}
  }

  get value() {
    if (this.override) return this.override;
    const k = this.keys, b = this.btn;
    const left = b.left || k.has('ArrowLeft') || k.has('KeyA'), right = b.right || k.has('ArrowRight') || k.has('KeyD');
    const brake = b.brake || k.has('ArrowDown') || k.has('KeyS');
    const gas = b.gas || k.has('ArrowUp') || k.has('KeyW') || (this.auto && !brake);
    return { steer: (right ? 1 : 0) - (left ? 1 : 0), throttle: gas ? 1 : 0, brake: brake ? 1 : 0 };
  }
}
