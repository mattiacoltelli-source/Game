import * as THREE from '../lib/three.module.min.js';
import { mergeBoxes } from './geom.js';
import { sfx } from './sfx.js';

// LEPORE, il sindaco col fischietto e la paletta del "30": compare al massimo 2 volte per corsa in mezzo alla strada.
// Dentro il cerchio azzurro intorno a lui perdi 50 km/h rispetto alla velocità con cui entri (anche col NOS). Niente multe.
const rnd = (a, b) => a + Math.random() * (b - a);
const R = 14, CUT = 50 / 3.6, ROADS = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential']);
const SKIN = [0.92, 0.74, 0.6], DARK = [0.14, 0.15, 0.2], VEST = [0.85, 1.0, 0.15], WHITE = [0.95, 0.95, 0.95];

function figure() {
  return mergeBoxes([
    { x: 0, y: 0.45, z: 0.14, sx: 0.2, sy: 0.9, sz: 0.2, c: DARK }, { x: 0, y: 0.45, z: -0.14, sx: 0.2, sy: 0.9, sz: 0.2, c: DARK }, // gambe
    { x: 0, y: 1.25, z: 0, sx: 0.32, sy: 0.7, sz: 0.5, c: DARK }, { x: 0.02, y: 1.28, z: 0, sx: 0.34, sy: 0.55, sz: 0.52, c: VEST }, // busto con gilet
    { x: 0.03, y: 1.32, z: 0, sx: 0.36, sy: 0.12, sz: 0.56, c: [0.1, 0.65, 0.25], r: 0 }, { x: 0.03, y: 1.2, z: 0, sx: 0.36, sy: 0.12, sz: 0.56, c: WHITE }, { x: 0.03, y: 1.08, z: 0, sx: 0.36, sy: 0.12, sz: 0.56, c: [0.85, 0.15, 0.15] }, // fascia tricolore
    { x: 0, y: 1.85, z: 0, sx: 0.3, sy: 0.32, sz: 0.3, c: SKIN }, { x: -0.02, y: 2.05, z: 0, sx: 0.34, sy: 0.12, sz: 0.34, c: [0.2, 0.2, 0.22] }, // testa, capelli
    { x: 0.16, y: 1.88, z: 0.08, sx: 0.04, sy: 0.04, sz: 0.04, c: [0.05, 0.05, 0.08] }, { x: 0.16, y: 1.88, z: -0.08, sx: 0.04, sy: 0.04, sz: 0.04, c: [0.05, 0.05, 0.08] },
    { x: 0, y: 1.3, z: -0.34, sx: 0.14, sy: 0.6, sz: 0.14, c: DARK }, // braccio sinistro lungo il fianco
  ]);
}
function paddle() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#e53935'; g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 24, 0, 7); g.fill(); g.fillStyle = '#111'; g.font = '800 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('30', 32, 34);
  const tex = new THREE.CanvasTexture(c), grp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), new THREE.MeshLambertMaterial({ color: 0xdddddd })); pole.position.y = 0.45; grp.add(pole);
  for (const s of [1, -1]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ map: tex })); d.position.set(0.05 * s, 1.1, 0); d.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2; grp.add(d); }
  return grp;
}
function zone() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = 'rgba(60,170,255,0.18)'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.strokeStyle = 'rgba(120,205,255,0.95)'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 46, 0, 7); g.stroke(); g.fillStyle = 'rgba(255,255,255,0.95)'; g.font = '800 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('30', 64, 66);
  return new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
}

