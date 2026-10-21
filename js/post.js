import * as THREE from '../lib/three.module.min.js';

// Bloom leggero: scena (MSAA) -> luci intense a 1/4 di risoluzione -> sfocatura separabile -> somma a schermo.
// Costa 4 passaggi a schermo intero/ridotto: si può spegnere (opzione "Effetti grafici") e si spegne da solo se gli fps crollano.
const VS = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const mat = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });

export class Post {
  constructor(renderer) {
    this.r = renderer; this.on = true; this.strength = 0.55;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(g, null); this.quad.frustumCulled = false; this.cam = new THREE.Camera(); this.sc = new THREE.Scene(); this.sc.add(this.quad);
    const opt = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.rtS = new THREE.WebGLRenderTarget(4, 4, { ...opt, depthBuffer: true, samples: 4 }); this.rtA = new THREE.WebGLRenderTarget(4, 4, opt); this.rtB = new THREE.WebGLRenderTarget(4, 4, opt);
    this.mBright = mat('uniform sampler2D t; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb; float l = max(c.r, max(c.g, c.b)); float k = clamp((l - 0.82) / 0.18, 0.0, 1.0); gl_FragColor = vec4(c * k * k, 1.0); }', { t: { value: null } });
    this.mBlur = mat('uniform sampler2D t; uniform vec2 d; varying vec2 vUv; void main(){ vec3 s = texture2D(t, vUv).rgb * 0.227; s += (texture2D(t, vUv + d * 1.385).rgb + texture2D(t, vUv - d * 1.385).rgb) * 0.316; s += (texture2D(t, vUv + d * 3.231).rgb + texture2D(t, vUv - d * 3.231).rgb) * 0.070; gl_FragColor = vec4(s, 1.0); }', { t: { value: null }, d: { value: new THREE.Vector2() } });
    this.mComp = mat('uniform sampler2D t; uniform sampler2D b; uniform float k; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(t, vUv).rgb + texture2D(b, vUv).rgb * k, 1.0); }', { t: { value: null }, b: { value: null }, k: { value: 0.55 } });
  }
  setSize() {
    const s = this.r.getDrawingBufferSize(new THREE.Vector2()), w = Math.max(2, s.x | 0), h = Math.max(2, s.y | 0), q = Math.max(2, Math.round(w / 4)), qh = Math.max(2, Math.round(h / 4));
    this.rtS.setSize(w, h); this.rtA.setSize(q, qh); this.rtB.setSize(q, qh); this.q = [q, qh];
  }
  pass(m, target) { this.quad.material = m; this.r.setRenderTarget(target); this.r.render(this.sc, this.cam); }
  render(scene, camera) {
    if (!this.on) { this.r.setRenderTarget(null); this.r.render(scene, camera); return; }
    this.r.setRenderTarget(this.rtS); this.r.render(scene, camera);
    this.mBright.uniforms.t.value = this.rtS.texture; this.pass(this.mBright, this.rtA);
    const [q, qh] = this.q;
    this.mBlur.uniforms.t.value = this.rtA.texture; this.mBlur.uniforms.d.value.set(1 / q, 0); this.pass(this.mBlur, this.rtB);
    this.mBlur.uniforms.t.value = this.rtB.texture; this.mBlur.uniforms.d.value.set(0, 1 / qh); this.pass(this.mBlur, this.rtA);
    this.mBlur.uniforms.t.value = this.rtA.texture; this.mBlur.uniforms.d.value.set(1.5 / q, 0); this.pass(this.mBlur, this.rtB);
    this.mBlur.uniforms.t.value = this.rtB.texture; this.mBlur.uniforms.d.value.set(0, 1.5 / qh); this.pass(this.mBlur, this.rtA);
    this.mComp.uniforms.t.value = this.rtS.texture; this.mComp.uniforms.b.value = this.rtA.texture; this.mComp.uniforms.k.value = this.strength; this.pass(this.mComp, null);
  }
}
