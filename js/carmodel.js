import * as THREE from '../lib/three.module.min.js';

// Taxi low-poly (guarda verso +x). Gruppo esterno = posizione/imbardata, interno = rollio/beccheggio.
export function buildTaxi() {
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const white = mat(0xf3f1ea), dark = mat(0x23303a), black = mat(0x15151a), yellow = new THREE.MeshBasicMaterial({ color: 0xffc928 });
  const head = new THREE.MeshBasicMaterial({ color: 0xfff3b0 }), tail = new THREE.MeshBasicMaterial({ color: 0xe0343a });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };

  const outer = new THREE.Group(), inner = new THREE.Group(); outer.add(inner);
  inner.add(box(4.3, 0.7, 1.85, white, 0, 0.7, 0));         // scocca
  inner.add(box(2.1, 0.62, 1.7, dark, -0.15, 1.3, 0));       // abitacolo (vetri)
  inner.add(box(1.9, 0.08, 1.6, white, -0.15, 1.64, 0));     // tetto
  inner.add(box(0.5, 0.22, 0.9, yellow, -0.15, 1.8, 0));     // insegna TAXI
  inner.add(box(0.1, 0.18, 0.4, head, 2.17, 0.78, 0.6)); inner.add(box(0.1, 0.18, 0.4, head, 2.17, 0.78, -0.6));
  inner.add(box(0.1, 0.18, 0.4, tail, -2.17, 0.78, 0.6)); inner.add(box(0.1, 0.18, 0.4, tail, -2.17, 0.78, -0.6));
  inner.add(box(4.32, 0.1, 1.87, black, 0, 0.38, 0));        // paraurti/sottoscocca
  const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10); wg.rotateX(Math.PI / 2);
  for (const [x, z] of [[1.4, 0.95], [1.4, -0.95], [-1.4, 0.95], [-1.4, -0.95]]) { const w = new THREE.Mesh(wg, black); w.position.set(x, 0.36, z); inner.add(w); }
  return { outer, inner };
}
