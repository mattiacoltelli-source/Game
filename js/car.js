// Fisica arcade: velocità come vettore mondo, presa laterale variabile (drift), collisioni che scivolano.
const VMAX = 35, VREV = 8, ACC = 19, BRAKE = 22, REV_ACC = 10, COAST = 3, WHEELBASE = 2.7;
const GRIP = 9, GRIP_DRIFT = 1.7, MAX_SLIP = 0.5;
const CIRCLES = [-1.4, 0, 1.4], RADIUS = 0.92;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export class Car {
  constructor() { this.place(0, 0, 0); }

  place(x, z, h) {
    this.x = x; this.z = z; this.h = h; this.vx = 0; this.vz = 0;
    this.yaw = 0; this.steer = 0; this.drift = 0; this.speed = 0; this.lat = 0; this.contact = 0; this.stuck = 0;
  }

  step(dt, input, col, bounds) {
    const thr = input.throttle, brk = input.brake;
    let fx = Math.cos(this.h), fz = Math.sin(this.h), rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz;

    // sterzo morbido
    const tgt = input.steer, rate = Math.abs(tgt) > Math.abs(this.steer) ? 7 : 11;
    this.steer += clamp(tgt - this.steer, -rate * dt, rate * dt);

    // acceleratore / freno / retromarcia
    let a = 0;
    if (thr > 0) a += ACC * thr * (1 - Math.max(0, vf) / VMAX) + (vf < 0 ? BRAKE * thr : 0);
    if (brk > 0) a += vf > 0.8 ? -BRAKE * brk : -REV_ACC * brk * (1 + Math.min(0, vf) / VREV);
    if (!thr && !brk) a -= Math.sign(vf) * Math.min(Math.abs(vf) / dt, COAST);
    a -= this.drift * 2.5 * Math.sign(vf);
    this.vx += fx * a * dt; this.vz += fz * a * dt;

    // drift: curva stretta ad alta velocità, o frenata in curva
    const sAbs = Math.abs(this.steer), sp = Math.abs(vf);
    let dTgt = clamp((sp - 10) / 8, 0, 1) * (sAbs > 0.55 ? 1 : 0);
    if (brk > 0 && vf > 8 && sAbs > 0.2) dTgt = 1; // frenata in curva = drift
    this.drift += (dTgt - this.drift) * Math.min(1, (dTgt > this.drift ? 6 : 3) * dt);

    // imbardata: curvatura limitata dalla velocità, poi smorzata verso il target
    const dMax = lerp(0.62, 0.2, clamp(sp / 30, 0, 1));
    let wT = vf * Math.tan(this.steer * dMax) / WHEELBASE * (1 + 0.25 * this.drift);
    // auto-allineamento: senza sterzo l'auto riprende da sola la direzione di marcia
    const vl0 = this.vx * rx + this.vz * rz;
    if (vf > 0.5) wT += 3 * (vl0 / (vf + 3)) * (1 - sAbs);
    this.yaw += (wT - this.yaw) * Math.min(1, 10 * dt);
    this.h += this.yaw * dt;

    // riproietta la velocità sul nuovo asse; la componente laterale decade (poco in drift), con slip massimo
    fx = Math.cos(this.h); fz = Math.sin(this.h); rx = -fz; rz = fx;
    vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * rx + this.vz * rz;
    vl *= Math.exp(-lerp(GRIP, GRIP_DRIFT, this.drift) * dt);
    const ms = MAX_SLIP * (Math.abs(vf) + 2); vl = clamp(vl, -ms, ms);
    this.vx = fx * vf + rx * vl; this.vz = fz * vf + rz * vl;
    this.speed = vf; this.lat = vl;

    this.x += this.vx * dt; this.z += this.vz * dt;
    this.collide(dt, col, bounds, input);
  }

  collide(dt, col, bounds, input) {
    let hit = false;
    for (let it = 0; it < 3; it++) {
      const fx = Math.cos(this.h), fz = Math.sin(this.h);
      let any = false;
      for (const off of CIRCLES) {
        const p = col.push(this.x + fx * off, this.z + fz * off, RADIUS);
        if (!p) continue;
        any = hit = true;
        this.x += p.x - (this.x + fx * off); this.z += p.z - (this.z + fz * off);
        const vn = this.vx * p.nx + this.vz * p.nz;
        if (vn < 0) { const sp0 = Math.hypot(this.vx, this.vz); // scivola: toglie solo la componente contro il muro
          this.vx -= vn * p.nx; this.vz -= vn * p.nz;
          const k = Math.max(0, 1 - 0.04 * Math.min(1, -vn / 8));
          this.vx *= k; this.vz *= k;
          // gira dolcemente il muso lungo il muro e convoglia parte dell'urto in scivolamento (niente stop secco)
          const tx = -p.nz, tz = p.nx, s = (fx * tx + fz * tz) >= 0 ? 1 : -1, ttx = tx * s, ttz = tz * s;
          const boost = -vn * 0.6; this.vx += ttx * boost; this.vz += ttz * boost;
          const sp1 = Math.hypot(this.vx, this.vz); if (sp1 > sp0) { this.vx *= sp0 / sp1; this.vz *= sp0 / sp1; }
          let cr = fx * ttz - fz * ttx; const dp = fx * ttx + fz * ttz;
          if (Math.abs(cr) < 0.15 && dp < 0.3) cr = (input.steer >= 0 ? 1 : -1) * 0.5;
          this.h += Math.atan2(cr, dp) * Math.min(1, 3 * dt);
        }
      }
      if (!any) break;
    }
    this.contact = hit ? Math.min(1, this.contact + 5 * dt) : Math.max(0, this.contact - 3 * dt);
    if (hit) { const sp = Math.hypot(this.vx, this.vz); if (sp > 0.1) { const k = Math.max(0, sp - 1.2 * dt) / sp; this.vx *= k; this.vz *= k; } }

    // limiti della mappa
    const [x0, z0, x1, z1] = bounds, m = 20;
    if (this.x < x0 + m) { this.x = x0 + m; this.vx = Math.max(0, this.vx); }
    if (this.x > x1 - m) { this.x = x1 - m; this.vx = Math.min(0, this.vx); }
    if (this.z < z0 + m) { this.z = z0 + m; this.vz = Math.max(0, this.vz); }
    if (this.z > z1 - m) { this.z = z1 - m; this.vz = Math.min(0, this.vz); }

    // anti-incastro: input attivo ma l'auto non si muove
    const active = input.throttle > 0 || input.brake > 0;
    if (active && Math.hypot(this.vx, this.vz) < 1.5) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - 2 * dt);
  }

  // Ritorna true se serve riposizionare (incastrata per >2 s).
  needsRescue() { return this.stuck > 2.0; }
}
