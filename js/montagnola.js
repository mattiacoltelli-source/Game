import * as THREE from '../lib/three.module.min.js';
import { mergeBoxes } from './geom.js';

// Parco della Montagnola: collinetta artificiale sopraelevata (piattaforma a quota PARK_H) con muri di contenimento in pietra, parapetto con
// pilastri, contrafforti, camminamento sul bordo e due scaloni: lo Scalone del Pincio da Via dell'Indipendenza e la scalinata verso Via Irnerio
// (Piazza dell'Otto Agosto). L'area del parco è sollevata, i sentieri OSM ridisegnati in quota, strade e edifici interni tolti.
export const PARK_H = 6;
const STONE = [0.72, 0.68, 0.6], STONE_D = [0.5, 0.46, 0.4], STONE_L = [0.84, 0.8, 0.72], GRASS = [0.56, 0.70, 0.45], PATH = [0.82, 0.76, 0.64], BRONZE = [0.26, 0.2, 0.15], LAMP = [1.4, 1.3, 0.95];
// base indicativa (viene riaggiustata sul bordo del parco), direzione di salita (dx,dz), lunghezza e larghezza
const STAIRS = [
  { id: 'pincio', x0: -392, z0: -297, dx: 1, dz: 0, len: 26, w: 15, clip: true, terrace: true },
  { id: 'irnerio', x0: -352, z0: -146, dx: 0, dz: -1, len: 22, w: 12, flat: [-377, -327] },
];

const inPoly = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > z) !== (poly[j][1] > z) && x < (poly[j][0] - poly[i][0]) * (z - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };

// Douglas-Peucker: toglie la dentellatura dei dati OSM mantenendo gli angoli veri.
function simplify(pts, tol) {
  const n = pts.length; if (n < 8) return pts; const keep = new Array(n).fill(false); keep[0] = keep[Math.floor(n / 2)] = true;
  const rec = (a, b) => { let md = 0, mi = -1; const A = pts[a % n], B = pts[b % n], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz) || 1;
    for (let i = a + 1; i < b; i++) { const P = pts[i % n], d = Math.abs((P[0] - A[0]) * dz - (P[1] - A[1]) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol && mi >= 0) { keep[mi % n] = true; rec(a, mi); rec(mi, b); } };
  rec(0, Math.floor(n / 2)); rec(Math.floor(n / 2), n); return pts.filter((_, i) => keep[i]);
}

// Costruisce il poligono semplificato e vi ritaglia l'apertura di ogni scalone. Ritorna null se i dati non contengono il parco.
export function setupPark(areas, pois) {
  const poi = (pois || []).find((q) => /Montagnola/.test(q.n)); if (!poi) return null;
  const a = areas.find((q) => (q.k === 'green' || q.k === 'wood') && q.p.length >= 40 && inPoly(Array.from({ length: q.p.length / 2 }, (_, i) => [q.p[i * 2], q.p[i * 2 + 1]]), poi.x, poi.z)); if (!a) return null;
  let poly = Array.from({ length: a.p.length / 2 }, (_, i) => [a.p[i * 2], a.p[i * 2 + 1]]);
  poly = simplify(poly, 1.3); const stairs = [], notches = [];
  for (const S0 of STAIRS) {
    const S = { ...S0 }, hw = S.w / 2, ex = -S.dz, ez = S.dx; // (ex,ez) = laterale
    // 1) se serve, appiattisce il bordo vicino alla base (toglie vertici in una baia attorno alla base)
    const bayR = hw + 14, bx = S.x0, bz = S.z0, inBay = (v) => Math.abs((v[0] - bx) * S.dx + (v[1] - bz) * S.dz) < 13 && Math.abs((v[0] - bx) * ex + (v[1] - bz) * ez) < bayR;
    poly = poly.filter((v) => !inBay(v));
    // 2) cerca il bordo attraversato dall'asse dello scalone (da base-8 a base+len)
    const p0 = [S.x0 - S.dx * 10, S.z0 - S.dz * 10], p1 = [S.x0 + S.dx * S.len, S.z0 + S.dz * S.len]; let hit = -1, P = null;
    for (let i = 0; i < poly.length; i++) { const A = poly[i], B = poly[(i + 1) % poly.length], d1x = p1[0] - p0[0], d1z = p1[1] - p0[1], d2x = B[0] - A[0], d2z = B[1] - A[1], den = d1x * d2z - d1z * d2x; if (Math.abs(den) < 1e-9) continue; const t = ((A[0] - p0[0]) * d2z - (A[1] - p0[1]) * d2x) / den, u = ((A[0] - p0[0]) * d1z - (A[1] - p0[1]) * d1x) / den; if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { hit = i; P = [p0[0] + d1x * t, p0[1] + d1z * t]; break; } }
    if (hit < 0) continue;
    S.x0 = P[0]; S.z0 = P[1]; const A = poly[hit], B = poly[(hit + 1) % poly.length]; let ex2 = B[0] - A[0], ez2 = B[1] - A[1]; const L = Math.hypot(ex2, ez2); ex2 /= L; ez2 /= L;
    const A0 = [P[0] - ex2 * hw, P[1] - ez2 * hw], B0 = [P[0] + ex2 * hw, P[1] + ez2 * hw], A1 = [A0[0] + S.dx * S.len, A0[1] + S.dz * S.len], B1 = [B0[0] + S.dx * S.len, B0[1] + S.dz * S.len];
    poly.splice(hit + 1, 0, A0, A1, B1, B0); S.top = [A1, B1]; S.mouth = [A0, B0]; stairs.push(S);
  }
  if (!stairs.length) return null;
  return { poly, H: PARK_H, stairs };
}

