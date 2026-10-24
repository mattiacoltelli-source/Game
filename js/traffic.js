import * as THREE from '../lib/three.module.min.js';
import { mergeBoxes } from './geom.js';

// Traffico e pedoni leggeri: percorrono le strade OSM seguendo i nodi condivisi; disegnati con una sola InstancedMesh ciascuno.
const DRIVE = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential']);
const WALK = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian']);
const KERB = new Set(DRIVE); // strade con marciapiede (si attraversa)
const CRUISE = { trunk: 15, primary: 13, secondary: 12, tertiary: 11, unclassified: 9, residential: 8 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

export class Graph {
  constructor(roads, accept) {
    this.roads = roads; this.ok = new Set(); this.nodes = new Map();
    const key = (x, z) => Math.round(x * 4) + ',' + Math.round(z * 4); this.key = key;
    roads.forEach((r, ri) => {
      if (!accept(r)) return; r._i = ri; this.ok.add(r);
      for (let i = 0; i < r.p.length / 2; i++) { const k = key(r.p[i * 2], r.p[i * 2 + 1]); let a = this.nodes.get(k); if (!a) this.nodes.set(k, a = []); a.push([ri, i]); }
    });
  }

  seg(ri, a, b) {
    const p = this.roads[ri].p, ax = p[a * 2], az = p[a * 2 + 1], bx = p[b * 2], bz = p[b * 2 + 1], L = Math.hypot(bx - ax, bz - az) || 0.01;
    return { ax, az, bx, bz, L, ux: (bx - ax) / L, uz: (bz - az) / L };
  }

  // Dal segmento (ri: a->b) al successivo, preferendo di proseguire dritto; inversione a U solo nei vicoli ciechi.
  next(ri, a, b) {
    const sg = this.seg(ri, a, b), p = this.roads[ri].p, list = this.nodes.get(this.key(p[b * 2], p[b * 2 + 1])) || [], cand = [];
    for (const [rj, vj] of list) {
      const q = this.roads[rj].p, n = q.length / 2;
      for (const d of [1, -1]) {
        const vn = vj + d; if (vn < 0 || vn >= n || (rj === ri && vn === a)) continue;
        const ox = q[vn * 2] - q[vj * 2], oz = q[vn * 2 + 1] - q[vj * 2 + 1], ol = Math.hypot(ox, oz) || 1, dot = sg.ux * ox / ol + sg.uz * oz / ol;
        cand.push([rj, vj, vn, dot > 0.8 ? 6 : dot > 0.3 ? 2 : dot > -0.5 ? 1 : 0.05]);
      }
    }
    if (!cand.length) return [ri, b, a];
    let tot = 0; for (const c of cand) tot += c[3]; let r = Math.random() * tot;
    for (const c of cand) { r -= c[3]; if (r <= 0) return [c[0], c[1], c[2]]; }
    return [cand[0][0], cand[0][1], cand[0][2]];
  }
}

const carGeometry = () => mergeBoxes([
  { x: 0, y: 0.65, z: 0, sx: 4.2, sy: 0.8, sz: 1.8, c: [1, 1, 1] },
  { x: -0.2, y: 1.3, z: 0, sx: 2.1, sy: 0.62, sz: 1.6, c: [0.16, 0.19, 0.24] },
  ...[[1.35, 0.95], [1.35, -0.95], [-1.35, 0.95], [-1.35, -0.95]].map(([x, z]) => ({ x, y: 0.35, z, sx: 0.72, sy: 0.7, sz: 0.3, c: [0.06, 0.06, 0.07] })),
]);
// Tipi di veicolo: geometria, lunghezza, raggio di collisione, centri dei cerchi di collisione e fattore di velocità.
const G = [0.07, 0.07, 0.08], GL = [0.18, 0.22, 0.28], W1 = [1, 1, 1];
const wheels = (xs, z, r = 0.35, w = 0.3) => xs.flatMap((x) => [{ x, y: r, z, sx: r * 2, sy: r * 2, sz: w, c: G }, { x, y: r, z: -z, sx: r * 2, sy: r * 2, sz: w, c: G }]);
const hatchGeo = () => mergeBoxes([{ x: 0, y: 0.65, z: 0, sx: 3.5, sy: 0.8, sz: 1.7, c: W1 }, { x: -0.25, y: 1.3, z: 0, sx: 2.0, sy: 0.7, sz: 1.55, c: GL }, ...wheels([1.1, -1.1], 0.9)]);
const vanGeo = () => mergeBoxes([{ x: -0.3, y: 1.45, z: 0, sx: 3.8, sy: 1.9, sz: 1.95, c: W1 }, { x: 2.0, y: 0.85, z: 0, sx: 1.5, sy: 1.0, sz: 1.9, c: W1 }, { x: 1.7, y: 1.55, z: 0, sx: 0.9, sy: 0.7, sz: 1.8, c: GL }, ...wheels([1.7, -1.5], 0.95, 0.4)]);
const RED = [0.78, 0.12, 0.14], CREAM = [0.93, 0.9, 0.82];
const busGeo = () => mergeBoxes([{ x: 0, y: 1.8, z: 0, sx: 11, sy: 2.5, sz: 2.5, c: RED }, { x: 0, y: 1.0, z: 0, sx: 11.02, sy: 0.5, sz: 2.52, c: CREAM }, { x: 0, y: 2.45, z: 0, sx: 10.6, sy: 0.8, sz: 2.54, c: GL }, { x: 0, y: 3.15, z: 0, sx: 10.6, sy: 0.12, sz: 2.3, c: CREAM }, { x: 5.55, y: 1.9, z: 0, sx: 0.12, sy: 1.6, sz: 2.3, c: GL }, ...wheels([3.6, -3.4], 1.25, 0.5, 0.35)]);
const boxTruckGeo = () => mergeBoxes([{ x: -1.4, y: 1.9, z: 0, sx: 5.2, sy: 2.6, sz: 2.3, c: [0.92, 0.92, 0.9] }, { x: 1.9, y: 1.1, z: 0, sx: 1.8, sy: 1.5, sz: 2.2, c: [0.15, 0.3, 0.55] }, { x: 2.1, y: 1.7, z: 0, sx: 1.2, sy: 0.7, sz: 2.0, c: GL }, { x: -1.4, y: 3.1, z: 0, sx: 5.1, sy: 0.1, sz: 2.2, c: [0.7, 0.7, 0.72] }, ...wheels([1.9, -0.8, -2.6], 1.15, 0.45, 0.35)]);
const scooterGeo = () => mergeBoxes([{ x: 0, y: 0.4, z: 0, sx: 1.4, sy: 0.3, sz: 0.4, c: [0.75, 0.15, 0.12] }, { x: 0.55, y: 0.85, z: 0, sx: 0.12, sy: 0.7, sz: 0.55, c: G }, { x: -0.3, y: 1.1, z: 0, sx: 0.4, sy: 0.7, sz: 0.5, c: [0.2, 0.25, 0.5] }, { x: -0.3, y: 1.6, z: 0, sx: 0.3, sy: 0.3, sz: 0.3, c: [0.93, 0.78, 0.65] }, { x: -0.3, y: 1.8, z: 0, sx: 0.34, sy: 0.14, sz: 0.34, c: G }, ...wheels([0.6, -0.6], 0, 0.2, 0.12)]);
const TYPES = {
  car: { geo: carGeometry, len: 4.2, r: 1.05, offs: [-1.2, 1.2], spd: 1, tint: true, w: 62 },
  hatch: { geo: hatchGeo, len: 3.5, r: 1.0, offs: [-0.8, 0.8], spd: 1.05, tint: true, w: 12 },
  van: { geo: vanGeo, len: 5.4, r: 1.15, offs: [-1.6, 1.4], spd: 0.95, tint: true, w: 9 },
  bus: { geo: busGeo, len: 11, r: 1.4, offs: [-4, 0, 4], spd: 0.85, tint: false, w: 6 },
  truck: { geo: boxTruckGeo, len: 7, r: 1.3, offs: [-2.4, 0, 2.2], spd: 0.9, tint: false, w: 5 },
  scooter: { geo: scooterGeo, len: 1.6, r: 0.6, offs: [0], spd: 1.15, tint: false, w: 6 },
};
const TYPE_KEYS = Object.keys(TYPES), TYPE_W = TYPE_KEYS.reduce((a, k) => a + TYPES[k].w, 0);
const pickType = () => { let r = Math.random() * TYPE_W; for (const k of TYPE_KEYS) { r -= TYPES[k].w; if (r <= 0) return k; } return 'car'; };
const CAR_COLORS = [0xe8e8e8, 0xc9ccd1, 0x2b2d33, 0xb23a3a, 0x3d5a8a, 0x5a7a52, 0xcdb98a, 0x8a8f99, 0xd9d4c4];

export class Traffic {
  constructor(scene, world, roadIndex, props, max = 16) {
    this.world = world; this.ri = roadIndex; this.props = props; this.max = max; this.cars = []; this.t = 0;
    this.g = new Graph(world.roads, (r) => DRIVE.has(r.c) && !r.n.includes('Matteotti') && r.w >= 5);
    this.meshes = {}; const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const k of TYPE_KEYS) { const m = new THREE.InstancedMesh(TYPES[k].geo(), mat, 32); m.frustumCulled = false; m.count = 0; scene.add(m); this.meshes[k] = m; }
  }

  reset() { this.cars.length = 0; for (const k of TYPE_KEYS) this.meshes[k].count = 0; }

  fill(player) { for (let i = 0; i < this.max * 3 && this.cars.length < this.max; i++) this.spawn(player, 60, 300); }

  spawn(player, rmin = 170, rmax = 300) {
    let pick = null, n = 0;
    this.ri.segmentsNear(player.x, player.z, rmax, (r, i) => {
      if (!this.g.ok.has(r)) return;
      const p = r.p, mx = (p[i * 2] + p[i * 2 + 2]) / 2, mz = (p[i * 2 + 1] + p[i * 2 + 3]) / 2, d = Math.hypot(mx - player.x, mz - player.z);
      if (d < rmin || d > rmax) return; if (++n * Math.random() < 1) pick = [r, i];
    });
    if (!pick) return;
    const [r, i] = pick, d = Math.random() < 0.5 ? 1 : -1, a = d > 0 ? i : i + 1, b = d > 0 ? i + 1 : i, sg = this.g.seg(r._i, a, b), s = Math.random() * sg.L;
    const lane = Math.min(2.3, r.w * 0.27), x = sg.ax + sg.ux * s - sg.uz * lane, z = sg.az + sg.uz * s + sg.ux * lane;
    for (const o of this.cars) if (Math.hypot(o.x - x, o.z - z) < 12) return;
    const type = pickType(), T = TYPES[type];
    this.cars.push({ type, ri: r._i, a, b, s, x, z, h: Math.atan2(sg.uz, sg.ux), spd: 0, cruise: (CRUISE[r.c] || 8) * rnd(0.8, 1.2) * T.spd, offx: 0, offz: 0, still: 0, col: new THREE.Color(T.tint ? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)] : 0xffffff), nxt: null });
  }

  update(dt, player) {
    this.t -= dt; if (this.t <= 0 && this.cars.length < this.max) { this.spawn(player); this.t = 0.2; }
    const cars = this.cars;
    for (let k = cars.length - 1; k >= 0; k--) {
      const c = cars[k], dp = Math.hypot(c.x - player.x, c.z - player.z);
      if (c.fixed) { c.ttl -= dt; c.cool = Math.max(0, (c.cool || 0) - dt); c.offx += (c.sx || 0) * dt; c.offz += (c.sz || 0) * dt; const dk = Math.exp(-2.2 * dt); c.sx = (c.sx || 0) * dk; c.sz = (c.sz || 0) * dk; c.spd = 0; if (c.ttl <= 0 || dp > 380) cars.splice(k, 1); continue; } // veicolo fermo di un evento
      if (dp > 380 || (c.still > 6 && dp > 30)) { cars.splice(k, 1); continue; }
      let sg = this.g.seg(c.ri, c.a, c.b), lim = c.cruise;
      const hx = Math.cos(c.h), hz = Math.sin(c.h);
      const lead = (x, z, v) => { const dx = x - c.x, dz = z - c.z, f = dx * hx + dz * hz, l = Math.abs(-dx * hz + dz * hx); if (f > 0 && f < 22 && l < 2.2) { const gap = f - (TYPES[c.type].len / 2 + 2.1); lim = Math.min(lim, gap < 1.5 ? 0 : Math.max(0, v * 0.9 + (gap - 2) * 0.8)); } };
      for (const o of cars) if (o !== c) lead(o.x, o.z, o.spd);
      lead(player.x, player.z, Math.max(0, player.vx * hx + player.vz * hz));
      if (this.props) for (const q of this.props.circles) if (Math.abs(q.x - c.x) < 20 && Math.abs(q.z - c.z) < 20) lead(q.x, q.z, 0);
      if (this.lights && this.lights.heads) { // semafori: si ferma alla linea di stop se è rosso (o giallo e c'è spazio per frenare)
        for (const h of this.lights.heads) { if (Math.abs(h.nx - c.x) > 40 || Math.abs(h.nz - c.z) > 40) continue; const s = (c.x - h.nx) * h.ax + (c.z - h.nz) * h.az, lat = Math.abs(-(c.x - h.nx) * h.az + (c.z - h.nz) * h.ax); const toward = hx * -h.ax + hz * -h.az;
          if (toward > 0.8 && lat < 5 && s > 8.5 && s < 30) { const st = this.lights.state(h); if (st === 0 || (st === 1 && s > 16)) { lim = Math.min(lim, Math.max(0, (s - 10.5)) * 0.9); break; } } }
      }
      const rem = sg.L - c.s;
      if (rem < 14) { if (!c.nxt) c.nxt = this.g.next(c.ri, c.a, c.b); const s2 = this.g.seg(c.nxt[0], c.nxt[1], c.nxt[2]), turn = Math.acos(clamp(sg.ux * s2.ux + sg.uz * s2.uz, -1, 1)); lim = Math.min(lim, turn > 1.0 ? 4 : turn > 0.5 ? 6.5 : turn > 0.25 ? 9 : lim); }
      c.spd += clamp(lim - c.spd, -10 * dt, 3.5 * dt); c.s += c.spd * dt;
      c.still = c.spd < 0.3 ? c.still + dt : 0;
      while (c.s >= sg.L) { c.s -= sg.L; const n = c.nxt || this.g.next(c.ri, c.a, c.b); c.ri = n[0]; c.a = n[1]; c.b = n[2]; c.nxt = null; sg = this.g.seg(c.ri, c.a, c.b); }
      const lane = Math.min(2.3, this.g.roads[c.ri].w * 0.27), tx = sg.ax + sg.ux * c.s - sg.uz * lane, tz = sg.az + sg.uz * c.s + sg.ux * lane, k2 = Math.min(1, 9 * dt);
      c.x += (tx - c.x) * k2; c.z += (tz - c.z) * k2;
      let dh = Math.atan2(sg.uz, sg.ux) - c.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); c.h += dh * Math.min(1, 7 * dt);
      c.cool = Math.max(0, (c.cool || 0) - dt);
      c.offx += (c.sx || 0) * dt; c.offz += (c.sz || 0) * dt; const dk = Math.exp(-2.2 * dt); c.sx = (c.sx || 0) * dk; c.sz = (c.sz || 0) * dk;
      c.offx *= Math.exp(-1.2 * dt); c.offz *= Math.exp(-1.2 * dt);
    }
    this.draw();
  }

  // Urti col giocatore: separazione, il giocatore perde velocità, l'auto rallenta e viene spinta di lato. Ritorna l'intensità (0 = nessun urto).
  collide(player) {
    if (player.clear > 1.6) return 0;
    const pf = [Math.cos(player.h), Math.sin(player.h)]; let worst = 0;
    for (const c of this.cars) {
      if (Math.hypot(c.x - player.x, c.z - player.z) > 10) continue;
      const cx = Math.cos(c.h), cz = Math.sin(c.h), ax = c.x + c.offx, az = c.z + c.offz;
      const T = TYPES[c.type]; for (const ao of T.offs) for (const po of [-1.4, 0, 1.4]) {
        const qx = ax + cx * ao, qz = az + cz * ao, px = player.x + pf[0] * po, pz = player.z + pf[1] * po;
        let dx = px - qx, dz = pz - qz; const d = Math.hypot(dx, dz), pen = T.r + 0.92 - d; if (pen <= 0) continue;
        if (d < 1e-4) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
        player.x += dx * pen * 0.55; player.z += dz * pen * 0.55; c.offx -= dx * pen * 0.45; c.offz -= dz * pen * 0.45;
        const vrel = (player.vx - c.spd * cx) * dx + (player.vz - c.spd * cz) * dz;
        if (vrel < 0 && !(c.cool > 0)) { // un solo impatto ogni 0.35 s: il giocatore perde ~40%, l'auto viene spinta via
          const j = -vrel * 0.4; player.vx += dx * j; player.vz += dz * j; c.spd = Math.max(0, c.spd * 0.3); c.sx = -dx * -vrel * 0.45; c.sz = -dz * -vrel * 0.45; c.cool = 0.35; worst = Math.max(worst, -vrel);
        }
      }
    }
    return worst;
  }

  draw() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3(), n = {};
    for (const k of TYPE_KEYS) n[k] = 0;
    for (const c of this.cars) { const k = c.type, i = n[k]++; if (i >= 32) { n[k] = 32; continue; } e.set(0, -c.h, 0); q.setFromEuler(e); pos.set(c.x + c.offx, 0.18, c.z + c.offz); m.compose(pos, q, sc); this.meshes[k].setMatrixAt(i, m); this.meshes[k].setColorAt(i, c.col); }
    for (const k of TYPE_KEYS) { const mm = this.meshes[k]; mm.count = n[k]; mm.instanceMatrix.needsUpdate = true; if (mm.instanceColor) mm.instanceColor.needsUpdate = true; }
  }
}

