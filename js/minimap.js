// Minimappa 2D "heading up": strade vicine, auto al centro, obiettivo (bordo se fuori raggio).
const RANGE = 220; // metri dal centro al bordo
const ROAD = { motorway: 3, trunk: 3, primary: 3, secondary: 2.6, tertiary: 2.2 };

export class Minimap {
  constructor(canvas, roads) {
    this.c = canvas; this.roads = roads; this.t = 0;
    const size = canvas.clientWidth || 132, dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(size * dpr); this.size = canvas.width;
    this.g = canvas.getContext('2d');
  }

  update(dt, car, target) {
    this.t -= dt; if (this.t > 0) return; this.t = 0.1;
    const g = this.g, S = this.size, k = S / (2 * RANGE);
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S);
    g.fillStyle = '#1b222a'; g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 7); g.fill();
    g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, 7); g.clip();
    g.translate(S / 2, S / 2); g.rotate(-Math.PI / 2 - car.h); g.scale(k, k); g.translate(-car.x, -car.z);
    g.lineCap = 'round';
    const lines = [[], []]; // [secondarie, principali]
    this.roads.segmentsNear(car.x, car.z, RANGE * 1.1, (r, i) => { (ROAD[r.c] ? lines[1] : lines[0]).push(r, i); });
    for (const [pass, list] of lines.entries()) {
      g.strokeStyle = pass ? '#8793a1' : '#56616d'; g.lineWidth = (pass ? 3.4 : 2) * (S / 132) / k;
      g.beginPath();
      for (let n = 0; n < list.length; n += 2) { const p = list[n].p, i = list[n + 1]; g.moveTo(p[i * 2], p[i * 2 + 1]); g.lineTo(p[i * 2 + 2], p[i * 2 + 3]); }
      g.stroke();
    }
    // obiettivo
    let dx = target.x - car.x, dz = target.z - car.z; const d = Math.hypot(dx, dz), lim = RANGE * 0.88;
    let tx = target.x, tz = target.z; if (d > lim) { tx = car.x + dx / d * lim; tz = car.z + dz / d * lim; }
    g.fillStyle = '#ffc928'; g.strokeStyle = '#14181d'; g.lineWidth = 2 * (S / 132) / k;
    g.beginPath(); g.arc(tx, tz, (d > lim ? 5 : 8) * (S / 132) / k, 0, 7); g.fill(); g.stroke();
    g.restore();
    // auto
    g.translate(S / 2, S / 2); g.fillStyle = '#fff'; g.strokeStyle = '#14181d'; g.lineWidth = 2 * (S / 132);
    const u = S / 132 * 7; g.beginPath(); g.moveTo(0, -u * 1.2); g.lineTo(u, u); g.lineTo(0, u * 0.4); g.lineTo(-u, u); g.closePath(); g.fill(); g.stroke();
  }
}
