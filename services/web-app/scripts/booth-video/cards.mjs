/**
 * Full-screen title cards for the booth video, as self-contained HTML (the
 * logo is inlined) rendered in the same browser window that records the app.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const logo = (file) =>
  `data:image/png;base64,${fs.readFileSync(path.join(here, '../../public/img', file)).toString('base64')}`;
const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const base = `
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; font-family: Roboto, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  @keyframes rise { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  .rise { opacity: 0; animation: rise .8s cubic-bezier(.2,.7,.2,1) forwards; }
  .fade { opacity: 0; animation: fade 1s ease forwards; }
`;

export function sectionCard({ n, total, title, sub }) {
  const dots = Array.from({ length: total }, (_, i) =>
    `<i style="width:${i + 1 === n ? 46 : 14}px;background:${i + 1 < n ? 'rgba(210,113,81,.45)' : i + 1 === n ? '#D27151' : '#DCD7C8'}"></i>`,
  ).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}
    body { background: #F7F5EE; color: #27251A; }
    .wrap { position: absolute; inset: 0; padding: 0 140px; display: flex; flex-direction: column; justify-content: center; }
    .logo { position: absolute; top: 48px; left: 140px; width: 78px; height: 78px; }
    .eyebrow { font-size: 24px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #D27151; }
    h1 { font-size: 92px; line-height: 1.04; font-weight: 800; letter-spacing: -0.03em; margin-top: 22px; max-width: 1180px; }
    p { font-size: 36px; line-height: 1.35; color: #6b6859; margin-top: 30px; max-width: 1100px; }
    .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 18px; background: #D27151; }
    .dots { position: absolute; bottom: 64px; left: 140px; display: flex; gap: 10px; }
    .dots i { display: block; height: 12px; border-radius: 999px; transition: width .6s ease; }
  </style></head><body>
    <div class="bar"></div>
    <img class="logo fade" src="${logo('logo_for_light_mode.png')}" alt="">
    <div class="wrap">
      <div class="eyebrow rise" style="animation-delay:.05s">Part ${n} of ${total}</div>
      <h1 class="rise" style="animation-delay:.2s">${escape(title)}</h1>
      ${sub ? `<p class="rise" style="animation-delay:.55s">${escape(sub)}</p>` : ''}
    </div>
    <div class="dots fade" style="animation-delay:.4s">${dots}</div>
  </body></html>`;
}

export function openingCard({ kicker, title, sub }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}
    body { background: #27251A; color: #FFFEFA; }
    .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 120px; }
    img { width: 430px; }
    .kicker { margin-top: 34px; font-size: 30px; font-weight: 700; letter-spacing: .02em; color: #E39478; }
    h1 { margin-top: 20px; font-size: 70px; line-height: 1.1; font-weight: 800; letter-spacing: -0.025em; max-width: 1240px; }
    p { margin-top: 26px; font-size: 34px; color: #CFCBBE; }
  </style></head><body><div class="wrap">
    <img class="fade" src="${logo('yawp_white_logo.png')}" alt="Yawp!">
    <div class="kicker rise" style="animation-delay:.35s">${escape(kicker)}</div>
    <h1 class="rise" style="animation-delay:.6s">${escape(title)}</h1>
    <p class="rise" style="animation-delay:1.1s">${escape(sub)}</p>
  </div></body></html>`;
}

export function closingCard({ title, url, sub, disclosure }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}
    body { background: #27251A; color: #FFFEFA; }
    .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    img { width: 470px; }
    h1 { margin-top: 36px; font-size: 64px; font-weight: 800; letter-spacing: -0.025em; }
    .url { margin-top: 18px; font-size: 76px; font-weight: 800; color: #E07F5E; letter-spacing: -0.02em; }
    p { margin-top: 22px; font-size: 32px; color: #CFCBBE; }
    small { position: absolute; bottom: 34px; left: 0; right: 0; text-align: center; font-size: 18px; color: #8f8b7c; }
  </style></head><body><div class="wrap">
    <img class="fade" src="${logo('yawp_white_logo.png')}" alt="Yawp!">
    <h1 class="rise" style="animation-delay:.3s">${escape(title)}</h1>
    <div class="url rise" style="animation-delay:.6s">${escape(url)}</div>
    <p class="rise" style="animation-delay:.9s">${escape(sub)}</p>
  </div><small class="fade" style="animation-delay:1.2s">${escape(disclosure)}</small></body></html>`;
}
