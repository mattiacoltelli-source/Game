import * as THREE from '../lib/three.module.min.js';

// Pickup di luce "NOS": colonna di luce ciano + anello rotante + sfera. Tre InstancedMesh in tutto (3 draw call).
// Posizioni: lungo il corridoio di gioco ogni ~240 m e due proprio prima del Ponte Matteotti (rincorsa per il salto).
const COLOR = 0x4fe6ff, RESPAWN = 25, RADIUS = 4.2;

export class NosPickups {
  constructor(scene, world, roads, free, avoid = []) {
    this.items = []; this.t = 0; this.roads = roads; this.free = free;
    const cor = world.corridor, seg = []; let total = 0;
    for (let i = 0; i < cor.length - 1; i++) { const L = Math.hypot(cor[i + 1][0] - cor[i][0], cor[i + 1][1] - cor[i][1]); seg.push(L); total += L; }
    const at = (d) => { for (let i = 0; i < seg.length; i++) { if (d <= seg[i]) { const f = d / seg[i]; return [cor[i][0] + (cor[i + 1][0] - cor[i][0]) * f, cor[i][1] + (cor[i + 1][1] - cor[i][1]) * f, cor[i + 1][0] - cor[i][0], cor[i + 1][1] - cor[i][1]]; } d -= seg[i]; } return null; };
    const add = (x, z) => { const q = roads.nearest(x, z, free); if (q && !this.items.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 40) && !avoid.some((a) => Math.hypot(a.x - q.x, a.z - q.z) < a.r)) this.items.push({ x: q.x, z: q.z, on: true, t: 0 }); };
    // rincorsa prima del ponte: il verso di percorrenza è quello del corridoio nel punto più vicino alla gobba
    for (const h of world.humps) {
      const cx = h.ax + h.ux * h.L / 2, cz = h.az + h.uz * h.L / 2; let best = 1e9, bi = 0;
      for (let i = 0; i < cor.length - 1; i++) { // segmento del corridoio più vicino al ponte
        const dx = cor[i + 1][0] - cor[i][0], dz = cor[i + 1][1] - cor[i][1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((cx - cor[i][0]) * dx + (cz - cor[i][1]) * dz) / L2));
        const d = Math.hypot(cx - cor[i][0] - dx * t, cz - cor[i][1] - dz * t); if (d < best) { best = d; bi = i; }
      }
      if (best > 90) continue; // quella carreggiata non è sul percorso
      const dx = cor[bi + 1][0] - cor[bi][0], dz = cor[bi + 1][1] - cor[bi][1], dir = dx * h.ux + dz * h.uz >= 0 ? 1 : -1;
      const ex = dir > 0 ? h.ax : h.ax + h.ux * h.L, ez = dir > 0 ? h.az : h.az + h.uz * h.L;
      for (const back of [45, 100, 155]) add(ex - h.ux * dir * back, ez - h.uz * dir * back);
    }
    for (let d = 110; d < total - 120; d += 240) { const p = at(d); if (p) add(p[0], p[1]); }
    const n = Math.max(1, this.items.length) + 8, mats = (op) => new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beam = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.5, 2.1, 26, 12, 1, true).translate(0, 13, 0), mats(0.5), n);
    this.ring = new THREE.InstancedMesh(new THREE.TorusGeometry(2.7, 0.3, 8, 28), mats(1), n);
    this.orb = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.0, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    this.glow = new THREE.InstancedMesh(new THREE.CircleGeometry(6, 24).rotateX(-Math.PI / 2), mats(0.45), n);
    for (const m of [this.beam, this.ring, this.orb, this.glow]) { m.frustumCulled = false; scene.add(m); }
    this.draw(0);
  }

  // Pickup aggiuntivo a runtime (arena del boss), agganciato alla strada più vicina.
  addAt(x, z) { const q = this.roads.nearest(x, z, this.free); if (q && this.items.length < this.beam.instanceMatrix.count) this.items.push({ x: q.x, z: q.z, on: true, t: 0 }); }

  active() { return this.items.filter((i) => i.on); }

  reset() { for (const i of this.items) { i.on = true; i.t = 0; } }

  // Ritorna true se il giocatore ha raccolto un pickup in questo frame.
  update(dt, car) {
    this.t += dt; let got = false;
    for (const it of this.items) {
      if (!it.on) { it.t -= dt; if (it.t <= 0) it.on = true; continue; }
      if (car.charges < 3 && Math.abs(it.x - car.x) < RADIUS && Math.abs(it.z - car.z) < RADIUS && Math.hypot(it.x - car.x, it.z - car.z) < RADIUS && car.clear < 4.5) { it.on = false; it.t = RESPAWN; got = true; }
    }
    this.draw(this.t); return got;
  }

  draw(t) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    this.items.forEach((it, i) => {
      const s = it.on ? 1 + 0.1 * Math.sin(t * 6 + i) : 0;
      sc.set(s, s, s); q.identity(); pos.set(it.x, 0.1, it.z); m.compose(pos, q, sc); this.beam.setMatrixAt(i, m);
      pos.set(it.x, 0.22, it.z); q.identity(); m.compose(pos, q, sc); this.glow.setMatrixAt(i, m);
      e.set(0, t * 2.4 + i, 0); q.setFromEuler(e); pos.set(it.x, 1.9 + Math.sin(t * 3 + i) * 0.25, it.z); m.compose(pos, q, sc); this.ring.setMatrixAt(i, m);
      e.set(t * 1.7, t * 2.1, 0); q.setFromEuler(e); this.orb.setMatrixAt(i, m.compose(pos, q, sc));
    });
    for (const m2 of [this.beam, this.ring, this.orb, this.glow]) { m2.count = this.items.length; m2.instanceMatrix.needsUpdate = true; }
  }
}

// Colori dei livelli del NOS: 1 ciano, 2 viola, 3 oro.
export const NOS_COLORS = [0x4fe6ff, 0xc26bff, 0xffb02e];

// Fiamme del NOS dietro all'auto (due coni additivi), visibili solo col boost; colore e dimensione dipendono dal livello.
export function buildFlames(taxi) {
  const geo = new THREE.ConeGeometry(0.28, 2.6, 8).rotateZ(Math.PI / 2).translate(-1.3, 0, 0); // punta verso -x (dietro)
  const outer = new THREE.MeshBasicMaterial({ color: 0x3fd0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const inner = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const fl = [];
  for (const z of [-0.55, 0.55]) for (const [mat, sc] of [[outer, 1], [inner, 0.55]]) { const m = new THREE.Mesh(geo, mat); m.position.set(-2.2, 0.55, z); m.scale.set(sc, sc, sc); m.visible = false; taxi.inner.add(m); fl.push([m, sc]); }
  let last = 0;
  return (level, t) => {
    if (level && level !== last) outer.color.setHex(NOS_COLORS[level - 1]); last = level;
    for (const [m, sc] of fl) { m.visible = level > 0; if (level) { const f = 0.8 + 0.35 * Math.sin(t * 40 + m.position.z * 7); m.scale.set(sc * (1 + f * 0.6) * (0.85 + 0.3 * level), sc * (0.9 + 0.2 * level), sc * (0.9 + 0.2 * level)); } }
  };
}
