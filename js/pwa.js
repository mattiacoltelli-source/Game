import { VERSION } from './version.js';

// Registra il service worker e mostra il banner "Aggiorna" quando c'è una nuova versione pronta.
const CHECK_EVERY = 30 * 60 * 1000;

export function initPWA() {
  const ver = document.getElementById('version'); if (ver) ver.textContent = `v${VERSION}`;
  // guida all'installazione: passi diversi per iPhone/Safari, iPhone con altri browser, Android (Chrome, Samsung, Firefox)
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone, ua = navigator.userAgent, ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const iosSafari = ios && /safari/i.test(ua) && !/crios|fxios|edgios|opios|gsa\//i.test(ua), android = /android/i.test(ua);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|BytedanceWebview|Twitter|LinkedInApp|Pinterest|; wv\)|\bwv\b/i.test(ua) || (ios && !/safari/i.test(ua) && !standalone);
  const link = location.origin + location.pathname;
  const copy = async (btn) => { try { await navigator.clipboard.writeText(link); btn.textContent = 'Link copiato ✓'; } catch (e) { prompt('Copia il link:', link); } };
  const banner0 = document.getElementById('inapp');
  if (banner0 && inApp && !standalone) {
    banner0.hidden = false; const o = document.getElementById('inapp-open'), c = document.getElementById('inapp-copy');
    if (android) { o.href = `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;end`; o.hidden = false; }
    c.addEventListener('click', () => copy(c));
  }
  const how = document.getElementById('howto'), txt = document.getElementById('howto-txt');
  if (how && !standalone) {
    how.hidden = false;
    const steps = iosSafari ? '<ol><li>Tocca <b>Condividi</b> (il quadrato con la freccia in su) in basso.</li><li>Scorri e scegli <b>«Aggiungi alla schermata Home»</b>.</li><li>Tocca <b>Aggiungi</b>: trovi l\'icona nella Home.</li><li>Se l\'icona non c\'è: Impostazioni → Safari → Avanzate → Dati dei siti web → cancella il sito, poi riprova.</li></ol>'
      : ios ? '<ol><li>Su iPhone si installa <b>solo da Safari</b>.</li><li>Copia il link qui sotto, aprilo in Safari e scegli Condividi → «Aggiungi alla schermata Home».</li></ol>'
      : android ? '<ol><li>Apri il menu <b>⋮</b> del browser (in alto a destra).</li><li>Scegli <b>«Installa app»</b> oppure «Aggiungi a schermata Home».</li><li>Se non c\'è, apri il link in <b>Chrome</b>.</li><li>Se dice <b>«già installata»</b> ma non la trovi: Impostazioni del telefono → App → «Taxi Bologna» → Disinstalla. Poi in Chrome: ⋮ → Impostazioni → Impostazioni sito → Tutti i siti → mattiacoltelli-source.github.io → Cancella e reimposta. Riapri il link e riprova.</li></ol>'
      : '<ol><li>Chrome/Edge: icona <b>Installa</b> nella barra degli indirizzi.</li><li>Oppure menu ⋮ → «Installa Taxi Bologna».</li></ol>';
    txt.innerHTML = steps + '<p>Si gioca bene anche senza installare.</p><button class="ghost" id="howto-copy" type="button">Copia link del gioco</button>';
    how.addEventListener('click', () => { txt.hidden = !txt.hidden; const c = document.getElementById('howto-copy'); if (c && !c.onclick) c.onclick = () => copy(c); });
  }
  // Stato installazione: cosa vede il browser (per capire perché dice «già installata» o non propone l'installazione)
  const stBtn = document.getElementById('install-state'), stTxt = document.getElementById('install-state-txt'); let promptSeen = false; addEventListener('beforeinstallprompt', () => { promptSeen = true; });
  if (stBtn) {
    stBtn.hidden = false;
    stBtn.addEventListener('click', async () => {
      stTxt.hidden = false; stTxt.textContent = 'Controllo…'; const L = [];
      const yn = (v) => (v ? 'sì' : 'no');
      L.push(`Aperta come app installata: ${yn(standalone)}`, `Browser: ${/crios/i.test(ua) ? 'Chrome iPhone' : /fxios/i.test(ua) ? 'Firefox iPhone' : /edgios/i.test(ua) ? 'Edge iPhone' : iosSafari ? 'Safari iPhone' : android ? 'Android' : 'altro'}`, `Browser interno (Instagram, ecc.): ${yn(inApp)}`);
      try { const r = await fetch('manifest.webmanifest', { cache: 'no-store' }); const m = await r.json(); L.push(`Manifest: ok (${m.name}, id ${m.id || '-'})`); } catch (e) { L.push('Manifest: NON si legge'); }
      try { const regs = await navigator.serviceWorker.getRegistrations(); L.push(`Service worker: ${regs.length ? 'attivo' : 'non registrato'}${regs[0] && regs[0].active ? ' (pronto)' : ''}`); const keys = await caches.keys(); L.push(`Cache offline: ${keys.length ? keys.length + ' (ok)' : 'vuota'}`); } catch (e) { L.push('Service worker: non disponibile'); }
      L.push(`Il browser propone l'installazione: ${yn(promptSeen)}`);
      try { if (navigator.getInstalledRelatedApps) { const a = await navigator.getInstalledRelatedApps(); L.push(`Il browser vede app già installate: ${a.length ? 'sì' : 'no'}`); } } catch (e) { /* non supportato */ }
      L.push(`Indirizzo: ${location.origin}${location.pathname}`);
      stTxt.textContent = L.join('\n'); const cp = document.createElement('button'); cp.className = 'ghost'; cp.type = 'button'; cp.textContent = 'Copia'; cp.onclick = async () => { try { await navigator.clipboard.writeText(L.join('\n')); cp.textContent = 'Copiato ✓'; } catch (e) { prompt('Copia:', L.join('\n')); } }; stTxt.appendChild(document.createElement('br')); stTxt.appendChild(cp);
    });
  }
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
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; if (inst) inst.hidden = false; if (how) how.hidden = true; });
  if (inst) inst.addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; inst.hidden = true; });
  addEventListener('appinstalled', () => { if (inst) inst.hidden = true; });
}
