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
const SIDEWALK_ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential']);
const SIDEWALK = [0.74, 0.72, 0.68], LINE = [0.86, 0.84, 0.76];

// Facciate tipiche bolognesi: terracotta, ocra, rosa, crema.
const PALETTE = [[0.80, 0.47, 0.34], [0.86, 0.68, 0.40], [0.88, 0.60, 0.50], [0.90, 0.82, 0.66], [0.66, 0.37, 0.29], [0.76, 0.56, 0.38], [0.72, 0.68, 0.62], [0.92, 0.76, 0.55]];
const hash = (i) => ((i + 1) * 2654435761 >>> 0) / 4294967296;

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
    this.areas = data.areas.areas.filter((a) => a.k !== 'river');
    this.rivers = data.areas.areas.filter((a) => a.k === 'river');
    // edifici: anello aperto (senza punto di chiusura duplicato) in Float32Array
    this.buildings = [];
    for (const b of data.buildings.buildings) {
      let p = b.p, n = p.length / 2;
      if (p[0] === p[p.length - 2] && p[1] === p[p.length - 1]) n--;
      if (n < 3) continue;
      this.buildings.push({ pts: Float32Array.from(p.slice(0, n * 2)), h: b.h, k: b.k });
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
    this.matPlain = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.matBuilding = new THREE.MeshLambertMaterial({ vertexColors: true, map: makeFacadeTexture() });
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
    if (gp.length) g.add(this.makeMesh(gp, gc, null, this.matGround));

    // edifici: pareti con texture finestre (W), tetti e monumenti a tinta unita (Pl)
    const W = { p: [], n: [], c: [], u: [] }, Pl = { p: [], n: [], c: [] };
    for (const bi of this.cB.get(key) || []) this.addBuilding(this.buildings[bi], bi, W, Pl);
    if (W.p.length) { const m = this.makeMesh(W.p, W.c, W.n, this.matBuilding); m.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(W.u, 2)); g.add(m); }
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

  // Triangolo orientato secondo la normale nn; colori per vertice (c0,c1,c2); uv opzionali.
  tri3(B, a, b, c, nn, c0, c1, c2, uvs) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const dot = (uy * vz - uz * vy) * nn[0] + (uz * vx - ux * vz) * nn[1] + (ux * vy - uy * vx) * nn[2];
    if (dot < 0) { let t = b; b = c; c = t; t = c1; c1 = c2; c2 = t; if (uvs) uvs = [uvs[0], uvs[2], uvs[1]]; }
    B.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let k = 0; k < 3; k++) B.n.push(nn[0], nn[1], nn[2]);
    B.c.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]);
    if (uvs) for (const q of uvs) B.u.push(q[0], q[1]);
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

  addBuilding(b, bi, W, Pl) {
    const p = b.pts, n = p.length / 2, h = b.h;
    const pts = []; for (let i = 0; i < n; i++) pts.push([p[i * 2], p[i * 2 + 1]]);
    let A = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]; }
    const s = A > 0 ? 1 : -1;
    if (b.k) return this.addLandmark(b, pts, s, Pl);

    const base = PALETTE[Math.floor(hash(bi) * PALETTE.length)], tone = 0.92 + hash(bi + 7) * 0.16;
    const top = base.map((v) => Math.min(1, v * tone)), low = top.map((v) => v * 0.8);
    this.wallRing(W, pts, s, 0, h, low, top, true);
    const rf = [0.44 * tone, 0.30 * tone, 0.27 * tone];
    const contour = pts.map((q) => new THREE.Vector2(q[0], q[1]));
    let idx; try { idx = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { return; }
    for (const t of idx) this.tri3(Pl, [contour[t[0]].x, h, contour[t[0]].y], [contour[t[1]].x, h, contour[t[1]].y], [contour[t[2]].x, h, contour[t[2]].y], [0, 1, 0], rf, rf, rf);
  }

  // Due Torri (con cornice e punta) e San Petronio (facciata in marmo sotto, mattoni sopra).
  addLandmark(b, pts, s, Pl) {
    const h = b.h, n = pts.length;
    let cx = 0, cz = 0; for (const q of pts) { cx += q[0]; cz += q[1]; } cx /= n; cz /= n;
    const brick = [0.74, 0.44, 0.32], brickLow = [0.58, 0.34, 0.25], roof = [0.42, 0.24, 0.20], marble = [1.35, 1.2, 1.1];
    if (b.k === 'petronio') {
      const rf = [0.5, 0.42, 0.38], nz0 = pts.map(() => 0);
      for (let i = 0; i < n; i++) { // pareti: facciata a nord (verso Piazza Maggiore) bicolore
        const j = (i + 1) % n, dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1], L = Math.hypot(dx, dz) || 1, nzv = -s * dx / L;
        const seg = [pts[i], pts[j]];
        if (nzv < -0.6 && L > 3) {
          this.wallRingSeg(Pl, seg, s, 0, 20, marble, marble); this.wallRingSeg(Pl, seg, s, 20, h, brick, brick);
        } else this.wallRingSeg(Pl, seg, s, 0, h, brickLow, brick);
      }
      void nz0;
      // tre portali scuri sulla facciata (lato nord più lungo)
      let fe = null, fl = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1], L = Math.hypot(dx, dz);
        if (-s * dx / (L || 1) < -0.6 && L > fl) { fl = L; fe = [pts[i], pts[j]]; }
      }
      if (fe) {
        const dx = fe[1][0] - fe[0][0], dz = fe[1][1] - fe[0][1], ux = dx / fl, uz = dz / fl, ox = s * dz / fl * 0.15, oz = -s * dx / fl * 0.15, door = [0.22, 0.14, 0.11];
        for (const f of [0.2, 0.5, 0.8]) {
          const w = f === 0.5 ? 3.2 : 2.2, hh = f === 0.5 ? 9 : 6.5, c0 = fl * f;
          const q = (t, y) => [fe[0][0] + ux * (c0 + t) + ox, y, fe[0][1] + uz * (c0 + t) + oz];
          this.tri3(Pl, q(-w, 0), q(w, 0), q(w, hh), [ox, 0, oz], door, door, door);
          this.tri3(Pl, q(-w, 0), q(w, hh), q(-w, hh), [ox, 0, oz], door, door, door);
        }
      }
      const contour = pts.map((q) => new THREE.Vector2(q[0], q[1]));
      let idx; try { idx = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { return; }
      for (const t of idx) this.tri3(Pl, [contour[t[0]].x, h, contour[t[0]].y], [contour[t[1]].x, h, contour[t[1]].y], [contour[t[2]].x, h, contour[t[2]].y], [0, 1, 0], rf, rf, rf);
      return;
    }
    // torri: fusto, cornice sporgente, punta piramidale. La Garisenda pende.
    const lean = b.k === 'garisenda' ? 2.4 : 0, dir = [-0.8, 0.6];
    const shear = (x, y, z) => { const f = lean * Math.pow(y / h, 2); return [x + dir[0] * f, y, z + dir[1] * f]; };
    const H0 = h - 7;
    this.wallRing(Pl, pts, s, 0, H0, brickLow, brick, false, shear);
    const big = pts.map((q) => [cx + (q[0] - cx) * 1.14, cz + (q[1] - cz) * 1.14]);
    this.wallRing(Pl, big, s, H0, H0 + 2.2, brick, brick, false, shear);
    this.wallRing(Pl, pts, s, H0 + 2.2, H0 + 3, brickLow, brickLow, false, shear); // sottotetto
    for (let i = 0; i < n; i++) { // tetto a piramide
      const j = (i + 1) % n, a = shear(big[i][0], H0 + 2.2, big[i][1]), c = shear(big[j][0], H0 + 2.2, big[j][1]), apex = shear(cx, h, cz);
      this.tri3(Pl, a, c, apex, [(a[0] + c[0]) / 2 - cx, 0.8, (a[2] + c[2]) / 2 - cz], roof, roof, roof);
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
