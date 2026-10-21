// Genera icons/*.png da un SVG (richiede playwright): node tools/make_icons.mjs
import { chromium } from 'playwright';
const art = (s) => `
<g transform="translate(${s / 2} ${s / 2}) scale(${s / 512}) translate(-256 -256)">
  <rect x="170" y="146" width="172" height="46" rx="12" fill="#ffc928"/>
  <text x="256" y="180" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="34" text-anchor="middle" fill="#14181d">TAXI</text>
  <path d="M96 318 L140 214 Q150 190 176 190 L336 190 Q362 190 372 214 L416 318 Z" fill="#f3f1ea"/>
  <path d="M158 296 L184 226 Q188 214 200 214 L312 214 Q324 214 328 226 L354 296 Z" fill="#23303a"/>
  <rect x="72" y="296" width="368" height="78" rx="26" fill="#f3f1ea"/>
  <rect x="72" y="338" width="368" height="22" fill="#ffc928"/>
  <circle cx="160" cy="378" r="38" fill="#0e1114"/><circle cx="160" cy="378" r="16" fill="#8b929a"/>
  <circle cx="352" cy="378" r="38" fill="#0e1114"/><circle cx="352" cy="378" r="16" fill="#8b929a"/>
</g>`;
const svg = (s, maskable) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="#14181d" ${maskable ? '' : `rx="${s * 0.22}"`}/>
  ${art(maskable ? s * 0.66 : s * 0.86).replace('translate(' + (maskable ? s * 0.66 : s * 0.86) / 2, 'translate(' + s / 2)}
</svg>`;
const b = await chromium.launch(); const p = await b.newPage();
for (const [name, size, mask] of [['icon-192', 192, false], ['icon-512', 512, false], ['icon-maskable-512', 512, true]]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<body style="margin:0;background:transparent">${svg(size, mask)}</body>`);
  await p.screenshot({ path: `icons/${name}.png`, omitBackground: true });
}
await b.close();
