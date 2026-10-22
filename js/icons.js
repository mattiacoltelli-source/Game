import * as THREE from '../lib/three.module.min.js';

// Icone a fumetto per riconoscere a colpo d'occhio cosa si vede in giro: NOS, scudo, molla, magnete, cliente, destinazione.
// Sprite sempre rivolti alla camera, con etichetta sotto; texture create una sola volta per tipo.
const cache = new Map();

function glyph(g, kind, col) {
  g.lineJoin = g.lineCap = 'round'; g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 9;
  if (kind === 'nos') { g.beginPath(); g.moveTo(70, 18); g.lineTo(38, 68); g.lineTo(60, 68); g.lineTo(52, 110); g.lineTo(90, 56); g.lineTo(66, 56); g.closePath(); g.fill(); }
  else if (kind === 'shield') { g.beginPath(); g.moveTo(64, 16); g.lineTo(100, 30); g.lineTo(98, 68); g.quadraticCurveTo(94, 98, 64, 112); g.quadraticCurveTo(34, 98, 30, 68); g.lineTo(28, 30); g.closePath(); g.fill(); g.fillStyle = '#0b1722'; g.beginPath(); g.moveTo(64, 30); g.lineTo(86, 38); g.lineTo(84, 66); g.quadraticCurveTo(80, 88, 64, 98); g.closePath(); g.fill(); }
  else if (kind === 'molla') { g.lineWidth = 10; g.beginPath(); g.moveTo(40, 100); g.lineTo(88, 88); g.lineTo(40, 72); g.lineTo(88, 56); g.lineTo(40, 40); g.stroke(); g.beginPath(); g.moveTo(64, 14); g.lineTo(88, 36); g.lineTo(40, 36); g.closePath(); g.fill(); }
  else if (kind === 'magnete') { g.lineWidth = 16; g.beginPath(); g.arc(64, 62, 30, Math.PI, 0); g.lineTo(94, 98); g.moveTo(34, 62); g.lineTo(34, 98); g.stroke(); g.fillStyle = '#e8e8e8'; g.fillRect(25, 92, 18, 18); g.fillRect(85, 92, 18, 18); g.fillStyle = '#ff4a4a'; g.fillRect(25, 84, 18, 10); g.fillRect(85, 84, 18, 10); }
  else if (kind === 'cliente') { g.beginPath(); g.arc(64, 38, 18, 0, 7); g.fill(); g.beginPath(); g.moveTo(30, 108); g.quadraticCurveTo(30, 62, 64, 62); g.quadraticCurveTo(98, 62, 98, 108); g.closePath(); g.fill(); }
  else if (kind === 'meta') { g.lineWidth = 8; g.beginPath(); g.moveTo(36, 112); g.lineTo(36, 18); g.stroke(); const s = 16; for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { g.fillStyle = (r + c) % 2 ? '#111' : '#fff'; g.fillRect(42 + c * s, 20 + r * s, s, s); } }
}

export function iconTexture(kind, color, label) {
  const key = kind + color + label; if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = 128; c.height = 172; const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,16,22,0.88)'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.strokeStyle = color; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.stroke();
  glyph(g, kind, color);
  if (label) { g.font = '800 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; const w = Math.min(124, g.measureText(label).width + 22); g.fillStyle = 'rgba(10,16,22,0.88)'; g.beginPath(); g.roundRect ? g.roundRect(64 - w / 2, 134, w, 34, 17) : g.rect(64 - w / 2, 134, w, 34); g.fill(); g.strokeStyle = color; g.lineWidth = 3; g.stroke(); g.fillStyle = '#fff'; g.fillText(label, 64, 152); }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; cache.set(key, t); return t;
}

export function iconSprite(kind, color, label, size = 5) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(kind, color, label), transparent: true, depthWrite: false, fog: false }));
  sp.scale.set(size, size * 172 / 128, 1); sp.renderOrder = 10; sp.center.set(0.5, 0.2); return sp;
}

export const hex = (n) => '#' + n.toString(16).padStart(6, '0');
