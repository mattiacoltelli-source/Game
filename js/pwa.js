import { VERSION } from './version.js';

// Registra il service worker e mostra il banner "Aggiorna" quando c'è una nuova versione pronta.
const CHECK_EVERY = 30 * 60 * 1000;

export function initPWA() {
  const ver = document.getElementById('version'); if (ver) ver.textContent = `v${VERSION}`;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname) && !location.search.includes('sw');
  if (!('serviceWorker' in navigator) || local) return;

  const banner = document.getElementById('update'), btn = document.getElementById('update-btn');
  let reloading = false, wantUpdate = false;
  const offer = (worker) => {
    banner.hidden = false;
    btn.onclick = () => { wantUpdate = true; btn.disabled = true; btn.textContent = 'Aggiorno…'; worker.postMessage('SKIP_WAITING'); };
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (wantUpdate && !reloading) { reloading = true; location.reload(); } });

  navigator.serviceWorker.register('sw.js').then((reg) => {
    const watch = (w) => w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => reg.installing && watch(reg.installing));
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, CHECK_EVERY);
    window.__pwaCheck = check;
  }).catch((e) => console.warn('Service worker non registrato', e));

  // pulsante "Installa app" (Chrome/Android)
  let deferred = null; const inst = document.getElementById('install');
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; if (inst) inst.hidden = false; });
  if (inst) inst.addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; inst.hidden = true; });
  addEventListener('appinstalled', () => { if (inst) inst.hidden = true; });
}
