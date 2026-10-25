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
  html, body { width: 100%; height: 100%; overflow: hidden; font-family: 'Instrument Sans', Roboto, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  h1 { font-family: 'Bricolage Grotesque', 'Instrument Sans', system-ui, sans-serif; }
  @keyframes rise { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  .rise { opacity: 0; animation: rise .8s cubic-bezier(.2,.7,.2,1) forwards; }
  .fade { opacity: 0; animation: fade 1s ease forwards; }
`;

/**
 * One color per section, exactly as the Lesson Planner's stack draws its step
 * types (step-types.ts on the Lesson Planner branch): accent for marks, tint
 * for grounds, text for small type.
 */
const BLUE = { accent: '#5E7DB8', tint: '#DCE4F2', text: '#2B4370' }; // context
const TEAL = { accent: '#3E9A84', tint: '#D5EBE5', text: '#1F5C4E' }; // read-aloud
const PINK = { accent: '#C2577F', tint: '#F6DCE6', text: '#7A2550' }; // Daily Pages
const PURPLE = { accent: '#7B4FB0', tint: '#F4EEF9', text: '#7B4FB0' }; // writing
// The stack's own green reads olive on a full-bleed ground, so Revision takes
// a clear emerald instead. Gold's tint reads as tan and coral as orange, so
// neither is a ground here.
const EMERALD = { accent: '#2E9E6B', tint: '#D7F0E3', text: '#17603F' };
export const SECTION_COLORS = [BLUE, TEAL, PINK, EMERALD, BLUE, PURPLE, TEAL, PINK];
const STRIPE = [BLUE, TEAL, PURPLE, PINK, EMERALD].map((c, i) => `${c.accent} ${i * 20}% ${(i + 1) * 20}%`).join(', ');
const HEAD = `'Bricolage Grotesque', 'Instrument Sans', system-ui, sans-serif`;
const BODY = `'Instrument Sans', Roboto, system-ui, sans-serif`;

export function sectionCard({ n, total, title, sub }) {
  const color = SECTION_COLORS[(n - 1) % SECTION_COLORS.length];
  const dots = Array.from({ length: total }, (_, i) =>
    `<i style="width:${i + 1 === n ? 46 : 14}px;background:${i + 1 <= n ? SECTION_COLORS[i % SECTION_COLORS.length].accent : 'rgba(28,26,23,.14)'}"></i>`,
  ).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}
    body { background: ${color.tint}; color: #1C1A17; font-family: ${BODY}; }
    .wrap { position: absolute; inset: 0; padding: 0 600px 0 140px; display: flex; flex-direction: column; justify-content: center; }
    .logo { position: absolute; top: 48px; left: 140px; width: 78px; height: 78px; }
    .eyebrow { font-size: 24px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${color.text}; }
    h1 { font-family: ${HEAD}; font-size: 92px; line-height: 1.02; font-weight: 800; letter-spacing: -0.035em; margin-top: 22px; }
    p { font-size: 34px; line-height: 1.35; color: ${color.text}; margin-top: 30px; font-weight: 500; }
    .panel { position: absolute; top: 150px; right: 140px; bottom: 150px; width: 380px; border-radius: 36px; background: #FFFFFF;
      display: flex; align-items: center; justify-content: center; overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,.06), 0 24px 48px -12px rgba(0,0,0,.22), 0 60px 110px -30px rgba(0,0,0,.30); }
    .panel span { font-family: ${HEAD}; font-size: 400px; font-weight: 800; line-height: 1; color: ${color.accent}; letter-spacing: -0.05em; }
    .dots { position: absolute; bottom: 64px; left: 140px; display: flex; gap: 10px; }
    .dots i { display: block; height: 12px; border-radius: 999px; }
  </style></head><body>
    <img class="logo fade" src="${logo('logo_for_light_mode.png')}" alt="">
    <div class="wrap">
      <div class="eyebrow rise" style="animation-delay:.05s">Part ${n} of ${total}</div>
      <h1 class="rise" style="animation-delay:.2s">${escape(title)}</h1>
      ${sub ? `<p class="rise" style="animation-delay:.55s">${escape(sub)}</p>` : ''}
    </div>
    <div class="panel rise" style="animation-delay:.1s"><span>${n}</span></div>
    <div class="dots fade" style="animation-delay:.4s">${dots}</div>
  </body></html>`;
}

export function openingCard({ kicker, title, sub }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}
    body { background: #1F3532; color: #FFFEFA; }
    body::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 16px; background: linear-gradient(90deg, ${STRIPE}); }
    .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 120px; }
    img { width: 430px; }
    .kicker { margin-top: 34px; font-size: 30px; font-weight: 700; letter-spacing: .02em; color: #D5EBE5; }
    h1 { margin-top: 20px; font-size: 70px; line-height: 1.1; font-weight: 800; letter-spacing: -0.025em; max-width: 1240px; }
    p { margin-top: 26px; font-size: 34px; color: #C9D3CF; }
  </style></head><body><div class="wrap">
    <img class="fade" src="${logo('yawp_white_logo.png')}" alt="Yawp!">
    <div class="kicker rise" style="animation-delay:.35s">${escape(kicker)}</div>
    <h1 class="rise" style="animation-delay:.6s">${escape(title)}</h1>
    <p class="rise" style="animation-delay:1.1s">${escape(sub)}</p>
  </div></body></html>`;
}

const pine = `
    body { background: #1F3532; color: #FFFEFA; font-family: ${BODY}; }
    body::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 16px; background: linear-gradient(90deg, ${STRIPE}); }
    .logo { display: block; width: 180px; margin: 0 auto; }
    small { position: absolute; bottom: 34px; left: 0; right: 0; text-align: center; font-size: 18px; color: #93A39E; }
`;

/**
 * Closing card 1: who Yawp! is for, one line at a time. The lines wait for
 * `body.play` (set once recording starts) so the first one is never missed.
 */
export function closingStackCard({ lines, stepMs = 1900 }) {
  const accents = [TEAL, BLUE, PINK];
  const rows = lines.map(({ who, what }, i) => `
    <div class="row" style="--c:${accents[i % accents.length].accent};--t:${accents[i % accents.length].tint};transition-delay:${i * stepMs}ms">
      <span class="who">${escape(who)}</span><span class="what">${escape(what)}</span>
    </div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}${pine}
    .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; gap: 20px; padding: 30px 150px 46px; }
    .wrap .logo { margin-bottom: 14px; }
    .row { display: flex; flex-direction: column; gap: 8px; padding: 22px 34px 24px; border-radius: 24px; background: rgba(255,255,255,.06);
      border-left: 10px solid var(--c); opacity: 0; transform: translateY(26px); transition: opacity .8s ease, transform .8s cubic-bezier(.2,.7,.2,1); }
    body.play .row { opacity: 1; transform: none; }
    .who { font-family: ${HEAD}; font-size: 24px; font-weight: 800; letter-spacing: .02em; color: var(--t); }
    .what { font-family: ${HEAD}; font-size: 40px; line-height: 1.12; font-weight: 700; letter-spacing: -0.02em; }
  </style></head><body>
    <div class="wrap"><img class="logo fade" src="${logo('yawp_white_logo.png')}" alt="Yawp!">${rows}</div>
  </body></html>`;
}

/** Closing card 2: the punchline. */
export function closingPunchlineCard({ line }) {
  const [before, after] = line.split(/,\s*(?=but )/);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}${pine}
    .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 180px; }
    .wrap .logo { margin-bottom: 44px; }
    h1 { font-size: 76px; line-height: 1.08; font-weight: 800; letter-spacing: -0.03em; text-wrap: balance; }
    h1 span { text-wrap: balance; }
    h1 .b { display: block; color: #D5EBE5; }
  </style></head><body>
    <div class="wrap"><img class="logo fade" src="${logo('yawp_white_logo.png')}" alt="Yawp!"><h1><span class="rise" style="display:block;animation-delay:.2s">${escape(before)}${after ? ',' : ''}</span>${after ? `<span class="b rise" style="animation-delay:1.3s">${escape(after)}</span>` : ''}</h1></div>
  </body></html>`;
}

