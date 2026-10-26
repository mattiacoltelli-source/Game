// Modalità Sparatutto: arena a piedi tra Piazza Maggiore, Santo Stefano, Piazza Malpighi, Via Ugo Bassi, Via Rizzoli e Via dell'Indipendenza.
// Ondate di nemici, 5 armi, granate, mezzi guidabili (taxi con mitragliatrice, blindato col cannone). Mira automatica: pensata per il touch.
import * as THREE from '../lib/three.module.min.js';
import { mergeBoxes } from './geom.js';
import { Car } from './car.js';
import { sfx } from './sfx.js';

export const ARENA = [-870, 270, -70, 990]; // x0, z0, x1, z1 (m)
const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FS = 1.4; // gli omini sono un po' più grandi del vero: leggibili dall'alto
const BEST_KEY = 'taxi-bologna:shoot-best';

const WEAPONS = {
  pistola: { name: 'PISTOLA', rate: 3.6, dmg: 1, speed: 58, range: 34, spread: 0.03, ammo: Infinity, col: 0xffe27a },
  mitra: { name: 'MITRA', rate: 12, dmg: 1, speed: 62, range: 36, spread: 0.08, ammo: 160, col: 0xffd03a },
  pompa: { name: 'POMPA', rate: 1.5, dmg: 1.5, speed: 50, range: 20, spread: 0.32, pellets: 7, ammo: 28, col: 0xff9a3a },
  razzi: { name: 'RAZZI', rate: 1.3, dmg: 0, speed: 30, range: 46, spread: 0.01, ammo: 14, col: 0xff5a3a, rocket: true },
  laser: { name: 'LASER', rate: 14, dmg: 0.8, range: 34, ammo: 240, col: 0x4fe6ff, beam: true },
};
const ORDER = ['pistola', 'mitra', 'pompa', 'razzi', 'laser'];
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

const ET = {
  grunt: { hp: 3, spd: 6.2, r: 0.5, s: 1, score: 10, dmg: 8, shirt: [0.78, 0.16, 0.14], pants: [0.14, 0.14, 0.2], skin: [0.88, 0.68, 0.52], hat: [0.78, 0.16, 0.14] },
  shooter: { hp: 4, spd: 4.4, r: 0.5, s: 1, score: 25, dmg: 0, ranged: true, shirt: [0.12, 0.3, 0.2], pants: [0.1, 0.12, 0.1], skin: [0.8, 0.6, 0.46], hat: [0.1, 0.1, 0.1] },
  heavy: { hp: 22, spd: 3.5, r: 0.95, s: 1.7, score: 80, dmg: 22, shirt: [0.4, 0.42, 0.46], pants: [0.2, 0.2, 0.24], skin: [0.8, 0.6, 0.46], hat: [0.3, 0.3, 0.34] },
  boss: { hp: 150, spd: 4.8, r: 2.1, s: 3.7, score: 500, dmg: 35, shirt: [0.55, 0.15, 0.62], pants: [0.2, 0.15, 0.3], skin: [0.85, 0.62, 0.48], hat: [1.1, 0.8, 0.1] },
};

// omino low-poly che guarda verso +x (origine ai piedi)
function figure(o, gun = [0.1, 0.1, 0.12]) {
  const g = mergeBoxes([
    { x: 0, y: 0.42, z: -0.13, sx: 0.22, sy: 0.84, sz: 0.2, c: o.pants }, { x: 0, y: 0.42, z: 0.13, sx: 0.22, sy: 0.84, sz: 0.2, c: o.pants },
    { x: 0, y: 1.14, z: 0, sx: 0.36, sy: 0.6, sz: 0.62, c: o.shirt }, { x: 0.04, y: 1.6, z: 0, sx: 0.3, sy: 0.3, sz: 0.3, c: o.skin }, { x: 0.04, y: 1.8, z: 0, sx: 0.34, sy: 0.11, sz: 0.34, c: o.hat },
    { x: 0.3, y: 1.18, z: -0.38, sx: 0.5, sy: 0.14, sz: 0.14, c: o.shirt }, { x: 0.3, y: 1.18, z: 0.38, sx: 0.5, sy: 0.14, sz: 0.14, c: o.shirt },
    { x: 0.62, y: 1.2, z: 0.05, sx: 0.7, sy: 0.12, sz: 0.1, c: gun },
  ]);
  return g;
}
function bigFigure(o) { // pesante / boss: spalle larghe
  const g = figure(o, [0.2, 0.2, 0.22]); const e = mergeBoxes([{ x: 0, y: 1.42, z: 0, sx: 0.42, sy: 0.16, sz: 0.96, c: o.hat }, { x: -0.22, y: 1.16, z: 0, sx: 0.16, sy: 0.55, sz: 0.5, c: o.pants }]);
  return mergeGeoms([g, e]);
}
function mergeGeoms(gs) {
  const P = [], N = [], C = [];
  for (const g of gs) { P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); C.push(...g.attributes.color.array); }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); m.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); return m;
}

function buildTank() { // blindato: scafo, cingoli, torretta girevole, cannone (guarda +x)
  const O = [0.34, 0.4, 0.26], O2 = [0.26, 0.31, 0.2], D = [0.1, 0.1, 0.11], Y = [1.2, 0.9, 0.2];
  const hull = mergeBoxes([
    { x: 0, y: 0.75, z: 0, sx: 4.4, sy: 0.9, sz: 2.2, c: O }, { x: 1.9, y: 0.7, z: 0, sx: 0.9, sy: 0.7, sz: 2.0, c: O2 }, { x: 0, y: 0.3, z: 1.2, sx: 4.6, sy: 0.6, sz: 0.55, c: D }, { x: 0, y: 0.3, z: -1.2, sx: 4.6, sy: 0.6, sz: 0.55, c: D },
    { x: -2.2, y: 0.8, z: 0, sx: 0.2, sy: 0.5, sz: 1.8, c: D }, { x: 0.4, y: 1.25, z: 0.9, sx: 0.5, sy: 0.12, sz: 0.2, c: Y },
  ]);
  const tur = mergeBoxes([{ x: 0, y: 1.5, z: 0, sx: 2.0, sy: 0.7, sz: 1.8, c: O2 }, { x: 1.9, y: 1.55, z: 0, sx: 2.2, sy: 0.22, sz: 0.24, c: D }, { x: -0.6, y: 1.95, z: 0.3, sx: 0.5, sy: 0.3, sz: 0.5, c: O }, { x: 0.7, y: 1.5, z: 0, sx: 0.4, sy: 0.4, sz: 0.5, c: D }]);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true }), outer = new THREE.Group(), inner = new THREE.Group(), turret = new THREE.Mesh(tur, mat);
  inner.add(new THREE.Mesh(hull, mat), turret); outer.add(inner); return { outer, turret };
}

