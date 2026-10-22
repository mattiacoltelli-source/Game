import * as THREE from '../lib/three.module.min.js';
import { mergeBoxes } from './geom.js';
import { sfx } from './sfx.js';

// TARTA, l'ingegnere informatico malvagio: salta da un tetto all'altro (si teletrasporta) e dal tetto spara un laser
// che incendia la strada davanti a te. Il fuoco rallenta appena: serve soprattutto a distrarti.
const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MAX_FIRE = 20, FIRE_LIFE = 7, FIRE_R = 3.4;
const SKIN = [0.92, 0.74, 0.6], HOOD = [0.18, 0.12, 0.28], DARK = [0.1, 0.1, 0.12], METAL = [0.5, 0.52, 0.58], GLOW = [1.4, 0.2, 0.55];

function model() {
  const parts = [
    { x: 0, y: 1.1, z: 0, sx: 1.1, sy: 1.6, sz: 0.8, c: HOOD }, { x: 0, y: 2.25, z: 0, sx: 0.8, sy: 0.8, sz: 0.8, c: SKIN }, { x: 0, y: 2.7, z: 0, sx: 0.9, sy: 0.4, sz: 0.9, c: HOOD }, // corpo, testa, cappuccio
    { x: 0.42, y: 2.3, z: 0.2, sx: 0.08, sy: 0.22, sz: 0.28, c: [0.05, 0.05, 0.08] }, { x: 0.42, y: 2.3, z: -0.2, sx: 0.08, sy: 0.22, sz: 0.28, c: [0.05, 0.05, 0.08] }, // occhiali
    { x: 0.42, y: 2.05, z: 0, sx: 0.08, sy: 0.08, sz: 0.5, c: [0.5, 0.1, 0.1] }, // ghigno
    { x: 0.2, y: 1.4, z: 0.75, sx: 0.3, sy: 0.3, sz: 0.9, c: HOOD, r: 0 }, { x: 0.2, y: 1.4, z: -0.75, sx: 0.3, sy: 0.3, sz: 0.9, c: HOOD },
    { x: 1.0, y: 0.5, z: 0, sx: 1.4, sy: 1.0, sz: 1.6, c: METAL }, // base del cannone
    { x: 3.8, y: 1.4, z: 0, sx: 5.4, sy: 0.7, sz: 0.7, c: DARK }, { x: 6.6, y: 1.4, z: 0, sx: 0.5, sy: 1.0, sz: 1.0, c: GLOW }, // canna e lente laser
    { x: 2.2, y: 2.0, z: 0, sx: 1.2, sy: 0.3, sz: 0.9, c: METAL }, // laptop
  ];
  return mergeBoxes(parts);
}

