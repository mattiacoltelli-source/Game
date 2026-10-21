import * as THREE from '../lib/three.module.min.js';
import { mergeBoxes } from './geom.js';

// Arredo urbano lungo il corridoio della corsa: panchine, cestini, motorini, biciclette sui marciapiedi e tombini sull'asfalto.
// Posizioni deterministiche (stesso seme), istanze statiche: 5 draw call in tutto.
const SIDE_ROADS = new Set(['residential', 'tertiary', 'secondary', 'primary', 'pedestrian', 'living_street', 'unclassified']);
const WOOD = [0.5, 0.34, 0.2], METAL = [0.25, 0.27, 0.3], DARK = [0.1, 0.1, 0.12], GREEN = [0.16, 0.34, 0.2];
const MODELS = {
  bench: () => [{ x: 0, y: 0.5, z: 0, sx: 1.7, sy: 0.08, sz: 0.5, c: WOOD }, { x: -0.2, y: 0.8, z: -0.22, sx: 1.7, sy: 0.4, sz: 0.06, c: WOOD }, { x: -0.7, y: 0.25, z: 0, sx: 0.08, sy: 0.5, sz: 0.5, c: METAL }, { x: 0.7, y: 0.25, z: 0, sx: 0.08, sy: 0.5, sz: 0.5, c: METAL }],
  bin: () => [{ x: 0, y: 0.45, z: 0, sx: 0.5, sy: 0.9, sz: 0.5, c: GREEN }, { x: 0, y: 0.93, z: 0, sx: 0.56, sy: 0.08, sz: 0.56, c: DARK }],
  scooter: (col) => [{ x: 0, y: 0.35, z: 0, sx: 1.4, sy: 0.25, sz: 0.3, c: col }, { x: 0.55, y: 0.75, z: 0, sx: 0.12, sy: 0.7, sz: 0.5, c: DARK }, { x: -0.25, y: 0.65, z: 0, sx: 0.55, sy: 0.12, sz: 0.28, c: DARK }, { x: 0.6, y: 0.18, z: 0, sx: 0.36, sy: 0.36, sz: 0.1, c: DARK }, { x: -0.6, y: 0.18, z: 0, sx: 0.36, sy: 0.36, sz: 0.1, c: DARK }, { x: 0.4, y: 0.5, z: 0, sx: 0.18, sy: 0.45, sz: 0.28, c: col }],
  bike: () => [{ x: 0, y: 0.5, z: 0, sx: 1.2, sy: 0.07, sz: 0.06, c: [0.7, 0.15, 0.12] }, { x: 0.58, y: 0.3, z: 0, sx: 0.55, sy: 0.55, sz: 0.06, c: DARK }, { x: -0.58, y: 0.3, z: 0, sx: 0.55, sy: 0.55, sz: 0.06, c: DARK }, { x: 0.55, y: 0.85, z: 0, sx: 0.06, sy: 0.12, sz: 0.5, c: DARK }, { x: -0.4, y: 0.82, z: 0, sx: 0.28, sy: 0.07, sz: 0.14, c: DARK }],
};
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Street {
  constructor(scene, world, col) {
    const corr = world.details.corridor, R = rng(20260), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1);
    const near = (x, z) => { for (let i = 0; i < corr.length; i++) if (Math.hypot(corr[i][0] - x, corr[i][1] - z) < 120) return true; return false; };
    const list = { bench: [], bin: [], scooter: [], bike: [], hole: [] }, cap = { bench: 40, bin: 60, scooter: 80, bike: 60, hole: 90 };
    for (const r of world.roads) {
      if (!SIDE_ROADS.has(r.c)) continue; const p = r.p, hw = r.w / 2;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az); if (L < 8) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux, ang = Math.atan2(uz, ux);
        if (!near((ax + bx) / 2, (az + bz) / 2)) continue;
        for (let s = 5 + R() * 6; s < L - 4; s += 9 + R() * 14) {
          const x = ax + ux * s, z = az + uz * s, side = R() < 0.5 ? 1 : -1, pick = R(); if (world.groundY && world.groundY(x, z) > 0.3) continue;
          let kind, off, a2 = ang + (side < 0 ? Math.PI : 0);
          if (pick < 0.12) { kind = 'bench'; off = hw + 1.0; } else if (pick < 0.32) { kind = 'bin'; off = hw + 0.7; } else if (pick < 0.62) { kind = 'scooter'; off = hw + 0.9 + R() * 0.3; a2 = ang + (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 0.5; } else if (pick < 0.8) { kind = 'bike'; off = hw + 0.8; a2 = ang + Math.PI / 2 + (R() - 0.5) * 0.3; } else { kind = 'hole'; off = (R() - 0.5) * Math.min(hw, 2.2); }
          const px = x + nx * side * off, pz = z + nz * side * off;
          if (kind !== 'hole' && col.inside(px, pz)) continue; if (list[kind].length < cap[kind]) list[kind].push([px, pz, a2, R()]);
        }
      }
    }
    const COLS = [[0.75, 0.15, 0.12], [0.15, 0.35, 0.7], [0.85, 0.8, 0.7], [0.1, 0.1, 0.12], [0.8, 0.6, 0.1]];
    this.count = 0; this.meshes = [];
    for (const kind of ['bench', 'bin', 'scooter', 'bike']) {
      const items = list[kind]; if (!items.length) continue;
      const geo = mergeBoxes(MODELS[kind](kind === 'scooter' ? [0.7, 0.7, 0.72] : null)), mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => { q.setFromAxisAngle(up, -it[2]); m.compose(new THREE.Vector3(it[0], 0.17, it[1]), q, sc); im.setMatrixAt(i, m); if (kind === 'scooter') { const c = COLS[Math.floor(it[3] * COLS.length)]; im.setColorAt(i, new THREE.Color(c[0] / 0.7, c[1] / 0.7, c[2] / 0.72)); } });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.frustumCulled = false; scene.add(im); this.meshes.push(im); this.count += items.length;
    }
    // tombini
    const hg = new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2), hm = new THREE.MeshBasicMaterial({ color: 0x3b3b40, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), hi = new THREE.InstancedMesh(hg, hm, list.hole.length || 1);
    list.hole.forEach((it, i) => { m.compose(new THREE.Vector3(it[0], 0.19, it[1]), q.identity(), sc); hi.setMatrixAt(i, m); }); hi.count = list.hole.length; hi.instanceMatrix.needsUpdate = true; hi.frustumCulled = false; scene.add(hi); this.meshes.push(hi); this.count += list.hole.length;
  }
}