export class Lepore {
  constructor(scene, world, roadIndex, fx, ctx, nameTag, fixed = null) {
    this.fixed = fixed; this.world = world; this.ri = roadIndex; this.fx = fx; this.ctx = ctx;
    this.group = new THREE.Group(); this.body = new THREE.Mesh(figure(), new THREE.MeshLambertMaterial({ vertexColors: true })); this.paddle = paddle(); this.paddle.position.set(0.05, 1.45, 0.42); this.arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), new THREE.MeshLambertMaterial({ color: 0x1a1b22 })); this.arm.position.set(0.05, 1.7, 0.4);
    this.group.add(this.body, this.paddle, this.arm); this.group.scale.setScalar(2.4); this.group.visible = false; scene.add(this.group); // alto circa 5 m
    this.zone = zone(); this.zone.visible = false; scene.add(this.zone);
    this.tag = nameTag('LEPORE', '#1e88e5'); this.tag.scale.set(10, 2.5, 1); this.tag.visible = false; scene.add(this.tag);
    this.reset();
  }

  reset() { this.cool = 0; if (this.fixed) { this.px = this.fixed.x; this.pz = this.fixed.z; this.group.position.set(this.px, 0.17, this.pz); this.zone.position.set(this.px, 0.19, this.pz); this.tag.position.set(this.px, 7.6, this.pz); } this.state = 'off'; this.n = 0; this.next = rnd(38, 65); this.group.visible = this.zone.visible = this.tag.visible = false; this.inside = false; this.cap = 0; this.whistleT = 0; this.t = 0; }
  get x() { return this.px; }
  get z() { return this.pz; }

  spawn(player) {
    let pick = null, n = 0; const hx = Math.cos(player.h), hz = Math.sin(player.h);
    this.ri.segmentsNear(player.x, player.z, 140, (r, i) => {
      if (!ROADS.has(r.c) || r.w < 6 || /Matteotti/.test(r.n || '')) return; const p = r.p, mx = (p[i * 2] + p[i * 2 + 2]) / 2, mz = (p[i * 2 + 1] + p[i * 2 + 3]) / 2, dx = mx - player.x, dz = mz - player.z, d = Math.hypot(dx, dz);
      if (d < 70 || d > 125 || (dx * hx + dz * hz) / d < 0.7 || this.world.groundY(mx, mz) > 0.2) return; if (++n * Math.random() < 1) pick = [mx, mz];
    });
    if (!pick) return false;
    this.px = pick[0]; this.pz = pick[1]; this.group.position.set(this.px, 0.17, this.pz); this.zone.position.set(this.px, 0.19, this.pz); this.tag.position.set(this.px, 7.6, this.pz);
    this.group.visible = this.zone.visible = this.tag.visible = true; this.state = 'on'; this.t = 0; this.inside = false; this.n++; this.whistleT = 0.4; this.group.rotation.set(0, 0, 0); this.group.position.y = 0.17;
    this.ctx.toast('Lepore ti ferma con la paletta: zona 30!'); return true;
  }

  end(runT) { this.state = 'off'; this.group.visible = this.zone.visible = this.tag.visible = false; this.inside = false; this.next = runT + rnd(50, 80); this.cool = 45; }

  // Lepore fisso (ponte, spazi aperti): compare quando ti avvicini (entro 230 m), torna dopo 45 s se lo sperone.
  showFixed() { this.group.visible = this.zone.visible = this.tag.visible = true; this.state = 'on'; this.t = 0; this.inside = false; this.whistleT = 0.4; this.group.rotation.set(0, 0, 0); this.group.position.y = 0.17; this.group.position.x = this.px; this.group.position.z = this.pz; }

  update(dt, player, runT) {
    if (this.state === 'off') {
      if (this.fixed) { this.cool -= dt; if (this.cool <= 0 && Math.hypot(player.x - this.px, player.z - this.pz) < 230) this.showFixed(); return; }
      if (this.n < 2 && runT > this.next && !this.hold) this.spawn(player); return;
    }
    this.t += dt; const dx = player.x - this.px, dz = player.z - this.pz, d = Math.hypot(dx, dz);
    if (this.state === 'fly') { // sperone: vola via
      const f = this.fly; f.t += dt; f.vy -= 16 * dt; this.px += f.vx * dt; this.pz += f.vz * dt; f.y = Math.max(0, f.y + f.vy * dt); this.group.position.set(this.px, 0.17 + f.y, this.pz); this.group.rotation.z += dt * 9; this.tag.position.set(this.px, 7.6 + f.y, this.pz);
      if (f.t > 1.6) this.end(runT); return;
    }
    if (this.fixed ? d > 320 : (d > 280 || this.t > 36)) { if (this.fixed) { this.state = 'off'; this.group.visible = this.zone.visible = this.tag.visible = false; this.inside = false; this.cool = 0; } else this.end(runT); return; }
    this.group.rotation.y = -Math.atan2(dz, dx); this.paddle.rotation.z = Math.sin(this.t * 8) * 0.12; this.arm.rotation.z = Math.sin(this.t * 8) * 0.1;
    // fischietto: ogni 3,5 s quando sei entro 90 m
    this.whistleT -= dt; if (this.whistleT <= 0 && d < 90) { this.whistleT = 3.5; sfx.whistle && sfx.whistle(); this.fx.shake = Math.max(this.fx.shake, 0.25); }
    // cerchio: entrando perdi 50 km/h rispetto alla velocità con cui entri; dentro non puoi superare quel limite (NOS compreso)
    const inz = d < R && !player.air && player.clear < 4;
    if (inz) {
      const sp = Math.hypot(player.vx, player.vz);
      if (!this.inside) { this.inside = true; this.cap = Math.max(2.8, sp - CUT); this.ctx.toast('Zona 30! Perdi 50 km/h'); }
      if (sp > this.cap) { const k = this.cap / sp; player.vx *= k; player.vz *= k; }
    } else this.inside = false;
    // sperone forte: Lepore vola via
    if (d < 2.6 && !player.air && Math.hypot(player.vx, player.vz) > 16) { this.state = 'fly'; this.fly = { t: 0, vx: player.vx * 0.6 + rnd(-2, 2), vz: player.vz * 0.6 + rnd(-2, 2), vy: 9, y: 0 }; this.zone.visible = false; this.inside = false; this.ctx.toast('Lepore è volato via!'); sfx.thud && sfx.thud(0.5); }
  }
}