export const stairU = (S, x, z) => { const ex = -S.dz, ez = S.dx, rx = x - S.x0, rz = z - S.z0; return [rx * S.dx + rz * S.dz, rx * ex + rz * ez]; };
export const parkHeight = (park, x, z) => {
  if (!park) return 0;
  for (const S of park.stairs) { const [u, v] = stairU(S, x, z); if (u >= 0 && u <= S.len && Math.abs(v) <= S.w / 2) return park.H * u / S.len; }
  return inPoly(park.poly, x, z) ? park.H : 0;
};
export const nearStair = (park, x, z, pad = 4) => !!park && park.stairs.some((S) => { const [u, v] = stairU(S, x, z); return u > -pad && u < S.len + 14 && Math.abs(v) < S.w / 2 + pad; });

// Apre il varco davanti allo scalone con `clip`: un palazzo che lo attraversa viene diviso in due corpi (se la pianta è rettangolare) o tolto.
export function clipPassage(park, p, n) {
  const S = park.stairs.find((q) => q.clip); if (!S) return null;
  const zA = S.z0 - S.w / 2 - 3, zB = S.z0 + S.w / 2 + 3, xA = S.x0 - 34, xB = S.x0 + 4; let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9, A = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; mnx = Math.min(mnx, p[i * 2]); mxx = Math.max(mxx, p[i * 2]); mnz = Math.min(mnz, p[i * 2 + 1]); mxz = Math.max(mxz, p[i * 2 + 1]); A += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
  if (mxx < xA || mnx > xB || mxz < zA || mnz > zB) return null;
  if (Math.abs(A) / 2 < 0.8 * (mxx - mnx) * (mxz - mnz)) return [];
  const out = []; if (mnz < zA - 4) out.push([mnx, mnz, mxx, mnz, mxx, zA, mnx, zA]); if (mxz > zB + 4) out.push([mnx, zB, mxx, zB, mxx, mxz, mnx, mxz]); return out;
}

const isTop = (park, a, b) => park.stairs.some((S) => Math.hypot(a[0] - S.top[0][0], a[1] - S.top[0][1]) < 0.01 && Math.hypot(b[0] - S.top[1][0], b[1] - S.top[1][1]) < 0.01);
const isSide = (park, a, b) => park.stairs.some((S) => (Math.hypot(a[0] - S.mouth[0][0], a[1] - S.mouth[0][1]) < 0.01 && Math.hypot(b[0] - S.top[0][0], b[1] - S.top[0][1]) < 0.01) || (Math.hypot(a[0] - S.top[1][0], a[1] - S.top[1][1]) < 0.01 && Math.hypot(b[0] - S.mouth[1][0], b[1] - S.mouth[1][1]) < 0.01));

