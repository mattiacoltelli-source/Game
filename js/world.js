import * as THREE from '../lib/three.module.min.js';
import { VIEW } from './config.js';

const R_EARTH = 6371000;
export function makeProjector(origin) {
  const la0 = origin[0] * Math.PI / 180, lo0 = origin[1] * Math.PI / 180, k = Math.cos(la0);
  return (lat, lon) => [(lon * Math.PI / 180 - lo0) * k * R_EARTH, -(lat * Math.PI / 180 - la0) * R_EARTH];
}

export async function loadData(onProgress) {
  const names = ['roads', 'buildings', 'areas', 'labels', 'extras'];
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
  road: [0.28, 0.28, 0.31], roadMajor: [0.24, 0.24, 0.27], service: [0.36, 0.36, 0.38], pedestrian: [0.70, 0.64, 0.57],
};
const ROAD_STYLE = { // [colore, quota y, scala larghezza]
  motorway: ['roadMajor', 0.16, 1], trunk: ['roadMajor', 0.16, 1], primary: ['roadMajor', 0.15, 1.05], secondary: ['roadMajor', 0.14, 1.05],
  tertiary: ['road', 0.13, 1.05], unclassified: ['road', 0.12, 1.1], residential: ['road', 0.11, 1.1], living_street: ['road', 0.10, 1.1],
  service: ['service', 0.09, 1.1], track: ['service', 0.08, 1], pedestrian: ['pedestrian', 0.07, 1],
};
const AREA_Y = { green: 0.03, wood: 0.04, water: 0.05, river: 0.05 };

export const GROUND_COLOR = C.ground;
const ARC_COLOR = [0.86, 0.62, 0.46];
const TYPE_STYLE = [null,
  { wall: [0.92, 0.86, 0.74], roof: [0.52, 0.32, 0.27] },                 // 1 chiesa
  { wall: [0.88, 0.91, 0.94], roof: [0.55, 0.58, 0.62] },                 // 2 ospedale
  { wall: [0.95, 0.86, 0.58], roof: [0.55, 0.35, 0.28] },                 // 3 scuola/università
  { wall: [0.68, 0.70, 0.72], roof: [0.55, 0.57, 0.59], plain: true },    // 4 capannone
  { wall: [0.84, 0.86, 0.88], roof: [0.52, 0.54, 0.57] },                 // 5 uffici/negozi
];
const SIDEWALK_ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential']);
const SIDEWALK = [0.74, 0.72, 0.68], LINE = [0.86, 0.84, 0.76];

// Facciate tipiche bolognesi: terracotta, ocra, rosa, crema.
const PALETTE = [[0.80, 0.47, 0.34], [0.86, 0.68, 0.40], [0.88, 0.60, 0.50], [0.90, 0.82, 0.66], [0.66, 0.37, 0.29], [0.76, 0.56, 0.38], [0.72, 0.68, 0.62], [0.92, 0.76, 0.55]];
const hash = (i) => ((i + 1) * 2654435761 >>> 0) / 4294967296;

// Lastricato di piazza: lastre chiare con fuga scura (4 m per lastra).
function makePlazaTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), sh = ['#ffffff', '#f2eee6', '#f8f5ee', '#ece7dd'];
  for (let i = 0; i < 4; i++) { g.fillStyle = sh[i]; g.fillRect((i % 2) * 32, Math.floor(i / 2) * 32, 32, 32); }
  g.fillStyle = '#cfc7b8'; g.fillRect(0, 0, 64, 2); g.fillRect(0, 32, 64, 2); g.fillRect(0, 0, 2, 64); g.fillRect(32, 0, 2, 64);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

// Portico: arcata scura con pilastri chiari (tile 4.2 m x 4.6 m).
function makeArcadeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#2b2321'; g.beginPath(); g.moveTo(10, 64); g.lineTo(10, 26); g.arc(32, 26, 22, Math.PI, 0); g.lineTo(54, 64); g.closePath(); g.fill();
  g.fillStyle = '#6a4d40'; g.fillRect(10, 58, 44, 6);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 2;
  return t;
}

// Una sola texture 64x64 (piano con finestra) ripetuta sulle facciate: un piano ~3.1 m x 3.4 m.
function makeFacadeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#e8e8e8'; g.fillRect(0, 56, 64, 8);            // cornice di piano
  g.fillStyle = '#4b5663'; g.fillRect(19, 12, 26, 32);           // vetro
  g.fillStyle = '#9aa5b1'; g.fillRect(19, 12, 26, 5);            // riflesso
  g.fillStyle = '#d9d2c4'; g.fillRect(16, 44, 32, 4);            // davanzale
  g.fillStyle = '#7b6a58'; g.fillRect(31, 12, 2, 32);            // telaio centrale
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 2;
  return t;
}

