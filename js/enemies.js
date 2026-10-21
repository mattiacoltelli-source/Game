import * as THREE from '../lib/three.module.min.js';
import { mergeBoxes } from './geom.js';
import { Graph } from './traffic.js';
import { sfx } from './sfx.js';

// Nemici arcade: il carro armato LUCCHIO (a terra) e l'elicottero MACCO (in aria).
// I colpi sono "mortai": prima compare un cerchio rosso a terra dove cadranno (si può schivare), poi esplodono.
// L'esplosione lancia in aria l'auto (car.blast) e fa volare pedoni, auto del traffico e coni.
const R_BLAST = 9, ROADS = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential']);
const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const additive = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

function nameTag(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = color; g.beginPath(); g.roundRect ? g.roundRect(4, 8, 248, 48, 24) : g.rect(4, 8, 248, 48); g.fill();
  g.fillStyle = '#fff'; g.font = '800 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false })); sp.scale.set(14, 3.5, 1); sp.renderOrder = 12; return sp;
}

// ---- proiettili, cerchi di avviso ed esplosioni
class Fx {
  constructor(scene, ctx) {
    this.ctx = ctx; this.shells = []; this.ex = []; this.shake = 0;
    const inst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.count = 0; m.renderOrder = 5; scene.add(m); return m; };
    this.shellM = inst(new THREE.IcosahedronGeometry(0.6, 0), additive(0xffb347, 1), 16);
    this.ringM = inst(new THREE.RingGeometry(R_BLAST - 0.9, R_BLAST, 40).rotateX(-Math.PI / 2), additive(0xff3b30, 0.95), 16);
    this.discM = inst(new THREE.CircleGeometry(R_BLAST - 0.9, 32).rotateX(-Math.PI / 2), additive(0xff3b30, 0.22), 16);
    this.fireM = inst(new THREE.IcosahedronGeometry(1, 1), additive(0xff8a1f, 0.9), 12);
    this.coreM = inst(new THREE.IcosahedronGeometry(1, 0), additive(0xfff2b0, 1), 12);
    this.waveM = inst(new THREE.RingGeometry(0.82, 1, 36).rotateX(-Math.PI / 2), additive(0xffffff, 0.8), 12);
  }

  reset() { this.shells.length = 0; this.ex.length = 0; this.shake = 0; this.draw(); }

  // Lancia un colpo da `from` che atterrerà in (tx,tz) dopo T secondi.
  fire(from, tx, tz, T) { this.shells.push({ x0: from[0], y0: from[1], z0: from[2], tx, tz, T, t: 0 }); sfx.shot(); }

  explode(x, z, y = 0, power = 1) {
    const { car, peds, traffic, props } = this.ctx;
    this.ex.push({ x, y, z, t: 0 });
    const k = car.blast(x, z, R_BLAST, power); if (k > 0) { this.shake = Math.max(this.shake, 0.4 + k); this.ctx.onHit && this.ctx.onHit(k); }
    for (const p of peds.peds) { const d = Math.hypot(p.x - x, p.z - z); if (!p.fly && d < R_BLAST) p.fly = { t: 0, vx: (p.x - x) / (d || 1) * 9, vz: (p.z - z) / (d || 1) * 9, vy: 9 + Math.random() * 4 }; }
    for (const c of traffic.cars) { const d = Math.hypot(c.x - x, c.z - z); if (d < R_BLAST) { c.sx = (c.x - x) / (d || 1) * 20; c.sz = (c.z - z) / (d || 1) * 20; c.spd = 0; c.cool = 0.5; } }
    for (const c of props.c) { const d = Math.hypot(c.x - x, c.z - z); if (c.st === 0 && d < R_BLAST) { c.st = 1; c.vx = (c.x - x) / (d || 1) * 14; c.vz = (c.z - z) / (d || 1) * 14; c.vy = 9 + Math.random() * 5; c.rz = (Math.random() - 0.5) * 8; c.rx = (Math.random() - 0.5) * 8; props.dirty = true; } }
    const dist = Math.hypot(x - car.x, z - car.z); sfx.boom(clamp(1.2 - dist / 160, 0.15, 1));
  }

  update(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) { const s = this.shells[i]; s.t += dt; if (s.t >= s.T) { this.explode(s.tx, s.tz); this.shells.splice(i, 1); } }
    for (let i = this.ex.length - 1; i >= 0; i--) { this.ex[i].t += dt; if (this.ex[i].t > 0.7) this.ex.splice(i, 1); }
    this.shake *= Math.exp(-5 * dt); this.draw();
  }

  draw() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    this.shells.forEach((s, i) => {
      const f = s.t / s.T, arc = 4 * f * (1 - f) * (6 + Math.hypot(s.tx - s.x0, s.tz - s.z0) * 0.12);
      pos.set(s.x0 + (s.tx - s.x0) * f, s.y0 * (1 - f) + arc, s.z0 + (s.tz - s.z0) * f); sc.setScalar(1); m.compose(pos, q, sc); this.shellM.setMatrixAt(i, m);
      pos.set(s.tx, 0.25, s.tz); const pulse = 0.94 + 0.06 * Math.sin(s.t * 18); sc.set(pulse, 1, pulse); m.compose(pos, q, sc); this.ringM.setMatrixAt(i, m);
      sc.set(f, 1, f); m.compose(pos, q, sc); this.discM.setMatrixAt(i, m); // il disco si riempie man mano che il colpo si avvicina
    });
    this.shellM.count = this.ringM.count = this.discM.count = this.shells.length;
    this.ex.forEach((e, i) => {
      const f = e.t / 0.7, s = R_BLAST * 0.55 * (0.25 + 0.75 * Math.sqrt(f)) * (1 - f * f * 0.8);
      pos.set(e.x, e.y + s * 0.6, e.z); sc.setScalar(Math.max(0.01, s)); m.compose(pos, q, sc); this.fireM.setMatrixAt(i, m);
      sc.setScalar(Math.max(0.01, s * 0.55 * (1 - f))); m.compose(pos, q, sc); this.coreM.setMatrixAt(i, m);
      pos.set(e.x, e.y + 0.3, e.z); const w = R_BLAST * 1.3 * f; sc.set(Math.max(0.01, w), 1, Math.max(0.01, w)); m.compose(pos, q, sc); this.waveM.setMatrixAt(i, m);
    });
    this.fireM.count = this.coreM.count = this.waveM.count = this.ex.length;
    for (const x of [this.shellM, this.ringM, this.discM, this.fireM, this.coreM, this.waveM]) x.instanceMatrix.needsUpdate = true;
  }
}

