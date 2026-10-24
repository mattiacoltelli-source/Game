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
    this.junctions(scene, world, near, col);
    this.cafes(scene, world, near, col, R);
    // tombini
    const hg = new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2), hm = new THREE.MeshBasicMaterial({ color: 0x3b3b40, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), hi = new THREE.InstancedMesh(hg, hm, list.hole.length || 1);
    list.hole.forEach((it, i) => { m.compose(new THREE.Vector3(it[0], 0.19, it[1]), q.identity(), sc); hi.setMatrixAt(i, m); }); hi.count = list.hole.length; hi.instanceMatrix.needsUpdate = true; hi.frustumCulled = false; scene.add(hi); this.meshes.push(hi); this.count += list.hole.length;
  }

  // Dehors dei bar: tavolini con ombrelloni colorati e sedie sul bordo delle strade pedonali e delle piazze vicine al percorso.
  cafes(scene, world, near, col, R) {
    const spots = [], up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
    for (const r of world.roads) {
      if (r.c !== 'pedestrian' && r.c !== 'living_street') continue; const p = r.p;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az); if (L < 10 || !near((ax + bx) / 2, (az + bz) / 2)) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
        for (let t = 6 + R() * 8; t < L - 4 && spots.length < 70; t += 18 + R() * 14) { const side = R() < 0.5 ? 1 : -1, off = r.w / 2 - 0.2, x = ax + ux * t + nx * side * off, z = az + uz * t + nz * side * off; if (!col.inside(x, z)) spots.push([x, z, Math.atan2(uz, ux), Math.floor(R() * 3)]); }
      }
    }
    if (!spots.length) return;
    const UMB = [[0.8, 0.15, 0.14], [0.15, 0.45, 0.22], [0.92, 0.88, 0.76]], TAB = [0.25, 0.25, 0.28], CH = [0.3, 0.2, 0.14];
    for (let v = 0; v < 3; v++) {
      const list = spots.filter((s) => s[3] === v); if (!list.length) continue;
      const parts = []; for (const dz of [-2.2, 2.2]) { parts.push({ x: 0, y: 0.75, z: dz, sx: 0.08, sy: 1.5, sz: 0.08, c: TAB }, { x: 0, y: 1.6, z: dz, sx: 2.6, sy: 0.12, sz: 2.6, c: UMB[v] }, { x: 0, y: 1.72, z: dz, sx: 1.3, sy: 0.14, sz: 1.3, c: UMB[v] }, { x: 0, y: 0.72, z: dz, sx: 0.9, sy: 0.06, sz: 0.9, c: TAB }, { x: 0.8, y: 0.45, z: dz, sx: 0.45, sy: 0.9, sz: 0.45, c: CH }, { x: -0.8, y: 0.45, z: dz, sx: 0.45, sy: 0.9, sz: 0.45, c: CH }); }
      const im = new THREE.InstancedMesh(mergeBoxes(parts), new THREE.MeshLambertMaterial({ vertexColors: true }), list.length);
      list.forEach((s, i) => { q.setFromAxisAngle(up, -s[2]); m.compose(new THREE.Vector3(s[0], 0.17, s[1]), q, one); im.setMatrixAt(i, m); }); im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; scene.add(im); this.meshes.push(im); this.count += list.length;
    }
  }

  // Incroci vicini al percorso: semafori (ciclo di colori), cartelli (stop, parcheggio, pericolo) e strisce pedonali sulle strade principali.
  junctions(scene, world, near, col) {
    this.sites = []; const DRV = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential']), nodes = new Map(), key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
    world.roads.forEach((r, ri) => {
      if (!DRV.has(r.c)) return; const p = r.p, n = p.length / 2;
      for (let i = 0; i < n; i++) {
        const x = p[i * 2], z = p[i * 2 + 1]; if (!near(x, z)) continue; let nd = nodes.get(key(x, z)); if (!nd) nodes.set(key(x, z), nd = { x, z, arms: [] });
        for (const j of [i - 1, i + 1]) { if (j < 0 || j >= n) continue; const dx = p[j * 2] - x, dz = p[j * 2 + 1] - z, L = Math.hypot(dx, dz); if (L < 1) continue; nd.arms.push({ dx: dx / L, dz: dz / L, w: r.w, r }); }
      }
    });
    const heads = [], plates = [], zebras = [], lamps = [], rg = (v) => v * 1103515245 % 4294967296;
    let seed = 12345; const R = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const nd of nodes.values()) {
      const arms = []; for (const a of nd.arms) if (!arms.some((b) => a.dx * b.dx + a.dz * b.dz > 0.94)) arms.push(a);
      if (arms.length < 3 || world.groundY(nd.x, nd.z) > 0.2) continue;
      arms.sort((a, b) => b.w - a.w); const main = arms.filter((a) => a.w >= 7);
      const d0 = arms[0]; let lights = 0;
      for (const a of arms) {
        const hw = a.w * 0.55 / 2 + 0.2, rx = a.dz, rz = -a.dx; // destra del veicolo che arriva (cioè verso il centro dell'incrocio)
        // strisce pedonali sulle strade larghe
        if (a.w >= 7 && zebras.length < 420) { this.sites.push({ x: nd.x + a.dx * 8, z: nd.z + a.dz * 8, ux: a.dx, uz: a.dz, w: a.w }); const cx = nd.x + a.dx * 8, cz = nd.z + a.dz * 8, len = Math.min(a.w * 0.85, 8); for (let k = -3; k <= 3; k++) zebras.push([cx + a.dx * k * 0.9, cz + a.dz * k * 0.9, Math.atan2(a.dz, a.dx), len]); }
        // semaforo sui bracci principali (al massimo 3 per incrocio)
        if (a.w >= 8 && lights < 3 && heads.length < 90) { lights++; const px = nd.x + a.dx * 7.5 + rx * (hw + 1.0), pz = nd.z + a.dz * 7.5 + rz * (hw + 1.0); if (!col.inside(px, pz)) heads.push({ x: px, z: pz, ax: a.dx, az: a.dz, nx: nd.x, nz: nd.z, h: Math.atan2(a.dz, a.dx), g: Math.abs(a.dx * d0.dx + a.dz * d0.dz) > 0.7 ? 0 : 1 }); }
        else if (a.w < 7 && plates.length < 70 && R() < 0.6) { const px = nd.x + a.dx * 4.5 + rx * (hw + 0.8), pz = nd.z + a.dz * 4.5 + rz * (hw + 0.8); if (!col.inside(px, pz)) plates.push({ x: px, z: pz, h: Math.atan2(a.dz, a.dx), t: R() < 0.45 ? 0 : R() < 0.6 ? 1 : 2 }); }
      }
    }
    const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
    // semafori: palo + testa (statici) e 3 lampade per testa (colore dinamico)
    if (heads.length) {
      const geo = mergeBoxes([{ x: 0, y: 2.1, z: 0, sx: 0.14, sy: 4.2, sz: 0.14, c: [0.22, 0.23, 0.26] }, { x: 0.2, y: 3.8, z: 0, sx: 0.5, sy: 1.25, sz: 0.4, c: [0.12, 0.12, 0.14] }, { x: 0.2, y: 4.55, z: 0, sx: 0.5, sy: 0.12, sz: 0.5, c: [0.12, 0.12, 0.14] }]);
      this.tl = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), heads.length); this.tl.frustumCulled = false;
      this.lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.26, 0.26), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }), heads.length * 3); this.lamps.frustumCulled = false;
      this.heads = heads; this.lampCol = new THREE.Color();
      heads.forEach((h, i) => { q.setFromAxisAngle(up, -h.h); m.compose(new THREE.Vector3(h.x, 0.17, h.z), q, one); this.tl.setMatrixAt(i, m);
        for (let k = 0; k < 3; k++) { const ly = 4.2 - k * 0.4, lx = 0.2 + 0.26, cs = Math.cos(h.h), sn = Math.sin(h.h); m.compose(new THREE.Vector3(h.x + lx * cs, 0.17 + ly, h.z + lx * sn), q, one); this.lamps.setMatrixAt(i * 3 + k, m); } });
      this.tl.instanceMatrix.needsUpdate = this.lamps.instanceMatrix.needsUpdate = true; scene.add(this.tl, this.lamps); this.meshes.push(this.tl, this.lamps); this.tlT = 0; this.lightsUpdate(0); this.count += heads.length;
    }
    // cartelli: palo + piastra colorata (rosso stop/divieto, blu parcheggio, giallo pericolo)
    if (plates.length) {
      const geo = mergeBoxes([{ x: 0, y: 1.2, z: 0, sx: 0.08, sy: 2.4, sz: 0.08, c: [0.35, 0.36, 0.4] }, { x: 0.06, y: 2.35, z: 0, sx: 0.05, sy: 0.65, sz: 0.65, c: [1, 1, 1] }]), im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), plates.length), C = [[1.0, 0.25, 0.22], [0.25, 0.45, 1.0], [1.0, 0.85, 0.2]];
      plates.forEach((p, i) => { q.setFromAxisAngle(up, -p.h); m.compose(new THREE.Vector3(p.x, 0.17, p.z), q, one); im.setMatrixAt(i, m); im.setColorAt(i, new THREE.Color(...C[p.t])); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.frustumCulled = false; scene.add(im); this.meshes.push(im); this.count += plates.length;
    }
    // strisce pedonali: lastrine bianche piatte
    if (zebras.length) {
      const zm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdedbd0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), zebras.length);
      zebras.forEach((z, i) => { q.setFromAxisAngle(up, -z[2]); m.compose(new THREE.Vector3(z[0], 0.2, z[1]), q, new THREE.Vector3(0.45, 1, z[3])); zm.setMatrixAt(i, m); });
      zm.instanceMatrix.needsUpdate = true; zm.frustumCulled = false; scene.add(zm); this.meshes.push(zm); this.count += zebras.length;
    }
  }

  // Stato (0 rosso, 1 giallo, 2 verde) del semaforo `h`: stesso ciclo dei colori disegnati.
  state(h) { const ph = ((this.tlT || 0) + h.g * 8) % 16; return ph < 7 ? 2 : ph < 8.5 ? 1 : 0; }

  // Colori dei semafori: ciclo di 16 s, i due gruppi di bracci sono sfasati di 8 s (verde 7 s, giallo 1,5 s, rosso il resto).
  lightsUpdate(dt) {
    if (!this.heads) return; this.tlT += dt; const t = this.tlT, c = this.lampCol, dim = 0.12;
    this.heads.forEach((h, i) => {
      const ph = (t + h.g * 8) % 16, st = ph < 7 ? 2 : ph < 8.5 ? 1 : 0; // 0 rosso, 1 giallo, 2 verde
      for (let k = 0; k < 3; k++) { const on = k === st ? 1 : dim, base = k === 0 ? [1, 0.12, 0.1] : k === 1 ? [1, 0.75, 0.1] : [0.15, 1, 0.3]; c.setRGB(base[0] * on, base[1] * on, base[2] * on); this.lamps.setColorAt(i * 3 + k, c); }
    });
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }

  update(dt) { this.acc = (this.acc || 0) + dt; if (this.acc > 0.5) { this.lightsUpdate(this.acc); this.acc = 0; } }
}
