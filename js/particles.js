import * as THREE from '../lib/three.module.min.js';
import { NOS_COLORS } from './nos.js';

// Particelle a pool fisso (2 InstancedMesh, 2 draw call): fumo/polvere (blend normale) e scintille/scia NOS (additivo).
const N_SOFT = 96, N_ADD = 160;
function disc() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
}
const rnd = (a, b) => a + Math.random() * (b - a);

class Pool {
  constructor(scene, n, additive, tex, op) {
    this.n = n; this.p = Array.from({ length: n }, () => ({ life: 0, age: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, g: 0, grow: 0, r: 1, gg: 1, b: 1 })); this.i = 0;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !additive }), n);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; this.mesh.count = 0; scene.add(this.mesh);
    this.m = new THREE.Matrix4(); this.sc = new THREE.Vector3(); this.pos = new THREE.Vector3(); this.add = additive; this.fog = new THREE.Color();
  }
  emit(x, y, z, vx, vy, vz, life, s, grow, g, r, gg, b) { const p = this.p[this.i++ % this.n]; Object.assign(p, { x, y, z, vx, vy, vz, life, age: 0, s, grow, g, r, gg, b }); }
  update(dt, camera, fogColor) {
    let k = 0;
    for (const p of this.p) {
      if (p.age >= p.life) continue; p.age += dt; if (p.age >= p.life) continue;
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y = Math.max(0.05, p.y + p.vy * dt); p.z += p.vz * dt; const f = p.age / p.life, s = (p.s + p.grow * f) * (this.add ? 1 - f * 0.6 : 1);
      this.pos.set(p.x, p.y, p.z); this.sc.set(s, s, s); this.m.compose(this.pos, camera.quaternion, this.sc); this.mesh.setMatrixAt(k, this.m);
      const a = this.add ? 1 - f : 0; // additivo: sfuma a nero; normale: sfuma verso il colore della nebbia
      if (this.add) this.mesh.instanceColor.setXYZ(k, p.r * a, p.gg * a, p.b * a); else this.mesh.instanceColor.setXYZ(k, p.r + (fogColor.r - p.r) * f, p.gg + (fogColor.g - p.gg) * f, p.b + (fogColor.b - p.b) * f);
      k++;
    }
    this.mesh.count = k; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Particles {
  constructor(scene) {
    const t = disc(); this.soft = new Pool(scene, N_SOFT, false, t, 0.5); this.add = new Pool(scene, N_ADD, true, t, 1); this.scene = scene; this.was = false; this.tN = 0; this.tS = 0;
  }
  burst(x, z, n, power, col = [0.78, 0.7, 0.55]) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = rnd(0.5, 1) * power; this.soft.emit(x, 0.4, z, Math.cos(a) * s, rnd(0.4, 2.2), Math.sin(a) * s, rnd(0.6, 1.1), rnd(0.8, 1.5), rnd(1.5, 3), 0, col[0], col[1], col[2]); } }
  steam(x, z, n = 3, kind = 'white') { const c = kind === 'dark' ? [0.22, 0.22, 0.24] : [0.95, 0.97, 1]; for (let i = 0; i < n; i++) this.soft.emit(x + rnd(-1, 1), kind === 'dark' ? 1.2 : 0.6, z + rnd(-1, 1), rnd(-0.6, 0.6), rnd(1.6, 3.4), rnd(-0.6, 0.6), rnd(1.0, 1.7), rnd(0.9, 1.4), 2.6, 0, c[0], c[1], c[2]); }
  sparks(x, y, z, n, dx = 0, dz = 0) { for (let i = 0; i < n; i++) this.add.emit(x, y, z, dx + rnd(-4, 4), rnd(1, 5), dz + rnd(-4, 4), rnd(0.25, 0.5), rnd(0.18, 0.3), 0, 14, 1, rnd(0.6, 0.9), 0.25); }
  update(dt, car, camera, fogColor) {
    const fx = Math.cos(car.h), fz = Math.sin(car.h), sp = Math.hypot(car.vx, car.vz);
    // atterraggio: nuvola di polvere proporzionale all'impatto
    if (this.was && !car.air && car.landed > 5) this.burst(car.x, car.z, Math.min(14, 4 + Math.round(car.landed)), 4 + car.landed * 0.3);
    this.was = car.air;
    // strisciata sul muro: scintille
    this.tS -= dt; if (car.contact > 0.3 && sp > 6 && !car.air && this.tS <= 0) { this.tS = 0.04; const side = Math.random() < 0.5 ? 1 : -1; this.sparks(car.x + fx * rnd(-1.5, 1.5) - fz * side * 0.9, 0.5, car.z + fz * rnd(-1.5, 1.5) + fx * side * 0.9, 3, car.vx * 0.2, car.vz * 0.2); }
    // scia del NOS: particelle del colore del livello
    if (car.boost > 0) { this.tN -= dt; if (this.tN <= 0) { this.tN = 0.025; const c = new THREE.Color(NOS_COLORS[Math.max(0, car.level - 1)]); for (const z of [-0.55, 0.55]) this.add.emit(car.x - fx * 2.4 - fz * z, 0.6 + car.y, car.z - fz * 2.4 + fx * z, -fx * 5 + rnd(-1, 1) + car.vx * 0.6, rnd(-0.2, 1), -fz * 5 + rnd(-1, 1) + car.vz * 0.6, rnd(0.35, 0.6), 0.5 + 0.12 * car.level, 0.3, 0, c.r, c.g, c.b); } }
    // estintore: schiuma/fumo bianco dalle due fiancate e dal retro per ~1,4 s
    if (car.foamT > 0) for (let k = 0; k < 3; k++) { const side = k % 2 ? 1 : -1, a = rnd(0.5, 1.1);
      this.soft.emit(car.x - fz * side * 1.0 + fx * rnd(-1.2, 1.2), 0.7 + car.y, car.z + fx * side * 1.0 + fz * rnd(-1.2, 1.2), -fz * side * rnd(3, 7) + car.vx * 0.4, rnd(0.8, 2.2), fx * side * rnd(3, 7) + car.vz * 0.4, rnd(0.8, 1.3), rnd(0.7, 1.1), a * 1.4, 0, 0.97, 0.98, 1); }
    // prato: ciuffi d'erba e terra dalle ruote
    if (car.grass && sp > 6 && Math.random() < 0.5) this.soft.emit(car.x - fx * 1.2 + rnd(-0.9, 0.9), 0.3 + car.y, car.z - fz * 1.2 + rnd(-0.9, 0.9), rnd(-1.5, 1.5), rnd(1, 2.5), rnd(-1.5, 1.5), rnd(0.4, 0.7), rnd(0.35, 0.6), 0.6, 0, 0.42, 0.55, 0.25);
    // olio: gocce scure vicino alle ruote quando si sbanda
    if (car.oil > 0 && !car.air && Math.random() < 0.3) this.add.emit(car.x - fx * 1.2 + rnd(-1, 1), 0.3, car.z - fz * 1.2 + rnd(-1, 1), rnd(-2, 2), rnd(1, 3), rnd(-2, 2), 0.45, 0.22, 0, 12, 0.35, 0.2, 0.5);
    this.soft.update(dt, camera, fogColor); this.add.update(dt, camera, fogColor);
  }
}
