import * as THREE from '../lib/three.module.min.js';
import { iconSprite, hex } from './icons.js';

// Cerchio d'obiettivo: anello + disco traslucido a terra e un fascio verticale visibile da lontano.
export function buildMarker(radius, color = 0xffc928, icon = null, label = '') {
  const g = new THREE.Group();
  const yellow = new THREE.Color(color);
  const mk = (geo, op) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: yellow, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
  const ring = mk(new THREE.RingGeometry(radius - 1.2, radius, 40).rotateX(-Math.PI / 2), 0.95); ring.position.y = 0.3;
  const disc = mk(new THREE.CircleGeometry(radius - 1.2, 40).rotateX(-Math.PI / 2), 0.22); disc.position.y = 0.28;
  const beam = mk(new THREE.CylinderGeometry(radius * 0.35, radius * 0.35, 90, 14, 1, true), 0.2); beam.position.y = 45;
  g.add(disc, ring, beam);
  if (icon) { const sp = iconSprite(icon, hex(color), label, 10); sp.position.y = 13; g.add(sp); } // grande icona sospesa con etichetta: si riconosce da lontano
  return g;
}
