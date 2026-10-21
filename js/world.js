import * as THREE from '../lib/three.module.min.js';
import { VIEW } from './config.js';

const R_EARTH = 6371000;
export function makeProjector(origin) {
  const la0 = origin[0] * Math.PI / 180, lo0 = origin[1] * Math.PI / 180, k = Math.cos(la0);
  return (lat, lon) => [(lon * Math.PI / 180 - lo0) * k * R_EARTH, -(lat * Math.PI / 180 - la0) * R_EARTH];
}

export async function loadData(onProgress) {
  const names = ['roads', 'buildings', 'areas', 'labels', 'extras', 'details'];
  const { DATA_URLS } = await import('./config.js');
  const out = {};
  let done = 0;
  // ogni file: fino a 3 tentativi, 45 s di timeout ciascuno (rete lenta o instabile)
  const get = async (url) => {
    let err;
    for (let attempt = 0; attempt < 3; attempt++) {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 45000);
      try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
      catch (e) { err = e; await new Promise((res) => setTimeout(res, 800 * (attempt + 1))); }
      finally { clearTimeout(timer); }
    }
    throw new Error(`Non riesco a scaricare ${url.split('/').pop()}: ${err && err.name === 'AbortError' ? 'connessione troppo lenta' : (err && err.message) || 'rete assente'}`);
  };
  await Promise.all(names.map(async (n) => { out[n] = await get(DATA_URLS[n]); onProgress && onProgress(++done / names.length); }));
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
const HUMP_H = 9; // Ponte Matteotti: gobba alta, pensata per i salti col NOS
const humpY = (h, t) => h.H * (1 - Math.abs(2 * t / h.L - 1)); // gobba a V: cresta a metà ponte
const ARC_COLOR = [0.86, 0.62, 0.46];
const TYPE_STYLE = [null,
  { wall: [0.92, 0.86, 0.74], roof: [0.52, 0.32, 0.27] },                 // 1 chiesa
  { wall: [0.88, 0.91, 0.94], roof: [0.55, 0.58, 0.62] },                 // 2 ospedale
  { wall: [0.95, 0.86, 0.58], roof: [0.55, 0.35, 0.28] },                 // 3 scuola/università
  { wall: [0.68, 0.70, 0.72], roof: [0.55, 0.57, 0.59], plain: true },    // 4 capannone
  { wall: [0.84, 0.86, 0.88], roof: [0.52, 0.54, 0.57] },                 // 5 uffici/negozi
];
const DRIVE_ARROW = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential']);
const SIDEWALK_ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential']);
const SIDEWALK = [0.74, 0.72, 0.68], LINE = [0.86, 0.84, 0.76];

// Facciate tipiche bolognesi: terracotta, ocra, rosa, crema.
const PALETTE = [[0.80, 0.47, 0.34], [0.86, 0.68, 0.40], [0.88, 0.60, 0.50], [0.90, 0.82, 0.66], [0.66, 0.37, 0.29], [0.76, 0.56, 0.38], [0.72, 0.68, 0.62], [0.92, 0.76, 0.55]];
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
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

// Atlante delle insegne: una sola texture con il nome di ogni attività (testo bianco su sfondo per categoria).
const SIGN_BG = { s: '#2c5d9e', f: '#b2432f', p: '#2e8b57', b: '#2f3e55', h: '#17606b', c: '#6a3f8c', o: '#55575e' };
const TILE_W = 192, TILE_H = 40, COLS = 5;
function makeSignAtlas(signs) {
  const rows = Math.max(1, Math.ceil(signs.length / COLS)), c = document.createElement('canvas'); c.width = COLS * TILE_W; c.height = rows * TILE_H;
  const g = c.getContext('2d'); g.textBaseline = 'middle'; g.textAlign = 'center';
  signs.forEach((sg, i) => {
    const x = (i % COLS) * TILE_W, y = Math.floor(i / COLS) * TILE_H;
    g.fillStyle = SIGN_BG[sg.c] || SIGN_BG.o; g.fillRect(x, y, TILE_W, TILE_H); g.strokeStyle = '#ffffffcc'; g.lineWidth = 2; g.strokeRect(x + 2, y + 2, TILE_W - 4, TILE_H - 4);
    let fs = 20; g.font = `700 ${fs}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    while (g.measureText(sg.n).width > TILE_W - 16 && fs > 10) { fs--; g.font = `700 ${fs}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; }
    g.fillStyle = '#fff'; g.fillText(sg.n, x + TILE_W / 2, y + TILE_H / 2 + 1);
  });
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.generateMipmaps = true; return t;
}

