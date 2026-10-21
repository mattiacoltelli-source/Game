// Piccole utilità di geometria: box colorati uniti in una sola BufferGeometry (per istanze leggere).
import * as THREE from '../lib/three.module.min.js';

// parts: [{ x, y, z, sx, sy, sz, c: [r,g,b], r? }] (centro x,y,z; r = rotazione attorno a y)
export function mergeBoxes(parts) {
  const P = [], N = [], C = [];
  for (const q of parts) {
    const V = [];
    const cr = Math.cos(q.r || 0), sr = Math.sin(q.r || 0);
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const d of [-1, 1]) { const lx = a * q.sx / 2, lz = b * q.sz / 2; V.push([q.x + cr * lx - sr * lz, q.y + d * q.sy / 2, q.z + sr * lx + cr * lz]); }
    const F = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [1, 3, 7, 5], [0, 2, 6, 4]];
    for (const f of F) for (const tri of [[f[0], f[1], f[2]], [f[0], f[2], f[3]]]) {
      let [a, b, c] = tri.map((i) => V[i]);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
      const mx = (a[0] + b[0] + c[0]) / 3 - q.x, my = (a[1] + b[1] + c[1]) / 3 - q.y, mz = (a[2] + b[2] + c[2]) / 3 - q.z;
      if (nx * mx + ny * my + nz * mz < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
      P.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) { N.push(nx, ny, nz); C.push(...q.c); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}
