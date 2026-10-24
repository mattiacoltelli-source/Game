// Fisica arcade: velocità come vettore mondo, presa laterale variabile (drift), collisioni che scivolano.
const VMAX = 45, VREV = 8, ACC = 24, BRAKE = 22, REV_ACC = 10, COAST = 3, WHEELBASE = 2.7;
const GRIP = 9, GRIP_DRIFT = 1.7, MAX_SLIP = 0.5;
const CIRCLES = [-1.4, 0, 1.4], RADIUS = 0.92, G = 14; // G: gravità arcade (m/s²), bassa: i salti "galleggiano"
const THRUST = 30, VUP = 11, MAXALT = 40, FUEL_MAX = 10; // propulsori (modalità taxi volante)
const BOOST_TIME = 10, SLOW_TIME = 10, NOS_PEAK = 0.72; // picco col NOS: -28% rispetto all'originale (NOS x1 almeno +12% sulla velocità normale)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export class Car {
  constructor() { this.canFly = false; this.dry = false; this.fuel = FUEL_MAX; this.fuelMax = FUEL_MAX; this.thrusting = false; this.grass = false; this.rampH = () => 0; this.rampAssist = () => null; this.superJump = false; this.onRamp = false; this.gadget = null; this.shield = 0; this.magnet = 0; this.onRoof = false; this.place(0, 0, 0); }

  place(x, z, h, y = 0) {
    this.x = x; this.z = z; this.h = h; this.vx = 0; this.vz = 0; this.y = y; this.vy = 0; this.boost = 0; this.level = 0; this.charges = 0; this.slow = 0; this.oil = 0; this.oilPh = 0; this.air = false; this.airT = 0; this.jump = 0; this.landed = 0; this.clear = 0;
    this.yaw = 0; this.steer = 0; this.drift = 0; this.speed = 0; this.lat = 0; this.contact = 0; this.stuck = 0;
  }

  step(dt, input, col, bounds, ground = () => 0, base = ground) {
    const air = this.air, fly = this.canFly, thr = (air && !fly) ? 0 : input.throttle * (air ? 0.8 : 1), brk = (air && !fly) ? 0 : input.brake * (air ? 0.6 : 1);
    // NOS a livelli (1-3 cariche accumulate): la spinta in più è x1, x2, x3 (+40% velocità massima e +90% accelerazione per livello).
    // Rallentamento (dopo aver investito un pedone): velocità massima -30%.
    const lv = this.boost > 0 ? this.level : 0;
    const vmax = VMAX * (lv ? Math.max(1.12, NOS_PEAK * (1 + 0.4 * lv)) : 1) * (this.slow > 0 ? 0.7 : 1) * (this.grass ? 0.9 : 1), acc = ACC * (1 + 0.9 * lv) * (this.slow > 0 ? 0.75 : 1);
    this.boost = Math.max(0, this.boost - dt); this.slow = Math.max(0, this.slow - dt);
    this.shield = Math.max(0, this.shield - dt); this.magnet = Math.max(0, this.magnet - dt);
    const oily = this.oil > 0 && !air; this.oil = Math.max(0, this.oil - dt); // olio: poca aderenza, frenata debole, sbandate
    let fx = Math.cos(this.h), fz = Math.sin(this.h), rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz;

    // sterzo morbido
    const tgt = input.steer, rate = Math.abs(tgt) > Math.abs(this.steer) ? 7 : 11;
    this.steer += clamp(tgt - this.steer, -rate * dt, rate * dt);

    // acceleratore / freno / retromarcia
    let a = 0;
    if (thr > 0) a += acc * thr * (1 - Math.max(0, vf) / vmax) + (vf < 0 ? BRAKE * thr : 0);
    if (brk > 0) a += (vf > 0.8 ? -BRAKE * brk : -REV_ACC * brk * (1 + Math.min(0, vf) / VREV)) * (oily ? 0.3 : 1);
    if (!thr && !brk && !air) a -= Math.sign(vf) * Math.min(Math.abs(vf) / dt, COAST);
    a -= this.drift * 2.5 * Math.sign(vf);
    this.vx += fx * a * dt; this.vz += fz * a * dt;

    // drift: curva stretta ad alta velocità, o frenata in curva
    const sAbs = Math.abs(this.steer), sp = Math.abs(vf);
    let dTgt = clamp((sp - 10) / 8, 0, 1) * (sAbs > 0.55 ? 1 : 0);
    if (brk > 0 && vf > 8 && sAbs > 0.2) dTgt = 1; // frenata in curva = drift
    this.drift += (dTgt - this.drift) * Math.min(1, (dTgt > this.drift ? 6 : 3) * dt);

    // imbardata: curvatura limitata dalla velocità, poi smorzata verso il target
    const dMax = lerp(0.62, 0.13, clamp(sp / 40, 0, 1));
    let wT = vf * Math.tan(this.steer * dMax) / WHEELBASE * (1 + 0.25 * this.drift) * (air ? (fly ? 0.9 : 0.25) : 1);
    // auto-allineamento: senza sterzo l'auto riprende da sola la direzione di marcia
    const vl0 = this.vx * rx + this.vz * rz;
    if (vf > 0.5 && !air && !oily) wT += 3 * (vl0 / (vf + 3)) * (1 - sAbs);
    if (oily) { this.oilPh += dt * 6.5; wT += Math.sin(this.oilPh) * 1.1 * clamp(sp / 22, 0, 1) + (this.steer * 0.4); this.drift = Math.max(this.drift, 0.85); }
    wT = clamp(wT, -2.8, 2.8); // a velocità enormi l'auto resta guidabile
    this.yaw += (wT - this.yaw) * Math.min(1, (oily ? 2.6 : 10) * dt);
    this.h += this.yaw * dt;

    // riproietta la velocità sul nuovo asse; la componente laterale decade (poco in drift), con slip massimo
    fx = Math.cos(this.h); fz = Math.sin(this.h); rx = -fz; rz = fx;
    vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * rx + this.vz * rz;
    if (!air) { vl *= Math.exp(-(oily ? 0.5 : lerp(GRIP, GRIP_DRIFT, this.drift)) * dt); const ms = (oily ? 1.5 : MAX_SLIP) * (Math.abs(vf) + 2); vl = clamp(vl, -ms, ms); }
    else if (fly) vl *= Math.exp(-2.2 * dt); // in volo i propulsori laterali fanno seguire la direzione del muso
    this.vx = fx * vf + rx * vl; this.vz = fz * vf + rz * vl;
    this.speed = vf; this.lat = vl;

    this.x += this.vx * dt; this.z += this.vz * dt;
    if (fly) { // propulsori: tenendo premuto sale (carburante 6 s, si ricarica a terra); rilasciando scende lentamente
      if (this.fuel <= 0.02) this.dry = true; else if (this.fuel >= FUEL_MAX - 0.02) this.dry = false; // a secco: serve la ricarica completa (20 s) prima di ripartire
      const want = !!input.thrust && this.fuel > 0.02 && !this.dry; this.thrusting = want;
      if (want) { this.fuel = Math.max(0, this.fuel - dt * (1 + clamp((this.y - 12) / 28, 0, 1))); // più sali, più consumi (fino al doppio a 40 m)
         if (!this.air) { this.vy = Math.max(this.vy, 3); this.y += 0.08; } this.vy = Math.min(this.vy + THRUST * dt, VUP); if (this.y > MAXALT) this.vy = Math.min(this.vy, 0); }
      else this.fuel = Math.min(FUEL_MAX, this.fuel + (FUEL_MAX / 30) * dt);
    } else this.thrusting = false;
    this.vertical(dt, ground, base);
    this.collide(dt, col, bounds, input);
  }

  // Quota: segue il terreno; se il terreno scende più in fretta della caduta libera, l'auto vola.
  vertical(dt, ground, base) {
    const Ge = G; // gravità piena anche col propulsore: se molli, cadi; bisogna dare colpetti di spinta
    const g = ground(this.x, this.z, this.y), yb = this.y + this.vy * dt - 0.5 * Ge * dt * dt;
    if (yb > g + 0.02) { // in volo
      if (!this.air) { this.air = true; this.airT = 0; this.x0 = this.x; this.z0 = this.z; if (this.onRamp && this.boost > 0) { const a = this.rampAssist(this.x, this.z, this.vx, this.vz); if (a) { this.vx = a.vx; this.vz = a.vz; this.vy = a.vy; this.superJump = true; } else { this.vy += 4 + 3 * this.level; this.vx += Math.cos(this.h) * 5 * this.level; this.vz += Math.sin(this.h) * 5 * this.level; } } // dalla rampa col NOS: super salto (verso un tetto) o spinta in più
      if (this.onRoof && this.boost > 0) { this.vy = Math.max(this.vy, 5 + 2 * this.level); this.vx += Math.cos(this.h) * 9 * this.level; this.vz += Math.sin(this.h) * 9 * this.level; } } // dal tetto col NOS: la propulsione spinge in alto e in avanti
      this.airT += dt; this.y = yb; this.vy -= Ge * dt; if (this.canFly && this.vy < -30) this.vy = -30;
    } else {
      const vyg = Math.max(-25, Math.min(25, (g - this.y) / dt));
      if (this.air) { // atterraggio
        if (g > base(this.x, this.z) + 0.5) { this.vx *= 0.45; this.vz *= 0.45; } // atterrando su un tetto si frena
        const impact = -this.vy; this.jump = this.airT > 0.35 ? Math.hypot(this.x - this.x0, this.z - this.z0) : 0; this.landed = impact;
        if (impact > 6) { const k = 1 - Math.min(0.18, (impact - 6) * 0.02); this.vx *= k; this.vz *= k; }
        this.air = false;
      }
      this.y = g; this.vy = vyg;
    }
    const b0 = base(this.x, this.z); this.onRamp = !this.air && this.rampH(this.x, this.z) > 0.6; this.onRoof = !this.air && g > b0 + 0.5; this.clear = this.y - b0;
  }

  collide(dt, col, bounds, input) {
    let hit = false;
    for (let it = 0; it < 3; it++) {
      const fx = Math.cos(this.h), fz = Math.sin(this.h);
      let any = false;
      for (const off of CIRCLES) {
        const p = col.push(this.x + fx * off, this.z + fz * off, RADIUS, this.clear);
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

  // NOS: 10 s di boost più uno scatto in avanti. Rallentamento: 10 s con velocità massima ridotta.
  // Onda d'urto: dentro il raggio R l'auto viene lanciata in aria e spinta via. Ritorna l'intensità 0..1.3 (0 = fuori portata).
  blast(ex, ez, R, power = 1) {
    if (this.shield > 0) return 0; // lo scudo assorbe le esplosioni
    const dx = this.x - ex, dz = this.z - ez, d = Math.hypot(dx, dz); if (d > R) return 0;
    const k = Math.pow(1 - d / R, 0.6) * power, nx = d > 1e-3 ? dx / d : Math.cos(this.h), nz = d > 1e-3 ? dz / d : Math.sin(this.h);
    this.vx += nx * 13 * k; this.vz += nz * 13 * k; this.vy = 7 + 7 * k; this.y += 0.3;
    if (!this.air) { this.air = true; this.airT = 0; this.x0 = this.x; this.z0 = this.z; }
    this.yaw += (Math.random() - 0.5) * 7 * k; return k;
  }

  // Calcio del gigante: lancia l'auto lontano nella direzione (dx,dz) e in alto. k = intensità 0..1.
  kick(dx, dz, k) {
    if (this.shield > 0) { this.vx = this.vx * 0.6 + dx * 9 * k; this.vz = this.vz * 0.6 + dz * 9 * k; return; } // lo scudo respinge il calcio
    this.vx = this.vx * 0.3 + dx * 44 * k; this.vz = this.vz * 0.3 + dz * 44 * k; this.vy = 14 + 7 * k; this.y += 0.3;
    if (!this.air) { this.air = true; this.airT = 0; this.x0 = this.x; this.z0 = this.z; }
    this.yaw += (Math.random() - 0.5) * 9 * k;
  }

  giveCharge() { if (this.charges >= 3) return false; this.charges++; return true; }
  // Attiva il NOS con tutte le cariche accumulate (livello = cariche). Ritorna il livello attivato, 0 se non possibile.
  activate() {
    if (this.boost > 0 || this.charges <= 0) return 0;
    this.level = this.charges; this.charges = 0; this.boost = BOOST_TIME;
    const fx = Math.cos(this.h), fz = Math.sin(this.h); this.vx += fx * 6 * this.level; this.vz += fz * 6 * this.level; return this.level;
  }
  hitSlow() { if (this.shield > 0) return; this.slow = SLOW_TIME; }
  // Molla: salto automatico (scavalca ostacoli e treno).
  spring() { this.vy = 13; this.y += 0.3; if (!this.air) { this.air = true; this.airT = 0; this.x0 = this.x; this.z0 = this.z; } }

  // Ritorna true se serve riposizionare (incastrata per >2 s).
  needsRescue() { return this.stuck > 2.0; }
}
