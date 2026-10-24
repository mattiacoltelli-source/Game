import * as THREE from '../lib/three.module.min.js';

// Eventi casuali sulla strada davanti a te: camion in panne, incidente, corteo di pedoni. Uno alla volta, ogni 30-45 s, ~30 s di durata.
const rnd = (a, b) => a + Math.random() * (b - a);
const WHITE = new THREE.Color(1, 1, 1);

export class RandomEvents {
  constructor(scene, world, roadIndex, traffic, peds, ctx) {
    this.ri = roadIndex; this.traffic = traffic; this.peds = peds; this.ctx = ctx; this.world = world;
    // coni (statici) e lampeggianti arancioni (accesi/spenti)
    this.cones = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 0.8, 8).translate(0, 0.4, 0), new THREE.MeshLambertMaterial({ color: 0xff6a1a }), 24); this.cones.frustumCulled = false; this.cones.count = 0; scene.add(this.cones);
    this.lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.22, 0.35), new THREE.MeshBasicMaterial({ color: 0xffa21a, fog: false }), 16); this.lights.frustumCulled = false; this.lights.count = 0; scene.add(this.lights);
    this.m = new THREE.Matrix4(); this.pos = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.sc = new THREE.Vector3();
    this.reset();
  }

  reset() { this.cool = 22; this.ev = null; this.cones.count = 0; this.lights.count = 0; this.t = 0; }

  points() { return this.ev ? [{ x: this.ev.x, z: this.ev.z, y: 2, k: 'event', r: 210 }] : []; }

  // Strada percorribile davanti al giocatore, 110-180 m, larga almeno 7 m: ritorna {r, i, x, z, ux, uz}.
  spot(player) {
    let pick = null, n = 0; const hx = Math.cos(player.h), hz = Math.sin(player.h);
    this.ri.segmentsNear(player.x, player.z, 190, (r, i) => {
      if (!this.traffic.g.ok.has(r) || r.w < 7 || this.world.groundY && 0) return; const p = r.p, mx = (p[i * 2] + p[i * 2 + 2]) / 2, mz = (p[i * 2 + 1] + p[i * 2 + 3]) / 2, dx = mx - player.x, dz = mz - player.z, d = Math.hypot(dx, dz), L = Math.hypot(p[i * 2 + 2] - p[i * 2], p[i * 2 + 3] - p[i * 2 + 1]);
      if (d < 110 || d > 180 || L < 24 || (dx * hx + dz * hz) / d < 0.75 || this.world.groundY(mx, mz) > 0.2) return; if (++n * Math.random() < 1) pick = [r, i, mx, mz, (p[i * 2 + 2] - p[i * 2]) / L, (p[i * 2 + 3] - p[i * 2 + 1]) / L, L];
    });
    return pick && { r: pick[0], i: pick[1], x: pick[2], z: pick[3], ux: pick[4], uz: pick[5], L: pick[6] };
  }

  fixedCar(type, x, z, h, ttl) { const c = { type, x, z, h, offx: 0, offz: 0, spd: 0, fixed: true, ttl, col: WHITE.clone(), cool: 0, sx: 0, sz: 0, cruise: 0 }; if (type === 'car' || type === 'hatch') c.col.setHex([0xb23a3a, 0x3d5a8a, 0xcdb98a][Math.floor(Math.random() * 3)]); this.traffic.cars.push(c); return c; }

  start(player) {
    const sp = this.spot(player); if (!sp) return false;
    const nx = -sp.uz, nz = sp.ux, ttl = 32, kind = ['camion', 'incidente', 'corteo'][Math.floor(Math.random() * 3)], cars = [], cones = [];
    if (kind === 'camion') { cars.push(this.fixedCar('truck', sp.x + nx * 2.1, sp.z + nz * 2.1, Math.atan2(sp.uz, sp.ux) + 0.08, ttl)); cones.push([sp.x - sp.ux * 9 + nx * 1.2, sp.z - sp.uz * 9 + nz * 1.2], [sp.x - sp.ux * 12 + nx * 0.2, sp.z - sp.uz * 12 + nz * 0.2], [sp.x - sp.ux * 15 + nx * 1.6, sp.z - sp.uz * 15 + nz * 1.6]); this.ctx.toast('Camion in panne davanti'); }
    else if (kind === 'incidente') { cars.push(this.fixedCar('car', sp.x + nx * 1.3, sp.z + nz * 1.3, Math.atan2(sp.uz, sp.ux) + 0.9, ttl), this.fixedCar('hatch', sp.x + sp.ux * 5.5 - nx * 0.8, sp.z + sp.uz * 5.5 - nz * 0.8, Math.atan2(sp.uz, sp.ux) - 0.5, ttl)); for (let k = 0; k < 4; k++) cones.push([sp.x - sp.ux * (8 + k * 2.5) + nx * (1.5 - k * 0.5), sp.z - sp.uz * (8 + k * 2.5) + nz * (1.5 - k * 0.5)]); this.ctx.toast('Incidente davanti'); }
    else { const seg = Math.max(2, sp.L * 0.15); this.crowd = this.peds.crowd(sp.r, sp.i, 14, seg); this.ctx.toast('Corteo di pedoni davanti'); }
    this.ev = { kind, x: sp.x, z: sp.z, t: 0, ttl, cars, cones, sx: sp.x, sz: sp.z, smoke: 0 }; this.cool = rnd(30, 45); return true;
  }

  update(dt, player, runT) {
    this.t += dt; const e = this.ev;
    if (!e) { this.cool -= dt; if (runT > 18 && this.cool <= 0 && !this.hold) this.start(player); this.draw(0); return; }
    e.t += dt; const dp = Math.hypot(e.x - player.x, e.z - player.z);
    if (e.t > e.ttl || dp > 420) { if (this.crowd) { for (const p of this.crowd) { p.parade = false; p.lat = null; } this.crowd = null; } this.ev = null; this.cones.count = 0; this.lights.count = 0; return; }
    if (e.kind === 'incidente') { e.smoke -= dt; if (e.smoke <= 0 && dp < 160) { e.smoke = 0.25; for (const c of e.cars) this.ctx.smoke && this.ctx.smoke(c.x, c.z, 1, 'dark'); } }
    this.draw(e.t);
  }

  draw(t) {
    const e = this.ev, m = this.m; if (!e) { this.cones.count = 0; this.lights.count = 0; return; }
    e.cones.forEach((c, i) => { this.pos.set(c[0], 0.18, c[1]); m.compose(this.pos, this.q.identity(), this.sc.set(1, 1, 1)); this.cones.setMatrixAt(i, m); }); this.cones.count = e.cones.length; this.cones.instanceMatrix.needsUpdate = true;
    // lampeggianti: quattro angoli di ogni veicolo, alternati ogni 0,5 s
    let n = 0; const on = Math.floor(t * 2) % 2;
    for (const c of e.cars) { const ch = Math.cos(c.h), sh = Math.sin(c.h), L = c.type === 'truck' ? 3.4 : 1.9; for (const [lx, lz] of [[L, 0.9], [L, -0.9], [-L, 0.9], [-L, -0.9]]) { const s = (lz > 0) === (on === 1) ? 1 : 0; this.pos.set(c.x + c.offx + lx * ch - lz * sh, c.type === 'truck' ? 2.9 : 1.3, c.z + c.offz + lx * sh + lz * ch); m.compose(this.pos, this.q.identity(), this.sc.set(s, s, s)); this.lights.setMatrixAt(n++, m); } }
    this.lights.count = n; this.lights.instanceMatrix.needsUpdate = true;
  }
}
