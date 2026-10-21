import * as THREE from '../lib/three.module.min.js';
import { VIEW } from './config.js';

const R_EARTH = 6371000;
export function makeProjector(origin) {
  const la0 = origin[0] * Math.PI / 180, lo0 = origin[1] * Math.PI / 180, k = Math.cos(la0);
  return (lat, lon) => [(lon * Math.PI / 180 - lo0) * k * R_EARTH, -(lat * Math.PI / 180 - la0) * R_EARTH];
}

export async function loadData(onProgress) {
  const names = ['roads', 'buildings', 'areas'];
  const { DATA_URLS } = await import('./config.js');
  const out = {};
  let done = 0;
  await Promise.all(names.map(async (n) => {
    const r = await fetch(DATA_URLS[n]);
    if (!r.ok) throw new Error(`Impossibile caricare ${DATA_URLS[n]} (${r.status})`);
    out[n] = await r.json();
    onProgress && onProgress(++done / names.length);
  }));
  return out;
}

// Colori (RGB 0..1)
const C = {
  ground: [0.80, 0.78, 0.71], green: [0.56, 0.70, 0.45], wood: [0.42, 0.60, 0.38], water: [0.48, 0.65, 0.78],
  road: [0.28, 0.28, 0.31], roadMajor: [0.24, 0.24, 0.27], service: [0.36, 0.36, 0.38], pedestrian: [0.66, 0.62, 0.55],
};
const ROAD_STYLE = { // [colore, quota y, scala larghezza]
  motorway: ['roadMajor', 0.16, 1], trunk: ['roadMajor', 0.16, 1], primary: ['roadMajor', 0.15, 1.05], secondary: ['roadMajor', 0.14, 1.05],
  tertiary: ['road', 0.13, 1.05], unclassified: ['road', 0.12, 1.1], residential: ['road', 0.11, 1.1], living_street: ['road', 0.10, 1.1],
  service: ['service', 0.09, 1.1], track: ['service', 0.08, 1], pedestrian: ['pedestrian', 0.07, 1],
};
const AREA_Y = { green: 0.03, wood: 0.04, water: 0.05, river: 0.05 };

export const GROUND_COLOR = C.ground;

export class World {
  constructor(data) {
    this.meta = data.roads.meta;
    this.project = makeProjector(this.meta.origin);
    [this.x0, this.z0, this.x1, this.z1] = this.meta.bounds;
    this.cols = Math.ceil((this.x1 - this.x0) / VIEW.cell);
    this.rows = Math.ceil((this.z1 - this.z0) / VIEW.cell);

    this.roads = data.roads.roads;
    this.areas = data.areas.areas.filter((a) => a.k !== 'river');
    this.rivers = data.areas.areas.filter((a) => a.k === 'river');
    // edifici: anello aperto (senza punto di chiusura duplicato) in Float32Array
    this.buildings = [];
    for (const b of data.buildings.buildings) {
      let p = b.p, n = p.length / 2;
      if (p[0] === p[p.length - 2] && p[1] === p[p.length - 1]) n--;
      if (n < 3) continue;
      this.buildings.push({ pts: Float32Array.from(p.slice(0, n * 2)), h: b.h });
    }

    this.cellOf = (x, z) => {
      const cx = Math.floor((x - this.x0) / VIEW.cell), cz = Math.floor((z - this.z0) / VIEW.cell);
      return (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) ? -1 : cz * this.cols + cx;
    };
    const mk = () => new Map();
    this.cB = mk(); this.cS = mk(); this.cV = mk(); this.cA = mk();
    const add = (m, k, ...v) => { if (k < 0) return; let a = m.get(k); if (!a) m.set(k, a = []); a.push(...v); };

    this.buildings.forEach((b, i) => {
      let sx = 0, sz = 0; const n = b.pts.length / 2;
      for (let j = 0; j < n; j++) { sx += b.pts[j * 2]; sz += b.pts[j * 2 + 1]; }
      add(this.cB, this.cellOf(sx / n, sz / n), i);
    });
    this.roads.forEach((r, ri) => {
      const p = r.p, n = p.length / 2;
      for (let i = 0; i < n - 1; i++) add(this.cS, this.cellOf((p[i * 2] + p[i * 2 + 2]) / 2, (p[i * 2 + 1] + p[i * 2 + 3]) / 2), ri, i);
      for (let i = 0; i < n; i++) { // dischi di raccordo agli incroci/curve/estremi
        let need = i === 0 || i === n - 1;
        if (!need) {
          const a1 = Math.atan2(p[i * 2 + 1] - p[i * 2 - 1], p[i * 2] - p[i * 2 - 2]);
          const a2 = Math.atan2(p[i * 2 + 3] - p[i * 2 + 1], p[i * 2 + 2] - p[i * 2]);
          let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
          need = d > 0.12;
        }
        if (need) add(this.cV, this.cellOf(p[i * 2], p[i * 2 + 1]), ri, i);
      }
    });
    this.areas.forEach((a, ai) => {
      let mnx = 1e9, mnz = 1e9, mxx = -1e9, mxz = -1e9;
      for (let i = 0; i < a.p.length; i += 2) { mnx = Math.min(mnx, a.p[i]); mxx = Math.max(mxx, a.p[i]); mnz = Math.min(mnz, a.p[i + 1]); mxz = Math.max(mxz, a.p[i + 1]); }
      for (let x = mnx; x <= mxx + VIEW.cell; x += VIEW.cell) for (let z = mnz; z <= mxz + VIEW.cell; z += VIEW.cell) {
        const k = this.cellOf(Math.min(x, mxx), Math.min(z, mxz));
        const arr = this.cA.get(k); if (!arr || arr[arr.length - 1] !== ai) add(this.cA, k, ai);
      }
    });

    this.group = new THREE.Group();
    this.cells = new Map(); // key -> Group
    this.matGround = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.matBuilding = new THREE.MeshLambertMaterial({ vertexColors: true });
  }

