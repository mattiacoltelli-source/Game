import * as THREE from '../lib/three.module.min.js';
import { mergeBoxes } from './geom.js';

function signTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 40; const g = c.getContext('2d');
  g.fillStyle = '#ffd23a'; g.fillRect(0, 0, 128, 40); g.fillStyle = '#1a1a1a'; g.font = '800 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TAXI', 64, 22);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 2; return t;
}

// Taxi low-poly (guarda verso +x). Gruppo esterno = posizione/imbardata, interno = rollio/beccheggio.
// Mesh: scocca (colori per vertice), luci (unlit, i fanali posteriori si accendono in frenata), 2 ruote anteriori che sterzano, cartello TAXI.
export function buildTaxi() {
  const W = [0.95, 0.94, 0.9], W2 = [0.82, 0.82, 0.8], D = [0.12, 0.17, 0.21], G = [0.3, 0.44, 0.55], B = [0.07, 0.07, 0.08], K = [0.4, 0.4, 0.42], C = [0.75, 0.76, 0.8], Y = [1.2, 0.95, 0.15];
  const body = [
    { x: 0, y: 0.62, z: 0, sx: 4.3, sy: 0.55, sz: 1.85, c: W },       // scocca
    { x: -1.75, y: 0.95, z: 0, sx: 0.8, sy: 0.14, sz: 1.75, c: W },   // baule
    { x: -0.2, y: 1.62, z: 0, sx: 1.8, sy: 0.09, sz: 1.62, c: W },    // tetto
    // montanti A/B/C e interno (sedili, cruscotto, volante, guidatore e passeggero): visibili attraverso i vetri trasparenti
    ...[[0.82, 0.8], [0.82, -0.8], [-1.2, 0.8], [-1.2, -0.8], [-0.2, 0.84], [-0.2, -0.84]].map(([x, z]) => ({ x, y: 1.3, z, sx: 0.1, sy: 0.6, sz: 0.1, c: W2 })),
    { x: 0.62, y: 0.98, z: 0, sx: 0.5, sy: 0.3, sz: 1.5, c: [0.14, 0.14, 0.16] }, { x: 0.5, y: 1.18, z: 0.4, sx: 0.04, sy: 0.3, sz: 0.3, c: [0.1, 0.1, 0.12] }, // cruscotto e volante
    { x: -0.15, y: 0.88, z: 0.4, sx: 0.5, sy: 0.12, sz: 0.5, c: [0.62, 0.55, 0.42] }, { x: -0.3, y: 1.15, z: 0.4, sx: 0.14, sy: 0.55, sz: 0.5, c: [0.62, 0.55, 0.42] }, { x: -0.15, y: 0.88, z: -0.4, sx: 0.5, sy: 0.12, sz: 0.5, c: [0.62, 0.55, 0.42] }, { x: -0.3, y: 1.15, z: -0.4, sx: 0.14, sy: 0.55, sz: 0.5, c: [0.62, 0.55, 0.42] }, // sedili anteriori
    { x: -1.0, y: 0.88, z: 0, sx: 0.5, sy: 0.12, sz: 1.5, c: [0.62, 0.55, 0.42] }, { x: -1.12, y: 1.12, z: 0, sx: 0.14, sy: 0.55, sz: 1.5, c: [0.62, 0.55, 0.42] }, // divano posteriore
    { x: -0.3, y: 1.52, z: 0.4, sx: 0.28, sy: 0.3, sz: 0.3, c: [0.78, 0.6, 0.48] }, { x: -0.3, y: 1.74, z: 0.4, sx: 0.32, sy: 0.14, sz: 0.34, c: [0.14, 0.12, 0.12] }, // guidatore (testa e berretto)
    { x: -0.2, y: 1.3, z: 0.88, sx: 0.07, sy: 0.55, sz: 0.04, c: W2 }, { x: -0.2, y: 1.3, z: -0.88, sx: 0.07, sy: 0.55, sz: 0.04, c: W2 }, // montante centrale
    { x: 0.35, y: 0.66, z: 0.94, sx: 0.04, sy: 0.5, sz: 0.04, c: W2 }, { x: 0.35, y: 0.66, z: -0.94, sx: 0.04, sy: 0.5, sz: 0.04, c: W2 }, // fughe porte
    { x: -0.95, y: 0.66, z: 0.94, sx: 0.04, sy: 0.5, sz: 0.04, c: W2 }, { x: -0.95, y: 0.66, z: -0.94, sx: 0.04, sy: 0.5, sz: 0.04, c: W2 },
    { x: 0.55, y: 0.8, z: 0.95, sx: 0.2, sy: 0.04, sz: 0.05, c: K }, { x: 0.55, y: 0.8, z: -0.95, sx: 0.2, sy: 0.04, sz: 0.05, c: K }, // maniglie
    { x: 0.8, y: 1.0, z: 1.0, sx: 0.28, sy: 0.14, sz: 0.2, c: B }, { x: 0.8, y: 1.0, z: -1.0, sx: 0.28, sy: 0.14, sz: 0.2, c: B }, // specchietti
    { x: 0, y: 0.3, z: 0, sx: 4.32, sy: 0.18, sz: 1.87, c: B },       // sottoscocca
    { x: 2.2, y: 0.38, z: 0, sx: 0.16, sy: 0.22, sz: 1.9, c: K }, { x: -2.2, y: 0.38, z: 0, sx: 0.16, sy: 0.22, sz: 1.9, c: K }, // paraurti
    { x: 2.17, y: 0.66, z: 0, sx: 0.06, sy: 0.22, sz: 0.7, c: B },    // calandra
    { x: -2.17, y: 0.55, z: 0, sx: 0.04, sy: 0.14, sz: 0.5, c: C },   // targa
    { x: -1.4, y: 0.42, z: 0.98, sx: 0.9, sy: 0.14, sz: 0.06, c: B }, { x: -1.4, y: 0.42, z: -0.98, sx: 0.9, sy: 0.14, sz: 0.06, c: B }, // passaruota posteriori
    // ruote posteriori
    ...[0.96, -0.96].flatMap((z) => [{ x: -1.4, y: 0.36, z, sx: 0.74, sy: 0.74, sz: 0.3, c: B }, { x: -1.4, y: 0.36, z: z * 1.05, sx: 0.34, sy: 0.34, sz: 0.32, c: C }]),
  ];
  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true }), bodyMesh = new THREE.Mesh(mergeBoxes(body), bodyMat);
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x4a6b82, transparent: true, opacity: 0.42, depthWrite: false }), GL = [1, 1, 1];
  const glassMesh = new THREE.Mesh(mergeBoxes([{ x: 0.82, y: 1.32, z: 0, sx: 0.1, sy: 0.56, sz: 1.5, c: GL }, { x: -1.2, y: 1.32, z: 0, sx: 0.1, sy: 0.52, sz: 1.5, c: GL }, { x: -0.2, y: 1.3, z: 0.86, sx: 1.9, sy: 0.5, sz: 0.04, c: GL }, { x: -0.2, y: 1.3, z: -0.86, sx: 1.9, sy: 0.5, sz: 0.04, c: GL }]), glassMat); glassMesh.renderOrder = 1;
  const front = new THREE.Group(), frontMat = new THREE.MeshLambertMaterial({ vertexColors: true }); // cofano + paraurti anteriore + calandra: si deformano con i danni
  const hood = new THREE.Mesh(mergeBoxes([{ x: 0.2, y: 0, z: 0, sx: 1.2, sy: 0.14, sz: 1.75, c: W }]), frontMat); hood.position.set(1.35, 0.95, 0);
  const bump = new THREE.Mesh(mergeBoxes([{ x: 0, y: 0, z: 0, sx: 0.16, sy: 0.22, sz: 1.9, c: K }, { x: -0.03, y: 0.28, z: 0, sx: 0.06, sy: 0.22, sz: 0.7, c: B }]), frontMat); bump.position.set(2.2, 0.38, 0);
  front.add(hood, bump);
  // luci (unlit)
  const HL = [1.8, 1.7, 1.3], TL = [0.9, 0.08, 0.06];
  const lights = [
    { x: 2.18, y: 0.78, z: 0.62, sx: 0.08, sy: 0.18, sz: 0.4, c: HL }, { x: 2.18, y: 0.78, z: -0.62, sx: 0.08, sy: 0.18, sz: 0.4, c: HL },
    { x: -2.18, y: 0.78, z: 0.66, sx: 0.08, sy: 0.18, sz: 0.4, c: [1, 1, 1] }, { x: -2.18, y: 0.78, z: -0.66, sx: 0.08, sy: 0.18, sz: 0.4, c: [1, 1, 1] }, // fanali (colore moltiplicato dal materiale)
  ];
  const lg = mergeBoxes(lights.slice(0, 2)), tg = mergeBoxes(lights.slice(2));
  const headMesh = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ vertexColors: true }));
  const tailMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(0.55, 0.05, 0.04) });
  const tailMesh = new THREE.Mesh(tg, tailMat);
  // ruote anteriori (sterzano)
  const wheel = (z) => new THREE.Mesh(mergeBoxes([{ x: 0, y: 0, z: 0, sx: 0.74, sy: 0.74, sz: 0.3, c: B }, { x: 0, y: 0, z: z * 0.05, sx: 0.34, sy: 0.34, sz: 0.32, c: C }]), new THREE.MeshLambertMaterial({ vertexColors: true }));
  const wl = wheel(1), wr = wheel(-1); wl.position.set(1.4, 0.36, 0.96); wr.position.set(1.4, 0.36, -0.96);
  // arco del passaruota anteriore (nel corpo) e cartello TAXI luminoso
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.9), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
  sign.position.set(-0.2, 1.8, 0);
  const tex = signTexture(), face = new THREE.MeshBasicMaterial({ map: tex });
  for (const s of [1, -1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.24), face); f.position.set(-0.2, 1.8, 0.47 * s); if (s < 0) f.rotation.y = Math.PI; sign.add(f); f.position.set(0, 0, 0.455 * s); }
  const outer = new THREE.Group(), inner = new THREE.Group(); outer.add(inner); inner.add(bodyMesh, glassMesh, front, headMesh, tailMesh, wl, wr, sign);
  // ombra morbida fissa sotto l'auto
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  blob.position.y = -0.16; blob.renderOrder = 2; outer.add(blob);
  // sterzo delle ruote anteriori, fanali posteriori accesi in frenata
  const update = (steer, braking, air) => { wl.rotation.y = wr.rotation.y = -steer * 0.45; tailMat.color.setRGB(braking ? 1.6 : 0.55, braking ? 0.16 : 0.05, braking ? 0.12 : 0.04); blob.visible = !air; };
  // propulsori (modalità taxi volante): 4 ugelli sotto le ruote e fiamme blu-bianche rivolte verso il basso
  const thr = new THREE.Group(), noz = mergeBoxes([[1.4, 0.96], [1.4, -0.96], [-1.4, 0.96], [-1.4, -0.96]].map(([x, z]) => ({ x, y: 0.12, z, sx: 0.5, sy: 0.22, sz: 0.4, c: [0.2, 0.22, 0.28] }))), flames = [];
  thr.add(new THREE.Mesh(noz, new THREE.MeshLambertMaterial({ vertexColors: true })));
  const fg = new THREE.ConeGeometry(0.34, 2.4, 8).rotateX(Math.PI).translate(0, -1.2, 0), fo = new THREE.MeshBasicMaterial({ color: 0x66c8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), fi = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const [x, z] of [[1.4, 0.96], [1.4, -0.96], [-1.4, 0.96], [-1.4, -0.96]]) for (const [m, s] of [[fo, 1], [fi, 0.5]]) { const f = new THREE.Mesh(fg, m); f.position.set(x, 0.05, z); f.scale.set(s, s, s); f.visible = false; thr.add(f); flames.push([f, s]); }
  // getti direzionali (in volo): dietro se acceleri, davanti se freni, ai lati se sterzi: la fiamma esce dal lato opposto alla spinta
  const jg = new THREE.ConeGeometry(0.22, 1.7, 8).rotateZ(-Math.PI / 2).translate(0.85, 0, 0), jets = {};
  const mkJet = (name, x, y, z, ry) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; for (const [m, s] of [[fo, 1], [fi, 0.5]]) { const f = new THREE.Mesh(jg, m); f.scale.set(s, s, s); g.add(f); } g.visible = false; thr.add(g); jets[name] = g; };
  mkJet('back', -2.2, 0.62, 0.55, Math.PI); mkJet('back2', -2.2, 0.62, -0.55, Math.PI); mkJet('front', 2.2, 0.55, 0.55, 0); mkJet('front2', 2.2, 0.55, -0.55, 0);
  mkJet('left', 0.4, 0.75, -1.0, -Math.PI / 2); mkJet('left2', -0.9, 0.75, -1.0, -Math.PI / 2); mkJet('right', 0.4, 0.75, 1.0, Math.PI / 2); mkJet('right2', -0.9, 0.75, 1.0, Math.PI / 2);
  thr.visible = false; inner.add(thr);
  const setJets = (air, gas, brake, steer, t) => { // getti direzionali: solo in volo
    const on = { back: air && gas > 0, front: air && brake > 0, left: air && steer > 0.15, right: air && steer < -0.15 }, fl = 0.8 + 0.3 * Math.sin(t * 50);
    for (const k of ['back', 'front', 'left', 'right']) for (const n of [k, k + '2']) { const g = jets[n]; g.visible = !!on[k]; if (on[k]) g.scale.set(1 + 0.5 * fl, 1, 1); }
  };
  const setThrust = (enabled, on, t) => { thr.visible = enabled; for (const [f, s] of flames) { f.visible = enabled && on; if (on) { const k = 0.85 + 0.3 * Math.sin(t * 45 + f.position.x * 7 + f.position.z * 5); f.scale.set(s, s * (1 + k * 0.5), s); } } };
  // Danni 0..1: scocca che si sporca e si arrugginisce, cofano che si solleva, paraurti che rientra e si storce, fari che si rompono
  const dentSeed = [Math.random() - 0.5, Math.random() - 0.5];
  const setDamage = (d, hit, t) => {
    const k = 1 - 0.42 * d; bodyMat.color.setRGB(k, k * 0.97, k * 0.92); frontMat.color.copy(bodyMat.color);
    hood.rotation.z = 0.28 * d * (0.8 + 0.2 * Math.sin(t * 40) * hit) ; hood.position.y = 0.95 + 0.12 * d; hood.rotation.y = dentSeed[0] * 0.2 * d;
    bump.position.x = 2.2 - 0.2 * d; bump.rotation.y = dentSeed[1] * 0.3 * d; bump.rotation.z = -0.18 * d; bump.position.y = 0.38 - 0.06 * d;
    front.scale.x = 1 - 0.06 * d; bodyMesh.scale.y = 1 - 0.02 * d;
    headMesh.visible = d < 0.35 || (d < 0.7 && Math.sin(t * 17) > -0.4);
  };
  return { outer, inner, update, blob, setThrust, setJets, setDamage };
}
