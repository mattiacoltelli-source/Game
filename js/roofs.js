import * as THREE from '../lib/three.module.min.js';
import { mergeBoxes } from './geom.js';

// Ostacoli sui tetti vicino al percorso: antenne, camini, serbatoi, pannelli solari. Sono solidi con collisione
// (l'auto ci sbatte e rallenta) e rendono i tetti una scorciatoia rischiosa. Posizioni deterministiche, un'unica mesh.
const GREY = [0.55, 0.56, 0.6], DARK = [0.2, 0.21, 0.25], RUST = [0.62, 0.34, 0.24], BLUE = [0.16, 0.26, 0.5], WHITE = [0.88, 0.88, 0.86];
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Roofs {
  constructor(scene, world, col, avoid = []) {
    const cor = world.corridor, R = rng(777), parts = []; this.count = 0;
    const near = (x, z) => { for (let i = 0; i < cor.length - 1; i++) { const dx = cor[i + 1][0] - cor[i][0], dz = cor[i + 1][1] - cor[i][1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - cor[i][0]) * dx + (z - cor[i][1]) * dz) / L2)); if (Math.hypot(x - cor[i][0] - dx * t, z - cor[i][1] - dz * t) < 130) return true; } return false; };
    const box = (x, y, z, sx, sy, sz, c, r = 0) => parts.push({ x, y, z, sx, sy, sz, c, r });
    for (const b of world.buildings) {
      if (b.k || b.solid || b.h < 10 || b.h > 34 || this.count >= 220) continue;
      const p = b.pts, n = p.length / 2; let mnx = 1e9, mnz = 1e9, mxx = -1e9, mxz = -1e9, cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { mnx = Math.min(mnx, p[i * 2]); mxx = Math.max(mxx, p[i * 2]); mnz = Math.min(mnz, p[i * 2 + 1]); mxz = Math.max(mxz, p[i * 2 + 1]); cx += p[i * 2]; cz += p[i * 2 + 1]; }
      const w = mxx - mnx, d = mxz - mnz; if (w < 12 || d < 12 || w * d < 220) continue; cx /= n; cz /= n;
      if (!near(cx, cz) || R() > 0.8 || avoid.some((a) => Math.hypot(a.x - cx, a.z - cz) < a.r)) continue;
      const k = 1 + Math.floor(R() * 3);
      for (let j = 0; j < k; j++) {
        const x = mnx + 4 + R() * (w - 8), z = mnz + 4 + R() * (d - 8); if (!col.inside(x, z, b.h - 0.5) || avoid.some((a) => Math.hypot(a.x - x, a.z - z) < a.r)) continue;
        const kind = R(), y0 = b.h; let hh, hw;
        if (kind < 0.3) { hh = 7; hw = 0.6; box(x, y0 + hh / 2, z, 0.5, hh, 0.5, GREY); box(x, y0 + hh - 1.5, z, 3.2, 0.3, 0.3, GREY); box(x, y0 + hh - 3, z, 0.3, 0.3, 2.6, GREY); box(x, y0 + 0.4, z, 1.6, 0.8, 1.6, DARK); hw = 1.6; }
        else if (kind < 0.55) { hh = 6; hw = 1.2; box(x, y0 + hh / 2, z, 1.6, hh, 1.6, RUST); box(x, y0 + hh + 0.3, z, 2.2, 0.6, 2.2, DARK); }
        else if (kind < 0.8) { hh = 6; hw = 2.6; box(x, y0 + 2.2, z, 5, 3, 5, WHITE); box(x, y0 + 4, z, 5.4, 0.4, 5.4, DARK); box(x, y0 + 4.6, z, 1.2, 1.4, 1.2, GREY); box(x - 1.6, y0 + 0.6, z - 1.6, 0.4, 1.2, 0.4, DARK); box(x + 1.6, y0 + 0.6, z + 1.6, 0.4, 1.2, 0.4, DARK); }
        else { hh = 4; hw = 3.2; for (let q = -1; q <= 1; q++) box(x + q * 2.2, y0 + 1.1, z, 1.8, 2.2, 5.6, BLUE, 0); box(x, y0 + 0.2, z, 7, 0.4, 5.8, DARK); }
        col.addSolid([x - hw, z - hw, x + hw, z - hw, x + hw, z + hw, x - hw, z + hw], y0 + hh); this.count++;
      }
    }
    if (parts.length) { this.mesh = new THREE.Mesh(mergeBoxes(parts), new THREE.MeshLambertMaterial({ vertexColors: true })); this.mesh.frustumCulled = false; scene.add(this.mesh); }
  }
}