// Mesh del parco.
export function buildPark(world, park, removedPaths) {
  const g = new THREE.Group(), H = park.H, poly = park.poly, n = poly.length;
  let area = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1]; } const sg = area > 0 ? 1 : -1;
  // piano superiore + sentieri in quota
  { const contour = poly.map((q) => new THREE.Vector2(q[0], q[1])); let idx = []; try { idx = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { /* ignora */ }
    const P = [], C = []; for (const t of idx) for (const k of t) { P.push(contour[k].x, H, contour[k].y); C.push(GRASS[0], GRASS[1], GRASS[2]); }
    g.add(world.makeMesh(P, C, null, world.matGround));
    const PP = [], PC = []; const strip = (ax, az, bx, bz, hw, y, col) => { const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.3) return; const nx = -dz / L * hw, nz = dx / L * hw; for (const v of [[ax + nx, az + nz], [ax - nx, az - nz], [bx + nx, bz + nz], [bx + nx, bz + nz], [ax - nx, az - nz], [bx - nx, bz - nz]]) { PP.push(v[0], y, v[1]); PC.push(col[0], col[1], col[2]); } };
    for (const r of removedPaths) { const p = r.p; for (let i = 0; i + 3 < p.length; i += 2) strip(p[i], p[i + 1], p[i + 2], p[i + 3], 1.3, H + 0.05, PATH); }
    // camminamento lungo tutto il bordo (2,6 m, ghiaia chiara) a 1,6 m dal parapetto
    for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; if (isTop(park, a, b) || isSide(park, a, b)) continue; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.5) continue; const ix = -sg * dz / L, iz = sg * dx / L, o = 2.2; strip(a[0] - ix * o * -1, a[1] - iz * o * -1, b[0] - ix * o * -1, b[1] - iz * o * -1, 1.2, H + 0.04, PATH); }
    if (PP.length) g.add(world.makeMesh(PP, PC, null, world.matGround)); }
  // muri di contenimento: zoccolo scuro, corsi di blocchi alternati, cornice sporgente, parapetto con coronamento; pilastri ogni ~10 m
  const wp = [], wc = [], wn = [], pil = [];
  const Q = (a, b, y0, y1, o, nx, nz, c) => { for (const v of [[a, y0], [b, y0], [b, y1], [a, y0], [b, y1], [a, y1]]) { wp.push(v[0][0] + nx * o, v[1], v[0][1] + nz * o); wc.push(c[0], c[1], c[2]); wn.push(nx, 0, nz); } };
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n]; if (isTop(park, a, b)) continue; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.05) continue; const nx = sg * dz / L, nz = -sg * dx / L; // normale verso l'esterno
    Q(a, b, 0, 0.7, 0.25, nx, nz, STONE_D); // zoccolo sporgente
    Q(a, b, 0.7, H - 0.5, 0, nx, nz, STONE_D); // fondo pieno (nessuna fessura tra i corsi)
    const courses = 6, ch = (H - 0.7 - 0.5) / courses; for (let k = 0; k < courses; k++) Q(a, b, 0.7 + k * ch + 0.03, 0.7 + (k + 1) * ch - 0.03, 0.04, nx, nz, k % 2 ? STONE : [0.76, 0.72, 0.64]); // corsi di blocchi in rilievo
    Q(a, b, H - 0.5, H, 0.28, nx, nz, STONE_L); // cornice sporgente
    if (!isSide(park, a, b)) { // parapetto sul bordo del piano (non lungo gli scaloni): muretto alto 1 m, un po' arretrato
      const ix = -nx, iz = -nz, ob = 0.35, A2 = [a[0] + ix * ob, a[1] + iz * ob], B2 = [b[0] + ix * ob, b[1] + iz * ob];
      Q(A2, B2, H, H + 1.0, 0.16, nx, nz, STONE); Q(A2, B2, H, H + 1.0, -0.16, -nx, -nz, STONE);
      for (const v of [[A2, -0.16], [B2, -0.16], [B2, 0.16], [A2, -0.16], [B2, 0.16], [A2, 0.16]]) { wp.push(v[0][0] + nx * v[1], H + 1.0, v[0][1] + nz * v[1]); wc.push(0.88, 0.84, 0.76); wn.push(0, 1, 0); }
      const cnt = Math.max(1, Math.round(L / 10)); for (let k = 0; k <= cnt; k++) { const t = k / cnt; pil.push({ x: a[0] + dx * t + ix * ob, z: a[1] + dz * t + iz * ob, nx, nz }); }
    }
  }
  g.add(world.makeMesh(wp, wc, wn, world.matPlain));
  const parts = [];
  for (const p of pil) parts.push({ x: p.x, y: H + 0.7, z: p.z, sx: 0.8, sy: 1.4, sz: 0.8, c: STONE_D }, { x: p.x, y: H + 1.5, z: p.z, sx: 1.0, sy: 0.22, sz: 1.0, c: STONE_L });
  // scaloni: gradini, balaustre con pilastrini, gruppi in bronzo, lampioni, sagrato in basso e terrazza/atrio in cima
  for (const S of park.stairs) {
    const hw = S.w / 2, ex = -S.dz, ez = S.dx, rot = Math.atan2(S.dz, S.dx), steps = Math.round(S.len), run = S.len / steps, sh = H / steps;
    const X = (u, v) => S.x0 + S.dx * u + ex * v, Z = (u, v) => S.z0 + S.dz * u + ez * v, box = (u, y, v, su, sy, sv, c) => parts.push({ x: X(u, v), y, z: Z(u, v), sx: su, sy, sz: sv, c, r: rot });
    for (let i = 0; i < steps; i++) box((i + 0.5) * run, (i + 1) * sh / 2, 0, run, (i + 1) * sh, S.w - 0.4, i % 2 ? [0.84, 0.8, 0.72] : [0.8, 0.76, 0.68]);
    box(-2.5, 0.1, 0, 5, 0.2, S.w + 3, [0.74, 0.7, 0.62]);
    for (const sd of [-1, 1]) { const vb = sd * (hw - 0.2);
      for (let i = 0; i < steps; i++) box((i + 0.5) * run, (i + 1) * sh + 0.5, vb, run + 0.02, 1.0, 0.5, STONE);
      for (let k = 0; k <= 6; k++) { const u = S.len * k / 6, y = H * k / 6; box(u, y + 0.9, vb, 0.9, 1.8 + (k % 2 ? 0 : 0.5), 0.9, STONE_D); box(u, y + 1.9 + (k % 2 ? 0 : 0.5), vb, 1.1, 0.25, 1.1, STONE_L); }
      for (const [u, hh] of [[-1.2, 0], [S.len + 1.5, H]]) { const v = sd * (hw + 0.2); box(u, hh + 0.8, v, 2.2, 1.6, 2.2, STONE); box(u, hh + 2.5, v, 0.8, 1.8, 0.8, BRONZE); box(u, hh + 3.7, v, 0.55, 0.55, 0.55, BRONZE); box(u + 0.5, hh + 3.2, v + sd * 0.7, 1.3, 0.25, 0.25, BRONZE); }
      for (const [u, hh] of [[0.5, 0], [S.len - 0.5, H]]) { const v = sd * (hw + 1.5); box(u, hh + 2.6, v, 0.2, 5.2, 0.2, [0.18, 0.19, 0.2]); box(u, hh + 5.4, v, 0.8, 0.5, 0.8, LAMP); }
    }
    if (S.terrace) { const u = S.len + 9; box(u, H + 0.3, 0, 8, 0.6, 8, STONE); box(u, H + 0.75, 0, 5.6, 0.3, 5.6, [0.5, 0.65, 0.8]); box(u, H + 1.7, 0, 1, 2, 1, STONE_D); box(u, H + 3, 0, 2, 0.4, 2, [0.55, 0.7, 0.85]); }
    else { const u = S.len + 4; box(u, H + 0.15, 0, 7, 0.3, S.w + 2, STONE); box(u, H + 0.6, -hw - 0.2, 3, 0.9, 1, STONE_L); box(u, H + 0.6, hw + 0.2, 3, 0.9, 1, STONE_L); } // atrio in cima
  }
  g.add(new THREE.Mesh(mergeBoxes(parts), new THREE.MeshLambertMaterial({ vertexColors: true })));
  return g;
}

// Solidi di collisione: muri del bordo (anche ai lati degli scaloni), non la sommità di ciascuno scalone.
export function addParkSolids(park, col) {
  const poly = park.poly, n = poly.length, t = 0.7, H = park.H;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; if (isTop(park, a, b)) continue; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.2) continue; const nx = -dz / L * t, nz = dx / L * t; col.addSolid([a[0] + nx, a[1] + nz, b[0] + nx, b[1] + nz, b[0] - nx, b[1] - nz, a[0] - nx, a[1] - nz], H + 3); }
}
