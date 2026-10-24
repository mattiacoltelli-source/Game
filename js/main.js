import * as THREE from '../lib/three.module.min.js';
import { RIDES, VIEW, STOP_SPEED, CANTIERI } from './config.js';
import { loadData, World } from './world.js';
import { Collider, RoadIndex } from './collider.js';
import { Car } from './car.js';
import { Input } from './input.js';
import { buildTaxi } from './carmodel.js';
import { DriftFX } from './fx.js';
import { GROUND_COLOR } from './world.js';
import { Minimap } from './minimap.js';
import { buildMarker } from './marker.js';
import { Labels } from './labels.js';
import { initPWA } from './pwa.js';
import { NosPickups, buildFlames, NOS_COLORS } from './nos.js';
import { Enemies } from './enemies.js';
import { leporeSpots } from './lepore.js';
import { sfx } from './sfx.js';
import { Atmosphere, PRESET_NAMES } from './atmosphere.js';
import { Props } from './props.js';
import { Particles } from './particles.js';
import { Post } from './post.js';
import { Street } from './street.js';
import { Ramps } from './ramps.js';
import { FoeIndicators } from './foeind.js';
import { RandomEvents } from './events.js';
import { GadgetPickups, GADGETS, buildShield, GadgetFx } from './gadgets.js';
import { Traffic, Pedestrians } from './traffic.js';
import { VERSION } from './version.js';

const $ = (id) => document.getElementById(id);
const FXFORCE = new URLSearchParams(location.search).has('fxforce');
const DEBUG = new URLSearchParams(location.search).has('debug'), NOTRAFFIC = new URLSearchParams(location.search).has('notraffic'), NOENEMIES = new URLSearchParams(location.search).has('noenemies');
THREE.ColorManagement.enabled = false; // colori "as-is", niente conversione sRGB: più semplice e leggero
const SKY = new THREE.Color(0xcfe0ea);

// ---- diagnostica ed errori visibili (per capire i problemi di chi non riesce a scaricare/avviare il gioco)
const lowEnd = !!((navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4));
let renderer = null;
function diag(extra = '') {
  let gpu = 'n/d'; try { const gl = renderer && renderer.getContext(), e = gl && gl.getExtension('WEBGL_debug_renderer_info'); if (e) gpu = gl.getParameter(e.UNMASKED_RENDERER_WEBGL); } catch (e) { /* ignora */ }
  return [`Taxi Bologna v${VERSION}`, navigator.userAgent, `GPU: ${gpu}`, `RAM: ${navigator.deviceMemory || '?'} GB, CPU: ${navigator.hardwareConcurrency || '?'}, schermo ${innerWidth}x${innerHeight} @${devicePixelRatio}`, extra].filter(Boolean).join('\n');
}
let lastErr = '';
function showFatal(msg, err) {
  lastErr = (err && (err.stack || err.message)) || String(err || msg); $('screen-load').hidden = false; $('screen-start').hidden = true; $('hud').hidden = true; $('controls').hidden = true;
  $('load-msg').textContent = msg; $('load-bar').style.width = '0'; $('retry').hidden = false; const dc = $('diag-copy'); dc.hidden = false;
  dc.onclick = async () => { const t = diag(lastErr); try { await navigator.clipboard.writeText(t); dc.textContent = 'Copiato ✓ — mandalo a chi ti ha dato il gioco'; } catch (e) { prompt('Copia questi dettagli:', t); } };
}
let errCount = 0;
addEventListener('error', (e) => { if (++errCount >= 3) showFatal('Il gioco ha avuto un problema. Ricarica la pagina.', e.error || e.message); });
addEventListener('unhandledrejection', (e) => { if (++errCount >= 3) showFatal('Il gioco ha avuto un problema. Ricarica la pagina.', e.reason); });
try { renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: false, powerPreference: 'high-performance' }); }
catch (e) { showFatal('Questo browser non riesce ad avviare la grafica 3D (WebGL). Prova con Chrome o Safari aggiornati.', e); throw e; }
$('c').addEventListener('webglcontextlost', (e) => { e.preventDefault(); showFatal('La grafica si è interrotta (poca memoria?). Ricarica la pagina.', 'webglcontextlost'); });
let pixelRatio = Math.min(devicePixelRatio || 1, lowEnd ? 1.25 : 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const scene = new THREE.Scene();
scene.background = SKY; scene.fog = new THREE.Fog(SKY, VIEW.fogNear, VIEW.fogFar);
const camera = new THREE.PerspectiveCamera(60, 2, 0.4, VIEW.fogFar + 40);
const hemi = new THREE.HemisphereLight(0xffffff, 0x8e8c86, 2.5); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 1.5); sun.position.set(-0.5, 1, 0.35); scene.add(sun);

