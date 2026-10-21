import * as THREE from '../lib/three.module.min.js';

// Cerchio d'obiettivo: anello + disco traslucido a terra e un fascio verticale visibile da lontano.
export function buildMarker(radius) {
  const g = new THREE.Group();
  const yellow = new THREE.Color(0xffc928);
  const mk = (geo, op) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: yellow, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
  const ring = mk(new THREE.RingGeometry(radius - 1.2, radius, 40).rotateX(-Math.PI / 2), 0.95); ring.position.y = 0.3;
  const disc = mk(new THREE.CircleGeometry(radius - 1.2, 40).rotateX(-Math.PI / 2), 0.22); disc.position.y = 0.28;
  const beam = mk(new THREE.CylinderGeometry(radius * 0.35, radius * 0.35, 90, 14, 1, true), 0.2); beam.position.y = 45;
  g.add(disc, ring, beam); return g;
}