export class Shooter {
  constructor(ctx) {
    this.c = ctx; const { scene } = ctx; this.scene = scene; this.active = false; this.driving = null; this.shake = 0;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    // eroe: busto + due gambe che oscillano
    const hc = { shirt: [1.15, 0.85, 0.15], pants: [0.14, 0.17, 0.24], skin: [0.88, 0.68, 0.52], hat: [1.15, 0.85, 0.15] };
    const full = figure(hc, [0.08, 0.08, 0.1]); full.scale(FS, FS, FS); this.hero = new THREE.Group(); this.hero.add(new THREE.Mesh(full, mat)); scene.add(this.hero); this.hero.visible = false;
    this.heroMesh = this.hero.children[0];
    // nemici istanziati (uno per tipo)
    this.em = {};
    for (const k of Object.keys(ET)) {
      const geo = k === 'heavy' || k === 'boss' ? bigFigure(ET[k]) : figure(ET[k]); geo.scale(ET[k].s * FS, ET[k].s * FS, ET[k].s * FS);
      const im = new THREE.InstancedMesh(geo, mat, k === 'boss' ? 2 : 80); im.count = 0; im.frustumCulled = false; im.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(im); this.em[k] = im;
    }
    // proiettili (scatole luminose, un solo mesh) e pickup
    const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff }), 260); bm.count = 0; bm.frustumCulled = false; bm.setColorAt(0, new THREE.Color(1, 1, 1)); bm.renderOrder = 5; scene.add(bm); this.bm = bm;
    const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff }), 40); pm.count = 0; pm.frustumCulled = false; pm.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(pm); this.pm = pm;
    this.beam = new THREE.Mesh(new THREE.BoxGeometry(1, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: 0x4fe6ff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false })); this.beam.visible = false; scene.add(this.beam);
    this.rings = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc060, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })); m.visible = false; m.userData = { t: 1, R: 1 }; scene.add(m); return m; }); this.ringI = 0;
    // blindato
    const tk = buildTank(); this.tankModel = tk; scene.add(tk.outer); tk.outer.visible = false; this.tankCar = new Car();
    this.vehicles = [{ id: 'taxi', car: ctx.car, model: ctx.taxi.outer, hp: 100, max: 100, alive: false }, { id: 'tank', car: this.tankCar, model: tk.outer, hp: 260, max: 260, alive: false, cd: 0 }];
    this.proxy = { x: 0, z: 0, y: 0, h: 0, vx: 0, vz: 0, speed: 0, boost: 0, level: 0, charges: 0, damage: 0, thrusting: false, contact: 0, air: false, landed: 0, oil: 0, grass: false, clear: 0, slow: 0, steer: 0, lat: 0, drift: 0, canFly: false, fuel: 0 };
    this.hold = { fire: false }; this.mv = { x: 0, z: 0 }; this.autoFire = true;
    this.bindUI(); this.reset();
  }

  bindUI() {
    const joy = $('joy'), knob = $('joy-knob'); let pid = null, ox = 0, oy = 0; const R = 48;
    const setK = (x, y) => { const r = joy.getBoundingClientRect(); knob.style.left = (x - r.left) + 'px'; knob.style.top = (y - r.top) + 'px'; };
    joy.addEventListener('pointerdown', (e) => { e.preventDefault(); joy.setPointerCapture(e.pointerId); pid = e.pointerId; ox = e.clientX; oy = e.clientY; knob.style.display = 'block'; setK(ox, oy); });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return; let dx = e.clientX - ox, dy = e.clientY - oy; const L = Math.hypot(dx, dy);
      if (L > R) { ox += dx / L * (L - R); oy += dy / L * (L - R); dx = e.clientX - ox; dy = e.clientY - oy; } // joystick "flottante": segue il dito
      const l = Math.hypot(dx, dy) / R; this.mv.x = l > 0.12 ? dx / R : 0; this.mv.z = l > 0.12 ? dy / R : 0; setK(ox + dx, oy + dy);
    });
    const up = (e) => { if (e.pointerId !== pid) return; pid = null; this.mv.x = this.mv.z = 0; knob.style.display = 'none'; };
    joy.addEventListener('pointerup', up); joy.addEventListener('pointercancel', up); joy.addEventListener('lostpointercapture', up);
    for (const el of document.querySelectorAll('[data-s]')) {
      const n = el.dataset.s, pts = new Set();
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); pts.add(e.pointerId); el.classList.add('on'); if (n === 'fire') this.hold.fire = true; else if (n === 'gren') this.wantGren = true; else if (n === 'wpn') this.wantWpn = true; else if (n === 'veh') this.wantVeh = true; });
      const rel = (e) => { pts.delete(e.pointerId); if (!pts.size) { el.classList.remove('on'); if (n === 'fire') this.hold.fire = false; } };
      el.addEventListener('pointerup', rel); el.addEventListener('pointercancel', rel); el.addEventListener('lostpointercapture', rel); el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    addEventListener('keydown', (e) => { if (!this.active || e.repeat) return; if (e.code === 'KeyK') this.wantGren = true; else if (e.code === 'KeyE') this.wantVeh = true; else if (e.code === 'KeyQ') this.wantWpn = true; });
    $('c').addEventListener('pointerdown', (e) => { if (this.active && e.pointerType === 'mouse') this.hold.mouse = true; }); addEventListener('pointerup', () => { this.hold.mouse = false; });
  }

  reset() {
    this.enemies = []; this.corpses = []; this.bul = []; this.items = []; this.queue = []; this.wave = 0; this.waveWait = 0; this.score = 0; this.kills = 0; this.combo = 0; this.comboT = 0;
    this.hp = 100; this.cd = 0; this.gren = 3; this.weapon = 'pistola'; this.ammo = { pistola: Infinity }; this.hx = 0; this.hz = 0; this.hh = 0; this.step = 0; this.hurtT = 0; this.over = false; this.beamT = 0; this.lastHint = 0;
    this.wantGren = this.wantVeh = this.wantWpn = false; this.driving = null; this.cx = this.cz = undefined; this.spawnCache = null; this.shake = 0; this.t = 0;
    for (const r of this.rings) { r.visible = false; r.userData.t = 1; }
  }

  // ---------- avvio / fine
  start(pos) {
    this.reset(); this.active = true; const { world, roads, col } = this.c;
    const free = (x, z) => !col.push(x, z, 0.7), ok = (x, z) => free(x, z) && x > ARENA[0] && x < ARENA[2] && z > ARENA[1] && z < ARENA[3];
    let p = { x: pos.x, z: pos.z }; if (!ok(p.x, p.z)) { const q = roads.nearest(p.x, p.z, ok); if (q) p = q; }
    this.hx = p.x; this.hz = p.z; this.hh = -Math.PI / 2; this.hero.visible = true;
    // taxi accanto all'eroe, blindato poco più in là sulla strada
    const side = (v, d, a) => { const q = roads.nearest(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, (x, z) => !col.push(x, z, 2.4) && ok(x, z)) || { x: p.x + 6, z: p.z, dx: 1, dz: 0 }; v.car.place(q.x, q.z, Math.atan2(q.dz || 0, q.dx || 1), world.groundY(q.x, q.z)); v.alive = true; v.hp = v.max; v.car.damage = 0; v.model.visible = true; };
    side(this.vehicles[0], 9, 0.8); side(this.vehicles[1], 22, 2.6);
    if (Math.hypot(this.vehicles[0].car.x - this.vehicles[1].car.x, this.vehicles[0].car.z - this.vehicles[1].car.z) < 6) this.vehicles[1].car.place(this.vehicles[0].car.x + 7, this.vehicles[0].car.z + 4, 0);
    this.nextWave(); this.c.toast('Elimina le ondate! Sali sul taxi o sul blindato'); this.updateHud(true);
  }
  stop() {
    this.active = false; this.driving = null; this.hero.visible = false; this.tankModel.outer.visible = false; this.beam.visible = false;
    for (const k of Object.keys(this.em)) this.em[k].count = 0; this.bm.count = 0; this.pm.count = 0; for (const r of this.rings) r.visible = false;
    this.vehicles[0].alive = false; this.vehicles[0].car.damage = 0; $('boss').hidden = true;
  }
  get focus() { const c = this.driving ? this.driving.car : null; if (c) return c; const p = this.proxy; p.x = this.hx; p.z = this.hz; p.h = this.hh; p.y = 0; return p; }

  // ---------- ondate
  nextWave() {
    this.wave++; const n = this.wave, q = this.queue;
    const grunts = Math.min(30, 5 + 2 * n), shooters = n >= 2 ? Math.min(10, 1 + (n >> 1)) : 0, heavies = n >= 3 ? Math.min(6, (n - 1) >> 1) : 0;
    for (let i = 0; i < grunts; i++) q.push('grunt'); for (let i = 0; i < shooters; i++) q.push('shooter'); for (let i = 0; i < heavies; i++) q.push('heavy');
    if (n % 5 === 0) q.push('boss'); q.sort(() => Math.random() - 0.5); this.spawnT = 1.2;
    this.c.toast(n % 5 === 0 ? `ONDATA ${n}: arriva Cos, il capo!` : `Ondata ${n}`); sfx.whistle();
    // un mezzo nuovo ogni due ondate se i mezzi sono finiti
    if (n > 1 && n % 2 === 1 && !this.vehicles.some((v) => v.alive)) this.dropVehicle(Math.random() < 0.5 ? 0 : 1);
    if (n > 1) this.heroHeal(15);
  }
  dropVehicle(i) {
    const v = this.vehicles[i], { roads, col, world } = this.c, pts = this.spawnPoints(10, 22); if (!pts.length) return; const p = pts[(Math.random() * pts.length) | 0], q = roads.nearest(p.x, p.z, (x, z) => !col.push(x, z, 2.4)) || p;
    v.car.place(q.x, q.z, Math.random() * 6.28, world.groundY(q.x, q.z)); v.alive = true; v.hp = v.max; v.car.damage = 0; v.model.visible = true; this.c.toast(i ? 'Blindato in arrivo!' : 'Nuovo taxi in zona!');
  }
  spawnPoints(dmin, dmax) {
    const { roads, col } = this.c, f = this.focus, out = [];
    roads.segmentsNear(f.x, f.z, dmax + 6, (r, i) => {
      const p = r.p, ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 5));
      for (let k = 0; k <= n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n, d = Math.hypot(x - f.x, z - f.z); if (d >= dmin && d <= dmax && x > ARENA[0] + 5 && x < ARENA[2] - 5 && z > ARENA[1] + 5 && z < ARENA[3] - 5 && !col.push(x, z, 1.2)) out.push({ x, z }); }
    });
    return out;
  }
  spawnOne(kind) {
    const pts = this.spawnPoints(36, 62); if (!pts.length) { const q = this.spawnPoints(20, 62); if (!q.length) return false; pts.push(...q); }
    const p = pts[(Math.random() * pts.length) | 0], t = ET[kind], bossK = kind === 'boss' ? 1 + (this.wave / 5 - 1) * 0.6 : 1;
    this.enemies.push({ k: kind, x: p.x, z: p.z, h: 0, hp: t.hp * bossK, max: t.hp * bossK, cd: rnd(0.5, 1.5), flash: 0, st: 0, side: 0, avoidT: 0, ph: Math.random() * 6, vx: 0, vz: 0, vh: 0, slam: 4 }); return true;
  }

  // ---------- effetti
  ring(x, z, R, col = 0xffc060) { const m = this.rings[this.ringI++ % this.rings.length]; m.position.set(x, 0.3, z); m.material.color.setHex(col); m.userData = { t: 0, R }; m.visible = true; }
  explode(x, z, R, dmg, fromP = true, y = 0.6) {
    const { parts } = this.c; parts.burst(x, z, 16, 6 + R * 0.5, [0.6, 0.5, 0.4]); parts.sparks(x, y + 0.5, z, 22); parts.steam(x, z, 4, 'dark'); this.ring(x, z, R); this.shake = Math.max(this.shake, 0.45 + R * 0.05); sfx.boom(0.5 + R * 0.06);
    if (fromP) for (const e of this.enemies) { const d = Math.hypot(e.x - x, e.z - z); if (d < R + ET[e.k].r) { const k = 1 - Math.min(0.75, d / (R + 0.001)); this.hit(e, dmg * k, x, z, 10 * k); } }
    else { const f = this.focus, d = Math.hypot(f.x - x, f.z - z); if (!this.driving && d < R) this.hurt(dmg * (1 - d / R)); }
    for (const v of this.vehicles) if (v.alive && !fromP) { const d = Math.hypot(v.car.x - x, v.car.z - z); if (d < R + 2) this.hurtVeh(v, dmg * 0.6); }
  }
  heroHeal(n) { this.hp = Math.min(100, this.hp + n); }
  hurt(n) {
    if (this.over || this.driving) return; this.hp -= n; this.hurtT = 0.35; this.shake = Math.max(this.shake, 0.25); sfx.thud(0.5);
    if (this.hp <= 0) this.end();
  }
  hurtVeh(v, n) {
    if (!v.alive) return; v.hp -= n; v.car.damage = v.dmgRef = clamp(1 - v.hp / v.max, 0, 1); v.car.dmgHit = 0.4; this.hurtT = Math.max(this.hurtT, this.driving === v ? 0.2 : 0);
    if (v.hp <= 0) {
      v.alive = false; v.model.visible = false; this.explode(v.car.x, v.car.z, 8, 14, true, 1); this.c.toast(v.id === 'tank' ? 'Blindato distrutto!' : 'Taxi distrutto!');
      if (this.driving === v) { this.driving = null; this.hx = v.car.x; this.hz = v.car.z; this.hurt(15); this.mvNudge(); }
    }
  }
  mvNudge() { const { col } = this.c; for (let i = 0; i < 8; i++) { const a = i * 0.8, x = this.hx + Math.cos(a) * 2.8, z = this.hz + Math.sin(a) * 2.8; if (!col.push(x, z, 0.5)) { this.hx = x; this.hz = z; return; } } }

  hit(e, dmg, sx, sz, kick = 2) {
    if (e.hp <= 0) return; e.hp -= dmg; e.flash = 0.12; const d = Math.hypot(e.x - sx, e.z - sz) || 1; const k = ET[e.k]; e.vx += (e.x - sx) / d * kick / (k.s * k.s); e.vz += (e.z - sz) / d * kick / (k.s * k.s);
    if (e.k === 'boss') { $('boss').querySelector('u').style.transform = `scaleX(${clamp(e.hp / e.max, 0, 1)})`; $('boss').querySelector('span').textContent = Math.max(0, Math.ceil(e.hp)); }
    this.c.parts.sparks(e.x, 1.2, e.z, 3);
    if (e.hp <= 0) this.kill(e);
  }
  kill(e) {
    const t = ET[e.k]; this.kills++; this.combo = Math.min(5, this.comboT > 0 ? this.combo + 1 : 1); this.comboT = 2.6; this.score += Math.round(t.score * this.combo);
    this.corpses.push({ k: e.k, x: e.x, z: e.z, h: e.h, t: 0, vx: e.vx, vz: e.vz }); this.c.parts.burst(e.x, e.z, e.k === 'grunt' ? 5 : 12, 3.5, [0.8, 0.75, 0.7]); this.c.parts.sparks(e.x, 1.1, e.z, e.k === 'grunt' ? 5 : 14); if (e.k !== 'grunt') { sfx.ko(); this.shake = Math.max(this.shake, 0.3); }
    const r = Math.random(); const drops = e.k === 'boss' ? 3 : e.k === 'heavy' ? 1 : (r < 0.13 ? 1 : 0);
    for (let i = 0; i < drops; i++) { const q = Math.random(); this.items.push({ x: e.x + rnd(-1.2, 1.2) * (e.k === 'boss' ? 3 : 1), z: e.z + rnd(-1.2, 1.2) * (e.k === 'boss' ? 3 : 1), type: q < 0.2 ? 'mitra' : q < 0.4 ? 'pompa' : q < 0.55 ? 'razzi' : q < 0.7 ? 'laser' : q < 0.88 ? 'med' : 'gren', t: 0 }); }
    if (e.k === 'boss') { $('boss').hidden = true; this.c.toast('COS SCONFITTO!'); this.heroHeal(40); this.gren += 2; }
    this.enemies.splice(this.enemies.indexOf(e), 1);
  }
  end() {
    if (this.over) return; this.over = true; this.hero.visible = false; this.explode(this.hx, this.hz, 5, 0, true); let best = 0; try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) { /* ignora */ }
    const nb = this.score > best; if (nb) try { localStorage.setItem(BEST_KEY, String(this.score)); } catch (e) { /* ignora */ }
    setTimeout(() => this.c.onEnd({ score: this.score, wave: this.wave, kills: this.kills, best: Math.max(best, this.score), isNew: nb }), 900);
  }

  // ---------- armi
  nearest(x, z, range) { let b = null, bd = range * range; for (const e of this.enemies) { const d = (e.x - x) ** 2 + (e.z - z) ** 2; if (d < bd) { bd = d; b = e; } } return b; }
  shoot(x, z, a, W, own = 'p', y = 1.2) {
    const { parts } = this.c;
    if (W.beam) return;
    const n = W.pellets || 1;
    for (let i = 0; i < n; i++) { const aa = a + rnd(-W.spread, W.spread); this.bul.push({ x, z, y, vx: Math.cos(aa) * W.speed, vz: Math.sin(aa) * W.speed, a: aa, life: W.range / W.speed, dmg: W.dmg, own, rocket: !!W.rocket, col: W.col, len: W.rocket ? 1.6 : 1.0, sz: W.rocket ? 2.2 : 1 }); }
    parts.sparks(x + Math.cos(a) * 0.5, y, z + Math.sin(a) * 0.5, W.rocket ? 6 : 2, Math.cos(a) * 3, Math.sin(a) * 3); if (W.rocket) sfx.shot(); else if (W.pellets) sfx.shot(); else sfx.gun(0.8);
  }
  fireBeam(x, z, a, W, dt) {
    const { col } = this.c; let L = W.range, hit = col.ray(x, z, Math.cos(a), Math.sin(a), L, 1.2); if (hit < L) L = hit;
    this.beam.visible = true; this.beam.position.set(x + Math.cos(a) * L / 2, 1.2, z + Math.sin(a) * L / 2); this.beam.rotation.y = -a; this.beam.scale.set(L, 1 + Math.random() * 0.8, 1 + Math.random() * 0.8); this.beamT = 0.06;
    this.beamTick = (this.beamTick || 0) - dt;
    if (this.beamTick <= 0) {
      this.beamTick = 1 / W.rate; sfx.gun(0.5); const cx = Math.cos(a), cz = Math.sin(a);
      for (const e of this.enemies.slice()) { const rx = e.x - x, rz = e.z - z, t = rx * cx + rz * cz; if (t < 0 || t > L) continue; const d = Math.abs(rx * cz - rz * cx); if (d < 0.8 + ET[e.k].r) this.hit(e, W.dmg, x, z, 1.2); }
      this.c.parts.sparks(x + cx * L, 1.2, z + cz * L, 3);
    }
  }
  throwGren(x, z, a) {
    const t = this.nearest(x, z, 24); let tx, tz; if (t) { tx = t.x; tz = t.z; } else { tx = x + Math.cos(a) * 14; tz = z + Math.sin(a) * 14; }
    const T = 0.85; this.bul.push({ gren: true, x, z, y: 1.4, vx: (tx - x) / T, vz: (tz - z) / T, vy: 0, life: T, own: 'p', col: 0x3a3a3a, a, len: 0.5, sz: 2.4, T0: T, ty: 0.3 }); this.gren--; sfx.shot();
  }

  update(dt, now) {
    if (!this.active) return; this.t += dt;
    const { col, world, input, parts } = this.c; this.shake *= Math.exp(-5 * dt); this.hurtT = Math.max(0, this.hurtT - dt); this.comboT = Math.max(0, this.comboT - dt); if (this.comboT <= 0) this.combo = 0;
    if (this.beamT > 0) { this.beamT -= dt; if (this.beamT <= 0) this.beam.visible = false; }
    if (!this.over) {
      const keys = input.keys, kx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0), kz = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      const fireKey = keys.has('KeyJ') || keys.has('Space') || this.hold.mouse;
      if (this.wantWpn) { this.wantWpn = false; this.cycleWeapon(); }
      // salire / scendere
      if (this.wantVeh) { this.wantVeh = false; if (this.driving) this.exit(); else { const v = this.nearVeh(); if (v) { this.driving = v; this.c.toast(v.id === 'tank' ? 'Blindato: cannone automatico' : 'Taxi: mitragliatrice automatica, investi i nemici'); sfx.pickup(); } } }
      if (this.driving) this.driveStep(dt, now); else this.footStep(dt, kx, kz, fireKey);
    }
    this.updateBullets(dt); this.updateEnemies(dt); this.updateItems(dt); this.updateRings(dt);
    // ondate
    if (!this.over) {
      if (this.queue.length) { this.spawnT -= dt; if (this.spawnT <= 0) { const live = this.enemies.length; if (live < 34) { const k = this.queue.shift(); if (this.spawnOne(k)) { if (k === 'boss') { $('boss').hidden = false; $('boss').querySelector('u').style.transform = 'scaleX(1)'; $('boss').querySelector('span').textContent = Math.ceil(this.enemies[this.enemies.length - 1].hp); $('boss').querySelector('b').textContent = 'COS'; sfx.boom(0.8); } } else this.queue.unshift(k); } this.spawnT = 0.28; } }
      else if (!this.enemies.length) { this.waveWait += dt; if (this.waveWait > 3) { this.waveWait = 0; this.nextWave(); } } else this.waveWait = 0;
    }
    this.pose(dt, now); this.updateHud();
  }

  nearVeh() { const f = this.focus; let b = null, bd = 36; for (const v of this.vehicles) { if (!v.alive) continue; const d = (v.car.x - f.x) ** 2 + (v.car.z - f.z) ** 2; if (d < bd) { bd = d; b = v; } } return b; }
  exit() {
    const v = this.driving; this.driving = null; v.car.vx = v.car.vz = 0; const { col } = this.c;
    for (let i = 0; i < 10; i++) { const a = v.car.h + Math.PI / 2 + i * 0.6, x = v.car.x + Math.cos(a) * 3.2, z = v.car.z + Math.sin(a) * 3.2; if (!col.push(x, z, 0.5)) { this.hx = x; this.hz = z; return; } }
    this.hx = v.car.x; this.hz = v.car.z;
  }
  cycleWeapon() { const have = ORDER.filter((w) => (this.ammo[w] || 0) > 0); const i = have.indexOf(this.weapon); this.weapon = have[(i + 1) % have.length]; }

  footStep(dt, kx, kz, fireKey) {
    const { col, world, input } = this.c;
    let mx = this.mv.x + kx, mz = this.mv.z + kz; const L = Math.hypot(mx, mz); if (L > 1) { mx /= L; mz /= L; }
    const sp = 7.4; let nx = this.hx + mx * sp * dt, nz = this.hz + mz * sp * dt;
    for (let it = 0; it < 3; it++) { const p = col.push(nx, nz, 0.45); if (!p) break; nx = p.x; nz = p.z; }
    nx = clamp(nx, ARENA[0] + 2, ARENA[2] - 2); nz = clamp(nz, ARENA[1] + 2, ARENA[3] - 2); this.hx = nx; this.hz = nz; if (L > 0.15) this.step += dt * 11 * Math.min(1, L); this.moving = L > 0.15;
    if (this.moving) { const a = Math.atan2(mz, mx); let d = a - this.hh; d = Math.atan2(Math.sin(d), Math.cos(d)); this.hh += d * Math.min(1, 14 * dt); }
    // mira automatica sul nemico più vicino; fuoco automatico se attivo
    const W = WEAPONS[this.weapon], tgt = this.nearest(this.hx, this.hz, W.range), want = this.hold.fire || fireKey || (this.autoFire && tgt);
    this.cd -= dt; this.aimT = tgt;
    if (tgt && (want || this.autoFire)) { const a = Math.atan2(tgt.z - this.hz, tgt.x - this.hx); let d = a - this.hh; d = Math.atan2(Math.sin(d), Math.cos(d)); this.hh += d * Math.min(1, 18 * dt); }
    if (want) {
      const a = tgt ? Math.atan2(tgt.z - this.hz, tgt.x - this.hx) : this.hh;
      if (W.beam) { if ((this.ammo[this.weapon] || 0) > 0) { this.fireBeam(this.hx + Math.cos(a) * 0.7, this.hz + Math.sin(a) * 0.7, a, W, dt); this.ammo[this.weapon] -= dt * W.rate * 0.5; } }
      else if (this.cd <= 0 && (this.ammo[this.weapon] === Infinity || this.ammo[this.weapon] > 0)) { this.cd = 1 / W.rate; this.shoot(this.hx + Math.cos(a) * 0.8, this.hz + Math.sin(a) * 0.8, a, W); if (this.ammo[this.weapon] !== Infinity) this.ammo[this.weapon]--; }
      if (this.ammo[this.weapon] !== Infinity && this.ammo[this.weapon] <= 0) { this.c.toast(`${W.name} finita: torni alla pistola`); this.weapon = 'pistola'; }
    }
    if (this.wantGren) { this.wantGren = false; if (this.gren > 0) this.throwGren(this.hx, this.hz, this.hh); else this.c.toast('Niente granate'); }
    // pickup
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; if ((it.x - this.hx) ** 2 + (it.z - this.hz) ** 2 > 2.6) continue; this.items.splice(i, 1); sfx.pickup();
      if (it.type === 'med') { this.heroHeal(35); this.c.toast('Kit medico +35'); } else if (it.type === 'gren') { this.gren += 2; this.c.toast('Granate +2'); }
      else { const W2 = WEAPONS[it.type]; this.ammo[it.type] = (this.ammo[it.type] || 0) + W2.ammo; this.weapon = it.type; this.c.toast(`${W2.name}!`); }
    }
  }
  driveStep(dt, now) {
    const v = this.driving, car = v.car, { col, groundCar, groundY, input } = this.c, inp = input.value, n = Math.ceil(dt / (1 / 90)), h = dt / n, tank = v.id === 'tank';
    const ref = car.damage; for (let i = 0; i < n; i++) { car.step(h, { ...inp, thrust: false }, col, ARENA, groundCar, groundY); if (tank) { const s = Math.hypot(car.vx, car.vz); if (s > 15) { car.vx *= 15 / s; car.vz *= 15 / s; } } }
    if (car.damage > ref + 0.0005) this.hurtVeh(v, (car.damage - ref) * v.max * 0.6); // urti contro i muri
    this.hx = car.x; this.hz = car.z; this.hh = car.h;
    // arma automatica del mezzo
    v.cd = (v.cd || 0) - dt; const tgt = this.nearest(car.x, car.z, tank ? 48 : 30); this.aimT = tgt;
    if (tgt) {
      const a = Math.atan2(tgt.z - car.z, tgt.x - car.x);
      if (tank) { v.aim = a; if (v.cd <= 0) { v.cd = 1.05; this.shoot(car.x + Math.cos(a) * 3, car.z + Math.sin(a) * 3, a, { ...WEAPONS.razzi, speed: 42, range: 50, col: 0xffe0a0 }, 'p', 1.8); this.shake = Math.max(this.shake, 0.3); } }
      else if (v.cd <= 0) { v.cd = 0.1; const s = (Math.random() < 0.5 ? 1 : -1) * 0.8; this.shoot(car.x + Math.cos(a) * 1.4 - Math.sin(a) * s, car.z + Math.sin(a) * 1.4 + Math.cos(a) * s, a, WEAPONS.mitra, 'p', 1.1); }
    } else v.aim = car.h;
    // investimento
    const sp = Math.hypot(car.vx, car.vz);
    if (sp > 7) for (const e of this.enemies.slice()) { const R = ET[e.k].r + 1.7; if ((e.x - car.x) ** 2 + (e.z - car.z) ** 2 < R * R && (e.vh || 0) <= 0) { e.vh = 0.45; this.hit(e, sp * 0.7, car.x - car.vx * 0.2, car.z - car.vz * 0.2, sp * 0.8); if (ET[e.k].s > 1.5) this.hurtVeh(v, ET[e.k].dmg * 0.5); this.shake = Math.max(this.shake, 0.2); sfx.thud(0.6); } }
    if (car.contact > 0.6 && sp > 12) this.hurtVeh(v, 0.5);
  }

  updateBullets(dt) {
    const { col, parts } = this.c, f = this.focus;
    for (let i = this.bul.length - 1; i >= 0; i--) {
      const b = this.bul[i]; const sx = b.x, sz = b.z, mv = Math.hypot(b.vx, b.vz) * dt;
      b.life -= dt;
      if (b.gren) { const k = 1 - b.life / b.T0; b.y = 0.3 + Math.sin(Math.min(1, Math.max(0, k)) * Math.PI) * 4.2; b.x += b.vx * dt; b.z += b.vz * dt; if (b.life <= 0) { this.explode(b.x, b.z, 7.5, 16, true); this.bul.splice(i, 1); } continue; }
      let dead = b.life <= 0; const dx = b.vx / (mv / dt || 1), dz = b.vz / (mv / dt || 1);
      const wall = col.ray(sx, sz, dx, dz, mv, 1.3); if (wall < mv) { b.x = sx + dx * wall; b.z = sz + dz * wall; dead = true; parts.sparks(b.x, b.y, b.z, 3); } else { b.x += b.vx * dt; b.z += b.vz * dt; }
      if (b.rocket) parts.steam(b.x, b.z, 1, 'dark');
      if (!dead) {
        if (b.own === 'p') {
          for (const e of this.enemies) { const R = ET[e.k].r + 0.25; if (distSeg(e.x, e.z, sx, sz, b.x, b.z) < R) { if (b.rocket) this.explode(b.x, b.z, 5.5, 11, true); else this.hit(e, b.dmg, sx, sz, 1.6); dead = true; break; } }
          if (!dead && b.rocket && b.life <= 0) { this.explode(b.x, b.z, 5.5, 11, true); }
        } else if (this.driving) { const v = this.driving; if (distSeg(v.car.x, v.car.z, sx, sz, b.x, b.z) < 2.0) { this.hurtVeh(v, b.dmg * 0.8); dead = true; } }
        else if (distSeg(this.hx, this.hz, sx, sz, b.x, b.z) < 0.7) { this.hurt(b.dmg); dead = true; }
      } else if (b.rocket) this.explode(b.x, b.z, 5.5, 11, true);
      if (dead) this.bul.splice(i, 1);
    }
  }

  updateEnemies(dt) {
    const { col, parts } = this.c, f = this.focus, fx = f.x, fz = f.z, list = this.enemies;
    for (const e of list) {
      const t = ET[e.k]; e.cd -= dt; e.flash = Math.max(0, e.flash - dt); e.vh = Math.max(0, (e.vh || 0) - dt); e.ph += dt * 8;
      let dx = fx - e.x, dz = fz - e.z, d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; let ang = Math.atan2(dz, dx);
      // aggiramento ostacoli: se bloccato a lungo, gira di lato
      if (e.avoidT > 0) { e.avoidT -= dt; ang += e.side * 1.25; }
      let sp = t.spd * (e.k === 'grunt' ? 1 + Math.min(0.5, this.wave * 0.03) : 1), mvx = Math.cos(ang), mvz = Math.sin(ang);
      if (t.ranged) { if (d < 11) { mvx = -mvx; mvz = -mvz; } else if (d < 20) { sp = 0; } }
      if (e.k === 'boss') { e.slam -= dt; if (e.slam < 0.9 && e.slam > 0) sp *= 0.1; if (e.slam <= 0) { e.slam = 4.2; this.ring(e.x, e.z, 8, 0xff6a3a); this.shake = Math.max(this.shake, 0.6); sfx.boom(0.9); if (d < 8.5 && !this.driving) this.hurt(26); if (d < 9) for (const v of this.vehicles) if (v.alive && Math.hypot(v.car.x - e.x, v.car.z - e.z) < 9) this.hurtVeh(v, 22); parts.burst(e.x, e.z, 16, 9); if (list.length < 30) for (let i = 0; i < 2; i++) this.enemies.push({ k: 'grunt', x: e.x + rnd(-3, 3), z: e.z + rnd(-3, 3), h: 0, hp: 3, max: 3, cd: 1, flash: 0, st: 0, side: 0, avoidT: 0, ph: Math.random() * 6, vx: 0, vz: 0, vh: 0, slam: 9 }); } }
      let nx = e.x + (mvx * sp + e.vx) * dt, nz = e.z + (mvz * sp + e.vz) * dt; e.vx *= Math.exp(-6 * dt); e.vz *= Math.exp(-6 * dt);
      let blocked = false; for (let it = 0; it < 2; it++) { const p = col.push(nx, nz, t.r * 0.8); if (!p) break; nx = p.x; nz = p.z; blocked = true; }
      if (blocked && sp > 0) { e.st += dt; if (e.st > 0.5 && e.avoidT <= 0) { e.avoidT = rnd(0.8, 1.6); e.side = Math.random() < 0.5 ? 1 : -1; e.st = 0; } } else e.st = Math.max(0, e.st - dt);
      e.x = nx; e.z = nz; let dh = Math.atan2(dz, dx) - e.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); e.h += dh * Math.min(1, 10 * dt);
      // troppo lontano (rimasto incastrato): lo riporto vicino
      if (d > 110) { const pts = this.spawnPoints(36, 60); if (pts.length) { const p = pts[(Math.random() * pts.length) | 0]; e.x = p.x; e.z = p.z; } }
      // attacchi
      if (t.ranged) { if (e.cd <= 0 && d < 30 && d > 6 && col.ray(e.x, e.z, dx, dz, d, 1.4) === Infinity) { e.cd = rnd(1.5, 2.4); const a = Math.atan2(dz, dx) + rnd(-0.07, 0.07); this.bul.push({ x: e.x + dx * 0.8, z: e.z + dz * 0.8, y: 1.3, vx: Math.cos(a) * 21, vz: Math.sin(a) * 21, a, life: 1.6, dmg: 7, own: 'e', col: 0xff4a3a, len: 0.8, sz: 1 }); sfx.gun(0.35); } }
      else {
        const reach = t.r + (this.driving ? 2.0 : 0.6) + (e.k === 'boss' ? 1.2 : 0.35);
        if (d < reach + 0.4 && e.cd <= 0) { e.cd = e.k === 'grunt' ? 0.8 : e.k === 'heavy' ? 1.1 : 1.3; if (this.driving) { if (e.k !== 'grunt') this.hurtVeh(this.driving, t.dmg * 0.5); else this.hurtVeh(this.driving, 1.5); } else this.hurt(t.dmg); parts.sparks(fx, 1.2, fz, 3); }
      }
    }
    // separazione
    for (let i = 0; i < list.length; i++) { const a = list[i]; for (let j = i + 1; j < list.length; j++) { const b = list[j], dx = b.x - a.x, dz = b.z - a.z, m = ET[a.k].r + ET[b.k].r; if (dx * dx + dz * dz < m * m * 0.8) { const d = Math.hypot(dx, dz) || 0.01, p = (m - d) * 0.5 * 0.5; a.x -= dx / d * p; a.z -= dz / d * p; b.x += dx / d * p; b.z += dz / d * p; } } }
    for (const c of this.corpses) { c.t += dt; c.x += c.vx * dt * 0.5; c.z += c.vz * dt * 0.5; }
    this.corpses = this.corpses.filter((c) => c.t < 0.7);
  }

  updateItems(dt) { for (const it of this.items) { it.t += dt; if (it.t > 40) it.dead = true; } this.items = this.items.filter((i) => !i.dead); if (this.items.length > 30) this.items.shift(); }
  updateRings(dt) { for (const r of this.rings) { if (!r.visible) continue; const u = r.userData; u.t += dt * 2.6; if (u.t >= 1) { r.visible = false; continue; } const s = u.R * (0.15 + u.t); r.scale.set(s, 1, s); r.material.opacity = (1 - u.t) * 0.9; } }

  // ---------- grafica
  pose(dt, now) {
    const M = this._M || (this._M = new THREE.Matrix4()), Q = this._Q || (this._Q = new THREE.Quaternion()), E = this._E || (this._E = new THREE.Euler()), P = this._P || (this._P = new THREE.Vector3()), S = this._S || (this._S = new THREE.Vector3()), C = this._C || (this._C = new THREE.Color());
    // eroe
    this.hero.visible = !this.driving && !this.over; this.hero.position.set(this.hx, Math.abs(Math.sin(this.step)) * (this.moving ? 0.1 : 0), this.hz); this.hero.rotation.y = -this.hh; this.heroMesh.rotation.z = this.moving ? Math.sin(this.step) * 0.08 : 0;
    // nemici
    const cnt = { grunt: 0, shooter: 0, heavy: 0, boss: 0 };
    const put = (k, x, z, h, sc, pitch, flash, bob) => { const im = this.em[k], i = cnt[k]++; if (i >= im.instanceMatrix.count) return; E.set(0, -h, pitch, 'YXZ'); Q.setFromEuler(E); P.set(x, bob, z); S.set(sc, sc, sc); M.compose(P, Q, S); im.setMatrixAt(i, M); C.setScalar(1 + flash * 9); im.setColorAt(i, C); };
    for (const e of this.enemies) put(e.k, e.x, e.z, e.h, 1, -0.12 - Math.sin(e.ph) * 0.04, e.flash > 0 ? 1 : 0, Math.abs(Math.sin(e.ph * 0.5)) * 0.12 * ET[e.k].s);
    for (const c of this.corpses) { const k = Math.min(1, c.t / 0.35); put(c.k, c.x, c.z, c.h, 1 - Math.max(0, c.t - 0.45) * 3.5, k * 1.45, 0, (1 - k) * 0.3); }
    for (const k of Object.keys(cnt)) { const im = this.em[k]; im.count = Math.min(cnt[k], im.instanceMatrix.count); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    // proiettili
    let n = 0; for (const b of this.bul) { if (n >= 260) break; E.set(0, -b.a, 0); Q.setFromEuler(E); P.set(b.x, b.y, b.z); S.set(b.len, b.sz, b.sz); M.compose(P, Q, S); this.bm.setMatrixAt(n, M); C.setHex(b.col); this.bm.setColorAt(n, C); n++; }
    this.bm.count = n; this.bm.instanceMatrix.needsUpdate = true; if (this.bm.instanceColor) this.bm.instanceColor.needsUpdate = true;
    // pickup
    n = 0; for (const it of this.items) { if (n >= 40) break; const col = it.type === 'med' ? 0x4cff7a : it.type === 'gren' ? 0xb0b0b0 : WEAPONS[it.type].col; E.set(0, it.t * 2.2, 0); Q.setFromEuler(E); P.set(it.x, 0.7 + Math.sin(it.t * 4) * 0.15, it.z); const pulse = 1 + Math.sin(it.t * 7) * 0.08; S.set(pulse, pulse, pulse); M.compose(P, Q, S); this.pm.setMatrixAt(n, M); C.setHex(col); this.pm.setColorAt(n, C); n++; }
    this.pm.count = n; this.pm.instanceMatrix.needsUpdate = true; if (this.pm.instanceColor) this.pm.instanceColor.needsUpdate = true;
    // blindato
    const tv = this.vehicles[1]; if (tv.alive) { const c = tv.car, o = this.tankModel; o.outer.position.set(c.x, 0.18 + c.y, c.z); o.outer.rotation.y = -c.h; o.turret.rotation.y = -((tv.aim ?? c.h) - c.h); }
  }
  updateCamera(dt) {
    const cam = this.c.camera, f = this.focus, sp = this.driving ? Math.hypot(f.vx, f.vz) : 0, H = 30 + sp * 0.45, Z = 6 + sp * 0.12;
    const tx = f.x + (this.driving ? f.vx * 0.35 : 0), tz = f.z + (this.driving ? f.vz * 0.35 : 0);
    this.cx = this.cx === undefined ? tx : this.cx + (tx - this.cx) * Math.min(1, 7 * dt); this.cz = this.cz === undefined ? tz : this.cz + (tz - this.cz) * Math.min(1, 7 * dt);
    const s = this.shake; cam.position.set(this.cx + (Math.random() - 0.5) * s, H, this.cz + Z + (Math.random() - 0.5) * s); cam.lookAt(this.cx, 0, this.cz - 0.8);
    const fov = 48 + Math.min(10, sp * 0.18); if (Math.abs(cam.fov - fov) > 0.2) { cam.fov += (fov - cam.fov) * Math.min(1, 4 * dt); cam.updateProjectionMatrix(); }
  }

  // ---------- HUD
  updateHud(force) {
    const w = WEAPONS[this.weapon], am = this.ammo[this.weapon], key = [Math.ceil(this.hp), this.weapon, am === Infinity ? 99999 : Math.ceil(am), this.gren, this.score, this.wave, this.combo, this.driving ? this.driving.id : '', this.driving ? Math.ceil(this.driving.hp) : 0, this.enemies.length + this.queue.length, !!this.nearVeh(), this.autoFire].join('|');
    $('hurt').style.opacity = this.hurtT > 0 ? String(Math.min(0.55, this.hurtT * 1.6)) : '0';
    if (key === this._hk && !force) return; this._hk = key;
    $('sh-hp').style.transform = `scaleX(${clamp(this.hp / 100, 0, 1)})`; $('sh-hpn').textContent = Math.max(0, Math.ceil(this.hp));
    const v = this.driving; $('sh-veh').hidden = !v; if (v) { $('sh-vhp').style.transform = `scaleX(${clamp(v.hp / v.max, 0, 1)})`; $('sh-vname').textContent = v.id === 'tank' ? 'BLINDATO' : 'TAXI'; }
    $('sh-wave').textContent = `ONDATA ${this.wave}`; $('sh-score').textContent = `${this.score}` + (this.combo > 1 ? `  ×${this.combo}` : ''); $('sh-left').textContent = `Nemici ${this.enemies.length + this.queue.length}`;
    $('sh-wpn').textContent = v ? (v.id === 'tank' ? 'CANNONE' : 'MITRAGLIATRICE') : w.name; $('sh-wpn').style.color = v ? '#fff' : hex(w.col);
    $('sh-ammo').textContent = v ? 'auto' : am === Infinity ? '∞' : Math.ceil(am); $('sh-gren').textContent = `Granate ${this.gren}`;
    const bv = $('b-veh'); bv.hidden = !(v || this.nearVeh()); bv.querySelector('span').textContent = v ? 'SCENDI' : 'SALI'; $('joy').hidden = !!v; $('b-fire').hidden = !!v; $('b-gren').hidden = !!v; $('b-wpn').hidden = !!v;
    $('controls').hidden = !v; document.body.classList.toggle('driving', !!v);
  }
}

function distSeg(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = clamp(((px - ax) * dx + (pz - az) * dz) / L, 0, 1); return Math.hypot(px - ax - dx * t, pz - az - dz * t); }