  // Carica al massimo `maxBuild` celle vicine a (x,z), scarica quelle lontane.
  update(x, z, maxBuild = 1) {
    const R = VIEW.loadRadius, half = VIEW.cell * 0.71;
    const want = [];
    const cx0 = Math.floor((x - R - this.x0) / VIEW.cell), cx1 = Math.floor((x + R - this.x0) / VIEW.cell);
    const cz0 = Math.floor((z - R - this.z0) / VIEW.cell), cz1 = Math.floor((z + R - this.z0) / VIEW.cell);
    for (let cz = Math.max(0, cz0); cz <= Math.min(this.rows - 1, cz1); cz++)
      for (let cx = Math.max(0, cx0); cx <= Math.min(this.cols - 1, cx1); cx++) {
        const mx = this.x0 + (cx + 0.5) * VIEW.cell, mz = this.z0 + (cz + 0.5) * VIEW.cell;
        const d = Math.hypot(mx - x, mz - z);
        if (d < R + half) want.push([d, cz * this.cols + cx, cx, cz]);
      }
    want.sort((a, b) => a[0] - b[0]);
    const wantSet = new Set(want.map((w) => w[1]));
    for (const [k, g] of this.cells) {
      if (!wantSet.has(k)) { this.group.remove(g); g.traverse((o) => o.geometry && o.geometry.dispose()); this.cells.delete(k); }
    }
    let built = 0, pending = 0;
    for (const [, k, cx, cz] of want) {
      if (this.cells.has(k)) continue;
      if (built < maxBuild) { const g = this.buildCell(k, cx, cz); this.cells.set(k, g); this.group.add(g); built++; } else pending++;
    }
    return pending;
  }

  buildCell(key) {
    const g = new THREE.Group();
    const gp = [], gc = []; // terreno: posizioni, colori
    const tri = (P, Cc, a, b, c, col, n) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const dot = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
      if (dot < 0) { const t = b; b = c; c = t; }
      P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      Cc.push(col[0], col[1], col[2], col[0], col[1], col[2], col[0], col[1], col[2]);
    };
    const UP = [0, 1, 0];

