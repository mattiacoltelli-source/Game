import * as THREE from '../lib/three.module.min.js';
import { mergeBoxes } from './geom.js';

// Parco della Montagnola: collinetta artificiale sopraelevata (piattaforma a quota PARK_H) con muri di contenimento in pietra e il monumentale
// Scalone del Pincio che sale da Via dell'Indipendenza. L'area del parco viene sollevata, i sentieri OSM sono ridisegnati in quota e
// le strade/edifici interni (che finirebbero sottoterra) vengono tolti. Tutto deterministico, nessun dato nuovo.
export const PARK_H = 6;
const STAIR = { z0: -297, x0: -392, len: 26, w: 15 };
const STONE = [0.72, 0.68, 0.6], STONE_D = [0.52, 0.48, 0.42], GRASS = [0.5, 0.68, 0.4], PATH = [0.8, 0.74, 0.62], BRONZE = [0.26, 0.2, 0.15];

function inPoly(poly, x, z) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > z) !== (poly[j][1] > z) && x < (poly[j][0] - poly[i][0]) * (z - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; }

// Trova il poligono del parco e vi ritaglia l'apertura dello scalone. Ritorna null se i dati non lo contengono.
export function setupPark(areas, pois) {
  const poi = (pois || []).find((q) => /Montagnola/.test(q.n)); if (!poi) return null;
  const a = areas.find((q) => (q.k === 'green' || q.k === 'wood') && q.p.length >= 40 && inPoly(Array.from({ length: q.p.length / 2 }, (_, i) => [q.p[i * 2], q.p[i * 2 + 1]]), poi.x, poi.z)); if (!a) return null;
  const src = Array.from({ length: a.p.length / 2 }, (_, i) => [a.p[i * 2], a.p[i * 2 + 1]]), S = STAIR, zN = S.z0 + S.w / 2, zS = S.z0 - S.w / 2, xT = S.x0 + S.len, poly = []; let done = false;
  for (let i = 0; i < src.length; i++) {
    const v = src[i]; if (v[0] < S.x0 + 6 && v[1] < zN && v[1] > zS) continue; // vertici nell'apertura
    poly.push(v);
    if (!done && v[0] < S.x0 + 6 && v[1] >= zN && src[(i + 1) % src.length][1] < zN) { poly.push([S.x0, zN], [xT, zN], [xT, zS], [S.x0 + 1, zS]); done = true; }
  }
  if (!done) return null;
  return { poly, H: PARK_H, stair: S, notch: { a: [S.x0, zN], b: [xT, zN], c: [xT, zS], d: [S.x0 + 1, zS] } };
}

// Apre il varco davanti allo scalone: un edificio che lo attraversa (fronte di Via dell'Indipendenza) viene diviso in due corpi, uno a nord e uno a sud
// del passaggio (se la pianta è un rettangolo), altrimenti tolto. Ritorna l'elenco di poligoni [x,z,...].
export function clipPassage(park, p, n) {
  const S = park.stair, zA = S.z0 - S.w / 2 - 3, zB = S.z0 + S.w / 2 + 3, xA = S.x0 - 34, xB = S.x0 + 4; let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9, A = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; mnx = Math.min(mnx, p[i * 2]); mxx = Math.max(mxx, p[i * 2]); mnz = Math.min(mnz, p[i * 2 + 1]); mxz = Math.max(mxz, p[i * 2 + 1]); A += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
  if (mxx < xA || mnx > xB || mxz < zA || mnz > zB) return null; // non interessa il varco
  if (Math.abs(A) / 2 < 0.8 * (mxx - mnx) * (mxz - mnz)) return []; // pianta irregolare: tolto
  const out = []; if (mnz < zA - 4) out.push([mnx, mnz, mxx, mnz, mxx, zA, mnx, zA]); if (mxz > zB + 4) out.push([mnx, zB, mxx, zB, mxx, mxz, mnx, mxz]); return out;
}

