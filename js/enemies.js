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
    this.ctx = ctx; this.shells = []; this.ex = []; this.marks = []; this.shake = 0;
    const inst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.count = 0; m.renderOrder = 5; scene.add(m); return m; };
    this.shellM = inst(new THREE.IcosahedronGeometry(0.6, 0), additive(0xffb347, 1), 16);
    this.ringM = inst(new THREE.RingGeometry(R_BLAST - 0.9, R_BLAST, 40).rotateX(-Math.PI / 2), additive(0xff3b30, 0.95), 16);
    this.discM = inst(new THREE.CircleGeometry(R_BLAST - 0.9, 32).rotateX(-Math.PI / 2), additive(0xff3b30, 0.22), 16);
    this.fireM = inst(new THREE.IcosahedronGeometry(1, 1), additive(0xff8a1f, 0.9), 12);
    this.coreM = inst(new THREE.IcosahedronGeometry(1, 0), additive(0xfff2b0, 1), 12);
    this.waveM = inst(new THREE.RingGeometry(0.82, 1, 36).rotateX(-Math.PI / 2), additive(0xffffff, 0.8), 12);
  }

  reset() { this.shells.length = 0; this.ex.length = 0; this.marks.length = 0; this.shake = 0; this.draw(); }

  // Cerchio di avviso a terra (senza proiettile) che dura T secondi.
  mark(x, z, T, s = 1) { const m = { x, z, T, t: 0, s }; this.marks.push(m); return m; }

  // Tonfo del gigante: onda di polvere + pedoni, auto e coni sbalzati via (senza fuoco né lancio automatico dell'auto).
  thump(x, z, R = 8) {
    const { peds, traffic, props } = this.ctx; this.ex.push({ x, y: 0, z, t: 0, dust: true });
    for (const p of peds.peds) { const d = Math.hypot(p.x - x, p.z - z); if (!p.fly && d < R) p.fly = { t: 0, vx: (p.x - x) / (d || 1) * 12, vz: (p.z - z) / (d || 1) * 12, vy: 10 + Math.random() * 4 }; }
    for (const c of traffic.cars) { const d = Math.hypot(c.x - x, c.z - z); if (d < R) { c.sx = (c.x - x) / (d || 1) * 26; c.sz = (c.z - z) / (d || 1) * 26; c.spd = 0; c.cool = 0.5; } }
    for (const c of props.c) { const d = Math.hypot(c.x - x, c.z - z); if (c.st === 0 && d < R) { c.st = 1; c.vx = (c.x - x) / (d || 1) * 16; c.vz = (c.z - z) / (d || 1) * 16; c.vy = 10 + Math.random() * 5; c.rz = (Math.random() - 0.5) * 8; c.rx = (Math.random() - 0.5) * 8; props.dirty = true; } }
  }

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
    for (let i = this.marks.length - 1; i >= 0; i--) { this.marks[i].t += dt; if (this.marks[i].t >= this.marks[i].T + 0.1) this.marks.splice(i, 1); }
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
    this.marks.forEach((k, j) => { const i = this.shells.length + j, f = Math.min(1, k.t / k.T);
      pos.set(k.x, 0.25, k.z); const pulse = 0.94 + 0.06 * Math.sin(k.t * 18); sc.set(pulse * k.s, 1, pulse * k.s); m.compose(pos, q, sc); this.ringM.setMatrixAt(i, m); sc.set(f * k.s, 1, f * k.s); m.compose(pos, q, sc); this.discM.setMatrixAt(i, m); });
    this.shellM.count = this.shells.length; this.ringM.count = this.discM.count = this.shells.length + this.marks.length;
    this.ex.forEach((e, i) => {
      const f = e.t / 0.7, s = e.dust ? 0 : R_BLAST * 0.55 * (0.25 + 0.75 * Math.sqrt(f)) * (1 - f * f * 0.8);
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
      ...[-2.3, -1.15, 0, 1.15, 2.3].flatMap((x) => [{ x, y: 0.42, z: 2.0, sx: 0.8, sy: 0.8, sz: 0.1, c: [0.28, 0.3, 0.26] }, { x, y: 0.42, z: -2.0, sx: 0.8, sy: 0.8, sz: 0.1, c: [0.28, 0.3, 0.26] }]),
      { x: 3.1, y: 1.2, z: 0.9, sx: 0.12, sy: 0.22, sz: 0.4, c: [1.4, 1.3, 0.9] }, { x: 3.1, y: 1.2, z: -0.9, sx: 0.12, sy: 0.22, sz: 0.4, c: [1.4, 1.3, 0.9] }, { x: -2.9, y: 1.1, z: 0.9, sx: 0.5, sy: 0.4, sz: 0.5, c: TANK_DARK }, { x: -2.9, y: 1.1, z: -0.9, sx: 0.5, sy: 0.4, sz: 0.5, c: TANK_DARK }, { x: -2.9, y: 1.7, z: 0.9, sx: 0.12, sy: 0.9, sz: 0.12, c: TANK_DARK },
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

// ---- SIMO PAKELO, il tir con la cisterna: velocissimo, lascia chiazze d'olio che fanno sbandare
const TRK_CAB = [0.75, 0.15, 0.12], TRK_DARK = [0.14, 0.14, 0.16], TRK_TANK = [0.82, 0.84, 0.88], MAX_OIL = 14;
class Truck {
  constructor(scene, world, roadIndex, fx, ctx) {
    this.fx = fx; this.ctx = ctx; this.ri = roadIndex; this.g = new Graph(world.roads, (r) => ROADS.has(r.c) && !r.n.includes('Matteotti') && r.w >= 6);
    this.group = new THREE.Group();
    this.group.add(new THREE.Mesh(mergeBoxes([
      { x: 6.2, y: 1.9, z: 0, sx: 2.6, sy: 2.6, sz: 2.5, c: TRK_CAB }, { x: 7.3, y: 2.4, z: 0, sx: 0.2, sy: 1.0, sz: 2.1, c: [0.6, 0.8, 0.95] },
      { x: 5.0, y: 0.75, z: 0, sx: 10.6, sy: 0.5, sz: 2.3, c: TRK_DARK }, { x: 6.4, y: 0.5, z: 0, sx: 1.2, sy: 0.9, sz: 2.4, c: TRK_DARK },
      { x: -1.2, y: 2.0, z: 0, sx: 9.4, sy: 1.9, sz: 2.3, c: TRK_TANK }, { x: -1.2, y: 2.0, z: 0, sx: 9.8, sy: 0.35, sz: 2.4, c: TRK_DARK },
      { x: -5.9, y: 2.0, z: 0, sx: 0.5, sy: 1.5, sz: 2.0, c: TRK_TANK }, { x: -1.2, y: 3.15, z: 0, sx: 1.0, sy: 0.4, sz: 1.0, c: TRK_DARK },
      { x: 7.52, y: 0.95, z: 0.8, sx: 0.12, sy: 0.3, sz: 0.5, c: [1.5, 1.4, 1.0] }, { x: 7.52, y: 0.95, z: -0.8, sx: 0.12, sy: 0.3, sz: 0.5, c: [1.5, 1.4, 1.0] }, { x: 7.55, y: 0.6, z: 0, sx: 0.1, sy: 0.5, sz: 1.5, c: TRK_DARK },
      { x: 4.9, y: 3.6, z: 1.0, sx: 0.25, sy: 2.2, sz: 0.25, c: [0.75, 0.76, 0.8] }, { x: 4.9, y: 3.6, z: -1.0, sx: 0.25, sy: 2.2, sz: 0.25, c: [0.75, 0.76, 0.8] }, { x: 7.1, y: 2.0, z: 1.55, sx: 0.3, sy: 0.7, sz: 0.1, c: TRK_DARK }, { x: 7.1, y: 2.0, z: -1.55, sx: 0.3, sy: 0.7, sz: 0.1, c: TRK_DARK },
      { x: 6.9, y: 3.3, z: 0.7, sx: 0.2, sy: 0.15, sz: 0.2, c: [1.5, 0.9, 0.1] }, { x: 6.9, y: 3.3, z: 0, sx: 0.2, sy: 0.15, sz: 0.2, c: [1.5, 0.9, 0.1] }, { x: 6.9, y: 3.3, z: -0.7, sx: 0.2, sy: 0.15, sz: 0.2, c: [1.5, 0.9, 0.1] }, { x: -6.1, y: 1.0, z: 0.8, sx: 0.12, sy: 0.25, sz: 0.4, c: [1.2, 0.1, 0.08] }, { x: -6.1, y: 1.0, z: -0.8, sx: 0.12, sy: 0.25, sz: 0.4, c: [1.2, 0.1, 0.08] },
      { x: 2.6, y: 0.45, z: 1.15, sx: 1.0, sy: 0.9, sz: 0.3, c: TRK_DARK }, { x: 2.6, y: 0.45, z: -1.15, sx: 1.0, sy: 0.9, sz: 0.3, c: TRK_DARK },
      { x: -4.2, y: 0.45, z: 1.15, sx: 1.0, sy: 0.9, sz: 0.3, c: TRK_DARK }, { x: -4.2, y: 0.45, z: -1.15, sx: 1.0, sy: 0.9, sz: 0.3, c: TRK_DARK },
    ]), new THREE.MeshLambertMaterial({ vertexColors: true })));
    this.group.visible = false; scene.add(this.group);
    this.tag = nameTag('SIMO PAKELO', '#7a3b00'); this.tag.visible = false; scene.add(this.tag);
    // chiazze d'olio (istanze piatte)
    const geo = new THREE.CircleGeometry(1, 20); geo.rotateX(-Math.PI / 2);
    this.puddles = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x0b0710, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), MAX_OIL);
    this.puddles.frustumCulled = false; this.puddles.renderOrder = 3; this.puddles.count = 0; scene.add(this.puddles);
    this.oils = []; this.m = new THREE.Matrix4(); this.state = 'off'; this.cool = 22; this.age = 0; this.dropT = 0; this.told = false;
  }

  reset() { this.state = 'off'; this.cool = 22; this.group.visible = this.tag.visible = false; this.oils.length = 0; this.puddles.count = 0; this.told = false; }

  spawn(player) {
    let pick = null, n = 0; const hx = Math.cos(player.h), hz = Math.sin(player.h);
    this.ri.segmentsNear(player.x, player.z, 280, (r, i) => {
      if (!this.g.ok.has(r)) return; const p = r.p, mx = (p[i * 2] + p[i * 2 + 2]) / 2, mz = (p[i * 2 + 1] + p[i * 2 + 3]) / 2, dx = mx - player.x, dz = mz - player.z, d = Math.hypot(dx, dz);
      if (d < 170 || d > 270 || (dx * hx + dz * hz) / d < 0.3) return; if (++n * Math.random() < 1) pick = [r, i];
    });
    if (!pick) return false;
    const [r, i] = pick, a = i, b = i + 1, sg = this.g.seg(r._i, a, b);
    Object.assign(this, { cr: r._i, a, b, s: Math.random() * sg.L, x: sg.ax, z: sg.az, h: Math.atan2(sg.uz, sg.ux), spd: 20, state: 'on', age: 0, dropT: 0.8 });
    this.group.visible = this.tag.visible = true; return true;
  }

  drop(x, z, r) {
    if (this.oils.length >= MAX_OIL) this.oils.shift();
    this.oils.push({ x, z, r, t: 11 });
  }

  update(dt, player, runT) {
    if (this.state === 'off') { this.cool -= dt; if (runT > 25 && this.cool <= 0 && this.spawn(player)) { this.ctx.toast('Simo Pakelo, il tir, sta spandendo olio!'); } }
    else {
      this.age += dt;
      const dx = player.x - this.x, dz = player.z - this.z, d = Math.hypot(dx, dz);
      if (d > 400 || this.age > 40) { this.group.visible = this.tag.visible = false; this.state = 'off'; this.cool = 18; }
      else {
        let sg = this.g.seg(this.cr, this.a, this.b); this.spd += clamp(34 - this.spd, -20 * dt, 14 * dt); this.s += this.spd * dt;
        while (this.s >= sg.L) {
          this.s -= sg.L; let best = null, bd = 1e9;
          for (let k = 0; k < 6; k++) { const n = this.g.next(this.cr, this.a, this.b), p = this.g.roads[n[0]].p, dd = Math.hypot(p[n[2] * 2] - player.x, p[n[2] * 2 + 1] - player.z); if (dd < bd) { bd = dd; best = n; } }
          [this.cr, this.a, this.b] = best; sg = this.g.seg(this.cr, this.a, this.b);
        }
        const tx = sg.ax + sg.ux * this.s, tz = sg.az + sg.uz * this.s; this.x += (tx - this.x) * Math.min(1, 10 * dt); this.z += (tz - this.z) * Math.min(1, 10 * dt);
        let dh = Math.atan2(sg.uz, sg.ux) - this.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); this.h += dh * Math.min(1, 5 * dt);
        this.group.position.set(this.x, 0.1, this.z); this.group.rotation.y = -this.h; this.tag.position.set(this.x, 6.4, this.z);
        // olio: una chiazza dietro il tir e una davanti all'auto (con anticipo sulla traiettoria)
        this.dropT -= dt;
        if (this.dropT <= 0 && d < 140) {
          const sp = Math.hypot(player.vx, player.vz), T = 1.1 + d / 120, ax = player.x + player.vx * T, az = player.z + player.vz * T;
          this.drop(ax + rnd(-2, 2), az + rnd(-2, 2), rnd(5.5, 7.5)); this.drop(this.x - Math.cos(this.h) * 7, this.z - Math.sin(this.h) * 7, 4);
          this.dropT = sp > 5 ? rnd(1.4, 2.0) : 3; sfx.thud && sfx.thud(0.3);
        }
      }
    }
    // chiazze: durata, disegno e effetto sull'auto
    const o = this.oils; let hit = false;
    for (let i = o.length - 1; i >= 0; i--) {
      const p = o[i]; p.t -= dt; if (p.t <= 0) { o.splice(i, 1); continue; }
      if (!player.air && player.clear < 0.5 && Math.hypot(player.x - p.x, player.z - p.z) < p.r) hit = true;
    }
    for (let i = 0; i < o.length; i++) { const p = o[i], sc = p.r * Math.min(1, (11 - p.t) * 3) * Math.min(1, p.t); this.m.makeScale(sc, 1, sc); this.m.setPosition(p.x, 0.07, p.z); this.puddles.setMatrixAt(i, this.m); }
    this.puddles.count = o.length; this.puddles.instanceMatrix.needsUpdate = true;
    if (hit) { if (player.oil <= 0 && !this.told) { this.ctx.toast('Olio! Non hai più aderenza!'); this.told = true; } player.oil = 2.2; }
    if (this.state === 'off' && !o.length) this.told = false;
  }

  // Urto con il tir: è pesante, rimbalzi via.
  collide(player) {
    if (this.state !== 'on' || player.clear > 2.2) return false;
    const pf = [Math.cos(player.h), Math.sin(player.h)], tf = [Math.cos(this.h), Math.sin(this.h)];
    for (const to of [-5.5, -2.5, 0.5, 3.5, 6.5]) for (const po of [-1.4, 0, 1.4]) {
      let dx = player.x + pf[0] * po - (this.x + tf[0] * to), dz = player.z + pf[1] * po - (this.z + tf[1] * to); const d = Math.hypot(dx, dz), pen = 1.5 + 0.92 - d; if (pen <= 0) continue;
      if (d > 1e-3) { dx /= d; dz /= d; } else { dx = 0; dz = 1; }
      player.x += dx * pen; player.z += dz * pen; const vn = player.vx * dx + player.vz * dz; if (vn < 0) { player.vx -= vn * dx * 1.5; player.vz -= vn * dz * 1.5; } player.oil = Math.max(player.oil, 1.5); return 'bump';
    }
    return false;
  }
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
      { x: -5.8, y: 1.0, z: 0.55, sx: 0.12, sy: 1.5, sz: 0.1, c: DK }, { x: -5.8, y: 1.0, z: 0.55, sx: 1.5, sy: 0.12, sz: 0.1, c: DK }, { x: 2.35, y: -0.2, z: 0, sx: 0.12, sy: 0.3, sz: 0.5, c: [1.5, 1.45, 1.0] },
      { x: 0.4, y: 0.1, z: 0.92, sx: 1.1, sy: 0.9, sz: 0.04, c: [0.1, 0.16, 0.3] }, { x: 0.4, y: 0.1, z: -0.92, sx: 1.1, sy: 0.9, sz: 0.04, c: [0.1, 0.16, 0.3] }, { x: -0.3, y: 1.0, z: 0.4, sx: 0.2, sy: 0.2, sz: 0.2, c: [1.5, 0.1, 0.1] },
    ]), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.rotor = new THREE.Mesh(mergeBoxes([{ x: 0, y: 0, z: 0, sx: 10, sy: 0.07, sz: 0.5, c: DK }, { x: 0, y: 0, z: 0, sx: 0.5, sy: 0.07, sz: 10, c: DK }]), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
    this.rotor.position.y = 1.25;
    this.group = new THREE.Group(); this.group.add(this.body, this.rotor); this.group.visible = false; scene.add(this.group);
    this.tag = nameTag('MACCO', '#1f4fa3'); this.tag.visible = false; scene.add(this.tag);
    this.state = 'off'; this.cool = 0; this.t = 0; this.burst = 0; this.fireT = 4; this.ang = 0;
  }

  reset() { this.state = 'off'; this.cool = 0; this.group.visible = false; this.tag.visible = false; this.stay = false; }

  forceSpawn(player) { const a = Math.random() * 6.28; Object.assign(this, { state: 'on', t: 0, x: player.x + Math.cos(a) * 150, z: player.z + Math.sin(a) * 150, y: 40, fireT: 2.5, burst: 0, ang: a, stay: true }); this.group.visible = this.tag.visible = true; }

  update(dt, player, runT) {
    if (this.state === 'off') { this.cool -= dt; if (runT > 18 && this.cool <= 0) { // arriva da lontano
        const a = Math.random() * 6.28; Object.assign(this, { state: 'on', t: 0, x: player.x + Math.cos(a) * 230, z: player.z + Math.sin(a) * 230, y: 40, fireT: 3.5, burst: 0, ang: a });
        this.group.visible = this.tag.visible = true; this.ctx.toast('Macco, l\'elicottero, è in arrivo!'); }
      return; }
    this.t += dt; this.rotor.rotation.y += dt * 26;
    this.ang += dt * 0.4; const leaving = this.t > 42 && !this.stay;
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

// ---- COS, il gigante di 30 m che tira calci
const KICK_R = 10, WIND = 0.65, SWING = 0.16;
class Giant {
  constructor(scene, fx, ctx) {
    this.fx = fx; this.ctx = ctx;
    const SK = [0.93, 0.76, 0.62], RED = [0.78, 0.12, 0.16], BLU = [0.12, 0.22, 0.55], JEAN = [0.2, 0.27, 0.48], HAIR = [0.12, 0.09, 0.08], WH = [0.96, 0.96, 0.95], BK = [0.05, 0.05, 0.06];
    const L = new THREE.MeshLambertMaterial({ vertexColors: true });
    const torso = []; for (let i = 0; i < 5; i++) torso.push({ x: 0, y: 23.5, z: -2.8 + i * 1.4, sx: 4.2, sy: 9, sz: 1.4, c: i % 2 ? BLU : RED }); // maglia rossoblu
    this.root = new THREE.Group(); this.group = new THREE.Group(); this.group.add(this.root);
    this.root.add(new THREE.Mesh(mergeBoxes([...torso, { x: 0, y: 28.6, z: 0, sx: 3.2, sy: 1.0, sz: 3.0, c: SK }, { x: 0, y: 31.1, z: 0, sx: 3.8, sy: 4.2, sz: 3.8, c: SK }, { x: -0.1, y: 33.5, z: 0, sx: 4.0, sy: 1.2, sz: 4.0, c: HAIR },
      { x: 1.93, y: 31.7, z: 0.9, sx: 0.12, sy: 0.9, sz: 0.95, c: WH }, { x: 1.93, y: 31.7, z: -0.9, sx: 0.12, sy: 0.9, sz: 0.95, c: WH }, { x: 2.0, y: 31.6, z: 0.9, sx: 0.2, sy: 0.55, sz: 0.5, c: BK }, { x: 2.0, y: 31.6, z: -0.9, sx: 0.2, sy: 0.55, sz: 0.5, c: BK },
      { x: 1.95, y: 32.5, z: 0.9, sx: 0.25, sy: 0.25, sz: 1.3, c: HAIR, r: 0.2 }, { x: 1.95, y: 32.5, z: -0.9, sx: 0.25, sy: 0.25, sz: 1.3, c: HAIR, r: -0.2 }, { x: 2.3, y: 30.9, z: 0, sx: 0.8, sy: 0.9, sz: 0.7, c: [0.88, 0.68, 0.55] }, { x: 0, y: 19.7, z: 0, sx: 4.4, sy: 0.4, sz: 7.3, c: BK }, { x: 1.95, y: 30.1, z: 0, sx: 0.2, sy: 0.4, sz: 1.6, c: [0.6, 0.15, 0.15] }, { x: 0, y: 18.7, z: 0, sx: 4.3, sy: 1.6, sz: 7.2, c: JEAN }]), L));
    const limb = (parts, y, z) => { const g = new THREE.Group(); g.position.set(0, y, z); g.add(new THREE.Mesh(mergeBoxes(parts), L)); this.root.add(g); return g; };
    this.legL = limb([{ x: 0, y: -7, z: 0, sx: 2.8, sy: 14, sz: 2.9, c: JEAN }, { x: 1.4, y: -14.4, z: 0, sx: 5.2, sy: 1.8, sz: 3.1, c: WH }], 17.4, 1.9);
    this.legR = limb([{ x: 0, y: -7, z: 0, sx: 2.8, sy: 14, sz: 2.9, c: JEAN }, { x: 1.4, y: -14.4, z: 0, sx: 5.2, sy: 1.8, sz: 3.1, c: WH }], 17.4, -1.9);
    this.armL = limb([{ x: 0, y: -1.2, z: 0, sx: 1.8, sy: 2.4, sz: 1.8, c: RED }, { x: 0, y: -5.6, z: 0, sx: 1.5, sy: 7, sz: 1.5, c: SK }], 27.6, 3.1);
    this.armR = limb([{ x: 0, y: -1.2, z: 0, sx: 1.8, sy: 2.4, sz: 1.8, c: BLU }, { x: 0, y: -5.6, z: 0, sx: 1.5, sy: 7, sz: 1.5, c: SK }], 27.6, -3.1);
    this.group.scale.setScalar(0.94); // ~30 m in totale
    this.group.visible = false; scene.add(this.group);
    this.tag = nameTag('COS', '#6a2fb0'); this.tag.scale.set(18, 4.5, 1); this.tag.visible = false; scene.add(this.tag);
    this.state = 'off'; this.cool = 0; this.phase = 0; this.t = 0; this.kickCool = 0; this.step = 0;
    this.boss = false; this.maxHp = 8; this.hp = 0; this.hitCool = 0; this.stompCool = 0; this.bp = 1;
  }

  reset() { this.state = 'off'; this.cool = 0; this.group.visible = false; this.tag.visible = false; this.boss = false; this.root.rotation.z = 0; }

  // Boss finale: Cos compare davanti al giocatore con una barra della vita. 3 fasi: calci più rapidi + pestoni, poi Macco, poi Lucchio.
  startBoss(player) {
    const a = player.h; Object.assign(this, { state: 'walk', x: player.x + Math.cos(a) * 100, z: player.z + Math.sin(a) * 100, h: a + Math.PI, boss: true, hp: this.maxHp, kickCool: 3, stompCool: 6, hitCool: 0, bp: 1, v: 0, t: 0 });
    this.group.visible = this.tag.visible = true;
  }

  update(dt, player, runT) {
    if (this.state === 'off') {
      this.cool -= dt;
      if (runT > 30 && this.cool <= 0) { // compare davanti al giocatore, a ~230 m
        const a = player.h + rnd(-0.6, 0.6); Object.assign(this, { state: 'walk', x: player.x + Math.cos(a) * 230, z: player.z + Math.sin(a) * 230, h: a + Math.PI, kickCool: 4, phase: 0, t: 0 });
        this.group.visible = this.tag.visible = true; this.ctx.toast('Cos, il gigante, ti sta venendo a prendere!');
      }
      return;
    }
    let dx = player.x - this.x, dz = player.z - this.z, d = Math.hypot(dx, dz);
    if (this.boss) { // il boss non sparisce: se ci si allontana troppo ti raggiunge
      if (d > 360) { this.x = player.x - dx / d * 240; this.z = player.z - dz / d * 240; dx = player.x - this.x; dz = player.z - this.z; d = 240; }
      const ph = this.hp <= this.maxHp / 3 ? 3 : this.hp <= this.maxHp * 2 / 3 ? 2 : 1; if (ph !== this.bp) { this.bp = ph; this.onPhase && this.onPhase(ph); }
      this.hitCool -= dt; this.stompCool -= dt;
    } else if (d > 430) { this.reset(); this.cool = 16; return; }
    this.kickCool -= dt;
    const face = Math.atan2(dz, dx); let dh = face - this.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const fx = Math.cos(this.h), fz = Math.sin(this.h);
    let lean = 0, crouch = 0;
    if (this.state === 'walk') {
      this.h += dh * Math.min(1, 2.2 * dt);
      const want = d > 15 ? 13 + (this.boss ? (this.bp - 1) * 2 : 0) : 0; this.v = (this.v || 0) + clamp(want - (this.v || 0), -14 * dt, 8 * dt);
      this.x += fx * this.v * dt; this.z += fz * this.v * dt; this.phase += dt * (this.v || 0) / 5.5;
      const sw = Math.sin(this.phase); this.legL.rotation.z = sw * 0.55; this.legR.rotation.z = -sw * 0.55; this.armL.rotation.z = -sw * 0.5; this.armR.rotation.z = sw * 0.5;
      const st = Math.floor(this.phase / Math.PI); if (st !== this.step) { this.step = st; if (d < 300) { this.fx.shake = Math.max(this.fx.shake, clamp(0.9 - d / 330, 0, 0.9)); sfx.thud(clamp(1 - d / 250, 0.1, 1)); } }
      // inizia il calcio: bersaglio = posizione prevista dell'auto, a 8-14 m da lui
      if (this.boss && this.bp >= 2 && this.stompCool <= 0 && d < 34) { this.state = 'stompwind'; this.t = 0; this.fx.mark(this.x, this.z, 1.1, 1.7); this.ctx.toast('Pestone! Allontanati!'); }
      else if (this.kickCool <= 0 && d < 40) {
        const T = WIND + SWING, tx = player.x + player.vx * T * 0.9, tz = player.z + player.vz * T * 0.9, td = Math.hypot(tx - this.x, tz - this.z);
        if (td > 6 && td < 16) { this.state = 'wind'; this.t = 0; this.tx = tx; this.tz = tz; this.fx.mark(tx, tz, T); this.h = Math.atan2(tz - this.z, tx - this.x); this.ctx.toast('Cos sta per calciare!'); }
      }
    } else {
      this.t += dt; this.v = 0;
      if (this.state === 'wind') { const f = this.t / WIND; this.legR.rotation.z = -0.9 * f; this.legL.rotation.z = 0.2 * f; crouch = 3.4 * f; lean = -0.12 * f; this.armR.rotation.z = 0.8 * f; this.armL.rotation.z = -0.6 * f; if (this.t >= WIND) { this.state = 'swing'; this.t = 0; } }
      else if (this.state === 'swing') { const f = Math.min(1, this.t / SWING); this.legR.rotation.z = -0.9 + 1.95 * f; crouch = 3.4; lean = -0.12 + 0.3 * f; this.armR.rotation.z = 0.8 - 1.4 * f;
        if (f >= 1) { this.impact(player); this.state = 'hold'; this.t = 0; } }
      else if (this.state === 'stompwind') { const f = Math.min(1, this.t / 1.1); this.legL.rotation.z = 0.9 * f; this.legR.rotation.z = -0.2; crouch = -1.2 * f; this.armL.rotation.z = -1.1 * f; this.armR.rotation.z = -1.1 * f;
        if (f >= 1) { this.stomp(player); this.state = 'hold'; this.t = 0; this.stompCool = 5.5; } }
      else if (this.state === 'stagger') { const f = this.t / 1.3; this.legL.rotation.z = 0.5; this.legR.rotation.z = -0.5; lean = -0.3 * Math.sin(Math.min(1, f) * Math.PI); this.armL.rotation.z = -1.4; this.armR.rotation.z = -1.4; if (this.t >= 1.3) { this.state = 'walk'; } }
      else if (this.state === 'dying') { // cade all'indietro tra le esplosioni
        const f = Math.min(1, this.t / 2.6); lean = -1.55 * f * f; this.legL.rotation.z = 0.3; this.legR.rotation.z = -0.3; this.armL.rotation.z = -1.2; this.armR.rotation.z = -1.2;
        this.boomT = (this.boomT || 0) - dt; if (this.boomT <= 0) { this.boomT = 0.2; this.fx.explode(this.x + rnd(-6, 6), this.z + rnd(-6, 6), rnd(2, 20), 0.001); }
        if (this.t >= 2.8) { this.state = 'off'; this.boss = false; this.group.visible = this.tag.visible = false; this.cool = 1e9; this.ctx.onBossDown && this.ctx.onBossDown(); } }
      else if (this.state === 'hold') { this.legR.rotation.z = 1.05; crouch = 3.4 * (1 - Math.min(1, this.t / 0.5)); lean = 0.18; if (this.t >= 0.6) { this.state = 'walk'; this.kickCool = this.boss ? [2.4, 1.7, 1.1][this.bp - 1] : 2.4; } }
    }
    this.group.position.set(this.x, 0, this.z); this.group.rotation.y = -this.h; this.root.position.y = -2.1 - crouch; this.root.rotation.z = lean; this.tag.position.set(this.x, 35.5, this.z);
    this.feet = [this.legL, this.legR].map((l, i) => ({ x: this.x + fx * 13.2 * Math.sin(l.rotation.z) + (-fz) * (i ? -1.8 : 1.8), z: this.z + fz * 13.2 * Math.sin(l.rotation.z) + fx * (i ? -1.8 : 1.8) }));
  }

  // Pestone (fase 2+): onda a terra di 15 m attorno ai suoi piedi; chi è a terra nel raggio viene sbalzato.
  stomp(player) { this.fx.thump(this.x, this.z, 16); this.fx.shake = Math.max(this.fx.shake, 1.5); sfx.boom(1); if (player.clear < 2) player.blast(this.x, this.z, 15, 0.95); }

  // Il piede colpisce il punto bersaglio: onda di polvere, tutto vola via e, se l'auto è nel raggio, viene calciata lontano.
  impact(player) {
    this.fx.thump(this.tx, this.tz, KICK_R + 2); this.fx.shake = Math.max(this.fx.shake, 1.2); sfx.boom(0.9);
    const d = Math.hypot(player.x - this.tx, player.z - this.tz);
    if (d < KICK_R && player.clear < 3) {
      const ox = player.x - this.x, oz = player.z - this.z, L = Math.hypot(ox, oz) || 1; player.kick(ox / L, oz / L, 1 - 0.35 * d / KICK_R); this.ctx.onKicked && this.ctx.onKicked();
    }
  }

  // I piedi sono ostacoli. Il boss subisce danno se lo si sperona forte: >79 km/h 1, >137 km/h 2, >198 km/h 3 (il NOS!).
  collide(player) {
    if (this.state === 'off' || this.state === 'dying' || !this.feet || player.clear > 3) return false;
    for (const f of this.feet) for (const po of [-1.4, 0, 1.4]) {
      const px = player.x + Math.cos(player.h) * po, pz = player.z + Math.sin(player.h) * po; let dx = px - f.x, dz = pz - f.z; const d = Math.hypot(dx, dz), pen = 3.2 + 0.92 - d; if (pen <= 0) continue;
      if (d > 1e-3) { dx /= d; dz /= d; } else { dx = 1; dz = 0; }
      const sp = Math.hypot(player.vx, player.vz);
      if (this.boss && this.hitCool <= 0 && this.state !== 'stagger' && sp > 22) {
        const dmg = sp > 55 ? 3 : sp > 38 ? 2 : 1; this.hp = Math.max(0, this.hp - dmg); this.hitCool = 1.0; this.fx.thump(f.x, f.z, 9); this.fx.shake = Math.max(this.fx.shake, 1.4); sfx.boom(0.9);
        player.vx = dx * Math.min(26, sp * 0.6); player.vz = dz * Math.min(26, sp * 0.6); player.x += dx * pen; player.z += dz * pen;
        this.ctx.onBossHit && this.ctx.onBossHit(this.hp, this.maxHp, dmg);
        if (this.hp <= 0) { this.state = 'dying'; this.t = 0; this.boomT = 0; } else { this.state = 'stagger'; this.t = 0; }
        return true;
      }
      player.x += dx * pen; player.z += dz * pen; const vn = player.vx * dx + player.vz * dz; if (vn < 0) { player.vx -= vn * dx * 1.5; player.vz -= vn * dz * 1.5; } return true;
    }
    return false;
  }
}

export class Enemies {
  constructor(scene, world, roadIndex, ctx) {
    this.fx = new Fx(scene, ctx); this.tank = new Tank(scene, world, roadIndex, this.fx, ctx); this.truck = new Truck(scene, world, roadIndex, this.fx, ctx); this.heli = new Heli(scene, this.fx, ctx); this.giant = new Giant(scene, this.fx, ctx); this.ctx = ctx; this.t = 0; this.last = null;
    this.giant.onPhase = (ph) => { // fase 2: arriva Macco, fase 3: arriva Lucchio
      if (ph === 2) { this.heli.forceSpawn(this.last); ctx.toast('Fase 2: Macco si unisce a Cos!'); }
      if (ph === 3) { this.tank.cool = 0; this.tank.spawn(this.last); ctx.toast('Fase 3: arriva anche Lucchio!'); }
    };
  }
  reset() { this.t = 0; this.fx.reset(); this.tank.reset(); this.truck.reset(); this.heli.reset(); this.giant.reset(); this.last = null; }
  // Inizia il boss finale: sospende le apparizioni normali e fa comparire Cos con la barra della vita.
  startBoss(player) { this.reset(); this.last = player; this.t = 1e5; this.tank.cool = 1e9; this.truck.cool = 1e9; this.heli.cool = 1e9; this.giant.startBoss(player); }
  get boss() { return this.giant.boss; }
  // Posizioni dei nemici attivi (per la minimappa).
  points() { const o = []; if (this.tank.state === 'on') o.push({ x: this.tank.x, z: this.tank.z }); if (this.truck.state === 'on') o.push({ x: this.truck.x, z: this.truck.z }); if (this.heli.state === 'on') o.push({ x: this.heli.x, z: this.heli.z }); if (this.giant.state !== 'off') o.push({ x: this.giant.x, z: this.giant.z }); return o; }
  get shake() { return this.fx.shake; }
  update(dt, player) {
    this.t += dt; this.last = player; this.fx.update(dt); this.tank.update(dt, player, this.t); this.truck.update(dt, player, this.t); this.truck.collide(player); this.heli.update(dt, player, this.t); this.giant.update(dt, player, this.t); this.giant.collide(player);
    const r = this.tank.collide(player); if (r === 'ko') { this.ctx.onKo('Lucchio'); } return r;
  }
}
