import * as THREE from '../lib/three.module.min.js';

// Gadget raccoglibili (uno alla volta, pulsante GADGET): scudo, anti-olio, estintore, molla, magnete, disturbatore.
// I pickup sono colonne di luce colorate per tipo (stesso disegno dei NOS, 4 InstancedMesh).
export const GADGETS = {
  shield: { name: 'Scudo', icon: '🛡️', color: 0x4aa3ff, time: 8, tip: 'Scudo! Respinge colpi, fuoco e calci (8 s)' },
  antiolio: { name: 'Anti-olio', icon: '🛞', color: 0xc3c8d0, time: 10, tip: 'Gomme anti-olio per 10 s' },
  estintore: { name: 'Estintore', icon: '🧯', color: 0xff4a4a, time: 0, tip: 'Estintore: spegne il fuoco intorno a te' },
  molla: { name: 'Molla', icon: '🌀', color: 0x4be37a, time: 0, tip: 'Molla: salto per scavalcare ostacoli e treno' },
  magnete: { name: 'Magnete', icon: '🧲', color: 0xffd23a, time: 10, tip: 'Magnete: attira NOS e gadget (10 s)' },
  disturbatore: { name: 'Disturbatore', icon: '📡', color: 0xc26bff, time: 8, tip: 'Disturbatore: Macco e Tarta bloccati (8 s)' },
};
const KEYS = Object.keys(GADGETS), WEIGHT = { shield: 3, antiolio: 2, estintore: 2, molla: 2, magnete: 2, disturbatore: 2 };
const pick = () => { const tot = KEYS.reduce((a, k) => a + WEIGHT[k], 0); let r = Math.random() * tot; for (const k of KEYS) { r -= WEIGHT[k]; if (r <= 0) return k; } return 'shield'; };
const RESPAWN = 40, RADIUS = 4.2, MAGNET_R = 80;

export class GadgetPickups {
  constructor(scene, world, roads, free, avoid = []) {
    this.items = []; this.t = 0; this.roads = roads; this.free = free;
    const cor = world.corridor, seg = []; let total = 0;
    for (let i = 0; i < cor.length - 1; i++) { const L = Math.hypot(cor[i + 1][0] - cor[i][0], cor[i + 1][1] - cor[i][1]); seg.push(L); total += L; }
    const at = (d) => { for (let i = 0; i < seg.length; i++) { if (d <= seg[i]) { const f = d / seg[i]; return [cor[i][0] + (cor[i + 1][0] - cor[i][0]) * f, cor[i][1] + (cor[i + 1][1] - cor[i][1]) * f]; } d -= seg[i]; } return null; };
    const add = (x, z) => { const q = roads.nearest(x, z, free); if (q && !this.items.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 50) && !avoid.some((a) => Math.hypot(a.x - q.x, a.z - q.z) < a.r)) this.items.push({ x: q.x, z: q.z, on: true, t: 0, type: pick() }); };
    for (let d = 200; d < total - 150; d += 260) { const p = at(d); if (p) add(p[0], p[1]); }
    const n = this.items.length + 8, mats = (op) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beam = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.3, 2.0, 30, 10, 1, true).translate(0, 15, 0), mats(0.55), n);
    this.ring = new THREE.InstancedMesh(new THREE.TorusGeometry(2.3, 0.28, 8, 24), mats(1), n);
    this.orb = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1.1, 0), mats(1), n);
    this.glow = new THREE.InstancedMesh(new THREE.CircleGeometry(5, 20).rotateX(-Math.PI / 2), mats(0.4), n);
    for (const m of [this.beam, this.ring, this.orb, this.glow]) { m.frustumCulled = false; scene.add(m); }
    this.col = new THREE.Color(); this.draw(0);
  }

  addAt(x, z) { const q = this.roads.nearest(x, z, this.free); if (q && this.items.length < this.beam.instanceMatrix.count) this.items.push({ x: q.x, z: q.z, on: true, t: 0, type: pick() }); }
  active() { return this.items.filter((i) => i.on); }
  reset() { for (const i of this.items) { i.on = true; i.t = 0; i.type = pick(); } }

  // Ritorna il tipo raccolto (stringa) oppure null. Con la mano libera (nessun gadget in tasca) e il magnete li attira.
  update(dt, car) {
    this.t += dt; let got = null;
    for (const it of this.items) {
      if (!it.on) { it.t -= dt; if (it.t <= 0) { it.on = true; it.type = pick(); } continue; }
      const d = Math.hypot(it.x - car.x, it.z - car.z);
      if (car.magnet > 0 && d < MAGNET_R && d > 1) { it.x += (car.x - it.x) / d * 40 * dt; it.z += (car.z - it.z) / d * 40 * dt; }
      if (!car.gadget && d < RADIUS && car.clear < 4.5) { it.on = false; it.t = RESPAWN; got = it.type; car.gadget = it.type; }
    }
    this.draw(this.t); return got;
  }

  draw(t) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    this.items.forEach((it, i) => {
      const s = it.on ? 1 + 0.1 * Math.sin(t * 6 + i) : 0; this.col.setHex(GADGETS[it.type].color);
      sc.set(s, s, s); q.identity(); pos.set(it.x, 0.1, it.z); m.compose(pos, q, sc); this.beam.setMatrixAt(i, m); this.beam.setColorAt(i, this.col);
      pos.set(it.x, 0.22, it.z); m.compose(pos, q, sc); this.glow.setMatrixAt(i, m); this.glow.setColorAt(i, this.col);
      e.set(0, t * 2.1 + i, 0); q.setFromEuler(e); pos.set(it.x, 1.9 + Math.sin(t * 3 + i) * 0.25, it.z); m.compose(pos, q, sc); this.ring.setMatrixAt(i, m); this.ring.setColorAt(i, this.col);
      e.set(t * 1.5, t * 2.3, 0); q.setFromEuler(e); this.orb.setMatrixAt(i, m.compose(pos, q, sc)); this.orb.setColorAt(i, this.col);
    });
    for (const m2 of [this.beam, this.ring, this.orb, this.glow]) { m2.count = this.items.length; m2.instanceMatrix.needsUpdate = true; if (m2.instanceColor) m2.instanceColor.needsUpdate = true; }
  }
}