export class Tarta {
  constructor(scene, world, roadIndex, fx, ctx, nameTag) {
    this.world = world; this.ri = roadIndex; this.fx = fx; this.ctx = ctx;
    // tetti candidati: centroide e altezza
    const B = world.buildings, c = []; for (const b of B) { if (b.h < 9 || b.k) continue; const p = b.pts, n = p.length / 2; let x = 0, z = 0; for (let i = 0; i < n; i++) { x += p[i * 2]; z += p[i * 2 + 1]; } c.push(x / n, z / n, b.h); }
    this.roofs = c;
    this.group = new THREE.Group(); this.mesh = new THREE.Mesh(model(), new THREE.MeshLambertMaterial({ vertexColors: true })); this.group.add(this.mesh); this.group.scale.setScalar(2.4); this.group.visible = false; scene.add(this.group);
    this.tag = nameTag('TARTA', '#7b1fa2'); this.tag.visible = false; scene.add(this.tag);
    // laser
    this.beam = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff2a6d, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); this.beam.visible = false; this.beam.renderOrder = 8; scene.add(this.beam);
    // fiamme: due coni sovrapposti per chiazza (istanze)
    const mk = (g, col, op) => { const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }), MAX_FIRE * 3); m.frustumCulled = false; m.count = 0; m.renderOrder = 6; scene.add(m); return m; };
    this.fireA = mk(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), 0xff5a14, 0.5); this.fireB = mk(new THREE.ConeGeometry(0.6, 1, 6).translate(0, 0.5, 0), 0xffc040, 0.6);
    this.fires = []; this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.pos = new THREE.Vector3(); this.sc = new THREE.Vector3();
    this.reset();
  }

  reset() { this.state = 'off'; this.cool = 25; this.hold = false; this.group.visible = this.tag.visible = this.beam.visible = false; this.fires.length = 0; this.fireA.count = this.fireB.count = 0; this.told = false; this.burn = false; }
  get x() { return this.rx; }
  get z() { return this.rz; }

  pickRoof(player) {
    const R = this.roofs, hx = Math.cos(player.h), hz = Math.sin(player.h); let best = null, n = 0;
    for (let i = 0; i < R.length; i += 3) {
      const dx = R[i] - player.x, dz = R[i + 1] - player.z, d = Math.hypot(dx, dz); if (d < 45 || d > 120 || (dx * hx + dz * hz) / d < 0.25) continue;
      if (++n * Math.random() < 1) best = i;
    }
    return best == null ? null : [R[best], R[best + 1], R[best + 2]];
  }

  appear(player) {
    const r = this.pickRoof(player); if (!r) return false;
    if (this.rx !== undefined) this.ctx.sparks && this.ctx.sparks(this.rx, this.ry + 2, this.rz, 14, 0, 0); // fumo di partenza
    [this.rx, this.rz, this.ry] = r; this.group.position.set(r[0], r[2], r[1]); this.group.visible = this.tag.visible = true; this.ctx.sparks && this.ctx.sparks(r[0], r[2] + 2, r[1], 14, 0, 0); sfx.pickup();
    this.state = 'idle'; this.t = 0; this.wait = rnd(1.6, 2.6); this.tag.position.set(r[0], r[2] + 7, r[1]); return true;
  }

  update(dt, player, runT) {
    this.updateFire(dt, player);
    if (this.state === 'off') { this.cool -= dt; if (!this.hold && runT > 30 && this.cool <= 0 && this.appear(player)) { this.life = 0; if (!this.told) { this.told = true; this.ctx.toast('Tarta, l\'ingegnere malvagio, ti spia dai tetti!'); } } return; }
    this.t += dt; this.life += dt;
    const dx = player.x - this.rx, dz = player.z - this.rz, d = Math.hypot(dx, dz), face = Math.atan2(dz, dx);
    if (d > 260 || this.life > 38) { this.group.visible = this.tag.visible = this.beam.visible = false; this.state = 'off'; this.cool = 22; return; }
    if (this.state !== 'idle' || this.t > 0.3) this.group.rotation.y = -face; // il cannone guarda verso di te
    if (this.ctx.car.jam > 0 && (this.state === 'aim')) { this.state = 'idle'; this.t = 0; this.wait = 2.5; this.beam.visible = false; this.ctx.toast('Tarta è disturbato!'); } // il disturbatore annulla la mira
    if (this.state === 'idle') { if (this.t >= this.wait && d < 150 && !(this.ctx.car.jam > 0)) { // punta il laser davanti all'auto
        const T = 1.7, sp = Math.hypot(player.vx, player.vz), tx = player.x + player.vx * T * 0.9, tz = player.z + player.vz * T * 0.9; const sn = this.ri.nearest(tx, tz); this.tx = sn ? sn.x : tx; this.tz = sn ? sn.z : tz; this.dirx = sp > 4 ? player.vx / sp : Math.cos(player.h); this.dirz = sp > 4 ? player.vz / sp : Math.sin(player.h);
        this.state = 'aim'; this.t = 0; this.mark = this.fx.mark(this.tx, this.tz, 1.2, 0.5); this.ctx.toast('Laser in carica! Attento al fuoco'); } }
    else if (this.state === 'aim') { this.setBeam(0.12 + 0.1 * Math.sin(this.t * 30), 0.12); if (this.t >= 1.2) { this.state = 'fire'; this.t = 0; sfx.shot(); } }
    else if (this.state === 'fire') { this.setBeam(0.9, 0.5 * (1 - this.t / 0.5) + 0.12); if (this.t < 0.06) this.ignite(); if (this.t >= 0.5) { this.beam.visible = false; this.state = 'rest'; this.t = 0; } }
    else if (this.state === 'rest') { if (this.t >= 1.2) { if (!this.appear(player)) { this.state = 'idle'; this.t = 0; this.wait = 2; } } }
  }

  setBeam(op, w) {
    const ox = this.rx + Math.cos(-this.group.rotation.y) * 11.5, oz = this.rz + Math.sin(-this.group.rotation.y) * 11.5, oy = this.ry + 2.6, ex = this.tx, ez = this.tz, ey = 0.3, dx = ex - ox, dy = ey - oy, dz = ez - oz, L = Math.hypot(dx, dy, dz);
    this.beam.position.set((ox + ex) / 2, (oy + ey) / 2, (oz + ez) / 2); this.beam.scale.set(L, w, w); this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(dx / L, dy / L, dz / L)); this.beam.material.opacity = op; this.beam.visible = true;
  }

  // Il laser colpisce la strada: una fila di fiamme davanti all'auto, nella sua direzione di marcia.
  ignite() {
    if (this.burn) return; this.burn = true;
    for (let k = 0; k < 6; k++) { if (this.fires.length >= MAX_FIRE) this.fires.shift(); this.fires.push({ x: this.tx + this.dirx * (k - 1.5) * 4.6 + rnd(-0.8, 0.8), z: this.tz + this.dirz * (k - 1.5) * 4.6 + rnd(-0.8, 0.8), t: 0, life: FIRE_LIFE + rnd(-1, 1), r: FIRE_R * rnd(0.85, 1.15), ph: Math.random() * 6 }); }
    this.ctx.sparks && this.ctx.sparks(this.tx, 0.6, this.tz, 10, 0, 0); this.fx.shake = Math.max(this.fx.shake, 0.5); sfx.boom(0.4); this.fx.thump && 0;
    setTimeout(() => { this.burn = false; }, 0);
  }

  // Estintore: spegne le fiamme entro il raggio R. Ritorna quante.
  extinguish(x, z, R) { let n = 0; for (const p of this.fires) if (p.out === undefined && Math.hypot(p.x - x, p.z - z) <= R) { p.out = 0.6; n++; } return n; }

  updateFire(dt, player) {
    let inside = false; const f = this.fires;
    for (let i = f.length - 1; i >= 0; i--) { const p = f[i]; p.t += dt; if (p.out !== undefined) { p.out -= dt; if ((p.st = (p.st || 0) - dt) <= 0) { p.st = 0.12; this.ctx.smoke && this.ctx.smoke(p.x, p.z, 2); } if (p.out <= 0) { f.splice(i, 1); continue; } } if (p.t >= p.life) { f.splice(i, 1); continue; } if (p.out === undefined && !player.air && player.y < 1.2 && Math.hypot(player.x - p.x, player.z - p.z) < p.r + 0.7) inside = true; }
    if (player.shield > 0) inside = false; // lo scudo ripara dal fuoco
    if (inside) { const k = Math.exp(-0.35 * dt); player.vx *= k; player.vz *= k; this.fx.shake = Math.max(this.fx.shake, 0.18); if (!this.hot) { this.hot = true; this.ctx.toast('Fuoco! Rallenta un po\''); } } else this.hot = false;
    const m = this.m, q = this.q, tm = performance.now() / 1000; let n = 0;
    for (const p of f) {
      const g = Math.min(1, p.t * 2.5) * Math.min(1, (p.life - p.t) * 1.5) * (p.out === undefined ? 1 : Math.max(0, p.out / 0.6)), fl = 0.85 + 0.25 * Math.sin(tm * 14 + p.ph) + 0.1 * Math.sin(tm * 23 + p.ph * 2);
      for (let k = 0; k < 3; k++) { const a = p.ph + k * 2.1, ox = Math.cos(a) * p.r * 0.45 * (k ? 1 : 0), oz = Math.sin(a) * p.r * 0.45 * (k ? 1 : 0), s = p.r * (k ? 0.28 : 0.42) * g, h = p.r * (k ? 0.75 : 1.05) * g * fl;
        this.pos.set(p.x + ox, 0.2, p.z + oz); this.sc.set(s, Math.max(0.01, h), s); m.compose(this.pos, q, this.sc); this.fireA.setMatrixAt(n, m); this.sc.set(s * 0.6, Math.max(0.01, h * 0.62), s * 0.6); m.compose(this.pos, q, this.sc); this.fireB.setMatrixAt(n, m); n++; }
    }
    this.fireA.count = this.fireB.count = n; this.fireA.instanceMatrix.needsUpdate = this.fireB.instanceMatrix.needsUpdate = true;
  }
}
