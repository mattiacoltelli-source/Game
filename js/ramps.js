import * as THREE from '../lib/three.module.min.js';

// Rampe di lancio lungo il percorso: salendo veloci (meglio col NOS) si salta molto in alto e si può atterrare sui tetti.
// Cuneo giallo/nero largo 6 m, lungo 16, alto 5. Prima di ognuna c'è un NOS (aggiunto da main).
const L = 16, W = 6, H = 5;
const YEL = [0.96, 0.78, 0.12], BLK = [0.12, 0.12, 0.14], SIDE = [0.55, 0.48, 0.4];

export class Ramps {
  constructor(scene, world, roads, col, avoid = []) {
    this.list = []; this.circles = [];
    const cor = world.corridor, seg = []; let total = 0;
    for (let i = 0; i < cor.length - 1; i++) { const l = Math.hypot(cor[i + 1][0] - cor[i][0], cor[i + 1][1] - cor[i][1]); seg.push(l); total += l; }
    const at = (d) => { for (let i = 0; i < seg.length; i++) { if (d <= seg[i]) { const f = d / seg[i]; return { x: cor[i][0] + (cor[i + 1][0] - cor[i][0]) * f, z: cor[i][1] + (cor[i + 1][1] - cor[i][1]) * f }; } d -= seg[i]; } return null; };
    // posizioni: vicino al percorso, su strade che puntano contro un edificio con un tetto raggiungibile a 28-90 m
    const OK = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential']), cands = [];
    for (let d = 160; d < total - 100; d += 90) {
      const p = at(d); if (!p) continue;
      roads.segmentsNear(p.x, p.z, 140, (r, i) => {
        if (!OK.has(r.c) || r.w < 6 || /Matteotti/.test(r.n || '')) return; const P = r.p, ax = P[i * 2], az = P[i * 2 + 1], bx = P[i * 2 + 2], bz = P[i * 2 + 3], len = Math.hypot(bx - ax, bz - az); if (len < 22) return;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2; if (world.groundY(mx, mz) > 0.2 || avoid.some((q) => Math.hypot(q.x - mx, q.z - mz) < q.r)) return;
        for (const sg of [1, -1]) {
          const ux = (bx - ax) / len * sg, uz = (bz - az) / len * sg, dw = col.ray(mx, mz, ux, uz, 95, 9); if (!(dw > 28 && dw < 90)) continue;
          let depth = 0, bld = null; for (let t = 4; t <= 10; t += 2) { const bb = col.buildingAt(mx + ux * (dw + t), mz + uz * (dw + t)); if (bb && bb.h >= 10 && bb.h <= 30) { depth = t; bld = bb; } else break; }
          if (bld && depth >= 6) cands.push({ d, x: mx, z: mz, ux, uz, tx: mx + ux * (dw + depth - 1), tz: mz + uz * (dw + depth - 1), th: bld.h, dist: Math.hypot(mx - p.x, mz - p.z) });
        }
      });
    }
    cands.sort((a, b) => a.dist - b.dist);
    for (const c of cands) { if (this.list.length >= 9) break; if (this.list.some((r) => Math.hypot(r.x - c.x, r.z - c.z) < 130)) continue; this.list.push(c); }
    // geometria unita: pendio a strisce, fianchi e retro
    const P = [], C = [], N = [];
    const tri = (a, b, c, col, n) => { P.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) { C.push(...col); N.push(...n); } };
    for (const r of this.list) {
      const nx = -r.uz, nz = r.ux, pt = (u, v, h) => [r.x + r.ux * (u - L / 2) + nx * v, 0.2 + h, r.z + r.uz * (u - L / 2) + nz * v], strips = 8;
      for (let k = 0; k < strips; k++) {
        const u0 = L * k / strips, u1 = L * (k + 1) / strips, a = pt(u0, -W / 2, H * u0 / L), b = pt(u0, W / 2, H * u0 / L), c = pt(u1, W / 2, H * u1 / L), d2 = pt(u1, -W / 2, H * u1 / L), col = k % 2 ? BLK : YEL, up = [-r.ux * H / L, 1, -r.uz * H / L];
        tri(a, b, c, col, up); tri(a, c, d2, col, up);
      }
      for (const s of [-1, 1]) { const o = pt(0, s * W / 2, 0), e = pt(L, s * W / 2, 0), t = pt(L, s * W / 2, H); tri(o, e, t, SIDE, [nx * s, 0, nz * s]); }
      const e1 = pt(L, -W / 2, 0), e2 = pt(L, W / 2, 0), t1 = pt(L, -W / 2, H), t2 = pt(L, W / 2, H); tri(e1, e2, t2, SIDE, [r.ux, 0, r.uz]); tri(e1, t2, t1, SIDE, [r.ux, 0, r.uz]);
      this.circles.push({ x: r.x, z: r.z, r: 7 });
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    this.mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); this.mesh.frustumCulled = false; scene.add(this.mesh);
  }

  // Salto assistito col NOS: se (x,z) è al bordo alto di una rampa e si va verso il tetto bersaglio, ritorna la velocità per atterrarci sopra in 2,8 s.
  assist(x, z, vx, vz) {
    const T = 2.8, G = 14;
    for (const r of this.list) {
      const dx = x - r.x, dz = z - r.z, u = dx * r.ux + dz * r.uz + L / 2; if (dx * dx + dz * dz > 150 || u < L * 0.5) continue;
      const sp = Math.hypot(vx, vz) || 1; if ((vx * r.ux + vz * r.uz) / sp < 0.75) continue;
      return { vx: (r.tx - x) / T, vz: (r.tz - z) / T, vy: (0.5 * G * T * T + (r.th - (0.2 + H))) / T };
    }
    return null;
  }

  // Quota della rampa nel punto (x,z): 0 fuori.
  h(x, z) {
    for (const r of this.list) {
      const dx = x - r.x, dz = z - r.z; if (dx * dx + dz * dz > 400) continue;
      const u = dx * r.ux + dz * r.uz + L / 2, v = -dx * r.uz + dz * r.ux;
      if (u >= 0 && u <= L && Math.abs(v) <= W / 2) return H * u / L;
    }
    return 0;
  }
}
