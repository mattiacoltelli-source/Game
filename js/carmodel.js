import * as THREE from '../lib/three.module.min.js';
import { mergeBoxes } from './geom.js';

// Taxi low-poly (guarda verso +x) in UNA sola mesh a colori per vertice. Gruppo esterno = posizione/imbardata, interno = rollio/beccheggio.
export function buildTaxi() {
  const W = [0.95, 0.94, 0.9], D = [0.14, 0.19, 0.23], B = [0.07, 0.07, 0.08], Y = [1.6, 1.25, 0.2], H = [1.5, 1.4, 1.0], T = [1.4, 0.25, 0.25];
  const parts = [
    { x: 0, y: 0.7, z: 0, sx: 4.3, sy: 0.7, sz: 1.85, c: W },       // scocca
    { x: -0.15, y: 1.3, z: 0, sx: 2.1, sy: 0.62, sz: 1.7, c: D },   // abitacolo (vetri)
    { x: -0.15, y: 1.64, z: 0, sx: 1.9, sy: 0.08, sz: 1.6, c: W },  // tetto
    { x: -0.15, y: 1.8, z: 0, sx: 0.5, sy: 0.22, sz: 0.9, c: Y },   // insegna TAXI
    { x: 2.17, y: 0.78, z: 0.6, sx: 0.1, sy: 0.18, sz: 0.4, c: H }, { x: 2.17, y: 0.78, z: -0.6, sx: 0.1, sy: 0.18, sz: 0.4, c: H },
    { x: -2.17, y: 0.78, z: 0.6, sx: 0.1, sy: 0.18, sz: 0.4, c: T }, { x: -2.17, y: 0.78, z: -0.6, sx: 0.1, sy: 0.18, sz: 0.4, c: T },
    { x: 0, y: 0.38, z: 0, sx: 4.32, sy: 0.1, sz: 1.87, c: B },     // paraurti/sottoscocca
    ...[[1.4, 0.95], [1.4, -0.95], [-1.4, 0.95], [-1.4, -0.95]].map(([x, z]) => ({ x, y: 0.36, z, sx: 0.72, sy: 0.72, sz: 0.28, c: B })),
  ];
  const mesh = new THREE.Mesh(mergeBoxes(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  const outer = new THREE.Group(), inner = new THREE.Group(); outer.add(inner); inner.add(mesh);
  return { outer, inner };
}
