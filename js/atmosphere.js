import * as THREE from '../lib/three.module.min.js';

// Atmosfera: cielo a gradiente, nebbia, luci, ombre proiettate dagli edifici, finestre accese e fari/lampioni di sera.
// Tre preset: giorno, tramonto, notte. Il terreno è unlit (Basic): si colora con `tint`.
const PRESETS = {
  giorno: { cloud: [1, 1, 1, 0.9], top: 0x4f8ad6, mid: 0xa6c8ec, hor: 0xd2e3ee, fog: 0xcfe0ea, hemi: [0xffffff, 0x8e8c86, 2.5], sun: [0xfff0d8, 1.5], az: 135, el: 52, shadow: 0.24, tint: [1, 1, 1], emissive: 0, lamp: 0 },
  tramonto: { cloud: [1, 0.66, 0.5, 0.85], top: 0x34478c, mid: 0xe9875a, hor: 0xffc890, fog: 0xf0b98c, hemi: [0xffd9b8, 0x6b5a6e, 1.9], sun: [0xff9c58, 1.8], az: 175, el: 13, shadow: 0.32, tint: [1, 0.8, 0.66], emissive: 0.35, lamp: 0.55 },
  notte: { cloud: [0.28, 0.33, 0.5, 0.5], top: 0x040813, mid: 0x0d1633, hor: 0x1b2748, fog: 0x121a31, hemi: [0x9db2e2, 0x2a2e44, 2.1], sun: [0x8fa4d8, 0.5], az: null, el: 40, shadow: 0, tint: [0.4, 0.45, 0.66], emissive: 0.85, lamp: 1 },
};
export const PRESET_NAMES = Object.keys(PRESETS);

function radial(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}

function cloudTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 48; const g = c.getContext('2d');
  for (const [x, y, r] of [[30, 30, 16], [52, 24, 20], [78, 26, 19], [98, 32, 14], [64, 34, 17]]) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  return new THREE.CanvasTexture(c);
}

