import * as THREE from '../lib/three.module.min.js';

// Etichette 3D per orientarsi: nomi di strade e luoghi noti. Pool fisso di sprite, texture a cache (LRU).
const POOL = 16, REFRESH = 0.35, CACHE_MAX = 70;
const KIND_COLOR = { station: '#5aa9ff', gate: '#e2a15a', tower: '#e2a15a', hospital: '#ff7b7b', fair: '#c79bff', square: '#ffd25a', park: '#6fcf7a',
  sport: '#6fcf7a', civic: '#e2a15a', shop: '#7fd3d6', attraction: '#ffd25a', market: '#ffd25a', bridge: '#9db0c4', church: '#d9c6a0', museum: '#c79bff', school: '#ffd25a' };
const RANGE = { poi1: 330, poi2: 170, street: 150 };

export class Labels {
  constructor(scene, camera, data) {
    this.camera = camera; this.t = 0; this.cache = new Map();
    const poiNames = new Set(data.pois.map((p) => p.n));
    this.items = [
      ...data.pois.map((p) => ({ kind: p.k, name: p.n, x: p.x, z: p.z, y: p.h + 7, range: p.t === 1 ? RANGE.poi1 : RANGE.poi2, poi: true, major: p.t === 1 })),
      ...data.streets.filter((s) => !poiNames.has(s.n)).map((s) => ({ kind: 'street', name: s.n, x: s.x, z: s.z, y: 8.5, range: s.c ? RANGE.street + 40 : RANGE.street, poi: false, major: !!s.c })),
    ];
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
      sp.visible = false; sp.renderOrder = 10; scene.add(sp); this.pool.push(sp);
    }
  }

  texture(item) {
    const key = item.kind + '|' + item.name; let e = this.cache.get(key);
    if (e) { this.cache.delete(key); this.cache.set(key, e); return e; }
    const poi = item.poi, fs = poi ? 30 : 26, c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = `${poi ? 700 : 600} ${fs}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    const dot = poi ? 22 : 0, w = Math.ceil(g.measureText(item.name).width) + 28 + dot, h = fs + 18;
    c.width = w; c.height = h;
    g.font = `${poi ? 700 : 600} ${fs}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; g.textBaseline = 'middle';
    g.fillStyle = poi ? 'rgba(14,18,24,.82)' : 'rgba(14,18,24,.6)';
    g.beginPath(); g.roundRect ? g.roundRect(0, 0, w, h, h / 2) : g.rect(0, 0, w, h); g.fill();
    if (poi) { g.fillStyle = KIND_COLOR[item.kind] || '#fff'; g.beginPath(); g.arc(h / 2 + 2, h / 2, 7, 0, 7); g.fill(); }
    g.fillStyle = poi ? '#fff' : '#e8edf2'; g.fillText(item.name, 14 + dot, h / 2 + 1);
    const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    e = { tex, w, h }; this.cache.set(key, e);
    if (this.cache.size > CACHE_MAX) { const k0 = this.cache.keys().next().value; this.cache.get(k0).tex.dispose(); this.cache.delete(k0); }
    return e;
  }

  update(dt, car, camH) {
    this.t -= dt; if (this.t > 0) return; this.t = REFRESH;
    const fx = Math.cos(camH), fz = Math.sin(camH), cand = [];
    for (const it of this.items) {
      const dx = it.x - car.x, dz = it.z - car.z, d = Math.hypot(dx, dz);
      if (d > it.range || d < (it.poi ? 60 : 45)) continue;
      if ((dx * fx + dz * fz) / d < -0.2) continue; // dietro la camera
      cand.push({ it, d, score: d / it.range - (it.poi ? 0.35 : 0) - (it.major ? 0.15 : 0) });
    }
    cand.sort((a, b) => a.score - b.score);
    const used = [], pick = [];
    for (const c of cand) { // niente etichette sovrapposte: distanza minima tra quelle scelte
      if (pick.length >= POOL) break;
      if (used.some((u) => Math.hypot(u.x - c.it.x, u.z - c.it.z) < 38)) continue;
      used.push(c.it); pick.push(c);
    }
    this.pool.forEach((sp, i) => {
      const c = pick[i]; if (!c) { sp.visible = false; return; }
      const e = this.texture(c.it), k = c.it.poi ? 0.13 : 0.1; // metri per pixel
      sp.material.map = e.tex; sp.material.needsUpdate = true;
      sp.scale.set(e.w * k, e.h * k, 1); sp.position.set(c.it.x, c.it.y, c.it.z);
      sp.material.opacity = Math.max(0.15, Math.min(1, 1.6 - c.d / c.it.range * 1.5)); sp.visible = true;
    });
  }
}