const pedGeometry = () => mergeBoxes([
  { x: 0, y: 0.42, z: 0, sx: 0.3, sy: 0.84, sz: 0.34, c: [0.15, 0.17, 0.25] },
  { x: 0, y: 1.17, z: 0, sx: 0.42, sy: 0.7, sz: 0.5, c: [1, 1, 1] },
  { x: 0, y: 1.7, z: 0, sx: 0.26, sy: 0.28, sz: 0.26, c: [0.93, 0.78, 0.65] },
]);
const PED_COLORS = [0xd9534f, 0x4f8fd9, 0xf0c24b, 0x5cb85c, 0xe8e8e8, 0x8e6bbf, 0xe98a3d, 0x3d3d46];

export class Pedestrians {
  constructor(scene, world, roadIndex, max = 34) {
    this.ri = roadIndex; this.max = max; this.peds = []; this.t = 0; this.world = world;
    this.g = new Graph(world.roads, (r) => WALK.has(r.c) && !r.n.includes('Matteotti'));
    this.mesh = new THREE.InstancedMesh(pedGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), 80);
    this.mesh.frustumCulled = false; this.mesh.count = 0; scene.add(this.mesh); this.time = 0; this.hit = 0;
  }

  reset() { this.peds.length = 0; this.mesh.count = 0; }
  fill(player) { for (let i = 0; i < this.max * 3 && this.peds.length < this.max; i++) this.spawn(player, 20, 200); }

  offset(p, r) { return p.lat != null ? p.lat : p.side * (r.w * 0.55 + 0.75); } // marciapiede o zona pedonale

  spawn(player, rmin = 40, rmax = 200) {
    let pick = null, n = 0;
    this.ri.segmentsNear(player.x, player.z, rmax, (r, i) => {
      if (!this.g.ok.has(r)) return;
      const p = r.p, mx = (p[i * 2] + p[i * 2 + 2]) / 2, mz = (p[i * 2 + 1] + p[i * 2 + 3]) / 2, d = Math.hypot(mx - player.x, mz - player.z);
      if (d < rmin || d > rmax) return; const wgt = r.c === 'pedestrian' ? 3 : 1; n += wgt; if (Math.random() * n < wgt) pick = [r, i];
    });
    if (!pick) return;
    const [r, i] = pick, d = Math.random() < 0.5 ? 1 : -1, a = d > 0 ? i : i + 1, b = d > 0 ? i + 1 : i, sg = this.g.seg(r._i, a, b);
    const ped = { ri: r._i, a, b, s: Math.random() * sg.L, spd: rnd(1.1, 1.6), side: Math.random() < 0.5 ? 1 : -1, mode: 'walk', x: 0, z: 0, y: 0, h: 0, col: new THREE.Color(PED_COLORS[Math.floor(Math.random() * PED_COLORS.length)]), ph: Math.random() * 6, q: 0, fly: null, wait: 0 };
    if (r.c === 'pedestrian' || r.c === 'living_street') ped.lat = rnd(-2, 2);
    else if (KERB.has(r.c) && Math.random() < 0.4) { ped.mode = 'wait'; ped.wait = rnd(0, 3); ped.spd = 1.5; }
    ped.q = this.offset(ped, r); this.place(ped, sg); this.peds.push(ped);
  }

  // Corteo: n pedestri che camminano insieme sulla carreggiata (solo metà strada) lungo il segmento (r, i).
  crowd(r, i, n, fromS) {
    const sg = this.g.seg(r._i, i, i + 1), side = Math.random() < 0.5 ? 1 : -1, list = [];
    for (let k = 0; k < n && this.peds.length < 78; k++) {
      const ped = { ri: r._i, a: i, b: i + 1, s: Math.min(sg.L - 1, fromS + (k % 8) * 1.3 + rnd(-0.4, 0.4)), spd: rnd(1.0, 1.25), side, mode: 'walk', parade: true, lat: side * rnd(0.6, Math.max(1, r.w / 2 - 0.9)), x: 0, z: 0, y: 0, h: 0, col: new THREE.Color(PED_COLORS[Math.floor(Math.random() * PED_COLORS.length)]), ph: Math.random() * 6 };
      ped.q = ped.lat; this.place(ped, sg); this.peds.push(ped); list.push(ped);
    }
    return list;
  }

  place(p, sg) {
    p.x = sg.ax + sg.ux * p.s - sg.uz * p.q; p.z = sg.az + sg.uz * p.s + sg.ux * p.q;
    const k = p.mode === 'cross' ? Math.sign(p.target - p.q) : 0; // attraversando: di fianco alla strada
    p.h = k ? Math.atan2(sg.ux * k, -sg.uz * k) : Math.atan2(sg.uz, sg.ux);
  }

  update(dt, player) {
    this.time += dt; this.t -= dt; if (this.t <= 0 && this.peds.length < this.max) { this.spawn(player); this.t = 0.3; }
    for (let k = this.peds.length - 1; k >= 0; k--) {
      const p = this.peds[k], dp = Math.hypot(p.x - player.x, p.z - player.z);
      if (dp > 260 || (p.fly && p.fly.t > 1.4)) { this.peds.splice(k, 1); continue; }
      if (p.fly) { const f = p.fly; f.t += dt; f.vy -= 18 * dt; p.x += f.vx * dt; p.z += f.vz * dt; p.y = Math.max(0, p.y + f.vy * dt); if (p.y === 0) { f.vx *= 0.9; f.vz *= 0.9; f.vy = 0; } p.spin = (p.spin || 0) + dt * 9; continue; }
      let sg = this.g.seg(p.ri, p.a, p.b); const r = this.g.roads[p.ri];
      // auto in arrivo: si aspetta al marciapiede
      const sp = Math.hypot(player.vx, player.vz), toP = (p.x - player.x) * player.vx + (p.z - player.z) * player.vz, danger = dp < 45 && sp > 5 && toP > 0;
      if (p.mode === 'wait') { p.wait -= dt; if (p.wait <= 0 && !danger) { p.mode = 'cross'; p.target = -p.side * (r.w * 0.55 + 0.75); } }
      else if (p.mode === 'cross') {
        const dir = Math.sign(p.target - p.q), onRoad = Math.abs(p.q) < r.w * 0.5 + 0.2;
        p.q += dir * (danger && onRoad ? 2.6 : 1.5) * dt;
        if ((p.target - p.q) * dir <= 0) { p.q = p.target; p.side = -p.side; p.mode = 'walk'; }
      } else { p.s += p.spd * dt; while (p.s >= sg.L) { p.s -= sg.L; const n = this.g.next(p.ri, p.a, p.b); p.ri = n[0]; p.a = n[1]; p.b = n[2]; sg = this.g.seg(p.ri, p.a, p.b); const r2 = this.g.roads[p.ri]; if (r2.c === 'pedestrian' || r2.c === 'living_street') { p.lat = p.lat != null ? p.lat : rnd(-2, 2); p.q = p.lat; } else { p.lat = null; p.q = p.side * (r2.w * 0.55 + 0.75); } } }
      this.place(p, sg);
    }
    this.draw();
  }

  // Investimento: il pedone vola via; l'auto rallenta appena. Ritorna true se ne ha colpito almeno uno.
  collide(player) {
    if (player.clear > 1.2) return false; let hit = false;
    const pf = [Math.cos(player.h), Math.sin(player.h)];
    for (const p of this.peds) {
      if (p.fly || Math.hypot(p.x - player.x, p.z - player.z) > 4) continue;
      for (const po of [-1.4, 0, 1.4]) {
        if (Math.hypot(p.x - (player.x + pf[0] * po), p.z - (player.z + pf[1] * po)) < 1.3 && Math.hypot(player.vx, player.vz) > 2) {
          p.fly = { t: 0, vx: player.vx * 0.7 + rnd(-1, 1), vz: player.vz * 0.7 + rnd(-1, 1), vy: 6 + Math.random() * 3 }; player.vx *= 0.94; player.vz *= 0.94; hit = true; break;
        }
      }
    }
    return hit;
  }

  draw() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
    this.peds.forEach((p, i) => {
      const walking = !p.fly && p.mode !== 'wait', bob = walking ? Math.abs(Math.sin(this.time * 8 + p.ph)) * 0.06 : 0;
      e.set(p.fly ? (p.spin || 0) : 0, -p.h, p.fly ? Math.PI / 2 * Math.min(1, p.fly.t * 2) : Math.sin(this.time * 8 + p.ph) * (walking ? 0.05 : 0), 'YXZ'); q.setFromEuler(e);
      pos.set(p.x, 0.12 + p.y + bob, p.z); m.compose(pos, q, sc); this.mesh.setMatrixAt(i, m); this.mesh.setColorAt(i, p.col);
    });
    this.mesh.count = this.peds.length; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