const post = new Post(renderer);
let fxQ = !lowEnd; try { const sv = localStorage.getItem('taxi-bologna:fx'); if (sv !== null) fxQ = sv !== '0'; } catch (e) { /* storage non disponibile */ } // telefoni deboli: effetti luce spenti di default
post.on = fxQ && !new URLSearchParams(location.search).has('nofx');
// Segue il viewport visibile (iPhone/Chrome iOS: il layout può essere più largo dell'area visibile) e blocca zoom/scorrimento accidentali.
// iPhone con Chrome/altri browser: l'area visibile può essere più stretta del layout (tacca): i pulsanti a destra restano tagliati. exR = margine destro extra dell'interfaccia.
const IOS = /iphone|ipad|ipod/i.test(navigator.userAgent), IOS_NOT_SAFARI = IOS && /crios|fxios|edgios|opios|gsa\//i.test(navigator.userAgent);
let exR = IOS_NOT_SAFARI ? 59 : 0; try { const sv = localStorage.getItem('taxi-bologna:exr'); if (sv !== null) exR = +sv || 0; } catch (e) { /* storage non disponibile */ }
function fitViewport() {
  const v = window.visualViewport, st = document.documentElement.style;
  if (v && v.scale <= 1.01) { st.setProperty('--vx', v.offsetLeft + 'px'); st.setProperty('--vy', v.offsetTop + 'px'); st.setProperty('--vw', v.width + 'px'); st.setProperty('--vh', v.height + 'px'); st.setProperty('--hw', (v.width - exR) + 'px'); }
  else st.setProperty('--hw', (innerWidth - exR) + 'px');
}
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || !e.target.closest('[data-btn]')) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());
addEventListener('scroll', () => { if (scrollX || scrollY) scrollTo(0, 0); });
if (window.visualViewport) { visualViewport.addEventListener('resize', () => { fitViewport(); resize(); }); visualViewport.addEventListener('scroll', fitViewport); }
function viewSize() { const v = window.visualViewport; return v && v.scale <= 1.01 ? [v.width, v.height] : [innerWidth, innerHeight]; }
function resize() {
  fitViewport(); const [w, h] = viewSize();
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); post.setSize();
}
addEventListener('resize', resize); resize();