// Posizioni dei Lepore fissi: all'imbocco del Ponte Matteotti (lato percorso) e in 3 spazi aperti verso la fine del percorso.
export function leporeSpots(world, roads, col, stops) {
  const cor = world.corridor, spots = [], far = (x, z, r) => !spots.some((s) => Math.hypot(s.x - x, s.z - z) < r) && !stops.some((s) => Math.hypot(s.x - x, s.z - z) < 60);
  for (const h of world.humps) { // imbocco del ponte: verso di percorrenza = quello del corridoio nel punto più vicino
    const cx = h.ax + h.ux * h.L / 2, cz = h.az + h.uz * h.L / 2; let best = 1e9, bi = 0;
    for (let i = 0; i < cor.length - 1; i++) { const dx = cor[i + 1][0] - cor[i][0], dz = cor[i + 1][1] - cor[i][1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((cx - cor[i][0]) * dx + (cz - cor[i][1]) * dz) / L2)), d = Math.hypot(cx - cor[i][0] - dx * t, cz - cor[i][1] - dz * t); if (d < best) { best = d; bi = i; } }
    if (best > 90) continue; const dir = (cor[bi + 1][0] - cor[bi][0]) * h.ux + (cor[bi + 1][1] - cor[bi][1]) * h.uz >= 0 ? 1 : -1, ex = dir > 0 ? h.ax : h.ax + h.ux * h.L, ez = dir > 0 ? h.az : h.az + h.uz * h.L;
    const q = roads.nearest(ex - h.ux * dir * 16, ez - h.uz * dir * 16); if (q && far(q.x, q.z, 100)) { spots.push({ x: q.x, z: q.z }); break; }
  }
  // spazi aperti verso la fine: tra i punti del percorso degli ultimi 700 m, quelli con più spazio libero intorno
  const segs = []; let total = 0; for (let i = 0; i < cor.length - 1; i++) { const L = Math.hypot(cor[i + 1][0] - cor[i][0], cor[i + 1][1] - cor[i][1]); segs.push(L); total += L; }
  const at = (d) => { for (let i = 0; i < segs.length; i++) { if (d <= segs[i]) { const f = d / segs[i]; return [cor[i][0] + (cor[i + 1][0] - cor[i][0]) * f, cor[i][1] + (cor[i + 1][1] - cor[i][1]) * f]; } d -= segs[i]; } return null; };
  const open = (x, z) => { let s = 0; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, d = col.ray(x, z, Math.cos(a), Math.sin(a), 45, 6); s += Math.min(d, 45); } return s / 8; };
  for (const back of [160, 380, 620]) {
    let best = null; for (let d = total - back - 80; d <= total - back + 80; d += 10) { const p = at(d); if (!p) continue; const q = roads.nearest(p[0], p[1]); if (!q || q.d > 12 || !far(q.x, q.z, 130)) continue; const o = open(q.x, q.z); if (!best || o > best.o) best = { o, x: q.x, z: q.z }; }
    if (best) spots.push({ x: best.x, z: best.z });
  }
  return spots;
}
