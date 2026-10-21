import * as THREE from '../lib/three.module.min.js';
import { mergeBoxes } from './geom.js';

// Cantieri: trincea + transenne + escavatore + cartello (mesh statica unica), solidi con collisione,
// coni arancioni "buttabili" (InstancedMesh con fisica minima).
const OK = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified']);
const RED = [0.88, 0.14, 0.12], WHITE = [0.96, 0.96, 0.94];

export class Props {
  constructor(scene, world, col, cfg) {
    this.circles = []; this.cones = [];
    const parts = [], sites = [];
    for (const { street, every, max } of cfg) {
      let count = 0;
      const ways = world.roads.filter((r) => r.n === street && OK.has(r.c) && r.w >= 6.5).sort((a, b) => b.p.length - a.p.length);
      for (const r of ways) {
        const p = r.p, n = p.length / 2; let acc = 0, Ltot = 0;
        for (let i = 0; i < n - 1; i++) Ltot += Math.hypot(p[i * 2 + 2] - p[i * 2], p[i * 2 + 3] - p[i * 2 + 1]);
        for (let i = 0; i < n - 1 && count < max; i++) {
          const dx = p[i * 2 + 2] - p[i * 2], dz = p[i * 2 + 3] - p[i * 2 + 1], L = Math.hypot(dx, dz); if (L < 0.5) continue;
          for (let t = 0; t < L && count < max; t += 12) {
            const x = p[i * 2] + dx * t / L, z = p[i * 2 + 1] + dz * t / L;
            if (acc + t < 35 || acc + t > Ltot - 35 || world.groundY(x, z) > 0 || world.humps.some((h) => Math.hypot(h.ax + h.ux * h.L / 2 - x, h.az + h.uz * h.L / 2 - z) < h.L / 2 + 70)) continue;
            if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < every)) continue;
            sites.push({ x, z, ux: dx / L, uz: dz / L, w: r.w, sd: sites.length % 2 ? 1 : -1 }); count++;
          }
          acc += L;
        }
      }
    }
    for (const s of sites) this.buildSite(s, parts, col);
    if (parts.length) { const m = new THREE.Mesh(mergeBoxes(parts), new THREE.MeshLambertMaterial({ vertexColors: true })); scene.add(m); this.mesh = m; }
    // coni (dinamici)
    const coneGeo = mergeBoxes([{ x: 0, y: 0.03, z: 0, sx: 0.55, sy: 0.06, sz: 0.55, c: [0.85, 0.35, 0.08] }, { x: 0, y: 0.32, z: 0, sx: 0.32, sy: 0.5, sz: 0.32, c: [1, 0.48, 0.1] }, { x: 0, y: 0.36, z: 0, sx: 0.36, sy: 0.1, sz: 0.36, c: [0.97, 0.97, 0.95] }]);
    this.cm = new THREE.InstancedMesh(coneGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), Math.max(1, this.cones.length));
    this.cm.frustumCulled = false; scene.add(this.cm); this.sites = sites; this.reset();
  }

  buildSite(s, parts, col) {
    const { x: cx, z: cz, ux, uz, w, sd } = s, rx = -uz, rz = ux, hw = w / 2, bw = Math.min(5, w * 0.55, w - 3.3), Z = 14, r0 = Math.atan2(uz, ux);
    const P = (u, lat) => [cx + ux * u + rx * lat, cz + uz * u + rz * lat]; // u lungo la strada, lat verso destra
    const l0 = sd * (hw - bw), l1 = sd * (hw + 0.3), lc = (l0 + l1) / 2, lw = Math.abs(l1 - l0);
    const mc = P(0, lc);
    parts.push({ x: mc[0], y: 0.16, z: mc[1], sx: Z, sy: 0.04, sz: lw, r: r0, c: [0.36, 0.3, 0.25] });
    parts.push({ x: mc[0], y: 0.19, z: mc[1], sx: Z - 3, sy: 0.04, sz: Math.max(1, lw - 2), r: r0, c: [0.22, 0.18, 0.15] });
    // transenne a strisce rosse/bianche + solido di collisione
    const line = (a, b) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), k = Math.ceil(len / 1.0), rot = Math.atan2(dz, dx);
      for (let i = 0; i < k; i++) { const t = (i + 0.5) / k, q = [a[0] + dx * t, a[1] + dz * t]; parts.push({ x: q[0], y: 0.75, z: q[1], sx: len / k * 0.96, sy: 0.9, sz: 0.12, r: rot, c: i % 2 ? WHITE : RED }); }
      for (const t of [0, 1]) parts.push({ x: a[0] + dx * t, y: 0.3, z: a[1] + dz * t, sx: 0.12, sy: 0.6, sz: 0.5, r: rot + 1.57, c: [0.2, 0.2, 0.22] });
      const nx = -dz / len * 0.2, nz = dx / len * 0.2; col.addSolid([a[0] + nx, a[1] + nz, b[0] + nx, b[1] + nz, b[0] - nx, b[1] - nz, a[0] - nx, a[1] - nz], 1.2);
      for (let d = 0; d <= len; d += 2) this.circles.push({ x: a[0] + dx * d / len, z: a[1] + dz * d / len, r: 1.3 });
    };
    line(P(-Z / 2, l0), P(-Z / 2, l1)); line(P(Z / 2, l0), P(Z / 2, l1)); line(P(-Z / 2, l0), P(Z / 2, l0));
    // escavatore e cumulo di terra dentro la trincea
    const E = (u, lat) => P(u, lc + lat * sd);
    const e0 = E(-1.5, 0), e1 = E(1.9, 0.2), e2 = E(-1.5, -0.1), pile = E(4.2, -0.3);
    parts.push({ x: e0[0], y: 0.3, z: e0[1], sx: 3.6, sy: 0.6, sz: 2.2, r: r0, c: [0.15, 0.15, 0.17] });
    parts.push({ x: e0[0], y: 1.1, z: e0[1], sx: 2.6, sy: 1.0, sz: 2.0, r: r0, c: [0.97, 0.74, 0.08] });
    parts.push({ x: e2[0], y: 2.0, z: e2[1], sx: 1.3, sy: 0.9, sz: 1.5, r: r0, c: [0.2, 0.26, 0.32] });
    parts.push({ x: e1[0], y: 1.9, z: e1[1], sx: 4.2, sy: 0.4, sz: 0.5, r: r0, c: [0.97, 0.74, 0.08] });
    parts.push({ x: pile[0], y: 0.45, z: pile[1], sx: 2.6, sy: 0.9, sz: 2.6, r: r0 + 0.5, c: [0.45, 0.36, 0.28] });
    parts.push({ x: pile[0], y: 1.0, z: pile[1], sx: 1.5, sy: 0.6, sz: 1.5, r: r0 + 0.2, c: [0.5, 0.4, 0.31] });
    // cartelli "lavori" all'inizio e alla fine, e coni a diagonale
    for (const u of [-1, 1]) {
      const sp = P(u * (Z / 2 + 13), sd * (hw + 0.9)); parts.push({ x: sp[0], y: 1.0, z: sp[1], sx: 0.1, sy: 2.0, sz: 0.1, c: [0.3, 0.3, 0.32] });
      parts.push({ x: sp[0], y: 2.1, z: sp[1], sx: 0.08, sy: 1.0, sz: 1.0, r: r0, c: [1, 0.85, 0.1] }); parts.push({ x: sp[0], y: 2.1, z: sp[1], sx: 0.09, sy: 0.5, sz: 0.2, r: r0, c: [0.1, 0.1, 0.1] });
      for (let k = 0; k < 5; k++) { const q = P(u * (Z / 2 + 1.5 + k * 2.4), sd * (hw - bw + (bw + 0.2) * (k + 1) / 5)); this.cones.push({ x: q[0], z: q[1] }); }
    }
    for (let k = 0; k < 4; k++) { const q = P(-Z / 2 + 3 + k * 3, l0 - sd * 0.5); this.cones.push({ x: q[0], z: q[1] }); }
  }

  reset() {
    this.c = this.cones.map((c) => ({ x: c.x, y: 0, z: c.z, vx: 0, vy: 0, vz: 0, rz: 0, rx: 0, st: 0, ox: c.x, oz: c.z }));
    this.dirty = true; this.draw();
  }

  update(dt, player) {
    const pf = [Math.cos(player.h), Math.sin(player.h)];
    for (const k of this.c) {
      if (k.st === 0 && Math.abs(k.x - player.x) < 4 && Math.abs(k.z - player.z) < 4 && player.clear < 0.8) {
        for (const po of [-1.4, 0, 1.4]) if (Math.hypot(k.x - (player.x + pf[0] * po), k.z - (player.z + pf[1] * po)) < 1.2) {
          k.st = 1; k.vx = player.vx * 0.9 + (Math.random() - 0.5) * 2; k.vz = player.vz * 0.9 + (Math.random() - 0.5) * 2; k.vy = 5 + Math.random() * 4; k.rz = (Math.random() - 0.5) * 8; k.rx = (Math.random() - 0.5) * 8; this.dirty = true; break;
        }
      }
      if (k.st === 1) {
        k.vy -= 18 * dt; k.x += k.vx * dt; k.z += k.vz * dt; k.y += k.vy * dt; k.tilt = (k.tilt || 0) + dt * 6; this.dirty = true;
        if (k.y <= 0) { k.y = 0; if (k.vy < -2) { k.vy *= -0.3; k.vx *= 0.7; k.vz *= 0.7; } else { k.vy = 0; k.vx *= 0.9; k.vz *= 0.9; if (Math.hypot(k.vx, k.vz) < 0.4) { k.st = 2; k.tilt = 1.45; } } }
      }
    }
    if (this.dirty) this.draw();
  }

  draw() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
    this.c.forEach((k, i) => { e.set(k.st ? (k.tilt || 0) * (k.rx > 0 ? 1 : -1) : 0, 0, k.st ? (k.tilt || 0) * (k.rz > 0 ? 1 : -1) * 0.5 : 0); q.setFromEuler(e); pos.set(k.x, 0.14 + k.y, k.z); m.compose(pos, q, sc); this.cm.setMatrixAt(i, m); });
    this.cm.count = this.c.length; this.cm.instanceMatrix.needsUpdate = true; this.dirty = false;
  }
}