    for (const ai of this.cA.get(key) || []) {
      const a = this.areas[ai], n = a.p.length / 2; let m = n;
      if (a.p[0] === a.p[a.p.length - 2] && a.p[1] === a.p[a.p.length - 1]) m--;
      const contour = []; for (let i = 0; i < m; i++) contour.push(new THREE.Vector2(a.p[i * 2], a.p[i * 2 + 1]));
      let idx; try { idx = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { continue; }
      const y = AREA_Y[a.k] || 0.03, col = C[a.k] || C.green;
      for (const t of idx) tri(gp, gc, [contour[t[0]].x, y, contour[t[0]].y], [contour[t[1]].x, y, contour[t[1]].y], [contour[t[2]].x, y, contour[t[2]].y], col, UP);
    }
    const segs = this.cS.get(key) || [];
    for (let s = 0; s < segs.length; s += 2) {
      const r = this.roads[segs[s]], i = segs[s + 1], p = r.p, st = ROAD_STYLE[r.c] || ROAD_STYLE.residential;
      const hw = r.w * st[2] / 2, y = st[1], col = C[st[0]];
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.01) continue;
      const nx = -dz / L * hw, nz = dx / L * hw;
      tri(gp, gc, [ax + nx, y, az + nz], [ax - nx, y, az - nz], [bx + nx, y, bz + nz], col, UP);
      tri(gp, gc, [bx + nx, y, bz + nz], [ax - nx, y, az - nz], [bx - nx, y, bz - nz], col, UP);
    }
    const vs = this.cV.get(key) || [];
    for (let s = 0; s < vs.length; s += 2) {
      const r = this.roads[vs[s]], i = vs[s + 1], st = ROAD_STYLE[r.c] || ROAD_STYLE.residential;
      const hw = r.w * st[2] / 2, y = st[1], col = C[st[0]], cx = r.p[i * 2], cz = r.p[i * 2 + 1];
      for (let k = 0; k < 8; k++) {
        const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2;
        tri(gp, gc, [cx, y, cz], [cx + Math.cos(a0) * hw, y, cz + Math.sin(a0) * hw], [cx + Math.cos(a1) * hw, y, cz + Math.sin(a1) * hw], col, UP);
      }
    }
    if (gp.length) g.add(this.makeMesh(gp, gc, null, this.matGround));

    // edifici
    const bp = [], bn = [], bc = [];
    for (const bi of this.cB.get(key) || []) this.addBuilding(this.buildings[bi], bi, bp, bn, bc);
    if (bp.length) g.add(this.makeMesh(bp, bc, bn, this.matBuilding));
    return g;
  }

  makeMesh(pos, col, nrm, mat) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (nrm) geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; m.updateMatrix(); return m;
  }

  // Passo 2: scatole grigie. (Passo 4: colori/facciate più curate.)
  addBuilding(b, bi, P, N, Cc) {
    const p = b.pts, n = p.length / 2, h = b.h;
    let A = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
    const s = A > 0 ? 1 : -1;
    const v = 0.58 + ((bi * 2654435761 >>> 0) % 1000) / 1000 * 0.14; // grigio variabile
    const wall = [v, v, v * 1.02], roof = [v * 1.12, v * 1.12, v * 1.15];
    const push = (a, b2, c, nn, col) => {
      const ux = b2[0] - a[0], uy = b2[1] - a[1], uz = b2[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const dot = (uy * vz - uz * vy) * nn[0] + (uz * vx - ux * vz) * nn[1] + (ux * vy - uy * vx) * nn[2];
      if (dot < 0) { const t = b2; b2 = c; c = t; }
      P.push(a[0], a[1], a[2], b2[0], b2[1], b2[2], c[0], c[1], c[2]);
      for (let k = 0; k < 3; k++) { N.push(nn[0], nn[1], nn[2]); Cc.push(col[0], col[1], col[2]); }
    };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.05) continue;
      const nn = [s * dz / L, 0, -s * dx / L];
      push([ax, 0, az], [bx, 0, bz], [bx, h, bz], nn, wall);
      push([ax, 0, az], [bx, h, bz], [ax, h, az], nn, wall);
    }
    const contour = []; for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(p[i * 2], p[i * 2 + 1]));
    let idx; try { idx = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { return; }
    for (const t of idx) push([contour[t[0]].x, h, contour[t[0]].y], [contour[t[1]].x, h, contour[t[1]].y], [contour[t[2]].x, h, contour[t[2]].y], [0, 1, 0], roof);
  }
}