// Bolla dello scudo attorno al taxi (ellissoide additivo che pulsa e lampeggia a fine durata).
export function buildShield(taxi) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x4aa3ff, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  mesh.scale.set(3.6, 2.3, 2.5); mesh.position.set(0, 1.0, 0); mesh.visible = false; taxi.inner.add(mesh);
  return (left, t) => { mesh.visible = left > 0 && (left > 2 || Math.sin(t * 24) > 0); if (mesh.visible) { const p = 1 + 0.04 * Math.sin(t * 9); mesh.scale.set(3.6 * p, 2.3 * p, 2.5 * p); } };
}

// Onde a terra per gli effetti dei gadget: anelli additivi che si espandono (o si stringono) e sfumano. Una InstancedMesh.
export class GadgetFx {
  constructor(scene) {
    this.n = 12; this.rings = []; this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.pos = new THREE.Vector3(); this.sc = new THREE.Vector3(); this.col = new THREE.Color(); this.pulse = 0;
    this.mesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), this.n);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 7; scene.add(this.mesh);
  }
  // r0 -> r1 in `life` secondi (r1 < r0 = onda che si stringe verso l'auto)
  ring(x, z, hex, r0, r1, life = 0.7, y = 0.3) { if (this.rings.length >= this.n) this.rings.shift(); this.rings.push({ x, z, y, hex, r0, r1, life, t: 0 }); }
  reset() { this.rings.length = 0; this.mesh.count = 0; this.pulse = 0; }
  update(dt, car) {
    // effetti continui: magnete (onda che attira), disturbatore (onda che si espande), anti-olio (anello sotto l'auto)
    this.pulse -= dt;
    if (this.pulse <= 0 && !car.air) {
      if (car.magnet > 0) { this.ring(car.x, car.z, GADGETS.magnete.color, 16, 2, 0.8); this.pulse = 0.9; }
      else if (car.jam > 0) { this.ring(car.x, car.z, GADGETS.disturbatore.color, 3, 20, 0.9); this.pulse = 1.0; }
      else if (car.antiOil > 0) { this.ring(car.x, car.z, GADGETS.antiolio.color, 2.2, 3.4, 0.7); this.pulse = 0.7; }
    }
    const m = this.m, f = this.rings;
    for (let i = f.length - 1; i >= 0; i--) { f[i].t += dt; if (f[i].t >= f[i].life) f.splice(i, 1); }
    f.forEach((r, i) => { const k = r.t / r.life, rad = r.r0 + (r.r1 - r.r0) * k, a = (1 - k) * (1 - k) * 0.9; this.pos.set(r.x, r.y, r.z); this.sc.set(rad, 1, rad); m.compose(this.pos, this.q, this.sc); this.mesh.setMatrixAt(i, m); this.col.setHex(r.hex).multiplyScalar(a); this.mesh.setColorAt(i, this.col); });
    this.mesh.count = f.length; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
