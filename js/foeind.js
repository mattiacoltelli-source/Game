import * as THREE from '../lib/three.module.min.js';

// Indicatori dei nemici fuori vista: piccole frecce ai bordi dello schermo (con lettera e distanza), lontane da HUD e pulsanti.
const KINDS = { train: ['#ff5a4a', 'L', 'Lucchio'], truck: ['#ffa43a', 'S', 'Simo Pakelo'], tarta: ['#c07bff', 'T', 'Tarta'], heli: ['#4aa3ff', 'M', 'Macco'], event: ['#ffd23a', '!', 'Evento'], giant: ['#e36bff', 'C', 'Cos'] };

export class FoeIndicators {
  constructor(root) { this.root = root; this.els = []; this.v = new THREE.Vector3(); }

  el(i) {
    if (this.els[i]) return this.els[i];
    const d = document.createElement('div'); d.className = 'foe'; d.innerHTML = '<i></i><b></b><small></small>'; this.root.appendChild(d);
    return (this.els[i] = { d, arrow: d.firstChild, b: d.children[1], s: d.children[2], k: '' });
  }

  update(camera, pts, car) {
    const W = innerWidth, H = innerHeight; let n = 0;
    for (const p of pts) {
      const dist = Math.hypot(p.x - car.x, p.z - car.z); if (dist > p.r) continue;
      this.v.set(p.x, p.y || 2, p.z).project(camera); let sx = this.v.x, sy = this.v.y; const behind = this.v.z > 1;
      if (!behind && Math.abs(sx) < 0.86 && Math.abs(sy) < 0.8) continue; // in vista: nessun indicatore
      if (behind) { sx = -sx; sy = -sy; if (Math.abs(sx) < 0.001 && Math.abs(sy) < 0.001) sy = -1; }
      let dx = sx * W / 2, dy = -sy * H / 2; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; // direzione dal centro dello schermo
      // punto sul bordo (ellisse ridotta) e poi fuori da minimappa, barra obiettivo e pulsanti
      const ax = W / 2 - 26, ay = H / 2 - 24, t = 1 / Math.hypot(dx / ax, dy / ay); let x = W / 2 + dx * t, y = H / 2 + dy * t;
      y = Math.min(y, H - 72); y = Math.max(y, x < 170 ? 160 : x > W - 150 ? 80 : 30); // sotto minimappa (sinistra) e sotto la velocità (destra)
      if (y > H - 140 && (x < 260 || x > W - 330)) y = H - 140; // sopra i pulsanti
      const e = this.el(n++), kd = KINDS[p.k] || ['#fff', '?', ''];
      if (e.k !== p.k) { e.k = p.k; e.d.style.setProperty('--fc', kd[0]); e.b.textContent = kd[1]; }
      e.d.classList.toggle('near', dist < 70); e.s.textContent = Math.round(dist) + ' m';
      e.d.style.display = ''; e.d.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; e.arrow.style.transform = `rotate(${(Math.atan2(dy, dx) + Math.PI / 2).toFixed(3)}rad)`;
    }
    for (let i = n; i < this.els.length; i++) this.els[i].d.style.display = 'none';
  }
}
