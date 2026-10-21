import * as THREE from '../lib/three.module.min.js';

// Effetti leggeri a pool fisso: fumo di drift (poche sprite) e segni sull'asfalto (anello di quad).
export class DriftFX {
  constructor(scene) {
    this.puffs = []; this.t = 0; this.pi = 0; this.mi = 0; this.marks = [];
    const pg = new THREE.CircleGeometry(1, 14);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0, depthWrite: false, fog: true }));
      m.visible = false; m.userData = { age: 9, life: 1, vy: 0 }; scene.add(m); this.puffs.push(m);
    }
    const mg = new THREE.PlaneGeometry(1.1, 0.22); mg.rotateX(-Math.PI / 2);
    const mm = new THREE.MeshBasicMaterial({ color: 0x151518, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let i = 0; i < 48; i++) { const m = new THREE.Mesh(mg, mm); m.visible = false; scene.add(m); this.marks.push(m); }
  }

  update(dt, car, camera) {
    const on = car.drift > 0.35 && Math.abs(car.speed) > 8;
    this.t -= dt;
    if (on && this.t <= 0) {
      this.t = 0.07;
      const fx = Math.cos(car.h), fz = Math.sin(car.h), rx = -fz, rz = fx;
      for (const side of [-1, 1]) {
        const x = car.x - fx * 1.4 + rx * side * 0.95, z = car.z - fz * 1.4 + rz * side * 0.95;
        const p = this.puffs[this.pi++ % this.puffs.length]; p.position.set(x, 0.5, z); p.visible = true; p.userData.age = 0; p.userData.life = 0.7;
        const k = this.marks[this.mi++ % this.marks.length]; k.position.set(x, 0.18, z); k.rotation.y = -Math.atan2(car.vz, car.vx); k.visible = true;
      }
    }
    for (const p of this.puffs) {
      const u = p.userData; if (u.age > u.life) { p.visible = false; continue; }
      u.age += dt; const f = u.age / u.life;
      p.scale.setScalar(0.45 + f * 1.2); p.position.y += dt * 0.8; p.material.opacity = 0.45 * (1 - f);
      p.quaternion.copy(camera.quaternion);
    }
  }
}