const fmt = (t) => { const m = Math.floor(t / 60), sec = t - m * 60; return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(2)}`; };
const bestKey = (id) => `taxi-bologna:best:${id}`;
const loadBest = (id) => { try { const v = parseFloat(localStorage.getItem(bestKey(id))); return v > 0 ? v : null; } catch (e) { return null; } };
const saveBest = (id, t) => { try { localStorage.setItem(bestKey(id), String(t)); } catch (e) { /* storage non disponibile */ } };

let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); }

async function boot() {
  const step = async (msg, pct) => { $('load-msg').textContent = msg; $('load-bar').style.width = `${pct}%`; await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); };
  await step('Scarico la mappa…', 3);
  const data = await loadData((p) => { $('load-bar').style.width = `${3 + p * 55}%`; });
  await step('Costruisco la città…', 60);
  const world = new World(data);
  await step('Preparo le strade…', 72);
  const col = new Collider(world.buildings, world.meta.bounds);
  const roads = new RoadIndex(world.roads);
  await step('Pianto gli alberi…', 80);
  world.plantTrees(col);
  const props = new Props(scene, world, col, CANTIERI), street = new Street(scene, world, col);
  const traffic = new Traffic(scene, world, roads, props), peds = new Pedestrians(scene, world, roads);
  scene.add(world.group);

  // terreno piatto
  const gw = world.x1 - world.x0 + 400, gh = world.z1 - world.z0 + 400;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(...GROUND_COLOR) }));
  ground.position.set((world.x0 + world.x1) / 2, 0, (world.z0 + world.z1) / 2); scene.add(ground);

  // auto
  const taxi = buildTaxi(); scene.add(taxi.outer);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.visible = false; scene.add(shadow);
  let groundBase = (x, z) => world.groundY(x, z);
  const car = new Car(), groundY = (x, z) => groundBase(x, z);
  const fx = new DriftFX(scene), parts = new Particles(scene);
  const atmo = new Atmosphere({ scene, camera, world, hemi, sun, ground, taxi });
  { // Piazza Maggiore: ovale rosato sul lastricato (come nelle foto)
    const poi = (data.labels.pois || []).find((q) => q.n === 'Piazza Maggiore'), pz = poi && { x: poi.x, z: poi.z };
    if (pz) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
      const el = (rx, ry, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(128, 64, rx, ry, 0, 0, 7); g.fill(); };
      el(126, 62, '#a8695f'); el(118, 55, '#e6d8c4'); el(104, 46, '#b97a6e'); el(98, 41, '#efe3d0');
      g.strokeStyle = '#c9a99a'; g.lineWidth = 2; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(128 + k * 28, 28); g.lineTo(128 + k * 28, 100); g.stroke(); } g.beginPath(); g.moveTo(40, 64); g.lineTo(216, 64); g.stroke();
      const m = new THREE.Mesh(new THREE.PlaneGeometry(70, 35).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      m.position.set(pz.x, 0.075, pz.z); m.renderOrder = 1; scene.add(m); atmo.decals = [m];
    }
  }
  let tod = 'giorno'; try { tod = localStorage.getItem('taxi-bologna:tod') || 'giorno'; } catch (e) { /* storage non disponibile */ }
  if (!PRESET_NAMES.includes(tod)) tod = 'giorno';
  atmo.set(tod);
  const markTod = () => document.querySelectorAll('#tod button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tod === atmo.name)));
  markTod();
  document.querySelectorAll('#tod button').forEach((b) => b.addEventListener('click', () => {
    atmo.set(b.dataset.tod); markTod(); try { localStorage.setItem('taxi-bologna:tod', atmo.name); } catch (e) { /* ignora */ }
    world.update(car.x, car.z, 99); // ricostruisce subito le celle con le nuove ombre
  }));
  const free = (x, z) => !col.push(x, z, 1.6); // spazio libero per l'auto
  const ride = RIDES[0], START = ride.start;
  const sp = world.project(START.lat, START.lon), fp = world.project(START.facing.lat, START.facing.lon);
  const snap = roads.nearest(sp[0], sp[1], free);
  const sx = snap ? snap.x : sp[0], sz = snap ? snap.z : sp[1];
  const startH = Math.atan2(fp[1] - sz, fp[0] - sx);
  car.place(sx, sz, startH);
  let camH = startH, camD = 8, camY = 0, camPos = new THREE.Vector3();

  // corsa: partenza -> tappe in ordine (cliente, ..., destinazione). Cronometro unico per tutta la corsa.
  const stops = ride.stops.map((st) => {
    const p = world.project(st.lat, st.lon), q = free(p[0], p[1]) ? { x: p[0], z: p[1] } : roads.nearest(p[0], p[1], free); // punto libero esatto, altrimenti la strada più vicina
    return { ...st, x: q ? q.x : p[0], z: q ? q.z : p[1], r: st.raggio };
  });
  let target = stops[0], marker = null;
  const nos = new NosPickups(scene, world, roads, free, [{ x: sx, z: sz, r: 60 }, ...stops.map((st) => ({ x: st.x, z: st.z, r: 45 }))]);
  const flames = buildFlames(taxi), shieldFx = buildShield(taxi), gfx = new GadgetFx(scene);
  const gadgets = new GadgetPickups(scene, world, roads, free, [{ x: sx, z: sz, r: 60 }, ...stops.map((st) => ({ x: st.x, z: st.z, r: 45 })), ...nos.items.map((i) => ({ x: i.x, z: i.z, r: 45 }))]);
  const ramps = new Ramps(scene, world, roads, col, stops[stops.length - 1]);
  for (const r of ramps.list) { nos.addAt(r.x - r.ux * 45, r.z - r.uz * 45); nos.addAt(r.x - r.ux * 80, r.z - r.uz * 80); } // NOS prima di ogni rampa (due: se li prendi entrambi il NOS è x2)
  props.circles.push(...ramps.circles); car.rampH = (x, z) => ramps.h(x, z); car.rampAssist = (x, z, vx, vz) => ramps.assist(x, z, vx, vz);
  groundBase = (x, z) => world.groundY(x, z) + ramps.h(x, z);
  const groundCar = (x, z, y) => Math.max(groundBase(x, z), col.roofAt(x, z, y)); // l'auto può stare sui tetti
  let wasRoof = false, roofToastT = 0;
  const enemies = new Enemies(scene, world, roads, {
    car, peds, traffic, props, toast, leporeSpots: leporeSpots(world, roads, col, stops), smoke: (x, z, n, kind) => parts.steam(x, z, n, kind), sparks: (x, y, z, n, dx, dz) => parts.sparks(x, y, z, n, dx, dz),
    onHit: (k) => { if (k > 0.25) toast('BOOM!'); },
    onKicked: (k) => toast(k === 'palla' ? 'Palla in faccia!' : 'Cos ti ha calciato!'),
    onBossHit: (hp, max, dmg) => { toast(dmg > 1 ? `COLPITO ×${dmg}!` : 'Colpito!'); $('boss').querySelector('u').style.transform = `scaleX(${hp / max})`; $('boss').querySelector('span').textContent = hp; },
    onBossDown: () => { toast('COS SCONFITTO!'); sfx.ko(); run.bossWon = true; finishRun(); },
    onKo: (name) => { toast(`${name} distrutto! +1 NOS`); car.giveCharge(); sfx.ko(); },
  });
  const muteBtn = $('mute'); muteBtn.classList.toggle('off', sfx.muted);
  muteBtn.addEventListener('click', () => { sfx.setMuted(!sfx.muted); muteBtn.classList.toggle('off', sfx.muted); });
  const foeInd = new FoeIndicators($('foes')), events = new RandomEvents(scene, world, roads, traffic, peds, { toast, smoke: (x, z, n, kind) => parts.steam(x, z, n, kind) });
  const mini = new Minimap($('mini'), roads);
  const labels = new Labels(scene, camera, data.labels);
  const run = { state: 'menu', t: 0, warned: false, stop: 0, boss: false, bossWon: false }; // menu | running | done
  const bossT = { x: 0, z: 0, r: 0 }; // bersaglio mobile durante il boss (Cos)
  const setStop = (i) => {
    run.stop = i; target = stops[i]; run.warned = false;
    if (marker) { scene.remove(marker); marker.traverse((o) => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); }); }
    const last = i === stops.length - 1; marker = buildMarker(target.r, last ? 0x5be37d : 0xffc928, last ? 'meta' : 'cliente', last ? 'SCARICO' : 'CLIENTE'); marker.position.set(target.x, 0, target.z); scene.add(marker);
    $('goal-txt').textContent = target.goal;
  };
  setStop(0);
  $('route').innerHTML = [START.nome, ...stops.map((s2) => s2.nome)].map((n) => `<span>${n}</span>`).join('<i></i>');
  const bid = () => ride.id + (car.canFly ? '-fly' : '');
  const showBest = () => { const b = loadBest(bid()); $('best-start').textContent = b ? `Record: ${fmt(b)}` : 'Nessun record ancora'; };
  showBest();

  const input = new Input();
  { // taxi volante (propulsori): opzione salvata, record separato
    const fq = $('flyq'); let fl = false; try { fl = localStorage.getItem('taxi-bologna:fly') === '1'; } catch (e) { /* ignora */ }
    const apply = (v) => { car.canFly = v; fq.checked = v; $('fly-btn').hidden = !v; showBest(); }; apply(fl);
    fq.addEventListener('change', () => { apply(fq.checked); try { localStorage.setItem('taxi-bologna:fly', fq.checked ? '1' : '0'); } catch (e) { /* ignora */ } });
  }
  { const fc = $('fxq'); fc.checked = post.on; fc.addEventListener('change', () => { post.on = fc.checked; try { localStorage.setItem('taxi-bologna:fx', post.on ? '1' : '0'); } catch (e) { /* ignora */ } }); }
  { const ib = $('inset'); if (IOS) { ib.hidden = false; const lab = () => { ib.textContent = `Schermo tagliato a destra? Margine: ${exR}`; }; lab(); ib.addEventListener('click', () => { exR = exR >= 60 ? 0 : exR + 30; try { localStorage.setItem('taxi-bologna:exr', String(exR)); } catch (e) { /* ignora */ } lab(); fitViewport(); }); } }
  $('auto').addEventListener('change', (e) => { input.auto = e.target.checked; });

  // precarico le celle attorno alla partenza
  let pending = 1;
  while (pending > 0) { pending = world.update(car.x, car.z, 4); $('load-bar').style.width = `${85 + 15 * (1 - Math.min(1, pending / 20))}%`; await new Promise((r) => setTimeout(r, 0)); }

  function useGadget() {
    const t = car.gadget, g = GADGETS[t]; car.gadget = null; sfx.nos(1); gfx.ring(car.x, car.z, g.color, 1.5, 9, 0.6);
    if (t === 'shield') car.shield = g.time; else if (t === 'magnete') car.magnet = g.time;
    else if (t === 'molla') { car.spring(); parts.burst(car.x, car.z, 10, 6, [0.7, 1, 0.75]); gfx.ring(car.x, car.z, g.color, 1, 7, 0.9); }
    toast(g.name + '!');
  }

  function rescue() {
    const accept = (x, z) => free(x, z);
    const r = roads.nearest(car.x, car.z, accept);
    if (!r) return;
    const d1 = r.dx * Math.cos(car.h) + r.dz * Math.sin(car.h);
    const h = d1 >= 0 ? Math.atan2(r.dz, r.dx) : Math.atan2(-r.dz, -r.dx);
    car.place(r.x, r.z, h, groundY(r.x, r.z)); camH = h; camD = 6; toast('Riposizionato sulla strada');
  }

  const hero = START.look ? { p: world.project(START.look.lat, START.look.lon), y: START.look.y } : null;
  function updateCamera(dt) {
    if (run.state === 'menu' && hero) { // schermata iniziale: inquadra le due torri, spostate a destra del pannello
      // camera davanti all'auto (che guarda verso di lei) e rivolta alle torri, che stanno alle spalle del taxi
      const cx = car.x + Math.cos(car.h) * 22, cz = car.z + Math.sin(car.h) * 22, dx = hero.p[0] - cx, dz = hero.p[1] - cz, d = Math.hypot(dx, dz), a = Math.atan2(dz, dx) - 0.3;
      camera.position.set(cx, 5.5, cz);
      camera.lookAt(cx + Math.cos(a) * d, hero.y, cz + Math.sin(a) * d);
      if (camera.fov !== 66) { camera.fov = 66; camera.updateProjectionMatrix(); }
      return;
    }
    let d = car.h - camH; d = Math.atan2(Math.sin(d), Math.cos(d));
    camH += d * (1 - Math.exp(-4.5 * dt));
    const speed = Math.hypot(car.vx, car.vz);
    const want = 8.2 + Math.min(speed, 64) * 0.06;
    const bx = -Math.cos(camH), bz = -Math.sin(camH);
    let limit = col.ray(car.x, car.z, bx, bz, want + 1.5, Math.max(4, car.y + 3)); // in alto gli edifici bassi non limitano la camera
    let target = Math.max(2.6, Math.min(want, limit - 1.2));
    if (target <= 2.6 && col.inside(car.x + bx * 2.6, car.z + bz * 2.6, Math.max(4, car.y + 3))) target = 1.4;
    camD = target < camD ? target : camD + (target - camD) * Math.min(1, 2.2 * dt);
    const t = (camD - 1.4) / 7;
    const height = 2.4 + Math.min(1, Math.max(0, t)) * 1.7 + speed * 0.012;
    const px = car.x + bx * camD, pz = car.z + bz * camD;
    camY += (car.y - camY) * Math.min(1, (car.canFly ? 12 : 6) * dt); // la camera segue la quota più lentamente: i salti si vedono
    camPos.set(px, height + camY, pz);
    camera.position.copy(camPos);
    const sh = enemies.shake; if (sh > 0.02) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    camera.lookAt(car.x + Math.cos(camH) * 7, car.canFly ? 0.9 + car.y * 0.92 : 0.9 + car.y * 0.8 + (car.y - camY) * 0.4, car.z + Math.sin(camH) * 7);
    const fov = 62 + Math.min(1, speed / 50) * 9 + (car.boost > 0 ? 4 + 3 * car.level : 0);
    if (Math.abs(camera.fov - fov) > 0.2) { camera.fov += (fov - camera.fov) * Math.min(1, 5 * dt); camera.updateProjectionMatrix(); }
  }

  function poseCar(dt) {
    taxi.outer.position.set(car.x, 0.18 + car.y, car.z);
    shadow.position.set(car.x, groundCar(car.x, car.z, car.y) + 0.2, car.z); shadow.rotation.y = -car.h; shadow.visible = car.air; shadow.scale.setScalar(1 - Math.min(0.5, car.clear * 0.06));
    taxi.outer.rotation.y = -car.h; taxi.update(car.steer, input.value.brake > 0.3 && car.speed > 1 && !car.air, car.air);
    const roll = THREE.MathUtils.clamp(-car.steer * Math.abs(car.speed) * 0.0035 + car.lat * 0.01, -0.12, 0.12);
    taxi.inner.rotation.x = THREE.MathUtils.lerp(taxi.inner.rotation.x, roll, Math.min(1, 8 * dt));
    const pitch = car.air ? THREE.MathUtils.clamp(Math.atan2(car.vy, Math.max(8, Math.abs(car.speed))), -0.45, 0.45) : 0;
    taxi.inner.rotation.z = THREE.MathUtils.lerp(taxi.inner.rotation.z, pitch, Math.min(1, 8 * dt));
  }

  // schermata iniziale
  $('screen-load').hidden = true;
  $('screen-start').hidden = false;
  let playing = false;
  function beginRun() {
    car.place(sx, sz, startH, groundY(sx, sz)); camH = startH; camD = 8; input.override = null; input.keys.clear();
    run.state = 'running'; run.t = 0; run.boss = false; run.bossWon = false; $('boss').hidden = true; setStop(0); playing = true;
    car.gadget = null; car.fuel = car.fuelMax; car.shield = car.magnet = 0; gfx.reset(); wasRoof = false; gadgets.reset();
    traffic.reset(); peds.reset(); props.reset(); nos.reset(); enemies.reset(); events.reset(); sfx.init(); if (!NOTRAFFIC) { traffic.fill(car); peds.fill(car); }
    $('screen-start').hidden = true; $('screen-end').hidden = true; $('hud').hidden = false; $('controls').hidden = false;
  }
  // Alla Fiera: consegnato il cliente, arriva il boss finale. La corsa finisce quando Cos cade.
  function beginBoss() {
    run.boss = true; marker.visible = false; $('goal-txt').textContent = target.bossGoal || 'Sconfiggi il boss'; $('boss').hidden = false;
    $('boss').querySelector('u').style.transform = 'scaleX(1)'; $('boss').querySelector('span').textContent = enemies.giant.maxHp;
    enemies.startBoss(car); target = bossT; toast('Cliente consegnato! Arriva COS, il boss!'); sfx.boom(0.6);
    for (let k = 0; k < 3; k++) gadgets.addAt(car.x + Math.cos(k * 2.1 + 0.2) * 55, car.z + Math.sin(k * 2.1 + 0.2) * 55);
    for (let k = 0; k < 4; k++) nos.addAt(car.x + Math.cos(k * 1.57 + 0.7) * 65, car.z + Math.sin(k * 1.57 + 0.7) * 65); // NOS per speronare più forte
  }
  function finishRun() {
    run.state = 'done'; playing = false; input.override = null; enemies.reset(); $('boss').hidden = true;
    const prev = loadBest(bid()), isNew = !prev || run.t < prev;
    if (isNew) saveBest(bid(), run.t);
    $('end-time').textContent = fmt(run.t);
    const el = $('end-best'); el.classList.toggle('new', isNew);
    $('end-title').textContent = run.bossWon ? 'Cos sconfitto!' : `Arrivati: ${stops[stops.length - 1].nome}`;
    el.textContent = isNew ? (prev ? `Nuovo record! Prima: ${fmt(prev)}` : 'Primo record salvato!') : `Record: ${fmt(prev)}`;
    $('hud').hidden = true; $('controls').hidden = true; $('screen-end').hidden = false; showBest();
  }
  $('again').addEventListener('click', beginRun);
  $('go').addEventListener('click', () => {
    beginRun();
    const el = document.documentElement;
    try { (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {}); screen.orientation?.lock?.('landscape')?.catch(() => {}); } catch (e) { /* best effort */ }
  });

  let lastT = performance.now(), last = lastT, acc = 0, frames = 0, fpsT = 0, fps = 60;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    const portrait = viewSize()[1] > viewSize()[0];
    if (playing && !portrait && dt > 0) {
      const inp = input.value, n = Math.ceil(dt / (1 / 90)), h = dt / n;
      car.grass = !car.air && car.onRoof !== true && world.isGrass(car.x, car.z); // prato: -10% di velocità massima
      for (let i = 0; i < n; i++) car.step(h, inp, col, world.meta.bounds, groundCar, groundY);
      if (car.needsRescue()) rescue();
      if (!NOTRAFFIC) {
        traffic.update(dt, car); peds.update(dt, car); props.update(dt, car); events.update(dt, car, run.t);
        const bump = traffic.collide(car); if (bump > 5) toast('Botta!');
        if (peds.collide(car)) { car.hitSlow(); toast('Pedone! Rallentato per 10 s'); }
      }
      if (!NOENEMIES) enemies.update(dt, car);
      if (run.boss) { bossT.x = enemies.giant.x; bossT.z = enemies.giant.z; }
      { const g = gadgets.update(dt, car); if (g) { sfx.pickup(); toast(GADGETS[g].tip); } }
      if (input.takeGad() && car.gadget) useGadget();
      if (car.onRoof && !wasRoof && now - roofToastT > 15000) { roofToastT = now; toast('Sei sui tetti! Scendi guidando o usa il NOS per un salto lungo'); } wasRoof = car.onRoof;
      if (nos.update(dt, car) && car.giveCharge()) { sfx.pickup(); toast(car.charges >= 3 ? 'NOS ×3 pronto!' : `NOS: ${car.charges}/3 cariche`); }
      if (input.takeNos()) { const lv = car.activate(); if (lv) { sfx.nos(lv); toast(`NOS ×${lv}! 10 secondi`); } }
      if (car.superJump) { car.superJump = false; toast('Super salto verso il tetto!'); }
      if (car.canFly) car.jump = 0; // in volo i salti non fanno notizia
      if (car.jump > 0) { if (car.jump >= 12) toast(`Salto di ${Math.round(car.jump)} m!`); car.jump = 0; }
      run.t += Math.min(0.25, (now - lastT) / 1000);
      const d = Math.hypot(target.x - car.x, target.z - car.z);
      if (d < target.r) {
        if (Math.abs(car.speed) < STOP_SPEED) {
          if (run.stop < stops.length - 1) { toast(target.boarded || 'Tappa completata'); setStop(run.stop + 1); } else finishRun(); // alla Fiera la corsa finisce (niente boss)
        }
        else if (!run.warned) { run.warned = true; toast('Fermati nel cerchio'); }
      } else run.warned = false;
    }
    lastT = now;
    world.update(car.x, car.z, 1); street.update(dt);
    flames(car.boost > 0 ? car.level : 0, now / 1000); taxi.setThrust(car.canFly, car.thrusting, now / 1000); shieldFx(car.shield, now / 1000); gfx.update(dt, car);
    poseCar(dt); if (!window.__freeCam) updateCamera(dt); fx.update(dt, car, camera); parts.update(dt, car, camera, scene.fog.color); labels.update(dt, car, camH); atmo.update(dt, car);
    if (run.state === 'running') {
      $('kmh').textContent = Math.round(Math.abs(car.speed) * 3.6);
      $('time').textContent = fmt(run.t);
      const dx = target.x - car.x, dz = target.z - car.z;
      $('dist').textContent = `${Math.round(Math.hypot(dx, dz))} m`;
      $('arrow').style.transform = `rotate(${Math.atan2(dz, dx) - camH}rad)`;
      const pts = enemies.points(); mini.update(dt, car, target, nos.active(), pts); foeInd.update(camera, [...pts, ...events.points()], car);
      const sNos = $('st-nos'), sSlow = $('st-slow'); sNos.hidden = !(car.boost > 0); sSlow.hidden = !(car.slow > 0);
      const nc = '#' + NOS_COLORS[Math.max(0, car.boost > 0 ? car.level - 1 : Math.max(0, car.charges - 1))].toString(16).padStart(6, '0');
      if (car.boost > 0) { sNos.style.setProperty('--nc', nc); $('speedfx').style.setProperty('--nc', nc); sNos.querySelector('b').textContent = `NOS ×${car.level}`; sNos.querySelector('u').style.transform = `scaleX(${car.boost / 10})`; sNos.querySelector('span').textContent = car.boost.toFixed(1); }
      { // gadget: pulsante e stato
        const gb = $('gad-btn'), gt = car.gadget && GADGETS[car.gadget];
        if (gt) { gb.classList.add('has'); gb.style.setProperty('--gc', '#' + gt.color.toString(16).padStart(6, '0')); gb.querySelector('.gi').textContent = gt.icon; gb.querySelector('.gl').textContent = gt.name.toUpperCase(); }
        else { gb.classList.remove('has'); gb.querySelector('.gi').textContent = '·'; gb.querySelector('.gl').textContent = 'GADGET'; }
        const act = [['shield', car.shield], ['magnete', car.magnet]].sort((a, b) => b[1] - a[1])[0], sg = $('st-gad');
        sg.hidden = !(act[1] > 0); if (act[1] > 0) { const g2 = GADGETS[act[0]]; sg.style.setProperty('--gc', '#' + g2.color.toString(16).padStart(6, '0')); sg.querySelector('b').textContent = g2.name.toUpperCase(); sg.querySelector('u').style.transform = `scaleX(${Math.min(1, act[1] / g2.time)})`; sg.querySelector('span').textContent = act[1].toFixed(1); }
      }
      { const sf = $('st-fuel'); sf.hidden = !car.canFly; if (car.canFly) { sf.querySelector('u').style.transform = `scaleX(${Math.max(0, Math.min(1, car.fuel / car.fuelMax))})`; sf.querySelector('span').textContent = car.fuel.toFixed(1); } }
      const nb = $('nos-btn'); nb.className = `btn nosbtn c${car.charges}` + (input.btn.nos ? ' on' : '');
      if (car.slow > 0) { sSlow.querySelector('u').style.transform = `scaleX(${car.slow / 10})`; sSlow.querySelector('span').textContent = car.slow.toFixed(1); }
      $('speedfx').classList.toggle('on', car.boost > 0);
    }
    try { post.render(scene, camera); } catch (e) { console.warn('Effetti luce disattivati', e); post.on = false; fxQ = false; try { renderer.setRenderTarget(null); } catch (e2) { /* ignora */ } const fc = $('fxq'); if (fc) fc.checked = false; }

    // pixel ratio adattivo
    frames++; fpsT += dt;
    if (fpsT >= 2) {
      fps = frames / fpsT; frames = 0; fpsT = 0;
      if (playing && fps < 30 && post.on && !FXFORCE) { post.on = false; fxQ = false; const fc = $('fxq'); if (fc) fc.checked = false; } // troppo lento: spengo il bloom
      else if (playing && fps < 27 && pixelRatio > 0.7) { pixelRatio = Math.max(0.7, pixelRatio - 0.15); renderer.setPixelRatio(pixelRatio); resize(); }
    }
  }
  requestAnimationFrame(frame);

  window.__taxi = { events, ramps, gadgets, street, post, parts, enemies, nos, props, traffic, peds, taxi, get target() { return target; }, stops, setStop, run, startPos: [sx, sz, startH], car, world, col, roads, input, camera, scene, renderer, get fps() { return fps; }, start() { $('go').click(); }, rescue, free };
  if (DEBUG) { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:8px;top:8px;font:12px monospace;color:#fff;text-shadow:0 1px 2px #000;z-index:9;pointer-events:none'; document.body.append(d); setInterval(() => { d.textContent = `fps ${fps.toFixed(0)} pr ${pixelRatio.toFixed(2)} cells ${world.cells.size} calls ${renderer.info.render.calls} tris ${renderer.info.render.triangles}`; }, 500); }
}

initPWA();
setTimeout(() => { const h = $('load-hint'); if (h && !$('screen-load').hidden) h.hidden = false; }, 3500); // download lento: spiego perché
boot().catch((e) => { console.error(e); showFatal(e.message || 'Errore di caricamento', e); });
$('retry').addEventListener('click', () => location.reload());