export class World {
  constructor(data) {
    this.meta = data.roads.meta;
    this.project = makeProjector(this.meta.origin);
    [this.x0, this.z0, this.x1, this.z1] = this.meta.bounds;
    this.cols = Math.ceil((this.x1 - this.x0) / VIEW.cell);
    this.rows = Math.ceil((this.z1 - this.z0) / VIEW.cell);

    this.roads = data.roads.roads;
    this.areas = data.areas.areas.filter((a) => a.k !== 'river' && a.k !== 'plaza');
    this.plazas = data.areas.areas.filter((a) => a.k === 'plaza');
    this.rivers = data.areas.areas.filter((a) => a.k === 'river');
    // edifici: anello aperto (senza punto di chiusura duplicato) in Float32Array
    this.buildings = [];
    for (const b of data.buildings.buildings) {
      let p = b.p, n = p.length / 2;
      if (p[0] === p[p.length - 2] && p[1] === p[p.length - 1]) n--;
      if (n < 3) continue;
      this.buildings.push({ pts: Float32Array.from(p.slice(0, n * 2)), h: b.h, k: b.k, t: b.t || 0, a: b.a ? new Set(b.a) : null });
    }

    this.cellOf = (x, z) => {
      const cx = Math.floor((x - this.x0) / VIEW.cell), cz = Math.floor((z - this.z0) / VIEW.cell);
      return (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) ? -1 : cz * this.cols + cx;
    };
    const mk = () => new Map();
    this.cB = mk(); this.cS = mk(); this.cV = mk(); this.cA = mk(); this.cRail = mk(); this.cWater = mk(); this.cT = mk(); this.cP = mk(); this.cL = mk(); this.cPar = mk();
    this.rails = data.roads.rails;
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
    const lineSegs = (list, map) => list.forEach((r, ri) => {
      for (let i = 0; i < r.p.length / 2 - 1; i++) add(map, this.cellOf((r.p[i * 2] + r.p[i * 2 + 2]) / 2, (r.p[i * 2 + 1] + r.p[i * 2 + 3]) / 2), ri, i);
    });
    lineSegs(this.rails, this.cRail); lineSegs(this.rivers, this.cWater);
    // piazze (lastricato), lampioni, parapetti dei ponti (solidi con collisione)
    this.plazas.forEach((a, ai) => {
      let mnx = 1e9, mnz = 1e9, mxx = -1e9, mxz = -1e9;
      for (let i = 0; i < a.p.length; i += 2) { mnx = Math.min(mnx, a.p[i]); mxx = Math.max(mxx, a.p[i]); mnz = Math.min(mnz, a.p[i + 1]); mxz = Math.max(mxz, a.p[i + 1]); }
      const seen = new Set();
      for (let x = mnx; x <= mxx + VIEW.cell; x += VIEW.cell) for (let z = mnz; z <= mxz + VIEW.cell; z += VIEW.cell) { const k = this.cellOf(Math.min(x, mxx), Math.min(z, mxz)); if (k >= 0 && !seen.has(k)) { seen.add(k); add(this.cP, k, ai); } }
    });
    const ex = data.extras;
    for (let i = 0; i < ex.lamps.length; i += 2) add(this.cL, this.cellOf(ex.lamps[i], ex.lamps[i + 1]), ex.lamps[i], ex.lamps[i + 1]);
    this.parapets = [];
    for (const br of ex.bridges) {
      const p = br.p, hw = br.w / 2 + 0.35;
      for (let i = 0; i < p.length / 2 - 1; i++) {
        const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.5) continue;
        const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
        for (const sd of [-1, 1]) {
          const cx = (ax + bx) / 2 + nx * hw * sd, cz = (az + bz) / 2 + nz * hw * sd, hl = L / 2 + 0.25, ht = 0.25;
          const rect = [cx - ux * hl - nx * ht, cz - uz * hl - nz * ht, cx + ux * hl - nx * ht, cz + uz * hl - nz * ht, cx + ux * hl + nx * ht, cz + uz * hl + nz * ht, cx - ux * hl + nx * ht, cz - uz * hl + nz * ht];
          const par = { pts: Float32Array.from(rect), h: 1.1, solid: true, c: [cx, cz, L + 0.5, Math.atan2(uz, ux)] };
          this.parapets.push(par); add(this.cPar, this.cellOf(cx, cz), this.parapets.length - 1);
        }
      }
    }
    this.buildings.push(...this.parapets); // collisione
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
    this.matPlain = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.matBuilding = new THREE.MeshLambertMaterial({ vertexColors: true, map: makeFacadeTexture() });
    this.matArcade = new THREE.MeshLambertMaterial({ vertexColors: true, map: makeArcadeTexture() });
    this.matPlaza = new THREE.MeshBasicMaterial({ vertexColors: true, map: makePlazaTexture() });
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
    const PP = { p: [], c: [], u: [] }, pcol = [0.84, 0.78, 0.70];
    for (const ai of this.cP.get(key) || []) {
      const a = this.plazas[ai], n = a.p.length / 2; let m = n;
      if (a.p[0] === a.p[a.p.length - 2] && a.p[1] === a.p[a.p.length - 1]) m--;
      const contour = []; for (let i = 0; i < m; i++) contour.push(new THREE.Vector2(a.p[i * 2], a.p[i * 2 + 1]));
      let idx; try { idx = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { continue; }
      for (const t of idx) {
        const A = contour[t[0]], B2 = contour[t[1]], C2 = contour[t[2]], y = 0.045;
        const cr = (B2.x - A.x) * (C2.y - A.y) - (B2.y - A.y) * (C2.x - A.x); // winding verso l'alto
        const tr = cr > 0 ? [A, C2, B2] : [A, B2, C2];
        for (const q of tr) { PP.p.push(q.x, y, q.y); PP.c.push(pcol[0], pcol[1], pcol[2]); PP.u.push(q.x / 4, q.y / 4); }
      }
    }
    const segs = this.cS.get(key) || [];
    for (let s = 0; s < segs.length; s += 2) {
      const r = this.roads[segs[s]], i = segs[s + 1], p = r.p, st = ROAD_STYLE[r.c] || ROAD_STYLE.residential;
      const hw = r.w * st[2] / 2, y = st[1], col = C[st[0]];
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.01) continue;
      let nx = -dz / L * hw, nz = dx / L * hw;
      if (SIDEWALK_ROADS.has(r.c)) { // marciapiede: fascia più larga sotto l'asfalto
        const sx = -dz / L * (hw + 1.3), sz = dx / L * (hw + 1.3), sy = 0.06;
        tri(gp, gc, [ax + sx, sy, az + sz], [ax - sx, sy, az - sz], [bx + sx, sy, bz + sz], SIDEWALK, UP);
        tri(gp, gc, [bx + sx, sy, bz + sz], [ax - sx, sy, az - sz], [bx - sx, sy, bz - sz], SIDEWALK, UP);
      }
      tri(gp, gc, [ax + nx, y, az + nz], [ax - nx, y, az - nz], [bx + nx, y, bz + nz], col, UP);
      tri(gp, gc, [bx + nx, y, bz + nz], [ax - nx, y, az - nz], [bx - nx, y, bz - nz], col, UP);
      if (hw >= 4.5) { // mezzeria sulle strade principali
        const lx = -dz / L * 0.1, lz = dx / L * 0.1, ly = y + 0.03;
        tri(gp, gc, [ax + lx, ly, az + lz], [ax - lx, ly, az - lz], [bx + lx, ly, bz + lz], LINE, UP);
        tri(gp, gc, [bx + lx, ly, bz + lz], [ax - lx, ly, az - lz], [bx - lx, ly, bz - lz], LINE, UP);
      }
    }
    const vs = this.cV.get(key) || [];
    for (let s = 0; s < vs.length; s += 2) {
      const r = this.roads[vs[s]], i = vs[s + 1], st = ROAD_STYLE[r.c] || ROAD_STYLE.residential;
      const hw = r.w * st[2] / 2, y = st[1], col = C[st[0]], cx = r.p[i * 2], cz = r.p[i * 2 + 1];
      if (SIDEWALK_ROADS.has(r.c)) {
        const sw = hw + 1.3;
        for (let k = 0; k < 8; k++) {
          const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2;
          tri(gp, gc, [cx, 0.06, cz], [cx + Math.cos(a0) * sw, 0.06, cz + Math.sin(a0) * sw], [cx + Math.cos(a1) * sw, 0.06, cz + Math.sin(a1) * sw], SIDEWALK, UP);
        }
      }
      for (let k = 0; k < 8; k++) {
        const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2;
        tri(gp, gc, [cx, y, cz], [cx + Math.cos(a0) * hw, y, cz + Math.sin(a0) * hw], [cx + Math.cos(a1) * hw, y, cz + Math.sin(a1) * hw], col, UP);
      }
    }
    // ferrovia (massicciata + traversine scure) e canali (Navile ecc.)
    const ribbon = (list, segsArr, w, y, col, ext) => {
      for (let q = 0; q < segsArr.length; q += 2) {
        const p = list[segsArr[q]].p, i = segsArr[q + 1], hw = w / 2;
        let ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.01) continue;
        const ux = dx / L, uz = dz / L; ax -= ux * ext; az -= uz * ext; bx += ux * ext; bz += uz * ext;
        const nx = -uz * hw, nz = ux * hw;
        tri(gp, gc, [ax + nx, y, az + nz], [ax - nx, y, az - nz], [bx + nx, y, bz + nz], col, UP);
        tri(gp, gc, [bx + nx, y, bz + nz], [ax - nx, y, az - nz], [bx - nx, y, bz - nz], col, UP);
      }
    };
    const rl = this.cRail.get(key); if (rl) { ribbon(this.rails, rl, 3.4, 0.05, [0.47, 0.43, 0.38], 0.3); ribbon(this.rails, rl, 1.5, 0.06, [0.25, 0.24, 0.26], 0.3); }
    const wt = this.cWater.get(key); if (wt) ribbon(this.rivers, wt, 7, 0.045, C.water, 3);
    if (gp.length) g.add(this.makeMesh(gp, gc, null, this.matGround));

    if (PP.p.length) { const m = this.makeMesh(PP.p, PP.c, null, this.matPlaza); m.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(PP.u, 2)); g.add(m); }
    // lampioni e parapetti dei ponti
    const lp = this.cL.get(key), pr = this.cPar.get(key);
    const extra = { p: [], n: [], c: [] }; // lampioni, parapetti, alberi: stesso materiale dei tetti -> una sola mesh
    if (lp || pr) {
      const T = extra;
      if (lp) for (let q = 0; q < lp.length; q += 2) { this.box(T, lp[q], 2.7, lp[q + 1], 0.16, 5.4, 0.16, 0, [0.2, 0.21, 0.24]); this.box(T, lp[q], 5.5, lp[q + 1], 0.7, 0.22, 0.7, 0, [1.4, 1.3, 0.95]); }
      if (pr) for (const pi of pr) { const c = this.parapets[pi].c; this.box(T, c[0], 0.55, c[1], c[2], 1.1, 0.5, c[3], [0.8, 0.79, 0.75]); }
    }
    // alberi (parchi): tronco + chioma low-poly
    const tr = this.cT.get(key);
    if (tr) for (let q = 0; q < tr.length; q += 3) this.addTree(extra, tr[q], tr[q + 1], tr[q + 2]);

    // edifici: pareti con texture finestre (W), tetti e monumenti a tinta unita (Pl)
    const W = { p: [], n: [], c: [], u: [] }, Pl = { p: [], n: [], c: [] }, Ar = { p: [], n: [], c: [], u: [] };
    for (const bi of this.cB.get(key) || []) this.addBuilding(this.buildings[bi], bi, W, Pl, Ar);
    if (Ar.p.length) { const m = this.makeMesh(Ar.p, Ar.c, Ar.n, this.matArcade); m.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(Ar.u, 2)); g.add(m); }
    if (W.p.length) { const m = this.makeMesh(W.p, W.c, W.n, this.matBuilding); m.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(W.u, 2)); g.add(m); }
    for (const k2 of ['p', 'n', 'c']) for (let i = 0; i < extra[k2].length; i++) Pl[k2].push(extra[k2][i]);
    if (Pl.p.length) g.add(this.makeMesh(Pl.p, Pl.c, Pl.n, this.matPlain));
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

  // Posiziona alberi (deterministici) nei parchi, evitando edifici. Da chiamare dopo aver creato il Collider.
  plantTrees(col) {
    let total = 0;
    this.areas.forEach((a, ai) => {
      if (a.k !== 'green' && a.k !== 'wood') return;
      const p = a.p, n = p.length / 2; let A = 0, mnx = 1e9, mnz = 1e9, mxx = -1e9, mxz = -1e9;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; mnx = Math.min(mnx, p[i * 2]); mxx = Math.max(mxx, p[i * 2]); mnz = Math.min(mnz, p[i * 2 + 1]); mxz = Math.max(mxz, p[i * 2 + 1]); }
      A = Math.abs(A) / 2; if (A < 900) return;
      const step = a.k === 'wood' ? 7 : 12, jit = step * 0.35;
      let cnt = 0;
      for (let x = mnx; x < mxx && cnt < 120; x += step) for (let z = mnz; z < mxz && cnt < 120; z += step) {
        const h1 = hash(ai * 7919 + Math.floor(x * 3) + Math.floor(z * 5)), px = x + (h1 - 0.5) * jit * 2, pz = z + (hash(ai + Math.floor(z * 7) + 3) - 0.5) * jit * 2;
        if (h1 > 0.7) continue;
        let ins = false; for (let i = 0, j = n - 1; i < n; j = i++) if ((p[i * 2 + 1] > pz) !== (p[j * 2 + 1] > pz) && px < (p[j * 2] - p[i * 2]) * (pz - p[i * 2 + 1]) / (p[j * 2 + 1] - p[i * 2 + 1]) + p[i * 2]) ins = !ins;
        if (!ins || col.inside(px, pz) || col.push(px, pz, 2.5)) continue;
        const k = this.cellOf(px, pz); if (k < 0) continue;
        let arr = this.cT.get(k); if (!arr) this.cT.set(k, arr = []); arr.push(px, pz, 0.8 + hash(x + z) * 0.6); cnt++; total++;
      }
    });
    return total;
  }

  // Triangolo con normale calcolata, orientato verso l'esterno rispetto a `ctr`.
  triOut(B, a, b, c, ctr, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    if (nx * ((a[0] + b[0] + c[0]) / 3 - ctr[0]) + ny * ((a[1] + b[1] + c[1]) / 3 - ctr[1]) + nz * ((a[2] + b[2] + c[2]) / 3 - ctr[2]) < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    B.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let k = 0; k < 3; k++) { B.n.push(nx, ny, nz); B.c.push(col[0], col[1], col[2]); }
  }

  addTree(B, x, z, sc) {
    const trunk = [0.38, 0.27, 0.2], g0 = 0.85 + hash(x * 13 + z) * 0.3, leaf = [0.26 * g0, 0.5 * g0, 0.27 * g0];
    const tw = 0.22 * sc, th = 1.9 * sc, c0 = [x, th / 2, z];
    const q = [[x - tw, z - tw], [x + tw, z - tw], [x + tw, z + tw], [x - tw, z + tw]];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.triOut(B, [q[i][0], 0, q[i][1]], [q[j][0], 0, q[j][1]], [q[j][0], th, q[j][1]], c0, trunk); this.triOut(B, [q[i][0], 0, q[i][1]], [q[j][0], th, q[j][1]], [q[i][0], th, q[i][1]], c0, trunk); }
    const R = 1.9 * sc, y0 = th * 0.75, y1 = th + 1.5 * sc, y2 = th + 4.2 * sc, cc = [x, (y0 + y2) / 2, z];
    for (let i = 0; i < 6; i++) {
      const a0 = i / 6 * Math.PI * 2, a1 = (i + 1) / 6 * Math.PI * 2, p0 = [x + Math.cos(a0) * R, y1, z + Math.sin(a0) * R], p1 = [x + Math.cos(a1) * R, y1, z + Math.sin(a1) * R];
      this.triOut(B, p0, p1, [x, y2, z], cc, leaf); this.triOut(B, p0, p1, [x, y0, z], cc, [leaf[0] * 0.8, leaf[1] * 0.8, leaf[2] * 0.8]);
    }
  }

  // Triangolo orientato secondo la normale nn; colori per vertice (c0,c1,c2); uv opzionali.
  tri3(B, a, b, c, nn, c0, c1, c2, uvs) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const dot = (uy * vz - uz * vy) * nn[0] + (uz * vx - ux * vz) * nn[1] + (ux * vy - uy * vx) * nn[2];
    if (dot < 0) { let t = b; b = c; c = t; t = c1; c1 = c2; c2 = t; if (uvs) uvs = [uvs[0], uvs[2], uvs[1]]; }
    B.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let k = 0; k < 3; k++) B.n.push(nn[0], nn[1], nn[2]);
    B.c.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]);
    if (uvs && B.u) for (const q of uvs) B.u.push(q[0], q[1]);
  }

  // Anello di pareti lungo il contorno `pts` ([x,z]...) tra le quote y0 e y1; shear(x,y,z)->[x,y,z] opzionale.
  wallRing(B, pts, s, y0, y1, cLow, cHigh, uvScale, shear) {
    const n = pts.length, sh = shear || ((x, y, z) => [x, y, z]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = pts[i][0], az = pts[i][1], bx = pts[j][0], bz = pts[j][1];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.05) continue;
      const nn = [s * dz / L, 0, -s * dx / L];
      const A0 = sh(ax, y0, az), B0 = sh(bx, y0, bz), B1 = sh(bx, y1, bz), A1 = sh(ax, y1, az);
      const uL = uvScale ? L / 3.4 : 0, vH = uvScale ? (y1 - y0) / 3.1 : 0;
      this.tri3(B, A0, B0, B1, nn, cLow, cLow, cHigh, uvScale && [[0, 0], [uL, 0], [uL, vH]]);
      this.tri3(B, A0, B1, A1, nn, cLow, cHigh, cHigh, uvScale && [[0, 0], [uL, vH], [0, vH]]);
    }
  }

  // Singolo lato di parete con uv (tile u,v in metri).
  wallSeg(B, ax, az, bx, bz, s, y0, y1, cLow, cHigh, tu, tv) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.05) return;
    const nn = [s * dz / L, 0, -s * dx / L], uL = L / tu, vH = (y1 - y0) / tv;
    this.tri3(B, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], nn, cLow, cLow, cHigh, [[0, 0], [uL, 0], [uL, vH]]);
    this.tri3(B, [ax, y0, az], [bx, y1, bz], [ax, y1, az], nn, cLow, cHigh, cHigh, [[0, 0], [uL, vH], [0, vH]]);
  }

  addBuilding(b, bi, W, Pl, Ar) {
    const p = b.pts, n = p.length / 2, h = b.h;
    const pts = []; for (let i = 0; i < n; i++) pts.push([p[i * 2], p[i * 2 + 1]]);
    let A = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]; }
    const s = A > 0 ? 1 : -1;
    if (b.k) return this.addLandmark(b, pts, s, Pl, W, Ar);

    const tone = 0.92 + hash(bi + 7) * 0.16, ty = TYPE_STYLE[b.t];
    const base = ty ? ty.wall : PALETTE[Math.floor(hash(bi) * PALETTE.length)];
    const top = base.map((v) => Math.min(1, v * tone)), low = top.map((v) => v * 0.8);
    const flat = ty && ty.plain; // capannoni: pareti lisce
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = pts[i][0], az = pts[i][1], bx = pts[j][0], bz = pts[j][1];
      if (b.a && b.a.has(i) && h > 6) { // portico al piano terra
        this.wallSeg(Ar, ax, az, bx, bz, s, 0, 4.6, ARC_COLOR, ARC_COLOR, 4.2, 4.6);
        this.wallSeg(W, ax, az, bx, bz, s, 4.6, h, low, top, 3.4, 3.1);
      } else if (flat) this.wallSeg(Pl, ax, az, bx, bz, s, 0, h, low, top, 3.4, 3.1);
      else this.wallSeg(W, ax, az, bx, bz, s, 0, h, low, top, 3.4, 3.1);
    }
    const rf = ty ? ty.roof.map((v) => v * tone) : [0.44 * tone, 0.30 * tone, 0.27 * tone];
    const contour = pts.map((q) => new THREE.Vector2(q[0], q[1]));
    let idx; try { idx = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { return; }
    for (const t of idx) this.tri3(Pl, [contour[t[0]].x, h, contour[t[0]].y], [contour[t[1]].x, h, contour[t[1]].y], [contour[t[2]].x, h, contour[t[2]].y], [0, 1, 0], rf, rf, rf);
  }

  // Parallelepipedo orientato (rot = rotazione attorno a y, sx lungo l'asse locale u).
  box(B, cx, cy, cz, sx, sy, sz, rot, col) {
    const c = Math.cos(rot), sn = Math.sin(rot), ctr = [cx, cy, cz], P = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const d of [-1, 1]) {
      const lx = a * sx / 2, lz = b * sz / 2; P.push([cx + c * lx - sn * lz, cy + d * sy / 2, cz + sn * lx + c * lz]);
    }
    // indici: bit2=a, bit1=b, bit0=d
    const F = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [1, 3, 7, 5], [0, 2, 6, 4]]; // -a,+a,-b,+b,+d,-d
    for (const f of F) { this.triOut(B, P[f[0]], P[f[1]], P[f[2]], ctr, col); this.triOut(B, P[f[0]], P[f[2]], P[f[3]], ctr, col); }
  }

  // Merli ghibellini lungo il bordo del tetto.
  merlons(B, pts, s, y, col, w = 1.3, step = 2.7) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = pts[i][0], az = pts[i][1], dx = pts[j][0] - ax, dz = pts[j][1] - az, L = Math.hypot(dx, dz); if (L < 1.6) continue;
      const ux = dx / L, uz = dz / L, ox = -s * dz / L, oz = s * dx / L; // verso l'interno
      for (let t = 0.8; t < L - 0.6; t += step) this.box(B, ax + ux * t + ox * 0.4, y + 0.7, az + uz * t + oz * 0.4, w, 1.4, 0.8, Math.atan2(uz, ux), col);
    }
  }

  // Palazzo storico: pareti con finestre (W), portico (Ar) sui lati marcati (o su tutti i lati lunghi), tetto, merli.
  palace(b, pts, s, W, Pl, Ar, o) {
    const h = b.h, n = pts.length, top = o.wall, low = top.map((v) => v * 0.82);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = pts[i][0], az = pts[i][1], bx = pts[j][0], bz = pts[j][1], L = Math.hypot(bx - ax, bz - az);
      const arc = (b.a && b.a.has(i)) || (o.allArcade && L > 8);
      if (arc && h > 7) { this.wallSeg(Ar, ax, az, bx, bz, s, 0, 4.6, o.arc || ARC_COLOR, o.arc || ARC_COLOR, 4.2, 4.6); this.wallSeg(W, ax, az, bx, bz, s, 4.6, h, low, top, 3.4, 3.1); }
      else this.wallSeg(W, ax, az, bx, bz, s, 0, h, low, top, 3.4, 3.1);
    }
    const contour = pts.map((q) => new THREE.Vector2(q[0], q[1]));
    let idx; try { idx = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { return; }
    for (const t of idx) this.tri3(Pl, [contour[t[0]].x, h, contour[t[0]].y], [contour[t[1]].x, h, contour[t[1]].y], [contour[t[2]].x, h, contour[t[2]].y], [0, 1, 0], o.roof, o.roof, o.roof);
    if (o.merlons) this.merlons(Pl, pts, s, h, top);
  }

  addLandmark(b, pts, s, Pl, W, Ar) {
    const h = b.h, n = pts.length, k = b.k;
    let cx = 0, cz = 0; for (const q of pts) { cx += q[0]; cz += q[1]; } cx /= n; cz /= n;
    const brick = [0.74, 0.44, 0.32], brickLow = [0.58, 0.34, 0.25], roof = [0.42, 0.24, 0.20], marble = [1.35, 1.2, 1.1];
    if (k === 'accursio') return this.palace(b, pts, s, W, Pl, Ar, { wall: [0.80, 0.46, 0.34], roof: [0.45, 0.28, 0.24], merlons: true });
    if (k === 'reenzo') return this.palace(b, pts, s, W, Pl, Ar, { wall: [0.72, 0.42, 0.30], roof: [0.4, 0.3, 0.27], merlons: true });
    if (k === 'podesta') return this.palace(b, pts, s, W, Pl, Ar, { wall: [0.76, 0.46, 0.33], roof: [0.42, 0.26, 0.22], allArcade: true, merlons: true });
    if (k === 'salaborsa') return this.palace(b, pts, s, W, Pl, Ar, { wall: [0.90, 0.80, 0.64], roof: [0.5, 0.4, 0.36] });
    if (k === 'cattedrale') return this.palace(b, pts, s, W, Pl, Ar, { wall: [0.93, 0.88, 0.78], roof: [0.42, 0.36, 0.34] });
    if (k === 'nettuno') { // Fontana del Nettuno: vasca, colonna, statua col tridente
      const stone = [0.82, 0.8, 0.76], bronze = [0.3, 0.26, 0.21], water = [0.45, 0.66, 0.82];
      this.box(Pl, cx, 0.45, cz, 8.2, 0.9, 8.2, 0, stone); this.box(Pl, cx, 0.92, cz, 7.2, 0.06, 7.2, 0, water);
      this.box(Pl, cx, 2.3, cz, 2.2, 2.8, 2.2, 0, stone); this.box(Pl, cx, 4.0, cz, 3.0, 0.6, 3.0, 0, stone);
      this.box(Pl, cx, 5.2, cz, 0.9, 1.9, 0.7, 0, bronze); this.box(Pl, cx, 6.5, cz, 0.55, 0.7, 0.55, 0, bronze);
      this.box(Pl, cx + 0.8, 6.0, cz, 0.12, 3.2, 0.12, 0, bronze); this.box(Pl, cx + 0.8, 7.7, cz, 0.9, 0.12, 0.12, 0, bronze);
      return;
    }
    if (k === 'petronio') {
      const rf = [0.5, 0.42, 0.38];
      for (let i = 0; i < n; i++) { // pareti: facciata a nord (verso Piazza Maggiore) bicolore
        const j = (i + 1) % n, dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1], L = Math.hypot(dx, dz) || 1, nzv = -s * dx / L, seg = [pts[i], pts[j]];
        if (nzv < -0.6 && L > 3) { this.wallRingSeg(Pl, seg, s, 0, 20, marble, marble); this.wallRingSeg(Pl, seg, s, 20, h, brick, brick); }
        else this.wallRingSeg(Pl, seg, s, 0, h, brickLow, brick);
      }
      const contour = pts.map((q) => new THREE.Vector2(q[0], q[1]));
      let idx; try { idx = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { return; }
      for (const t of idx) this.tri3(Pl, [contour[t[0]].x, h, contour[t[0]].y], [contour[t[1]].x, h, contour[t[1]].y], [contour[t[2]].x, h, contour[t[2]].y], [0, 1, 0], rf, rf, rf);
      let fe = null, fl = 0; // tre portali sulla facciata (lato nord più lungo)
      for (let i = 0; i < n; i++) { const j = (i + 1) % n, dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1], L = Math.hypot(dx, dz); if (-s * dx / (L || 1) < -0.6 && L > fl) { fl = L; fe = [pts[i], pts[j]]; } }
      if (fe) {
        const dx = fe[1][0] - fe[0][0], dz = fe[1][1] - fe[0][1], ux = dx / fl, uz = dz / fl, ox = s * dz / fl * 0.15, oz = -s * dx / fl * 0.15, door = [0.22, 0.14, 0.11];
        for (const f of [0.2, 0.5, 0.8]) {
          const w = f === 0.5 ? 3.2 : 2.2, hh = f === 0.5 ? 9 : 6.5, c0 = fl * f, q = (t, y) => [fe[0][0] + ux * (c0 + t) + ox, y, fe[0][1] + uz * (c0 + t) + oz];
          this.tri3(Pl, q(-w, 0), q(w, 0), q(w, hh), [ox, 0, oz], door, door, door); this.tri3(Pl, q(-w, 0), q(w, hh), q(-w, hh), [ox, 0, oz], door, door, door);
        }
      }
      return;
    }
    // torri: fusto, cornice sporgente, copertura. Asinelli/Garisenda a punta (la Garisenda pende), le altre merlate.
    const lean = k === 'garisenda' ? 2.4 : 0, dir = [-0.8, 0.6];
    const shear = (x, y, z) => { const f = lean * Math.pow(y / h, 2); return [x + dir[0] * f, y, z + dir[1] * f]; };
    const tone = [[0.74, 0.46, 0.33], [0.78, 0.62, 0.44], [0.68, 0.44, 0.34], [0.72, 0.55, 0.38]][Math.floor(hash(Math.round(cx + cz)) * 4)];
    const wall = k === 'orologio' ? [0.93, 0.87, 0.74] : (k === 'asinelli' || k === 'garisenda') ? brick : tone, wallLow = wall.map((v) => v * 0.78);
    const pointed = k === 'asinelli' || k === 'garisenda' || k === 'orologio' || k === 'arengo', H0 = h - (pointed ? 7 : 2.5);
    this.wallRing(Pl, pts, s, 0, H0, wallLow, wall, false, shear);
    const big = pts.map((q) => [cx + (q[0] - cx) * 1.14, cz + (q[1] - cz) * 1.14]);
    this.wallRing(Pl, big, s, H0, H0 + 2.2, wall, wall, false, shear);
    this.wallRing(Pl, pts, s, H0 + 2.2, H0 + 3, wallLow, wallLow, false, shear);
    if (pointed) {
      const cap = k === 'orologio' ? [0.35, 0.42, 0.4] : roof;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, a = shear(big[i][0], H0 + 2.2, big[i][1]), c = shear(big[j][0], H0 + 2.2, big[j][1]), apex = shear(cx, h, cz);
        this.tri3(Pl, a, c, apex, [(a[0] + c[0]) / 2 - cx, 0.8, (a[2] + c[2]) / 2 - cz], cap, cap, cap);
      }
    } else { // sommità piana con merli
      const rf = [0.4, 0.3, 0.27], contour = big.map((q) => new THREE.Vector2(q[0], q[1]));
      let idx; try { idx = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { idx = []; }
      for (const t of idx) this.tri3(Pl, [contour[t[0]].x, H0 + 2.2, contour[t[0]].y], [contour[t[1]].x, H0 + 2.2, contour[t[1]].y], [contour[t[2]].x, H0 + 2.2, contour[t[2]].y], [0, 1, 0], rf, rf, rf);
      this.merlons(Pl, big, s, H0 + 2.2, wall, 1.1, 2.4);
    }
    if (k === 'orologio' || k === 'arengo') { // quadranti dell'orologio / aperture della cella campanaria
      const face = k === 'orologio' ? [0.97, 0.96, 0.9] : [0.12, 0.09, 0.08], rim = [0.2, 0.18, 0.16], yc = h - (k === 'orologio' ? 9.5 : 11), r = k === 'orologio' ? 1.7 : 1.3;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1], L = Math.hypot(dx, dz); if (L < 3) continue;
        const nx = s * dz / L, nz = -s * dx / L, mx = (pts[i][0] + pts[j][0]) / 2 + nx * 0.1, mz = (pts[i][1] + pts[j][1]) / 2 + nz * 0.1, ux = dx / L, uz = dz / L;
        if (k === 'arengo') { // tre aperture ad arco della cella campanaria
          for (const du of [-1.6, 0, 1.6]) {
            const Q = (t, y) => [mx + ux * (du + t) + nx * 0.05, y, mz + uz * (du + t) + nz * 0.05];
            this.tri3(Pl, Q(-0.6, yc - 2), Q(0.6, yc - 2), Q(0.6, yc + 1.6), [nx, 0, nz], face, face, face); this.tri3(Pl, Q(-0.6, yc - 2), Q(0.6, yc + 1.6), Q(-0.6, yc + 1.6), [nx, 0, nz], face, face, face);
            this.tri3(Pl, Q(-0.6, yc + 1.6), Q(0.6, yc + 1.6), Q(0, yc + 2.5), [nx, 0, nz], face, face, face);
          }
          continue;
        }
        for (const [rr, col] of [[r * 1.18, rim], [r, face]]) for (let q = 0; q < 8; q++) {
          const a0 = q / 8 * Math.PI * 2, a1 = (q + 1) / 8 * Math.PI * 2, off = rr === r ? 0.04 : 0;
          const P = (a) => [mx + ux * Math.cos(a) * rr + nx * off, yc + Math.sin(a) * rr, mz + uz * Math.cos(a) * rr + nz * off];
          this.tri3(Pl, [mx + nx * off, yc, mz + nz * off], P(a0), P(a1), [nx, 0, nz], col, col, col);
        }
      }
    }
  }

  wallRingSeg(B, seg, s, y0, y1, cLow, cHigh) {
    // singolo lato come anello a due punti: riusa wallRing con un solo segmento
    const [a, b] = seg, dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.05) return;
    const nn = [s * dz / L, 0, -s * dx / L];
    this.tri3(B, [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], nn, cLow, cLow, cHigh);
    this.tri3(B, [a[0], y0, a[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], nn, cLow, cHigh, cHigh);
  }
}
