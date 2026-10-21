import * as THREE from '../lib/three.module.min.js';
import { mergeBoxes } from './geom.js';
import { TRENO_TRACK } from './config.js';
import { sfx } from './sfx.js';

// LUCCHIO, il treno blindato: corre avanti e indietro su binari lungo Via Donato Creti e Via Stalingrado.
// Dalle carrozze mitragliano: raffiche di proiettili tracciati (piccole botte, non esplosioni come Macco).
// Sperona una carrozza sopra ~80 km/h per cacciarne i mitraglieri; ripulite tutte, Lucchio è fuori uso e ti regala un NOS.
const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LEN = [12, 14, 14, 14], GAP = 1.2, HALF_W = 1.6, SPEED = 15, BULLETS = 56;
const LOCO = [0.62, 0.1, 0.1], BODY = [0.2, 0.26, 0.34], STRIPE = [0.85, 0.7, 0.15], ROOF = [0.55, 0.57, 0.6], GLASS = [0.2, 0.32, 0.45], DARK = [0.08, 0.08, 0.1];
const SHIRT = [[0.7, 0.15, 0.12], [0.2, 0.35, 0.2], [0.25, 0.25, 0.3], [0.6, 0.5, 0.2]], SKIN = [0.9, 0.72, 0.58];

function carMesh(len, loco) {
  const c = loco ? LOCO : BODY, parts = [
    { x: 0, y: 2.1, z: 0, sx: len, sy: 2.6, sz: 3.0, c }, { x: 0, y: 3.55, z: 0, sx: len - 0.4, sy: 0.22, sz: 2.7, c: ROOF }, { x: 0, y: 1.2, z: 0, sx: len + 0.02, sy: 0.35, sz: 3.04, c: STRIPE },
    { x: len / 2 - 2.4, y: 0.55, z: 0, sx: 2.6, sy: 0.55, sz: 2.3, c: DARK }, { x: -len / 2 + 2.4, y: 0.55, z: 0, sx: 2.6, sy: 0.55, sz: 2.3, c: DARK },
  ];
  if (loco) parts.push({ x: len / 2 + 0.5, y: 1.9, z: 0, sx: 1.2, sy: 1.9, sz: 2.8, c: LOCO }, { x: len / 2 + 1.12, y: 2.4, z: 0.9, sx: 0.1, sy: 0.4, sz: 0.5, c: [1.6, 1.5, 0.9] }, { x: len / 2 + 1.12, y: 2.4, z: -0.9, sx: 0.1, sy: 0.4, sz: 0.5, c: [1.6, 1.5, 0.9] }, { x: len / 2 - 1.2, y: 2.6, z: 0, sx: 2.4, sy: 1.1, sz: 3.06, c: GLASS }, { x: -1.5, y: 4.0, z: 0, sx: 1.2, sy: 0.7, sz: 1.2, c: DARK }, { x: -len / 2 + 0.1, y: 2.4, z: 0, sx: 0.2, sy: 1.0, sz: 2.4, c: STRIPE });
  else for (let k = 0; k < 6; k++) { const x = -len / 2 + 1.5 + k * ((len - 3) / 5); parts.push({ x, y: 2.6, z: 0, sx: 1.5, sy: 0.9, sz: 3.07, c: GLASS }); }
  return mergeBoxes(parts);
}
function gunnerMesh(len, seed) {
  const parts = [];
  for (const side of [1, -1]) for (const gx of [-len * 0.22, len * 0.22]) {
    const sh = SHIRT[(Math.abs(Math.round(gx * 7)) + (side > 0 ? 1 : 2) + seed) % SHIRT.length], z = side * 1.95;
    parts.push({ x: gx, y: 2.85, z, sx: 0.95, sy: 1.35, sz: 0.6, c: sh }, { x: gx, y: 3.8, z, sx: 0.6, sy: 0.6, sz: 0.6, c: SKIN }, { x: gx, y: 4.15, z, sx: 0.72, sy: 0.22, sz: 0.72, c: DARK }, { x: gx + 0.15, y: 2.95, z: z + side * 0.9, sx: 0.2, sy: 0.2, sz: 1.7, c: DARK }, { x: gx + 0.15, y: 3.15, z: z + side * 0.15, sx: 0.5, sy: 0.18, sz: 0.2, c: [0.3, 0.3, 0.33] });
  }
  return mergeBoxes(parts);
}