export class Atmosphere {
  constructor({ scene, camera, world, hemi, sun, ground, taxi, fogNear, fogFar }) {
    Object.assign(this, { scene, camera, world, hemi, sun, ground, taxi, fogNear, fogFar }); this.name = null; this.t = 0;
    this.groundBase = ground.material.color.clone();
    this.skyGeo = new THREE.SphereGeometry(320, 20, 14); this.skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(this.skyGeo.attributes.position.count * 3), 3));
    this.sky = new THREE.Mesh(this.skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -10; this.sky.frustumCulled = false; scene.add(this.sky);
    // nuvole (sprite sulla cupola), sole/luna con alone, stelle di notte
    this.skyGrp = new THREE.Group(); scene.add(this.skyGrp); this.clouds = [];
    const ct = cloudTex();
    for (let i = 0; i < 16; i++) {
      const m = new THREE.SpriteMaterial({ map: ct, transparent: true, depthWrite: false, fog: false }), sp = new THREE.Sprite(m), a = i / 16 * Math.PI * 2 + Math.random() * 0.3, el = (8 + Math.random() * 24) * Math.PI / 180;
      sp.userData = { a, el, sz: 90 + Math.random() * 90 }; sp.scale.set(sp.userData.sz, sp.userData.sz * 0.36, 1); sp.renderOrder = -9; this.skyGrp.add(sp); this.clouds.push(sp);
    }
    this.sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(255,248,220,1)', 'rgba(255,200,120,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); this.sunSpr.renderOrder = -8; this.skyGrp.add(this.sunSpr);
    const sg = new THREE.BufferGeometry(), sa = new Float32Array(180 * 3); for (let i = 0; i < 180; i++) { const a = Math.random() * 6.28, e = (6 + Math.random() * 70) * Math.PI / 180; sa.set([Math.cos(a) * Math.cos(e) * 305, Math.sin(e) * 305, Math.sin(a) * Math.cos(e) * 305], i * 3); }
    sg.setAttribute('position', new THREE.BufferAttribute(sa, 3)); this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, depthWrite: false, transparent: true, opacity: 0.8 })); this.stars.renderOrder = -9; this.skyGrp.add(this.stars);
    // pozze di luce dei lampioni (una sola InstancedMesh) e fari dell'auto
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radial('rgba(255,200,120,0.9)', 'rgba(255,200,120,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), 40);
    pool.frustumCulled = false; pool.count = 0; pool.renderOrder = 3; scene.add(pool); this.pool = pool;
    const hl = new THREE.Mesh(new THREE.PlaneGeometry(20, 7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(255,245,210,0.5)'); gr.addColorStop(1, 'rgba(255,245,210,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, 22); g.lineTo(128, 0); g.lineTo(128, 64); g.lineTo(0, 42); g.closePath(); g.fill(); return new THREE.CanvasTexture(c); })(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    hl.position.set(12.4, 0.22, 0); hl.visible = false; hl.renderOrder = 3; taxi.outer.add(hl); this.headlights = hl;
  }

  set(name) {
    const P = PRESETS[name] || PRESETS.giorno; this.name = PRESETS[name] ? name : 'giorno'; this.P = P;
    const col = this.skyGeo.attributes.color, pos = this.skyGeo.attributes.position, hor = new THREE.Color(P.hor), mid = new THREE.Color(P.mid), top = new THREE.Color(P.top), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const t = Math.max(0, pos.getY(i) / 320); if (t < 0.25) c.copy(hor).lerp(mid, t / 0.25); else c.copy(mid).lerp(top, Math.min(1, (t - 0.25) / 0.6)); col.setXYZ(i, c.r, c.g, c.b); }
    col.needsUpdate = true;
    this.scene.background = new THREE.Color(P.fog); this.scene.fog.color.set(P.fog);
    this.hemi.color.set(P.hemi[0]); this.hemi.groundColor.set(P.hemi[1]); this.hemi.intensity = P.hemi[2];
    this.sun.color.set(P.sun[0]); this.sun.intensity = P.sun[1];
    const az = (P.az == null ? 135 : P.az) * Math.PI / 180, el = P.el * Math.PI / 180; this.sun.position.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const tint = new THREE.Color(...P.tint);
    this.ground.material.color.copy(this.groundBase).multiply(tint); this.world.matGround.color.copy(tint); this.world.matPlaza.color.copy(tint);
    for (const d of this.decals || []) d.material.color.setRGB(tint.r, tint.g, tint.b); // decalcomanie sul terreno (es. ovale di Piazza Maggiore)
    this.world.matBuilding.emissiveIntensity = P.emissive; this.world.matArcade.emissiveIntensity = 0;
    this.world.setSun(P.az, P.el, P.shadow);
    // nuvole/sole/stelle secondo il preset
    const cc = P.cloud || [1, 1, 1, 0.9], sd = this.sun.position.clone().normalize().multiplyScalar(300);
    for (const c of this.clouds) { c.material.color.setRGB(cc[0], cc[1], cc[2]); c.material.opacity = cc[3]; }
    this.sunSpr.position.copy(sd); const ss = name === 'notte' ? 46 : name === 'tramonto' ? 150 : 110; this.sunSpr.scale.set(ss, ss, 1);
    this.sunSpr.material.color.set(name === 'notte' ? 0xbfd0ff : name === 'tramonto' ? 0xffa060 : 0xfff2c8); this.stars.visible = name === 'notte';
    this.headlights.visible = P.lamp > 0; this.pool.material.opacity = P.lamp; this.pool.visible = P.lamp > 0; this.t = 0;
  }

  update(dt, car) {
    this.sky.position.copy(this.camera.position); this.skyGrp.position.copy(this.camera.position);
    for (const c of this.clouds) { const u = c.userData; u.a += dt * 0.004; c.position.set(Math.cos(u.a) * Math.cos(u.el) * 295, Math.sin(u.el) * 295, Math.sin(u.a) * Math.cos(u.el) * 295); }
    if (!this.P || this.P.lamp <= 0) return;
    this.t -= dt; if (this.t > 0) return; this.t = 0.5;
    const near = [];
    for (const [key] of this.world.cells) { const l = this.world.cL.get(key); if (l) for (let i = 0; i < l.length; i += 2) { const d = Math.hypot(l[i] - car.x, l[i + 1] - car.z); if (d < 150) near.push([d, l[i], l[i + 1]]); } }
    near.sort((a, b) => a[0] - b[0]); const m = new THREE.Matrix4(), sc = new THREE.Vector3(9, 1, 9), q = new THREE.Quaternion(), pos = new THREE.Vector3(), n = Math.min(near.length, 40);
    for (let i = 0; i < n; i++) { pos.set(near[i][1], 0.21, near[i][2]); m.compose(pos, q, sc); this.pool.setMatrixAt(i, m); }
    this.pool.count = n; this.pool.instanceMatrix.needsUpdate = true;
  }
}