// Facciata: 4x4 finestre in 256x256 (13.6 m x 12.4 m). La mappa "emissive" accende un sottoinsieme di finestre di notte.
function makeFacadeTextures() {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = 256; return c; };
  const c = mk(), g = c.getContext('2d'), e = mk(), ge = e.getContext('2d'); let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); ge.fillStyle = '#000'; ge.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) {
    const x = q * 64, y = r * 64;
    g.fillStyle = '#e8e8e8'; g.fillRect(x, y + 56, 64, 8);            // cornice di piano
    g.fillStyle = '#4b5663'; g.fillRect(x + 19, y + 12, 26, 32);      // vetro
    g.fillStyle = '#9aa5b1'; g.fillRect(x + 19, y + 12, 26, 5);       // riflesso
    g.fillStyle = '#d9d2c4'; g.fillRect(x + 16, y + 44, 32, 4);       // davanzale
    g.fillStyle = '#7b6a58'; g.fillRect(x + 31, y + 12, 2, 32);       // telaio
    if (rnd() < 0.32) { const warm = rnd() < 0.8; ge.fillStyle = warm ? (rnd() < 0.5 ? '#ffc470' : '#ffdca0') : '#9ec6ff'; ge.fillRect(x + 20, y + 13, 24, 30); }
  }
  const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
  for (const x of [t, te]) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 2; }
  return { map: t, emissive: te };
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
      this.buildings.push({ pts: Float32Array.from(p.slice(0, n * 2)), h: b.h, k: b.k, t: b.t || 0, a: b.a ? new Set(b.a) : null, bc: b.bc ? hexRgb(b.bc) : null, rs: b.rs || 0 });
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
    // dettagli del corridoio di gioco (insegne, strisce pedonali, fermate, dissuasori, alberi, frecce dei sensi unici)
    const dt = data.details; this.cSign = mk(); this.cDet = mk(); this.signs = dt.signs;
    this.corridor = dt.corridor;
    const nearCorr = (x, z, r) => { const c = this.corridor; for (let i = 0; i < c.length - 1; i++) { const dx = c[i + 1][0] - c[i][0], dz = c[i + 1][1] - c[i][1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - c[i][0]) * dx + (z - c[i][1]) * dz) / L2)); if (Math.hypot(x - c[i][0] - dx * t, z - c[i][1] - dz * t) < r) return true; } return false; };
    this.signs.forEach((sg, i) => add(this.cSign, this.cellOf(sg.x, sg.z), i));
    dt.crossings.forEach((c, i) => add(this.cDet, this.cellOf(c[0], c[1]), 0, i));
    dt.bus.forEach((c, i) => add(this.cDet, this.cellOf(c[0], c[1]), 1, i));
    dt.bollards.forEach((c, i) => add(this.cDet, this.cellOf(c[0], c[1]), 2, i));
    dt.trees.forEach((c) => add(this.cT, this.cellOf(c[0], c[1]), c[0], c[1], 0.9 + hash(c[0] * 7 + c[1]) * 0.5));
    this.details = dt;
    this.roads.forEach((r, ri) => { // frecce sul senso unico, solo nel corridoio
      if (!r.o || !DRIVE_ARROW.has(r.c)) return; let acc = 30;
      for (let i = 0; i < r.p.length / 2 - 1; i++) {
        const ax = r.p[i * 2], az = r.p[i * 2 + 1], dx = r.p[i * 2 + 2] - ax, dz = r.p[i * 2 + 3] - az, L = Math.hypot(dx, dz); if (L < 0.5) continue;
        for (let t = acc; t < L - 6; t += 70) { const x = ax + dx * t / L, z = az + dz * t / L; if (nearCorr(x, z, 80)) add(this.cDet, this.cellOf(x, z), 3, ri, i, t / L); acc = 25; }
        acc = Math.max(10, acc - L);
      }
    });
    const ex = data.extras;
    // Ponte Matteotti: gobba a V (decollo) invece di ponte piatto
    this.humps = ex.bridges.filter((b) => b.n.includes('Matteotti')).map((b) => {
      const ax = b.p[0], az = b.p[1], bx = b.p[b.p.length - 2], bz = b.p[b.p.length - 1], L = Math.hypot(bx - ax, bz - az);
      return { ax, az, ux: (bx - ax) / L, uz: (bz - az) / L, L, w: b.w, H: HUMP_H };
    });
    const nearHump = (x, z) => this.humps.some((h) => { const t = (x - h.ax) * h.ux + (z - h.az) * h.uz, d = Math.abs(-(x - h.ax) * h.uz + (z - h.az) * h.ux); return t > -8 && t < h.L + 8 && d < h.w / 2 + 4; });
    for (let i = 0; i < ex.lamps.length; i += 2) if (!nearHump(ex.lamps[i], ex.lamps[i + 1])) add(this.cL, this.cellOf(ex.lamps[i], ex.lamps[i + 1]), ex.lamps[i], ex.lamps[i + 1]);
    this.parapets = []; this.deck = []; this.cDeck = mk();
    for (const h of this.humps) { // pezzi di impalcato da ~4 m; parapetti = solidi con collisione sul lato
      const n = Math.ceil(h.L / 4), hw = h.w / 2 + 1.35;
      for (let i = 0; i < n; i++) {
        const t0 = i * h.L / n, t1 = (i + 1) * h.L / n, y0 = humpY(h, t0), y1 = humpY(h, t1);
        const piece = { h, t0, t1, y0, y1, i, n }; this.deck.push(piece); add(this.cDeck, this.cellOf(h.ax + h.ux * (t0 + t1) / 2, h.az + h.uz * (t0 + t1) / 2), this.deck.length - 1);
        for (const sd of [-1, 1]) {
          const nx = -h.uz * sd, nz = h.ux * sd, cx = h.ax + h.ux * (t0 + t1) / 2 + nx * hw, cz = h.az + h.uz * (t0 + t1) / 2 + nz * hw, hl = (t1 - t0) / 2 + 0.15;
          const rect = [cx - h.ux * hl - nx * 0.25, cz - h.uz * hl - nz * 0.25, cx + h.ux * hl - nx * 0.25, cz + h.uz * hl - nz * 0.25, cx + h.ux * hl + nx * 0.25, cz + h.uz * hl + nz * 0.25, cx - h.ux * hl + nx * 0.25, cz - h.uz * hl + nz * 0.25];
          this.parapets.push({ pts: Float32Array.from(rect), h: 1.1, solid: true, noVisual: true });
        }
      }
    }
    for (const br of ex.bridges.filter((b) => !b.n.includes('Matteotti'))) {
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
    const fac = makeFacadeTextures();
    this.matBuilding = new THREE.MeshLambertMaterial({ vertexColors: true, map: fac.map, emissive: new THREE.Color(1, 0.8, 0.5), emissiveMap: fac.emissive, emissiveIntensity: 0 });
    this.matArcade = new THREE.MeshLambertMaterial({ vertexColors: true, map: makeArcadeTexture() });
    this.matPlaza = new THREE.MeshBasicMaterial({ vertexColors: true, map: makePlazaTexture() });
    this.sun = null; // {sx, sz, k, cap, op}: direzione orizzontale verso il sole, lunghezza ombra per metro di altezza
    this.matShadow = new THREE.MeshBasicMaterial({ color: 0x0a0c14, transparent: true, opacity: 0.26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.matSign = new THREE.MeshBasicMaterial({ map: makeSignAtlas(this.signs), side: THREE.DoubleSide });
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
    for (const [k, g] of this.cells) { const sh = g.userData.shadow; if (sh) { const cx = k % this.cols, cz = Math.floor(k / this.cols); sh.visible = Math.hypot(this.x0 + (cx + 0.5) * VIEW.cell - x, this.z0 + (cz + 0.5) * VIEW.cell - z) < 280; } }
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
    const extraDeck = this.cDeck.get(key);
    const deckBuf = { p: [], n: [], c: [] };
    if (extraDeck) for (const di of extraDeck) this.addDeckPiece(this.deck[di], gp, gc, deckBuf, tri);
    const extra2 = [], extra3 = [];
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
    // insegne
    const sgs = this.cSign.get(key);
    if (sgs) {
      const S = { p: [], n: [], c: [], u: [] }, rows = Math.max(1, Math.ceil(this.signs.length / COLS));
      for (const si of sgs) {
        const sg = this.signs[si], h = sg.w / 4.8, rx = sg.nz, rz = -sg.nx, cx = sg.x + sg.nx * 0.14, cz = sg.z + sg.nz * 0.14, hw = sg.w / 2;
        const u0 = (si % COLS) / COLS, u1 = u0 + 1 / COLS, v1 = 1 - Math.floor(si / COLS) / rows, v0 = v1 - 1 / rows;
        const A = [cx - rx * hw, sg.y - h / 2, cz - rz * hw], B2 = [cx + rx * hw, sg.y - h / 2, cz + rz * hw], C2 = [cx + rx * hw, sg.y + h / 2, cz + rz * hw], D = [cx - rx * hw, sg.y + h / 2, cz - rz * hw], nn = [sg.nx, 0, sg.nz], w1 = [1, 1, 1];
        this.tri3(S, A, B2, C2, nn, w1, w1, w1, [[u0, v0], [u1, v0], [u1, v1]]); this.tri3(S, A, C2, D, nn, w1, w1, w1, [[u0, v0], [u1, v1], [u0, v1]]);
      }
      const m = this.makeMesh(S.p, S.c, S.n, this.matSign); m.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(S.u, 2)); g.add(m);
    }
    // strisce pedonali, fermate, dissuasori, frecce
    const dl = this.cDet.get(key);
    if (dl) for (let q = 0; q < dl.length; q += dl[q] === 3 ? 4 : 2) {
      const kind = dl[q];
      if (kind === 0) { const c = this.details.crossings[dl[q + 1]], w = Math.min(c[4], 9), rx = -c[3], rz = c[2]; for (let k = -3; k <= 3; k++) { const px = c[0] + c[2] * k * 0.9, pz = c[1] + c[3] * k * 0.9; const A = [px - rx * w / 2 - c[2] * 0.22, 0.185, pz - rz * w / 2 - c[3] * 0.22], B2 = [px + rx * w / 2 - c[2] * 0.22, 0.185, pz + rz * w / 2 - c[3] * 0.22], C2 = [px + rx * w / 2 + c[2] * 0.22, 0.185, pz + rz * w / 2 + c[3] * 0.22], D = [px - rx * w / 2 + c[2] * 0.22, 0.185, pz - rz * w / 2 + c[3] * 0.22]; tri(gp, gc, A, B2, C2, [0.92, 0.92, 0.88], UP); tri(gp, gc, A, C2, D, [0.92, 0.92, 0.88], UP); } }
      else if (kind === 1) { const b = this.details.bus[dl[q + 1]], rx = -b[3] * b[4], rz = b[2] * b[4], x = b[0], z = b[1], ang = Math.atan2(b[3], b[2]); extra2.push([x, z, ang, rx, rz]); }
      else if (kind === 2) { const b = this.details.bollards[dl[q + 1]]; extra3.push(b[0], b[1]); }
      else { const r = this.roads[dl[q + 1]], i = dl[q + 2], t = dl[q + 3], ax = r.p[i * 2], az = r.p[i * 2 + 1], dx = r.p[i * 2 + 2] - ax, dz = r.p[i * 2 + 3] - az, L = Math.hypot(dx, dz), ux = dx / L * r.o, uz = dz / L * r.o, lane = r.w * 0.22, cx = ax + dx * t - uz * lane, cz = az + dz * t + ux * lane; this.arrow(gp, gc, tri, cx, cz, ux, uz); }
    }
    // lampioni e parapetti dei ponti
    const lp = this.cL.get(key), pr = this.cPar.get(key);
    const extra = { p: [], n: [], c: [] }; // lampioni, parapetti, alberi: stesso materiale dei tetti -> una sola mesh
    if (lp || pr || extra2.length || extra3.length) {
      const T = extra;
      if (lp) for (let q = 0; q < lp.length; q += 2) { this.box(T, lp[q], 2.7, lp[q + 1], 0.16, 5.4, 0.16, 0, [0.2, 0.21, 0.24]); this.box(T, lp[q], 5.5, lp[q + 1], 0.7, 0.22, 0.7, 0, [1.4, 1.3, 0.95]); }
      for (const [x, z, ang] of extra2) { this.box(T, x, 1.3, z, 0.1, 2.6, 0.1, 0, [0.3, 0.3, 0.33]); this.box(T, x, 2.75, z, 0.08, 0.5, 0.6, ang, [0.95, 0.55, 0.1]); this.box(T, x + Math.cos(ang) * 0.1, 2.45, z + Math.sin(ang) * 0.1, 3.2, 0.1, 1.5, ang, [0.35, 0.4, 0.45]); }
      for (let q = 0; q < extra3.length; q += 2) this.box(T, extra3[q], 0.45, extra3[q + 1], 0.22, 0.9, 0.22, 0, [0.28, 0.3, 0.34]);
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
    if (this.sun) { const Sh = { p: [] }; for (const bi of this.cB.get(key) || []) this.addShadow(this.buildings[bi], Sh); if (Sh.p.length) { const gs = new THREE.BufferGeometry(); gs.setAttribute('position', new THREE.Float32BufferAttribute(Sh.p, 3)); gs.computeBoundingSphere(); const ms = new THREE.Mesh(gs, this.matShadow); ms.matrixAutoUpdate = false; ms.renderOrder = 2; g.add(ms); g.userData.shadow = ms; } }
    for (const k2 of ['p', 'n', 'c']) { for (let i = 0; i < extra[k2].length; i++) Pl[k2].push(extra[k2][i]); for (let i = 0; i < deckBuf[k2].length; i++) Pl[k2].push(deckBuf[k2][i]); }
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

  // Quota del terreno (impalcato del Ponte Matteotti), 0 altrove.
  groundY(x, z) {
    for (const h of this.humps) {
      const dx = x - h.ax, dz = z - h.az, t = dx * h.ux + dz * h.uz;
      if (t < 0 || t > h.L) continue;
      if (Math.abs(-dx * h.uz + dz * h.ux) < h.w / 2 + 1.35) return humpY(h, t);
    }
    return 0;
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

  // Imposta il sole (azimut/elevazione in gradi; null = nessuna ombra, notte) e ricostruisce le celle.
  setSun(az, el, opacity = 0.26) {
    if (az == null) this.sun = null;
    else { const k = 1 / Math.tan(el * Math.PI / 180); this.sun = { sx: Math.cos(az * Math.PI / 180), sz: Math.sin(az * Math.PI / 180), k, cap: Math.min(26, 8 + k * 8) }; this.matShadow.opacity = opacity; }
    for (const [, g] of this.cells) { this.group.remove(g); g.traverse((o) => o.geometry && o.geometry.dispose()); }
    this.cells.clear();
  }

  // Ombra proiettata a terra dai lati dell'edificio rivolti via dal sole (un parallelogramma per lato).
  addShadow(b, Sh) {
    if (b.solid || b.h < 7) return;
    const p = b.pts, n = p.length / 2, sun = this.sun, len = Math.min(sun.cap, b.h * sun.k), y = 0.17;
    let A = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
    const sg = A > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 3) continue;
      const nx = sg * dz / L, nz = -sg * dx / L;
      if (nx * sun.sx + nz * sun.sz > -0.02) continue; // lato rivolto al sole
      const ex = -sun.sx * len, ez = -sun.sz * len;
      const up = (x0, z0, x1, z1, x2, z2) => { if ((z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0) > 0) Sh.p.push(x0, y, z0, x1, y, z1, x2, y, z2); else Sh.p.push(x0, y, z0, x2, y, z2, x1, y, z1); };
      up(ax, az, bx, bz, bx + ex, bz + ez); up(ax, az, bx + ex, bz + ez, ax + ex, az + ez);
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
    const base = b.bc || (ty ? ty.wall : PALETTE[Math.floor(hash(bi) * PALETTE.length)]);
    const top = base.map((v) => Math.min(1, v * tone)), low = top.map((v) => v * 0.8);
    const flat = ty && ty.plain; // capannoni: pareti lisce
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = pts[i][0], az = pts[i][1], bx = pts[j][0], bz = pts[j][1];
      if (b.a && b.a.has(i) && h > 6) { // portico al piano terra
        this.wallSeg(Ar, ax, az, bx, bz, s, 0, 4.6, ARC_COLOR, ARC_COLOR, 4.2, 4.6);
        this.wallSeg(W, ax, az, bx, bz, s, 4.6, h, low, top, 13.6, 12.4);
      } else if (flat) this.wallSeg(Pl, ax, az, bx, bz, s, 0, h, low, top, 13.6, 12.4);
      else this.wallSeg(W, ax, az, bx, bz, s, 0, h, low, top, 13.6, 12.4);
    }
    const rf = ty ? ty.roof.map((v) => v * tone) : [0.44 * tone, 0.30 * tone, 0.27 * tone];
    if (b.rs && n <= 12) { // tetto a padiglione/piramide (dove OSM lo indica)
      let cx = 0, cz = 0; for (const q of pts) { cx += q[0]; cz += q[1]; } cx /= n; cz /= n;
      const apex = [cx, h + 3.6, cz];
      for (let i = 0; i < n; i++) { const j = (i + 1) % n, a = [pts[i][0], h, pts[i][1]], c = [pts[j][0], h, pts[j][1]]; this.tri3(Pl, a, c, apex, [(a[0] + c[0]) / 2 - cx, 0.7, (a[2] + c[2]) / 2 - cz], rf, rf, rf); }
      return;
    }
    const contour = pts.map((q) => new THREE.Vector2(q[0], q[1]));
    let idx; try { idx = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { return; }
    for (const t of idx) this.tri3(Pl, [contour[t[0]].x, h, contour[t[0]].y], [contour[t[1]].x, h, contour[t[1]].y], [contour[t[2]].x, h, contour[t[2]].y], [0, 1, 0], rf, rf, rf);
  }

  // Pezzo d'impalcato: asfalto, marciapiedi, mezzeria, fascia in cemento, parapetti e lampioni, tutti alla quota della gobba.
  addDeckPiece(pc, gp, gc, B, tri) {
    const h = pc.h, UP = [0, 1, 0], asp = C.roadMajor, hwR = h.w / 2, hwS = h.w / 2 + 1.35;
    const P = (t, lat, dy) => { const y = humpY(h, t) + dy; return [h.ax + h.ux * t - h.uz * lat, y, h.az + h.uz * t + h.ux * lat]; };
    const t0 = pc.t0, t1 = pc.t1, mid = P((t0 + t1) / 2, 0, -2);
    const strip = (l0, l1, dy, col) => { tri(gp, gc, P(t0, l0, dy), P(t0, l1, dy), P(t1, l0, dy), col, UP); tri(gp, gc, P(t1, l0, dy), P(t0, l1, dy), P(t1, l1, dy), col, UP); };
    strip(-hwR, hwR, 0.13, asp); strip(hwR, hwS, 0.15, SIDEWALK); strip(-hwS, -hwR, 0.15, SIDEWALK); strip(-0.1, 0.1, 0.16, LINE);
    const wall = [0.62, 0.6, 0.57], par = [0.8, 0.79, 0.75];
    const quad = (a, b, c, d, col, ctr = mid) => { this.triOut(B, a, b, c, ctr, col); this.triOut(B, a, c, d, ctr, col); };
    for (const sd of [-1, 1]) { // fascia e parapetto su ciascun lato
      const l = hwS * sd, ln = (hwS - 0.5) * sd;
      quad(P(t0, l, 0.15), P(t1, l, 0.15), P(t1, l, -6), P(t0, l, -6), wall);                 // fascia esterna fino a terra
      quad(P(t0, l, 0.15), P(t1, l, 0.15), P(t1, l, 1.25), P(t0, l, 1.25), par);               // parapetto, faccia esterna
      quad(P(t0, ln, 0.15), P(t1, ln, 0.15), P(t1, ln, 1.25), P(t0, ln, 1.25), par, P((t0 + t1) / 2, l * 2, 0.7)); // faccia interna (verso la strada)
      quad(P(t0, l, 1.25), P(t1, l, 1.25), P(t1, ln, 1.25), P(t0, ln, 1.25), [0.88, 0.87, 0.83]); // sommità
    }
    if (pc.i % 5 === 2) for (const sd of [-1, 1]) { const q = P((t0 + t1) / 2, (hwS - 0.25) * sd, 0.15); this.box(B, q[0], q[1] + 2.7, q[2], 0.16, 5.4, 0.16, 0, [0.2, 0.21, 0.24]); this.box(B, q[0], q[1] + 5.5, q[2], 0.7, 0.22, 0.7, 0, [1.4, 1.3, 0.95]); }
  }

  // Freccia di senso unico (asta + punta) sul terreno, nella direzione (ux,uz).
  arrow(gp, gc, tri, cx, cz, ux, uz) {
    const rx = -uz, rz = ux, y = 0.185, col = [0.9, 0.9, 0.86], UP = [0, 1, 0], P = (u, l) => [cx + ux * u + rx * l, y, cz + uz * u + rz * l];
    tri(gp, gc, P(-1.4, -0.14), P(-1.4, 0.14), P(0.5, -0.14), col, UP); tri(gp, gc, P(0.5, -0.14), P(-1.4, 0.14), P(0.5, 0.14), col, UP);
    tri(gp, gc, P(0.4, -0.55), P(0.4, 0.55), P(1.5, 0), col, UP);
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
      if (arc && h > 7) { this.wallSeg(Ar, ax, az, bx, bz, s, 0, 4.6, o.arc || ARC_COLOR, o.arc || ARC_COLOR, 4.2, 4.6); this.wallSeg(W, ax, az, bx, bz, s, 4.6, h, low, top, 13.6, 12.4); }
      else this.wallSeg(W, ax, az, bx, bz, s, 0, h, low, top, 13.6, 12.4);
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
    if (k === 'porta') { // Porta Galliera: massiccio in mattoni con merli e grande arco scuro sui lati lunghi
      this.palace(b, pts, s, W, Pl, Ar, { wall: [0.68, 0.40, 0.30], roof: [0.4, 0.3, 0.27], merlons: true });
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1], L = Math.hypot(dx, dz); if (L < 8) continue;
        const nx = s * dz / L, nz = -s * dx / L, ux = dx / L, uz = dz / L, mx = (pts[i][0] + pts[j][0]) / 2 + nx * 0.15, mz = (pts[i][1] + pts[j][1]) / 2 + nz * 0.15, door = [0.12, 0.09, 0.08];
        const Q = (t, y) => [mx + ux * t, y, mz + uz * t];
        this.tri3(Pl, Q(-3.2, 0), Q(3.2, 0), Q(3.2, 8), [nx, 0, nz], door, door, door); this.tri3(Pl, Q(-3.2, 0), Q(3.2, 8), Q(-3.2, 8), [nx, 0, nz], door, door, door);
        this.tri3(Pl, Q(-3.2, 8), Q(3.2, 8), Q(0, 10.6), [nx, 0, nz], door, door, door);
      }
      return;
    }
    if (k === 'castello') { // Castello di Galliera: corpo con merli e torrette agli angoli
      this.palace(b, pts, s, W, Pl, Ar, { wall: [0.72, 0.43, 0.32], roof: [0.4, 0.3, 0.27], merlons: true });
      if (n <= 8) for (const q of pts) { this.box(Pl, q[0], (h + 5) / 2, q[1], 2.8, h + 5, 2.8, 0, [0.7, 0.42, 0.31]); this.box(Pl, q[0], h + 5.6, q[1], 3.2, 0.5, 3.2, 0, [0.62, 0.36, 0.27]); }
      return;
    }
    if (k === 'stazione') { // Stazione Centrale: lunga facciata color ocra con portico, corpo centrale più alto e orologio
      this.palace(b, pts, s, W, Pl, Ar, { wall: [0.88, 0.66, 0.48], roof: [0.5, 0.38, 0.33], allArcade: true });
      let fe = null, fl = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n, L = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]); if (L > fl) { fl = L; fe = [pts[i], pts[j]]; } }
      if (fe) {
        const ux = (fe[1][0] - fe[0][0]) / fl, uz = (fe[1][1] - fe[0][1]) / fl, nx = s * uz, nz = -s * ux, mx = (fe[0][0] + fe[1][0]) / 2, mz = (fe[0][1] + fe[1][1]) / 2, rot = Math.atan2(uz, ux);
        this.box(Pl, mx - nx * 1, h + 4, mz - nz * 1, Math.min(22, fl * 0.3), 8, 6, rot, [0.9, 0.68, 0.5]);
        this.box(Pl, mx - nx * 1, h + 8.4, mz - nz * 1, Math.min(23, fl * 0.3 + 1), 0.8, 7, rot, [0.5, 0.38, 0.33]);
        const cl = [mx + nx * 2.1, h + 4.5, mz + nz * 2.1], Q = (a, y) => [cl[0] + ux * Math.cos(a) * 1.8, cl[1] + y + Math.sin(a) * 1.8 - 0 * y, cl[2] + uz * Math.cos(a) * 1.8];
        for (const [rr, col] of [[1.8, [0.97, 0.96, 0.9]]]) for (let q = 0; q < 10; q++) { const a0 = q / 10 * Math.PI * 2, a1 = (q + 1) / 10 * Math.PI * 2, P = (a) => [cl[0] + ux * Math.cos(a) * rr, cl[1] + Math.sin(a) * rr, cl[2] + uz * Math.cos(a) * rr]; this.tri3(Pl, cl, P(a0), P(a1), [nx, 0, nz], col, col, col); }
        void Q;
      }
      return;
    }
    if (k === 'edicola') { // edicola: scatola verde con vetrina e tettoia a strisce
      this.wallRing(Pl, pts, s, 0, h, [0.1, 0.28, 0.2], [0.14, 0.38, 0.27]);
      const rf = [0.2, 0.2, 0.22], contour = pts.map((q) => new THREE.Vector2(q[0], q[1]));
      let idx; try { idx = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { idx = []; }
      for (const t of idx) this.tri3(Pl, [contour[t[0]].x, h + 0.35, contour[t[0]].y], [contour[t[1]].x, h + 0.35, contour[t[1]].y], [contour[t[2]].x, h + 0.35, contour[t[2]].y], [0, 1, 0], rf, rf, rf);
      let fe = null, fl = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n, L = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]); if (L > fl) { fl = L; fe = [pts[i], pts[j]]; } }
      if (fe) { const ux = (fe[1][0] - fe[0][0]) / fl, uz = (fe[1][1] - fe[0][1]) / fl, nx = s * uz, nz = -s * ux, mx = (fe[0][0] + fe[1][0]) / 2 + nx * 0.9, mz = (fe[0][1] + fe[1][1]) / 2 + nz * 0.9, rot = Math.atan2(uz, ux);
        for (let i = 0; i < 6; i++) this.box(Pl, mx + ux * (i - 2.5) * fl / 6, h - 0.15, mz + uz * (i - 2.5) * fl / 6, fl / 6, 0.12, 1.8, rot, i % 2 ? [0.95, 0.95, 0.9] : [0.82, 0.18, 0.15]); }
      return;
    }
    if (k === 'vetro') return this.palace(b, pts, s, W, Pl, Ar, { wall: [0.52, 0.7, 0.88], roof: [0.5, 0.52, 0.56] });
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
