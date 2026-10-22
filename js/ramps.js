import * as THREE from '../lib/three.module.min.js';

// Rampe di lancio lungo il percorso: salendo veloci (meglio col NOS) si salta molto in alto e si può atterrare sui tetti.
// Cuneo giallo/nero largo 6 m, lungo 16, alto 5. Prima di ognuna c'è un NOS (aggiunto da main).
const L = 16, H = 5;
const YEL = [0.96, 0.78, 0.12], BLK = [0.12, 0.12, 0.14], SIDE = [0.55, 0.48, 0.4];

export class Ramps {
  // Tre rampe pensate per la corsa Nettuno -> Fiera, tutte orientate verso la Fiera:
  //  1) Via dell'Indipendenza, sul percorso (comoda); 2) Via Donato Creti, nella corsia laterale (il treno corre in mezzo); 3) una traversa un po' fuori percorso (da conoscere).
  constructor(scene, world, roads, col, goal) {
    this.list = []; this.circles = [];
    const cor = world.corridor, G = 14, TT = 2.8, y0 = 0.2 + H;
    const segDist = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
    const corrDist = (x, z) => { let d = 1e9; for (let i = 0; i < cor.length - 1; i++) d = Math.min(d, segDist(x, z, cor[i][0], cor[i][1], cor[i + 1][0], cor[i + 1][1])); return d; };
    // tetto raggiungibile davanti alla rampa: atterraggio in un edificio 10-30 m entro ±30° e 38-85 m, senza edifici più alti sulla traiettoria
    const findRoof = (x, z, ux, uz) => {
      let best = null; const base = Math.atan2(uz, ux);
      for (const da of [0, 0.17, -0.17, 0.35, -0.35, 0.52, -0.52]) for (const D of [55, 48, 62, 70, 42, 78]) {
        const ang = base + da, dx = Math.cos(ang), dz = Math.sin(ang), tx = x + dx * D, tz = z + dz * D, b = col.buildingAt(tx, tz);
        if (!b || b.h < 10 || b.h > 30) continue;
        if (![[5, 0], [-5, 0], [0, 5], [0, -5]].every(([ox, oz]) => col.buildingAt(tx + ox, tz + oz) === b)) continue; // almeno 5 m dal bordo
        const vy = (0.5 * G * TT * TT + (b.h - y0)) / TT; let ok = true;
        for (let s2 = 8; s2 < D - 4 && ok; s2 += 6) { const t = s2 / D * TT, yy = y0 + vy * t - 0.5 * G * t * t, bb = col.buildingAt(x + dx * s2, z + dz * s2); if (bb && bb.h > yy - 1.5) ok = false; }
        if (!ok) continue; const score = Math.abs(da) * 30 + Math.abs(D - 55) * 0.2; if (!best || score < best.score) best = { score, tx, tz, th: b.h };
      }
      return best;
    };
    // punto sulla strada con nome (regex) più vicino a (nx,nz); direzione scelta secondo l'indizio (hx,hz)
    const onRoad = (re, nx, nz, hx, hz) => {
      let best = null;
      for (const r of world.roads) { if (!re.test(r.n || '')) continue; const p = r.p; for (let i = 0; i < p.length / 2 - 1; i++) { const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3], len = Math.hypot(bx - ax, bz - az); if (len < 22) continue; const d = segDist(nx, nz, ax, az, bx, bz); if (!best || d < best.d) best = { d, ax, az, bx, bz, len }; } }
      if (!best) return null; let ux = (best.bx - best.ax) / best.len, uz = (best.bz - best.az) / best.len; if (ux * hx + uz * hz < 0) { ux = -ux; uz = -uz; }
      const t = Math.max(0, Math.min(best.len, (nx - best.ax) * (best.bx - best.ax) / best.len + (nz - best.az) * (best.bz - best.az) / best.len)); return { x: best.ax + (best.bx - best.ax) * t / best.len, z: best.az + (best.bz - best.az) * t / best.len, ux, uz };
    };
    const add = (q, w, off) => { // sposta lateralmente (verso destra della marcia) di `off` m
      if (!q) return; const nx = -q.uz, nz = q.ux, x = q.x + nx * off, z = q.z + nz * off, roof = findRoof(x, z, q.ux, q.uz); if (!roof) return;
      this.list.push({ x, z, ux: q.ux, uz: q.uz, w, tx: roof.tx, tz: roof.tz, th: roof.th });
    };
    // 1) Indipendenza: sul percorso, tratto lungo e dritto verso nord (il percorso va da (-467,6) a (-444,-110))
    let q1 = null; for (const [px, pz] of [[-455, -45], [-480, 60], [-515, 215], [-440, -150], [-410, -260]]) { q1 = onRoad(/Indipendenza/, px, pz, 0.19, -0.98); if (q1 && findRoof(q1.x, q1.z, q1.uz * 0 + q1.ux, q1.uz)) break; }
    add(q1, 4.2, 0);
    // 2) Donato Creti: verso est, corsia laterale (in mezzo corrono i binari)
    for (const px of [330, 280, 380, 230, 420]) { const q = onRoad(/Donato Creti/, px, -1118, 1, 0.1); if (!q) continue; const n0 = this.list.length; add(q, 3.4, 3.0); if (this.list.length > n0) break; }
    // 3) traversa fuori percorso (45-120 m dal tracciato, dopo il ponte), che punta verso la Fiera
    let hid = null; const gx = goal.x, gz = goal.z;
    for (const r of world.roads) {
      if (!/^(residential|tertiary|secondary|unclassified)$/.test(r.c) || r.w < 6 || /Matteotti|Stalingrado|Donato|Indipendenza/.test(r.n || '')) continue; const p = r.p;
      for (let i = 0; i < p.length / 2 - 1; i++) {
        const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3], len = Math.hypot(bx - ax, bz - az); if (len < 28) continue;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2; if (mx < -300 || world.groundY(mx, mz) > 0.2) continue; const cd = corrDist(mx, mz); if (cd < 45 || cd > 120) continue;
        let ux = (bx - ax) / len, uz = (bz - az) / len; const tg = Math.hypot(gx - mx, gz - mz); if (ux * (gx - mx) / tg + uz * (gz - mz) / tg < 0) { ux = -ux; uz = -uz; } if (ux * (gx - mx) / tg + uz * (gz - mz) / tg < 0.6) continue;
        if (this.list.some((r2) => Math.hypot(r2.x - mx, r2.z - mz) < 200)) continue;
        const roof = findRoof(mx, mz, ux, uz); if (!roof) continue; const score = Math.abs(cd - 80) + roof.score; if (!hid || score < hid.score) hid = { score, x: mx, z: mz, ux, uz, roof };
      }
    }
    if (hid) this.list.push({ x: hid.x, z: hid.z, ux: hid.ux, uz: hid.uz, w: 4.2, tx: hid.roof.tx, tz: hid.roof.tz, th: hid.roof.th });
    for (const r of this.list) this.circles.push({ x: r.x, z: r.z, r: 7 });
    // geometria unita: pendio a strisce, fianchi e retro
    const P = [], C = [], N = [];
    const tri = (a, b, c, col, n) => { P.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) { C.push(...col); N.push(...n); } };
    for (const r of this.list) {
      const W = r.w, nx = -r.uz, nz = r.ux, pt = (u, v, h) => [r.x + r.ux * (u - L / 2) + nx * v, 0.2 + h, r.z + r.uz * (u - L / 2) + nz * v], strips = 8;
      for (let k = 0; k < strips; k++) {
        const u0 = L * k / strips, u1 = L * (k + 1) / strips, a = pt(u0, -W / 2, H * u0 / L), b = pt(u0, W / 2, H * u0 / L), c = pt(u1, W / 2, H * u1 / L), d2 = pt(u1, -W / 2, H * u1 / L), col = k % 2 ? BLK : YEL, up = [-r.ux * H / L, 1, -r.uz * H / L];
        tri(a, b, c, col, up); tri(a, c, d2, col, up);
      }
      for (const s of [-1, 1]) { const o = pt(0, s * W / 2, 0), e = pt(L, s * W / 2, 0), t = pt(L, s * W / 2, H); tri(o, e, t, SIDE, [nx * s, 0, nz * s]); }
      const e1 = pt(L, -W / 2, 0), e2 = pt(L, W / 2, 0), t1 = pt(L, -W / 2, H), t2 = pt(L, W / 2, H); tri(e1, e2, t2, SIDE, [r.ux, 0, r.uz]); tri(e1, t2, t1, SIDE, [r.ux, 0, r.uz]);
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
      if (u >= 0 && u <= L && Math.abs(v) <= r.w / 2) return H * u / L;
    }
    return 0;
  }
}
