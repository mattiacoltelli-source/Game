// Collisioni 2D contro le impronte degli edifici + indice delle strade (per riposizionamento).
const CELL = 40;

export class Collider {
  constructor(buildings, bounds) {
    this.polys = buildings; this.bounds = bounds; this.grid = new Map(); this.stamp = 0;
    buildings.forEach((b, i) => {
      const p = b.pts, n = p.length / 2;
      let mnx = 1e9, mnz = 1e9, mxx = -1e9, mxz = -1e9;
      for (let j = 0; j < n; j++) { mnx = Math.min(mnx, p[j * 2]); mxx = Math.max(mxx, p[j * 2]); mnz = Math.min(mnz, p[j * 2 + 1]); mxz = Math.max(mxz, p[j * 2 + 1]); }
      b.bb = [mnx, mnz, mxx, mxz]; b.seen = 0;
      for (let cx = Math.floor(mnx / CELL); cx <= Math.floor(mxx / CELL); cx++)
        for (let cz = Math.floor(mnz / CELL); cz <= Math.floor(mxz / CELL); cz++) {
          const k = cx * 100003 + cz; let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(i);
        }
    });
  }

  near(x0, z0, x1, z1, fn) {
    const st = ++this.stamp;
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const a = this.grid.get(cx * 100003 + cz); if (!a) continue;
        for (const i of a) { const b = this.polys[i]; if (b.seen === st) continue; b.seen = st; fn(b); }
      }
  }

  // Spinge il cerchio fuori dagli edifici. Ritorna {x,z,nx,nz} (normale verso lo spazio libero) o null.
  push(x, z, r) {
    let best = null, bd = 0;
    this.near(x - r, z - r, x + r, z + r, (b) => {
      const bb = b.bb; if (x < bb[0] - r || x > bb[2] + r || z < bb[1] - r || z > bb[3] + r) return;
      const p = b.pts, n = p.length / 2; let inside = false, md = 1e9, qx = 0, qz = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = p[j * 2], az = p[j * 2 + 1], bx = p[i * 2], bz = p[i * 2 + 1];
        if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        const cx = ax + t * dx, cz = az + t * dz, d = Math.hypot(x - cx, z - cz);
        if (d < md) { md = d; qx = cx; qz = cz; }
      }
      let depth, nx, nz;
      if (inside) { depth = md + r; const L = md || 1; nx = (qx - x) / L; nz = (qz - z) / L; if (!md) { nx = 1; nz = 0; } }
      else if (md < r) { depth = r - md; nx = (x - qx) / md; nz = (z - qz) / md; }
      else return;
      if (depth > bd) { bd = depth; best = { x: x + nx * depth, z: z + nz * depth, nx, nz }; }
    });
    return best;
  }

  inside(x, z, minH = 0) {
    let res = false;
    this.near(x, z, x, z, (b) => {
      if (res || b.h < minH) return; const bb = b.bb; if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) return;
      const p = b.pts, n = p.length / 2; let ins = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = p[j * 2], az = p[j * 2 + 1], bx = p[i * 2], bz = p[i * 2 + 1];
        if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) ins = !ins;
      }
      if (ins) res = true;
    });
    return res;
  }

  // Distanza dal primo muro (edifici alti almeno minH) lungo il raggio (dx,dz unitario); Infinity se libero.
  ray(x, z, dx, dz, maxD, minH = 4) {
    let best = Infinity;
    const ex = x + dx * maxD, ez = z + dz * maxD;
    this.near(Math.min(x, ex) - 1, Math.min(z, ez) - 1, Math.max(x, ex) + 1, Math.max(z, ez) + 1, (b) => {
      if (b.h < minH) return; const p = b.pts, n = p.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = p[j * 2], az = p[j * 2 + 1], sx = p[i * 2] - ax, sz = p[i * 2 + 1] - az;
        const den = dx * sz - dz * sx; if (Math.abs(den) < 1e-9) continue;
        const t = ((ax - x) * sz - (az - z) * sx) / den, u = ((ax - x) * dz - (az - z) * dx) / den;
        if (t >= 0 && t < best && u >= 0 && u <= 1) best = t;
      }
    });
    return best <= maxD ? best : Infinity;
  }
}

export class RoadIndex {
  constructor(roads) {
    this.roads = roads; this.grid = new Map();
    roads.forEach((r, ri) => {
      const p = r.p;
      for (let i = 0; i < p.length / 2 - 1; i++) {
        const mx0 = Math.min(p[i * 2], p[i * 2 + 2]), mx1 = Math.max(p[i * 2], p[i * 2 + 2]);
        const mz0 = Math.min(p[i * 2 + 1], p[i * 2 + 3]), mz1 = Math.max(p[i * 2 + 1], p[i * 2 + 3]);
        for (let cx = Math.floor(mx0 / CELL); cx <= Math.floor(mx1 / CELL); cx++)
          for (let cz = Math.floor(mz0 / CELL); cz <= Math.floor(mz1 / CELL); cz++) {
            const k = cx * 100003 + cz; let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(ri, i);
          }
      }
    });
  }

  // Chiama fn(strada, i) una volta per ogni segmento nel quadrato di lato 2r attorno a (x,z).
  segmentsNear(x, z, r, fn) {
    const seen = new Set();
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
        const a = this.grid.get(cx * 100003 + cz); if (!a) continue;
        for (let s = 0; s < a.length; s += 2) { const k = a[s] * 100000 + a[s + 1]; if (seen.has(k)) continue; seen.add(k); fn(this.roads[a[s]], a[s + 1]); }
      }
  }

  // Punto di strada più vicino a (x,z) per cui accept(x,z) è vero. Campiona i segmenti ogni ~2 m.
  nearest(x, z, accept = () => true, maxR = 400) {
    let best = null;
    for (let R = CELL; R <= maxR; R += CELL) {
      const cx0 = Math.floor((x - R) / CELL), cx1 = Math.floor((x + R) / CELL), cz0 = Math.floor((z - R) / CELL), cz1 = Math.floor((z + R) / CELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const a = this.grid.get(cx * 100003 + cz); if (!a) continue;
        for (let s = 0; s < a.length; s += 2) {
          const r = this.roads[a[s]], i = a[s + 1], p = r.p;
          const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
          const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, steps = Math.max(1, Math.ceil(L / 2));
          for (let k = 0; k <= steps; k++) {
            const t = k / steps, qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(qx - x, qz - z);
            if ((!best || d < best.d) && accept(qx, qz)) best = { x: qx, z: qz, d, dx: dx / L, dz: dz / L };
          }
        }
      }
      if (best && best.d <= R) return best;
    }
    return best;
  }
}