/** A QR image as a data URI, or null to draw the placeholder. */
function qrSource(image) {
  if (!image) return null;
  const file = path.isAbsolute(image) ? image : path.join(here, image);
  const type = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.jpg') || file.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
  return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
}

/** Closing card 3: two QR codes (placeholders until the real ones arrive), the URL, the disclosure. */
export function closingQrCard({ codes, url, disclosure }) {
  const tiles = codes.map(({ label, sub, image }, i) => {
    const src = qrSource(image);
    return `<div class="tile rise" style="animation-delay:${0.25 + i * 0.3}s">
      <div class="qr">${src ? `<img src="${src}" alt="QR code: ${escape(label)}">` : '<span>QR code<br>coming soon</span>'}</div>
      <div class="label">${escape(label)}</div><div class="sub">${escape(sub)}</div>
    </div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}${pine}
    .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding-bottom: 30px; }
    .wrap .logo { margin-bottom: 30px; width: 160px; }
    .tiles { display: flex; gap: 110px; }
    .tile { display: flex; flex-direction: column; align-items: center; text-align: center; }
    .qr { width: 300px; height: 300px; border-radius: 24px; background: #FFFFFF; padding: 22px; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 4px rgba(0,0,0,.2), 0 30px 60px -20px rgba(0,0,0,.5); }
    .qr img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
    .qr span { width: 100%; height: 100%; border: 4px dashed #B8C4C0; border-radius: 16px; display: flex; align-items: center; justify-content: center;
      font-size: 24px; font-weight: 600; line-height: 1.3; color: #7A8A85; }
    .label { margin-top: 22px; font-family: ${HEAD}; font-size: 40px; font-weight: 800; letter-spacing: -0.02em; }
    .sub { margin-top: 6px; font-size: 22px; color: #C9D3CF; }
    .url { margin-top: 34px; font-family: ${HEAD}; font-size: 46px; font-weight: 800; color: #D5EBE5; letter-spacing: -0.02em; }
  </style></head><body>
    <div class="wrap"><img class="logo fade" src="${logo('yawp_white_logo.png')}" alt="Yawp!"><div class="tiles">${tiles}</div><div class="url rise" style="animation-delay:.9s">${escape(url)}</div></div>
    <small class="fade" style="animation-delay:1.2s">${escape(disclosure)}</small>
  </body></html>`;
}