// ---- LUCCHIO, il carro armato
const TANK_GREEN = [0.3, 0.38, 0.22], TANK_DARK = [0.14, 0.16, 0.12];
class Tank {
  constructor(scene, world, roadIndex, fx, ctx) {
    this.fx = fx; this.ctx = ctx; this.ri = roadIndex; this.g = new Graph(world.roads, (r) => ROADS.has(r.c) && !r.n.includes('Matteotti') && r.w >= 6);
    const hull = new THREE.Mesh(mergeBoxes([
      { x: 0, y: 0.95, z: 0, sx: 5.6, sy: 1.0, sz: 2.9, c: TANK_GREEN }, { x: 2.9, y: 0.8, z: 0, sx: 0.9, sy: 0.7, sz: 2.7, c: TANK_GREEN },
      { x: 0, y: 0.45, z: 1.6, sx: 5.9, sy: 0.9, sz: 0.75, c: TANK_DARK }, { x: 0, y: 0.45, z: -1.6, sx: 5.9, sy: 0.9, sz: 0.75, c: TANK_DARK },
    ]), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.turret = new THREE.Mesh(mergeBoxes([
      { x: -0.2, y: 1.85, z: 0, sx: 2.7, sy: 0.9, sz: 2.4, c: [0.34, 0.42, 0.25] }, { x: -0.6, y: 2.45, z: 0.5, sx: 0.8, sy: 0.3, sz: 0.8, c: TANK_DARK },
      { x: 2.7, y: 1.9, z: 0, sx: 3.8, sy: 0.32, sz: 0.32, c: TANK_DARK },
    ]), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.group = new THREE.Group(); this.group.add(hull, this.turret); this.group.visible = false; scene.add(this.group);
    this.tag = nameTag('LUCCHIO', '#b3261e'); this.tag.visible = false; scene.add(this.tag);
    this.state = 'off'; this.cool = 6; this.fireT = 0; this.announced = false;
  }

  reset() { this.state = 'off'; this.cool = 6; this.group.visible = false; this.tag.visible = false; this.announced = false; }

  spawn(player) {
    let pick = null, n = 0; const hx = Math.cos(player.h), hz = Math.sin(player.h);
    this.ri.segmentsNear(player.x, player.z, 260, (r, i) => {
      if (!this.g.ok.has(r)) return; const p = r.p, mx = (p[i * 2] + p[i * 2 + 2]) / 2, mz = (p[i * 2 + 1] + p[i * 2 + 3]) / 2, dx = mx - player.x, dz = mz - player.z, d = Math.hypot(dx, dz);
      if (d < 150 || d > 250 || (dx * hx + dz * hz) / d < 0.2) return; if (++n * Math.random() < 1) pick = [r, i];
    });
    if (!pick) return false;
    const [r, i] = pick, a = i, b = i + 1, sg = this.g.seg(r._i, a, b);
    Object.assign(this, { cr: r._i, a, b, s: Math.random() * sg.L, x: sg.ax, z: sg.az, h: Math.atan2(sg.uz, sg.ux), spd: 0, state: 'on', fireT: 2.2 });
    this.group.visible = this.tag.visible = true; return true;
  }

  update(dt, player, runT) {
    if (this.state === 'off') { this.cool -= dt; if (runT > 8 && this.cool <= 0 && this.spawn(player)) { this.ctx.toast('Lucchio, il carro armato, ti ha trovato!'); } return; }
    if (this.state === 'dead') { this.cool -= dt; if (this.cool <= 0) { this.state = 'off'; this.cool = 1; } return; }
    const dx = player.x - this.x, dz = player.z - this.z, d = Math.hypot(dx, dz);
    if (d > 330) { this.reset(); this.cool = 12; return; }
    // si avvicina lungo le strade; si ferma a ~55 m
    let sg = this.g.seg(this.cr, this.a, this.b); const want = d > 55 ? 9 : 0;
    this.spd += clamp(want - this.spd, -12 * dt, 4 * dt); this.s += this.spd * dt;
    while (this.s >= sg.L) {
      this.s -= sg.L; let best = null, bd = 1e9;
      for (let k = 0; k < 6; k++) { const n = this.g.next(this.cr, this.a, this.b), p = this.g.roads[n[0]].p, dd = Math.hypot(p[n[2] * 2] - player.x, p[n[2] * 2 + 1] - player.z); if (dd < bd) { bd = dd; best = n; } }
      [this.cr, this.a, this.b] = best; sg = this.g.seg(this.cr, this.a, this.b);
    }
    const tx = sg.ax + sg.ux * this.s, tz = sg.az + sg.uz * this.s; this.x += (tx - this.x) * Math.min(1, 8 * dt); this.z += (tz - this.z) * Math.min(1, 8 * dt);
    let dh = Math.atan2(sg.uz, sg.ux) - this.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); this.h += dh * Math.min(1, 4 * dt);
    // torretta verso il giocatore
    let da = Math.atan2(dz, dx) - this.h; da = Math.atan2(Math.sin(da), Math.cos(da)); this.turret.rotation.y = -da;
    this.group.position.set(this.x, 0.15, this.z); this.group.rotation.y = -this.h; this.tag.position.set(this.x, 6.2, this.z);
    // fuoco: ogni ~3 s, cerchio di avviso sul punto previsto
    this.fireT -= dt;
    if (this.fireT <= 0 && d > 28 && d < 140) {
      const T = 0.8 + d / 170, ax = player.x + player.vx * T * 0.9 + rnd(-3, 3), az = player.z + player.vz * T * 0.9 + rnd(-3, 3), mz = this.h + da;
      this.fx.fire([this.x + Math.cos(mz) * 3.4, 2.1, this.z + Math.sin(mz) * 3.4], ax, az, T); this.fireT = rnd(2.8, 3.6);
    }
  }

  // Speronamento: sopra ~80 km/h il carro salta in aria e dà una carica NOS; sotto, è un urto.
  collide(player) {
    if (this.state !== 'on' || player.clear > 2.2) return false;
    const pf = [Math.cos(player.h), Math.sin(player.h)], tf = [Math.cos(this.h), Math.sin(this.h)];
    for (const to of [-1.5, 1.5]) for (const po of [-1.4, 0, 1.4]) {
      let dx = player.x + pf[0] * po - (this.x + tf[0] * to), dz = player.z + pf[1] * po - (this.z + tf[1] * to); const d = Math.hypot(dx, dz), pen = 1.9 + 0.92 - d; if (pen <= 0) continue;
      if (Math.hypot(player.vx, player.vz) > 22) { this.destroy(); return 'ko'; }
      if (d > 1e-3) { dx /= d; dz /= d; } else { dx = 1; dz = 0; }
      player.x += dx * pen; player.z += dz * pen; const vn = player.vx * dx + player.vz * dz; if (vn < 0) { player.vx -= vn * dx * 1.4; player.vz -= vn * dz * 1.4; } return 'bump';
    }
    return false;
  }

  destroy() { this.fx.explode(this.x, this.z, 0.5, 0.7); this.state = 'dead'; this.cool = 22; this.group.visible = this.tag.visible = false; }
}

// ---- MACCO, l'elicottero
class Heli {
  constructor(scene, fx, ctx) {
    this.fx = fx; this.ctx = ctx;
    const BLUE = [0.16, 0.24, 0.42], YEL = [0.95, 0.78, 0.12], DK = [0.1, 0.11, 0.14];
    this.body = new THREE.Mesh(mergeBoxes([
      { x: 0, y: 0, z: 0, sx: 4.2, sy: 1.5, sz: 1.8, c: BLUE }, { x: 0, y: 0.35, z: 0, sx: 4.25, sy: 0.22, sz: 1.85, c: YEL }, { x: 1.55, y: 0.25, z: 0, sx: 1.5, sy: 0.95, sz: 1.6, c: [0.55, 0.72, 0.9] },
      { x: -3.8, y: 0.45, z: 0, sx: 4.2, sy: 0.4, sz: 0.4, c: BLUE }, { x: -5.7, y: 1.0, z: 0, sx: 0.18, sy: 1.4, sz: 0.9, c: YEL },
      { x: 0, y: -1.0, z: 0.85, sx: 3.6, sy: 0.12, sz: 0.12, c: DK }, { x: 0, y: -1.0, z: -0.85, sx: 3.6, sy: 0.12, sz: 0.12, c: DK }, { x: 0, y: 0.95, z: 0, sx: 0.3, sy: 0.5, sz: 0.3, c: DK },
    ]), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.rotor = new THREE.Mesh(mergeBoxes([{ x: 0, y: 0, z: 0, sx: 10, sy: 0.07, sz: 0.5, c: DK }, { x: 0, y: 0, z: 0, sx: 0.5, sy: 0.07, sz: 10, c: DK }]), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
    this.rotor.position.y = 1.25;
    this.group = new THREE.Group(); this.group.add(this.body, this.rotor); this.group.visible = false; scene.add(this.group);
    this.tag = nameTag('MACCO', '#1f4fa3'); this.tag.visible = false; scene.add(this.tag);
    this.state = 'off'; this.cool = 0; this.t = 0; this.burst = 0; this.fireT = 4; this.ang = 0;
  }

  reset() { this.state = 'off'; this.cool = 0; this.group.visible = false; this.tag.visible = false; }

  update(dt, player, runT) {
    if (this.state === 'off') { this.cool -= dt; if (runT > 18 && this.cool <= 0) { // arriva da lontano
        const a = Math.random() * 6.28; Object.assign(this, { state: 'on', t: 0, x: player.x + Math.cos(a) * 230, z: player.z + Math.sin(a) * 230, y: 40, fireT: 3.5, burst: 0, ang: a });
        this.group.visible = this.tag.visible = true; this.ctx.toast('Macco, l\'elicottero, è in arrivo!'); }
      return; }
    this.t += dt; this.rotor.rotation.y += dt * 26;
    this.ang += dt * 0.4; const leaving = this.t > 42;
    const tx = player.x + player.vx * 0.9 + Math.cos(this.ang) * 36, tz = player.z + player.vz * 0.9 + Math.sin(this.ang) * 36, ty = leaving ? 120 : 22 + Math.sin(this.t * 1.7) * 2;
    const k = Math.min(1, 1.5 * dt), ox = this.x, oz = this.z;
    this.x += clamp((tx - this.x) * k, -70 * dt, 70 * dt); this.z += clamp((tz - this.z) * k, -70 * dt, 70 * dt); this.y += (ty - this.y) * Math.min(1, 1.2 * dt);
    const vx = (this.x - ox) / Math.max(dt, 1e-3), vz = (this.z - oz) / Math.max(dt, 1e-3);
    this.group.position.set(this.x, this.y, this.z); const yaw = Math.atan2(player.z - this.z, player.x - this.x); this.group.rotation.set(0, -yaw, 0);
    this.body.rotation.z = clamp(-(vx * Math.cos(yaw) + vz * Math.sin(yaw)) * 0.006, -0.35, 0.35); this.tag.position.set(this.x, this.y + 4.5, this.z);
    if (leaving && this.y > 100) { this.reset(); this.cool = 26; return; }
    // raffica da 3 missili ogni ~5 s
    this.fireT -= dt;
    if (!leaving && this.fireT <= 0 && this.t > 3) {
      this.fireT = 0.32; this.burst++;
      const d = Math.hypot(player.x - this.x, player.z - this.z), T = 1.15 + d / 120, ax = player.x + player.vx * T * 0.9 + rnd(-5, 5), az = player.z + player.vz * T * 0.9 + rnd(-5, 5);
      this.fx.fire([this.x + Math.cos(yaw) * 2, this.y - 0.6, this.z + Math.sin(yaw) * 2], ax, az, T);
      if (this.burst >= 3) { this.burst = 0; this.fireT = rnd(4.2, 5.4); }
    }
  }
}

export class Enemies {
  constructor(scene, world, roadIndex, ctx) {
    this.fx = new Fx(scene, ctx); this.tank = new Tank(scene, world, roadIndex, this.fx, ctx); this.heli = new Heli(scene, this.fx, ctx); this.ctx = ctx; this.t = 0;
  }
  reset() { this.t = 0; this.fx.reset(); this.tank.reset(); this.heli.reset(); }
  get shake() { return this.fx.shake; }
  update(dt, player) {
    this.t += dt; this.fx.update(dt); this.tank.update(dt, player, this.t); this.heli.update(dt, player, this.t);
    const r = this.tank.collide(player); if (r === 'ko') { this.ctx.onKo('Lucchio'); } return r;
  }
}