export class Train {
  constructor(scene, fx, ctx, nameTag) {
    this.fx = fx; this.ctx = ctx; this.scene = scene;
    // curva campionata ogni ~2 m con direzione
    const P = TRENO_TRACK, S = []; let L = 0;
    for (let i = 0; i + 1 < P.length; i++) { const dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], d = Math.hypot(dx, dz), n = Math.max(1, Math.round(d / 2)); for (let k = 0; k < n; k++) S.push([P[i][0] + dx * k / n, P[i][1] + dz * k / n]); L += d; }
    S.push(P[P.length - 1].slice()); this.S = S; this.step = L / (S.length - 1); this.L = L;
    // binari: due rotaie per tratto + traversine istanziate
    const rails = [], up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i + 1 < P.length; i++) { const dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], d = Math.hypot(dx, dz), a = Math.atan2(dz, dx), mx = (P[i][0] + P[i + 1][0]) / 2, mz = (P[i][1] + P[i + 1][1]) / 2;
      for (const o of [-0.72, 0.72]) rails.push({ x: mx - Math.sin(a) * o, y: 0.33, z: mz + Math.cos(a) * o, sx: d + 0.05, sy: 0.14, sz: 0.12, c: [0.55, 0.56, 0.6], r: a }); }
    this.track = new THREE.Group(); this.track.add(new THREE.Mesh(mergeBoxes(rails), new THREE.MeshLambertMaterial({ vertexColors: true })));
    const n = Math.floor(L / 2.2), sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.12, 2.5), new THREE.MeshLambertMaterial({ color: 0x4a3a2c }), n), m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) { const p = this.at(i * 2.2 + 1), h = this.head(i * 2.2 + 1); q.setFromAxisAngle(up, -h); m.compose(new THREE.Vector3(p[0], 0.24, p[1]), q, new THREE.Vector3(1, 1, 1)); sl.setMatrixAt(i, m); }
    sl.frustumCulled = false; this.track.add(sl); this.track.visible = false; scene.add(this.track);
    // convoglio
    this.cars = LEN.map((len, i) => {
      const g = new THREE.Group(), body = new THREE.Mesh(carMesh(len, i === 0), new THREE.MeshLambertMaterial({ vertexColors: true })); g.add(body);
      let gun = null; if (i > 0) { gun = new THREE.Mesh(gunnerMesh(len, i), new THREE.MeshLambertMaterial({ vertexColors: true })); g.add(gun); }
      g.visible = false; scene.add(g); return { g, len, gun, alive: i > 0, x: 0, z: 0, h: 0, cx: 0, cz: 0 };
    });
    this.tag = nameTag('LUCCHIO', '#b3261e'); this.tag.visible = false; scene.add(this.tag);
    // gunners: 2 per lato per carrozza
    this.gun = []; this.cars.forEach((c, i) => { if (i) for (const side of [1, -1]) for (const gx of [-c.len * 0.22, c.len * 0.22]) this.gun.push({ car: c, side, gx, cool: rnd(1, 3), n: 0, t: 0 }); });
    // proiettili
    this.bm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xffd45a, fog: false }), BULLETS); this.bm.frustumCulled = false; this.bm.count = 0; this.bm.renderOrder = 7; scene.add(this.bm);
    this.b = []; this.m = m; this.q = q; this.pos = new THREE.Vector3(); this.sc = new THREE.Vector3(1, 1, 1);
    this.reset();
  }

  at(s) { const f = clamp(s / this.step, 0, this.S.length - 1.001), i = Math.floor(f), t = f - i, a = this.S[i], b = this.S[i + 1]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  head(s) { const a = this.at(s - 3), b = this.at(s + 3); return Math.atan2(b[1] - a[1], b[0] - a[0]); }

  reset() {
    this.s = 120 + Math.random() * (this.L - 360); this.dir = Math.random() < 0.5 ? 1 : -1; this.spd = SPEED; this.state = 'idle'; this.cool = 0; this.b.length = 0; this.bm.count = 0; this.near = false; this.told = false; this.hitT = 0; this.boost = false; this.hits = []; this.age = 0;
    for (const c of this.cars) { c.g.visible = false; if (c.gun) { c.alive = true; c.gun.visible = true; } } this.tag.visible = false; this.track.visible = false;
  }

  get x() { return this.cars[0].x; }
  get z() { return this.cars[0].z; }
  // Fa comparire il treno vicino al giocatore (boss, fase 3): lo mette sul punto del binario più vicino.
  summon(player) {
    let bi = 0, bd = 1e9; for (let i = 0; i < this.S.length; i += 3) { const d = Math.hypot(this.S[i][0] - player.x, this.S[i][1] - player.z); if (d < bd) { bd = d; bi = i; } }
    this.s = clamp(bi * this.step, 80, this.L - 80); this.state = 'on'; this.cool = 0; for (const c of this.cars) if (c.gun) { c.alive = true; c.gun.visible = true; } this.ctx.toast('Lucchio, il treno, vi spara dai binari!'); this.told = true; this.boost = true;
  }

  place() {
    const hd = this.dir; let off = 0;
    this.cars.forEach((c, i) => {
      const cs = clamp(this.s - hd * (off + c.len / 2), 0, this.L); off += c.len + GAP; const p = this.at(cs), h = this.head(cs); c.x = p[0]; c.z = p[1]; c.h = h + (hd > 0 ? 0 : Math.PI); // direzione del modello (muso = +x)
      c.hs = h; c.g.position.set(p[0], 0.25, p[1]); c.g.rotation.y = -c.h;
    });
    const l = this.cars[0]; this.tag.position.set(l.x, 8, l.z);
  }

  update(dt, player, runT) {
    // il treno corre sempre sui binari (anche lontano): è solo posizione; il resto solo se vicino
    this.s += this.dir * this.spd * dt; if (this.s > this.L - 70) { this.s = this.L - 70; this.dir = -1; } else if (this.s < 70) { this.s = 70; this.dir = 1; }
    let dmin = 1e9; for (let i = 0; i < this.S.length; i += 6) { const d = Math.hypot(this.S[i][0] - player.x, this.S[i][1] - player.z); if (d < dmin) dmin = d; }
    const near = dmin < 320; this.near = near; this.track.visible = near;
    const show = near && this.state !== 'dead'; for (const c of this.cars) c.g.visible = show; this.tag.visible = show;
    if (this.state === 'dead') { this.cool -= dt; this.spd = Math.max(0, this.spd - 8 * dt); if (this.cool <= 0) { this.state = 'idle'; this.spd = SPEED; for (const c of this.cars) if (c.gun) { c.alive = true; c.gun.visible = true; } } }
    else { this.spd += (SPEED - this.spd) * Math.min(1, 2 * dt); }
    if (show || this.state === 'dead') this.place();
    const d0 = Math.hypot(this.x - player.x, this.z - player.z), range = this.boost ? 190 : 125;
    if (this.state === 'idle' && !this.hold && runT > 12 && d0 < 240) { this.state = 'on'; if (!this.told) { this.told = true; this.ctx.toast('Lucchio, il treno, ti spara dai binari!'); } }
    if (this.state === 'on' && !near) this.state = 'idle';
    if (this.state === 'on') this.shoot(dt, player, range);
    this.updateBullets(dt, player);
  }

  shoot(dt, player, range) {
    for (const g of this.gun) {
      if (!g.car.alive) continue;
      const c = g.car, wx0 = c.x + g.gx * Math.cos(c.h) - 0, wz0 = c.z + g.gx * Math.sin(c.h);
      if (g.n > 0) { g.t -= dt; if (g.t <= 0) { this.bullet(g, c, player); g.n--; g.t = 0.085; } continue; }
      g.cool -= dt; if (g.cool > 0) continue;
      const d = Math.hypot(player.x - wx0, player.z - wz0); g.cool = rnd(2.4, 4.4); if (d > range || d < 6) continue;
      const nx = -Math.sin(c.h), nz = Math.cos(c.h); if (((player.x - wx0) * nx + (player.z - wz0) * nz) * g.side < 0) continue; // spara solo dal lato in cui ti trovi
      g.n = 5 + Math.floor(Math.random() * 3); g.t = 0.05;
    }
  }

  bullet(g, c, player) {
    const lx = g.gx, lz = g.side * 3.0, ch = Math.cos(c.h), sh = Math.sin(c.h), ox = c.x + lx * ch - lz * sh, oz = c.z + lx * sh + lz * ch, oy = 3.1, d = Math.hypot(player.x - ox, player.z - oz), T = d / 95;
    const tx = player.x + player.vx * T * 0.85 + rnd(-1, 1) * (1.2 + d * 0.025), tz = player.z + player.vz * T * 0.85 + rnd(-1, 1) * (1.2 + d * 0.025), ty = 0.9 + rnd(-0.6, 0.6) + player.y;
    let dx = tx - ox, dy = ty - oy, dz = tz - oz; const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
    if (this.b.length >= BULLETS) this.b.shift(); this.b.push({ x: ox, y: oy, z: oz, vx: dx * 95, vy: dy * 95, vz: dz * 95, t: 0 }); sfx.gun(clamp(1 - d / 160, 0.15, 0.8));
    this.ctx.sparks && this.ctx.sparks(ox, oy, oz, 2, dx * 4, dz * 4);
  }

  updateBullets(dt, player) {
    this.hitT -= dt; this.age += dt; const m = this.m, q = this.q, up = new THREE.Vector3(1, 0, 0), dir = new THREE.Vector3();
    for (let i = this.b.length - 1; i >= 0; i--) {
      const b = this.b[i]; b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      let dead = b.t > 1.6 || b.y < 0.05;
      if (!dead && player.clear < 3 && Math.abs(b.y - (player.y + 0.9)) < 1.4 && Math.hypot(b.x - player.x, b.z - player.z) < 1.7 && player.shield > 0) { dead = true; this.ctx.sparks && this.ctx.sparks(b.x, b.y, b.z, 3, 0, 0); } // lo scudo ferma i proiettili
      else if (!dead && player.clear < 3 && Math.abs(b.y - (player.y + 0.9)) < 1.4 && Math.hypot(b.x - player.x, b.z - player.z) < 1.7) {
        dead = true; player.vx *= 0.9; player.vz *= 0.9; this.fx.shake = Math.max(this.fx.shake, 0.45); sfx.thud(0.25); this.ctx.sparks && this.ctx.sparks(b.x, b.y, b.z, 5, 0, 0);
        if (this.hitT <= 0) { this.hitT = 6; this.ctx.toast && this.ctx.toast('Ti mitragliano! Schiva!'); }
      }
      if (dead) { if (b.y < 0.1 && this.ctx.sparks) this.ctx.sparks(b.x, 0.2, b.z, 2, 0, 0); this.b.splice(i, 1); }
    }
    this.b.forEach((b, i) => { dir.set(b.vx, b.vy, b.vz).normalize(); q.setFromUnitVectors(up, dir); this.pos.set(b.x, b.y, b.z); m.compose(this.pos, q, this.sc); this.bm.setMatrixAt(i, m); });
    this.bm.count = this.b.length; this.bm.instanceMatrix.needsUpdate = true;
  }

  // Urto con il convoglio. Sopra ~80 km/h contro una carrozza viva ne spazza via i mitraglieri.
  collide(player) {
    if (this.state === 'dead' || !this.near || player.clear > 2.2) return false;
    let res = false;
    for (let ci = 0; ci < this.cars.length; ci++) {
      const c = this.cars[ci], ch = Math.cos(c.h), sh = Math.sin(c.h), hl = c.len / 2 + 0.2;
      for (const po of [-1.4, 0, 1.4]) {
        const px = player.x + Math.cos(player.h) * po, pz = player.z + Math.sin(player.h) * po, rx = px - c.x, rz = pz - c.z, u = rx * ch + rz * sh, v = -rx * sh + rz * ch, pu = hl + 0.92 - Math.abs(u), pv = HALF_W + 0.92 - Math.abs(v);
        if (pu <= 0 || pv <= 0) continue;
        const sp = Math.hypot(player.vx, player.vz); let nx, nz, pen;
        if (pv < pu) { const sg = v >= 0 ? 1 : -1; nx = -sh * sg; nz = ch * sg; pen = pv; } else { const sg = u >= 0 ? 1 : -1; nx = ch * sg; nz = sh * sg; pen = pu; }
        player.x += nx * pen; player.z += nz * pen; const vn = player.vx * nx + player.vz * nz; if (vn < 0) { player.vx -= vn * nx * 1.5; player.vz -= vn * nz * 1.5; }
        if (c.gun && c.alive && sp > 22) { c.alive = false; c.gun.visible = false; this.fx.thump(c.x, c.z, 8); this.fx.shake = Math.max(this.fx.shake, 1.2); sfx.boom(0.7); this.ctx.toast('Carrozza ripulita!'); this.b.length = 0;
          if (this.cars.every((k) => !k.gun || !k.alive)) { this.state = 'dead'; this.cool = 40; this.fx.explode(this.x, this.z, 1.5, 0.5); this.ctx.onKo && this.ctx.onKo('Lucchio'); } res = 'ko'; } else res = res || 'bump';
        return res;
      }
    }
    return res;
  }
}
