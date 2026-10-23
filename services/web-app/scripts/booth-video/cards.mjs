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
const GREEN = { accent: '#6E8F3C', tint: '#E3E9D4', text: '#3D5220' }; // thesis essay
const PURPLE = { accent: '#7B4FB0', tint: '#F4EEF9', text: '#7B4FB0' }; // writing
// Gold's tint reads as tan and coral as orange, so neither is a ground here.
export const SECTION_COLORS = [BLUE, TEAL, PINK, GREEN, BLUE, PURPLE, TEAL];
const STRIPE = [BLUE, TEAL, PURPLE, PINK, GREEN].map((c, i) => `${c.accent} ${i * 20}% ${(i + 1) * 20}%`).join(', ');
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

export function closingCard({ title, url, sub, disclosure }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}
    body { background: #1F3532; color: #FFFEFA; }
    body::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 16px; background: linear-gradient(90deg, ${STRIPE}); }
    .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    img { width: 470px; }
    h1 { margin-top: 36px; font-size: 64px; font-weight: 800; letter-spacing: -0.025em; }
    .url { margin-top: 18px; font-size: 76px; font-weight: 800; color: #F3E3C8; letter-spacing: -0.02em; }
    p { margin-top: 22px; font-size: 32px; color: #C9D3CF; }
    small { position: absolute; bottom: 34px; left: 0; right: 0; text-align: center; font-size: 18px; color: #93A39E; }
  </style></head><body><div class="wrap">
    <img class="fade" src="${logo('yawp_white_logo.png')}" alt="Yawp!">
    <h1 class="rise" style="animation-delay:.3s">${escape(title)}</h1>
    <div class="url rise" style="animation-delay:.6s">${escape(url)}</div>
    <p class="rise" style="animation-delay:.9s">${escape(sub)}</p>
  </div><small class="fade" style="animation-delay:1.2s">${escape(disclosure)}</small></body></html>`;
}