export const parkHeight = (park, x, z) => {
  if (!park) return 0; const S = park.stair;
  if (x >= S.x0 && x <= S.x0 + S.len && Math.abs(z - S.z0) <= S.w / 2) return park.H * (x - S.x0) / S.len; // scalone (rampa)
  return inPoly(park.poly, x, z) ? park.H : 0;
};

// Mesh del parco: piano erboso, muri in pietra, sentieri, scalone con statue e lampioni.
export function buildPark(world, park, removedPaths) {
  const g = new THREE.Group(), H = park.H, S = park.stair, poly = park.poly, n = poly.length;
  // piano superiore (unlit come il terreno, si tinge con l'atmosfera)
  { const contour = poly.map((q) => new THREE.Vector2(q[0], q[1])); let idx = []; try { idx = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { /* ignora */ }
    const P = [], C = []; for (const t of idx) for (const k of t) { P.push(contour[k].x, H, contour[k].y); C.push(GRASS[0], GRASS[1], GRASS[2]); }
    const m = world.makeMesh(P, C, null, world.matGround); m.material = world.matGround; g.add(m);
    // sentieri in quota (le strade interne tolte), ribbon larghi 2,6 m
    const PP = [], PC = []; for (const r of removedPaths) { const p = r.p; for (let i = 0; i + 3 < p.length; i += 2) { const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.5) continue; const nx = -dz / L * 1.3, nz = dx / L * 1.3, y = H + 0.05;
        for (const v of [[ax + nx, az + nz], [ax - nx, az - nz], [bx + nx, bz + nz], [bx + nx, bz + nz], [ax - nx, az - nz], [bx - nx, bz - nz]]) { PP.push(v[0], y, v[1]); PC.push(PATH[0], PATH[1], PATH[2]); } } }
    if (PP.length) g.add(world.makeMesh(PP, PC, null, world.matGround)); }
  // muri di contenimento lungo il bordo (esclusa la sommità dello scalone)
  const wp = [], wc = [], wn = [], A = []; let area = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1]; } const sg = area > 0 ? 1 : -1;
  const top = park.notch;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n]; if (Math.abs(a[0] - top.b[0]) < 0.01 && Math.abs(b[0] - top.c[0]) < 0.01) continue; // sommità scalone: aperta
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.05) continue; const nx = sg * dz / L, nz = -sg * dx / L; // normale verso l'esterno del piano
    const quad = (y0, y1, c) => { for (const v of [[a, y0], [b, y0], [b, y1], [a, y0], [b, y1], [a, y1]]) { wp.push(v[0][0], v[1], v[0][1]); wc.push(c[0], c[1], c[2]); wn.push(nx, 0, nz); } };
    quad(0, H - 0.7, STONE); quad(H - 0.7, H, STONE_D);
    const o = 0.18; // cornice sporgente in cima
    for (const v of [[a[0] + nx * o, H - 0.7, a[1] + nz * o], [b[0] + nx * o, H - 0.7, b[1] + nz * o], [b[0] + nx * o, H, b[1] + nz * o], [a[0] + nx * o, H - 0.7, a[1] + nz * o], [b[0] + nx * o, H, b[1] + nz * o], [a[0] + nx * o, H, a[1] + nz * o]]) { wp.push(v[0], v[1], v[2]); wc.push(0.82, 0.78, 0.7); wn.push(nx, 0, nz); }
  }
  g.add(world.makeMesh(wp, wc, wn, world.matPlain));
  // scalone: gradini pieni larghi S.w, balaustre ai lati con pilastrini, due gruppi bronzei alla base e due in cima, lampioni
  const parts = [], steps = 26, run = S.len / steps, sh = H / steps;
  for (let i = 0; i < steps; i++) parts.push({ x: S.x0 + (i + 0.5) * run, y: (i + 1) * sh / 2, z: S.z0, sx: run, sy: (i + 1) * sh, sz: S.w - 0.4, c: i % 2 ? [0.84, 0.8, 0.72] : [0.8, 0.76, 0.68] });
  parts.push({ x: S.x0 - 2.5, y: 0.1, z: S.z0, sx: 5, sy: 0.2, sz: S.w + 3, c: [0.74, 0.7, 0.62] }); // sagrato alla base
  for (const sd of [-1, 1]) { const zb = S.z0 + sd * (S.w / 2 - 0.2);
    for (let i = 0; i < steps; i++) parts.push({ x: S.x0 + (i + 0.5) * run, y: (i + 1) * sh + 0.5, z: zb, sx: run + 0.02, sy: 1.0, sz: 0.5, c: STONE }); // balaustra (a gradoni)
    for (let k = 0; k <= 6; k++) { const x = S.x0 + S.len * k / 6, y = H * k / 6; parts.push({ x, y: y + 0.9, z: zb, sx: 0.9, sy: 1.8 + (k % 2 ? 0 : 0.5), sz: 0.9, c: STONE_D }, { x, y: y + 1.9 + (k % 2 ? 0 : 0.5), z: zb, sx: 1.1, sy: 0.25, sz: 1.1, c: [0.85, 0.8, 0.72] }); }
    // gruppi scultorei in bronzo: base e figura stilizzata
    for (const [x, hh] of [[S.x0 - 1.2, 0], [S.x0 + S.len + 1.5, H]]) { const z = S.z0 + sd * (S.w / 2 + 0.2); parts.push({ x, y: hh + 0.8, z, sx: 2.2, sy: 1.6, sz: 2.2, c: STONE }, { x, y: hh + 2.5, z, sx: 0.8, sy: 1.8, sz: 0.8, c: BRONZE }, { x, y: hh + 3.7, z, sx: 0.55, sy: 0.55, sz: 0.55, c: BRONZE }, { x: x + 0.5, y: hh + 3.2, z: z + sd * 0.7, sx: 1.3, sy: 0.25, sz: 0.25, c: BRONZE }); }
    // lampioni ornati ai lati dell'entrata e in cima
    for (const [x, hh] of [[S.x0 + 0.5, 0], [S.x0 + S.len - 0.5, H]]) parts.push({ x, y: hh + 2.6, z: S.z0 + sd * (S.w / 2 + 1.5), sx: 0.2, sy: 5.2, sz: 0.2, c: [0.18, 0.19, 0.2] }, { x, y: hh + 5.4, z: S.z0 + sd * (S.w / 2 + 1.5), sx: 0.8, sy: 0.5, sz: 0.8, c: [1.4, 1.3, 0.95] });
  }
  // terrazza in cima con fontana a vasca e gruppo centrale
  const tx = S.x0 + S.len + 9; parts.push({ x: tx, y: H + 0.3, z: S.z0, sx: 8, sy: 0.6, sz: 8, c: STONE }, { x: tx, y: H + 0.75, z: S.z0, sx: 5.6, sy: 0.3, sz: 5.6, c: [0.5, 0.65, 0.8] }, { x: tx, y: H + 1.7, z: S.z0, sx: 1, sy: 2, sz: 1, c: STONE_D }, { x: tx, y: H + 3, z: S.z0, sx: 2, sy: 0.4, sz: 2, c: [0.55, 0.7, 0.85] });
  g.add(new THREE.Mesh(mergeBoxes(parts), new THREE.MeshLambertMaterial({ vertexColors: true })));
  return g;
}

// Solidi di collisione: muri lungo il bordo del parco (non la sommità dello scalone) e le balaustre dello scalone.
export function addParkSolids(park, col) {
  const poly = park.poly, n = poly.length, top = park.notch, t = 0.7, H = park.H;
  const rect = (a, b, h) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.2) return; const nx = -dz / L * t, nz = dx / L * t; col.addSolid([a[0] + nx, a[1] + nz, b[0] + nx, b[1] + nz, b[0] - nx, b[1] - nz, a[0] - nx, a[1] - nz], h); };
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; if (Math.abs(a[0] - top.b[0]) < 0.01 && Math.abs(b[0] - top.c[0]) < 0.01) continue; rect(a, b, H + 3); }
}
