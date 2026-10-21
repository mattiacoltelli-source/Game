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
    { x: 1.55, y: 0.95, z: 0, sx: 1.2, sy: 0.14, sz: 1.75, c: W },    // cofano
    { x: -1.75, y: 0.95, z: 0, sx: 0.8, sy: 0.14, sz: 1.75, c: W },   // baule
    { x: -0.2, y: 1.28, z: 0, sx: 2.0, sy: 0.6, sz: 1.7, c: D },      // abitacolo scuro
    { x: -0.2, y: 1.62, z: 0, sx: 1.8, sy: 0.09, sz: 1.62, c: W },    // tetto
    { x: 0.82, y: 1.3, z: 0, sx: 0.12, sy: 0.55, sz: 1.5, c: G },     // parabrezza
    { x: -1.2, y: 1.3, z: 0, sx: 0.12, sy: 0.5, sz: 1.5, c: G },      // lunotto
    { x: -0.2, y: 1.3, z: 0.86, sx: 1.9, sy: 0.5, sz: 0.04, c: G }, { x: -0.2, y: 1.3, z: -0.86, sx: 1.9, sy: 0.5, sz: 0.04, c: G }, // vetri laterali
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
  const bodyMesh = new THREE.Mesh(mergeBoxes(body), new THREE.MeshLambertMaterial({ vertexColors: true }));
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
  const outer = new THREE.Group(), inner = new THREE.Group(); outer.add(inner); inner.add(bodyMesh, headMesh, tailMesh, wl, wr, sign);
  // ombra morbida fissa sotto l'auto
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  blob.position.y = -0.16; blob.renderOrder = 2; outer.add(blob);
  // sterzo delle ruote anteriori, fanali posteriori accesi in frenata
  const update = (steer, braking, air) => { wl.rotation.y = wr.rotation.y = -steer * 0.45; tailMat.color.setRGB(braking ? 1.6 : 0.55, braking ? 0.16 : 0.05, braking ? 0.12 : 0.04); blob.visible = !air; };
  return { outer, inner, update, blob };
}
