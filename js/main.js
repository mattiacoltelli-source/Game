import * as THREE from '../lib/three.module.min.js';
import { START, VIEW, CUSTOMERS, STOP_SPEED } from './config.js';
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

const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');
THREE.ColorManagement.enabled = false; // colori "as-is", niente conversione sRGB: più semplice e leggero
const SKY = new THREE.Color(0xcfe0ea);

const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const scene = new THREE.Scene();
scene.background = SKY; scene.fog = new THREE.Fog(SKY, VIEW.fogNear, VIEW.fogFar);
const camera = new THREE.PerspectiveCamera(60, 2, 0.4, VIEW.fogFar + 40);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8e8c86, 2.5));
const sun = new THREE.DirectionalLight(0xfff0d8, 1.5); sun.position.set(-0.5, 1, 0.35); scene.add(sun);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const fmt = (t) => { const m = Math.floor(t / 60), sec = t - m * 60; return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(2)}`; };
const bestKey = (id) => `taxi-bologna:best:${id}`;
const loadBest = (id) => { try { const v = parseFloat(localStorage.getItem(bestKey(id))); return v > 0 ? v : null; } catch (e) { return null; } };
const saveBest = (id, t) => { try { localStorage.setItem(bestKey(id), String(t)); } catch (e) { /* storage non disponibile */ } };

let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); }

async function boot() {
  const data = await loadData((p) => { $('load-bar').style.width = `${p * 70}%`; });
  $('load-msg').textContent = 'Costruisco la città…';
  await new Promise((r) => setTimeout(r, 30));
  const world = new World(data);
  const col = new Collider(world.buildings, world.meta.bounds);
  const roads = new RoadIndex(world.roads);
  world.plantTrees(col);
  scene.add(world.group);

  // terreno piatto
  const gw = world.x1 - world.x0 + 400, gh = world.z1 - world.z0 + 400;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(...GROUND_COLOR) }));
  ground.position.set((world.x0 + world.x1) / 2, 0, (world.z0 + world.z1) / 2); scene.add(ground);

  // auto
  const taxi = buildTaxi(); scene.add(taxi.outer);
  const car = new Car();
  const fx = new DriftFX(scene);
  const free = (x, z) => !col.push(x, z, 1.6); // spazio libero per l'auto
  const sp = world.project(START.lat, START.lon), fp = world.project(START.facing.lat, START.facing.lon);
  const snap = roads.nearest(sp[0], sp[1], free);
  const sx = snap ? snap.x : sp[0], sz = snap ? snap.z : sp[1];
  const startH = Math.atan2(fp[1] - sz, fp[0] - sx);
  car.place(sx, sz, startH);
  let camH = startH, camD = 8, camPos = new THREE.Vector3();

  // corsa: per ora una sola tratta, partenza -> primo cliente (la lista CUSTOMERS è dati)
  const cust = CUSTOMERS[0];
  const cp = world.project(cust.lat, cust.lon), cs = roads.nearest(cp[0], cp[1], free);
  const target = { x: cs ? cs.x : cp[0], z: cs ? cs.z : cp[1], r: cust.raggio, id: cust.id, nome: cust.nome };
  const marker = buildMarker(target.r); marker.position.set(target.x, 0, target.z); scene.add(marker);
  const mini = new Minimap($('mini'), roads);
  const labels = new Labels(scene, camera, data.labels);
  const run = { state: 'menu', t: 0, warned: false }; // menu | running | done
  $('cust-name').textContent = target.nome;
  $('goal-txt').textContent = 'Vai dal cliente';
  const showBest = () => { const b = loadBest(target.id); $('best-start').textContent = b ? `Record: ${fmt(b)}` : 'Nessun record ancora'; };
  showBest();

  const input = new Input();
  $('auto').addEventListener('change', (e) => { input.auto = e.target.checked; });

  // precarico le celle attorno alla partenza
  let pending = 1;
  while (pending > 0) { pending = world.update(car.x, car.z, 4); $('load-bar').style.width = `${70 + 30 * (1 - Math.min(1, pending / 20))}%`; await new Promise((r) => setTimeout(r, 0)); }

  function rescue() {
    const accept = (x, z) => free(x, z);
    const r = roads.nearest(car.x, car.z, accept);
    if (!r) return;
    const d1 = r.dx * Math.cos(car.h) + r.dz * Math.sin(car.h);
    const h = d1 >= 0 ? Math.atan2(r.dz, r.dx) : Math.atan2(-r.dz, -r.dx);
    car.place(r.x, r.z, h); camH = h; camD = 6; toast('Riposizionato sulla strada');
  }

  function updateCamera(dt) {
    let d = car.h - camH; d = Math.atan2(Math.sin(d), Math.cos(d));
    camH += d * (1 - Math.exp(-4.5 * dt));
    const speed = Math.hypot(car.vx, car.vz);
    const want = 8.2 + Math.min(speed, 35) * 0.085;
    const bx = -Math.cos(camH), bz = -Math.sin(camH);
    let limit = col.ray(car.x, car.z, bx, bz, want + 1.5);
    let target = Math.max(2.6, Math.min(want, limit - 1.2));
    if (target <= 2.6 && col.inside(car.x + bx * 2.6, car.z + bz * 2.6, 4)) target = 1.4;
    camD = target < camD ? target : camD + (target - camD) * Math.min(1, 2.2 * dt);
    const t = (camD - 1.4) / 7;
    const height = 2.4 + Math.min(1, Math.max(0, t)) * 1.7 + speed * 0.012;
    const px = car.x + bx * camD, pz = car.z + bz * camD;
    camPos.set(px, height, pz);
    camera.position.copy(camPos);
    camera.lookAt(car.x + Math.cos(camH) * 7, 0.9, car.z + Math.sin(camH) * 7);
    const fov = 62 + Math.min(1, speed / 35) * 8;
    if (Math.abs(camera.fov - fov) > 0.2) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  function poseCar(dt) {
    taxi.outer.position.set(car.x, 0.18, car.z);
    taxi.outer.rotation.y = -car.h;
    const roll = THREE.MathUtils.clamp(-car.steer * Math.abs(car.speed) * 0.0035 + car.lat * 0.01, -0.12, 0.12);
    taxi.inner.rotation.x = THREE.MathUtils.lerp(taxi.inner.rotation.x, roll, Math.min(1, 8 * dt));
    taxi.inner.rotation.z = THREE.MathUtils.lerp(taxi.inner.rotation.z, 0, Math.min(1, 8 * dt));
  }

  // schermata iniziale
  $('screen-load').hidden = true;
  $('screen-start').hidden = false;
  let playing = false;
  function beginRun() {
    car.place(sx, sz, startH); camH = startH; camD = 8; input.override = null; input.keys.clear();
    run.state = 'running'; run.t = 0; run.warned = false; playing = true;
    $('screen-start').hidden = true; $('screen-end').hidden = true; $('hud').hidden = false; $('controls').hidden = false;
  }
  function finishRun() {
    run.state = 'done'; playing = false; input.override = null;
    const prev = loadBest(target.id), isNew = !prev || run.t < prev;
    if (isNew) saveBest(target.id, run.t);
    $('end-time').textContent = fmt(run.t);
    const el = $('end-best'); el.classList.toggle('new', isNew);
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
    const portrait = innerHeight > innerWidth;
    if (playing && !portrait && dt > 0) {
      const inp = input.value, n = Math.ceil(dt / (1 / 90)), h = dt / n;
      for (let i = 0; i < n; i++) car.step(h, inp, col, world.meta.bounds);
      if (car.needsRescue()) rescue();
      run.t += Math.min(0.25, (now - lastT) / 1000);
      const d = Math.hypot(target.x - car.x, target.z - car.z);
      if (d < target.r) {
        if (Math.abs(car.speed) < STOP_SPEED) finishRun();
        else if (!run.warned) { run.warned = true; toast('Fermati nel cerchio'); }
      } else run.warned = false;
    }
    lastT = now;
    world.update(car.x, car.z, 1);
    poseCar(dt); updateCamera(dt); fx.update(dt, car, camera); labels.update(dt, car, camH);
    if (run.state === 'running') {
      $('kmh').textContent = Math.round(Math.abs(car.speed) * 3.6);
      $('time').textContent = fmt(run.t);
      const dx = target.x - car.x, dz = target.z - car.z;
      $('dist').textContent = `${Math.round(Math.hypot(dx, dz))} m`;
      $('arrow').style.transform = `rotate(${Math.atan2(dz, dx) - camH}rad)`;
      mini.update(dt, car, target);
    }
    renderer.render(scene, camera);

    // pixel ratio adattivo
    frames++; fpsT += dt;
    if (fpsT >= 2) {
      fps = frames / fpsT; frames = 0; fpsT = 0;
      if (playing && fps < 27 && pixelRatio > 0.7) { pixelRatio = Math.max(0.7, pixelRatio - 0.15); renderer.setPixelRatio(pixelRatio); resize(); }
    }
  }
  requestAnimationFrame(frame);

  window.__taxi = { target, run, startPos: [sx, sz, startH], car, world, col, roads, input, camera, scene, renderer, get fps() { return fps; }, start() { $('go').click(); }, rescue, free };
  if (DEBUG) { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:8px;top:8px;font:12px monospace;color:#fff;text-shadow:0 1px 2px #000;z-index:9;pointer-events:none'; document.body.append(d); setInterval(() => { d.textContent = `fps ${fps.toFixed(0)} pr ${pixelRatio.toFixed(2)} cells ${world.cells.size} calls ${renderer.info.render.calls} tris ${renderer.info.render.triangles}`; }, 500); }
}

initPWA();
boot().catch((e) => { console.error(e); $('load-msg').textContent = `Errore: ${e.message}`; });
