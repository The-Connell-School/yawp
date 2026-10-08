import { guideOutline } from './guide';
import type { MarketingStoryboard, StoryboardScene } from './storyboard';

/**
 * Turns a rendered guide storyboard into one self-contained HTML page: the
 * same shape as the in-app "See how it works" guides (docs/how-to-guides.md),
 * with every still and clip inlined so the file can be emailed, attached to a
 * district proposal, dropped on a website, or printed as-is.
 *
 * The page carries no script and loads nothing from the network. The studio
 * serves it under a sandbox CSP, and a guide that needs neither keeps working
 * wherever it is opened.
 */

export type GuideSceneMedia = {
  /** The scene's still: a data: URI, or a sibling file name. */
  image?: string;
  /** The scene's looping clip, when one was cut for it. */
  clip?: string;
};

export type GuideDocumentParams = {
  storyboard: MarketingStoryboard;
  /** Media keyed by scene id. */
  media: Record<string, GuideSceneMedia>;
  /** Where the footer button points. Left as a plain label when absent. */
  startUrl?: string;
};

const SAFE_MEDIA =
  /^(data:(image\/(png|jpeg|webp)|video\/mp4);base64,[A-Za-z0-9+/=]+|[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpe?g|webp|mp4))$/;

function safeMedia(src: string | undefined): string | undefined {
  return src && SAFE_MEDIA.test(src) ? src : undefined;
}

function safeLink(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function headlineHtml(headline: string, highlight: string | undefined) {
  if (!highlight || !headline.includes(highlight)) return escapeHtml(headline);
  const at = headline.indexOf(highlight);
  return `${escapeHtml(headline.slice(0, at))}<mark>${escapeHtml(
    highlight
  )}</mark>${escapeHtml(headline.slice(at + highlight.length))}`;
}

function list(items: string[], className = '') {
  if (items.length === 0) return '';
  const cls = className ? ` class="${className}"` : '';
  return `<ul${cls}>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

/** A clip loops silently like the in-app guides; prints fall back to its still. */
function mediaHtml(
  scene: StoryboardScene | undefined,
  media: Record<string, GuideSceneMedia>,
  alt: string
): string {
  if (!scene) return '';
  const image = safeMedia(media[scene.id]?.image);
  const clip = safeMedia(media[scene.id]?.clip);
  const label = escapeHtml(alt);
  if (clip) {
    const poster = image ? ` poster="${image}"` : '';
    const printStill = image
      ? `<img class="print-only" src="${image}" alt="${label}">`
      : '';
    return `<div class="shot"><video autoplay muted loop playsinline${poster} src="${clip}" aria-label="${label}"></video>${printStill}</div>`;
  }
  if (image) {
    return `<div class="shot"><img src="${image}" alt="${label}"></div>`;
  }
  return '';
}

const STYLES = `
:root{--bg:#f6f3ea;--card:#fffdf8;--fg:#3a372b;--muted:#7c7a75;--accent:#d06a4b;--accent-soft:#f3dcd2;--line:#e4dfd2;--good:#3f7a52;--warn:#a2462b}
@media (prefers-color-scheme:dark){:root{--bg:#252524;--card:#2e2e2c;--fg:#c2bcae;--muted:#8f8c86;--accent:#e07253;--accent-soft:#4a3329;--line:#3d3d3a;--good:#79b48b;--warn:#e98f73}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1040px;margin:0 auto;padding:32px 16px 64px;display:flex;flex-direction:column;gap:72px}
.brand{font-weight:800;letter-spacing:.02em;color:var(--accent);font-size:15px}
.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:12px;font-weight:700;color:var(--accent);margin:0 0 8px}
h1{font-size:clamp(30px,5vw,48px);line-height:1.12;margin:0 0 16px}
h1 mark{background:none;color:var(--accent)}
h2{font-size:clamp(24px,3.4vw,32px);line-height:1.2;margin:0 0 12px}
h3{font-size:20px;line-height:1.3;margin:0 0 6px}
p{margin:0}
.lede{font-size:19px;color:var(--muted);max-width:60ch}
.hero{display:grid;gap:32px;align-items:center}
.row{display:grid;gap:24px;align-items:center}
@media (min-width:820px){.hero{grid-template-columns:1fr 1.15fr;gap:48px}.row{grid-template-columns:1fr 1.4fr;gap:40px}.row.flip>:first-child{order:2}}
.shot{border:1px solid var(--line);background:var(--card);border-radius:16px;padding:8px;box-shadow:0 12px 32px rgba(40,30,10,.12)}
.hero .shot{transform:rotate(1deg)}
.shot img,.shot video{display:block;width:100%;height:auto;border-radius:10px}
.steps{display:flex;flex-direction:column;gap:56px;margin-top:28px}
.step-n{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:999px;background:var(--accent);color:#fff;font-weight:700;font-size:15px;margin-bottom:10px}
ul{margin:12px 0 0;padding-left:20px}
li{margin:4px 0}
.chips{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.chips li{background:var(--accent-soft);border-radius:999px;padding:4px 14px;margin:0;font-size:15px}
.extras{display:grid;gap:32px;margin-top:24px}
@media (min-width:820px){.extras{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}}
.extras h3{margin-top:14px}
.willwont{display:grid;gap:20px;margin-top:20px}
@media (min-width:720px){.willwont{grid-template-columns:1fr 1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px}
.card h3{font-size:18px}
.will h3{color:var(--good)}
.wont h3{color:var(--warn)}
footer{border-top:1px solid var(--line);padding-top:28px;display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between}
footer p{color:var(--muted);font-size:14px;max-width:60ch}
.start{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;border-radius:999px;padding:10px 22px}
.shot .print-only{display:none}
@media (prefers-reduced-motion:reduce){.shot video{display:none}.shot .print-only{display:block}}
@media print{body{background:#fff}main{gap:36px;padding:0}.shot video{display:none}.shot .print-only{display:block}.shot{box-shadow:none;transform:none;break-inside:avoid}.step,.card{break-inside:avoid}}
`;

export function renderGuideDocument(params: GuideDocumentParams): string {
  const { storyboard, media } = params;
  const guide = storyboard.guide;
  const outline = guideOutline(storyboard);
  const title = escapeHtml(storyboard.title);
  const headline = guide?.headline ?? storyboard.title;

  const hero = `<header class="hero" data-guide="hero">
  <div>
    <p class="brand">YAWP!</p>
    <h1>${headlineHtml(headline, guide?.highlight)}</h1>
    ${guide?.lede ? `<p class="lede">${escapeHtml(guide.lede)}</p>` : ''}
  </div>
  ${mediaHtml(outline.hero, media, headline)}
</header>`;

  const canDo = guide?.canDo ?? [];
  const range =
    outline.range || canDo.length > 0
      ? `<section class="row" data-guide="range">
  <div>
    <p class="eyebrow">What it can do</p>
    <h2>${escapeHtml(outline.range?.guide?.heading ?? 'What it can do')}</h2>
    ${outline.range?.guide?.body ? `<p>${escapeHtml(outline.range.guide.body)}</p>` : ''}
    ${list(canDo)}
  </div>
  ${mediaHtml(outline.range, media, outline.range?.guide?.heading ?? 'What it can do')}
</section>`
      : '';

  const useCases = guide?.useCases ?? [];
  const steps =
    outline.steps.length > 0
      ? `<section data-guide="steps">
  <p class="eyebrow">How it works</p>
  <h2>${escapeHtml(guide?.workflowHeading ?? storyboard.title)}</h2>
  <div class="steps">
${outline.steps
  .map(
    (scene, index) => `    <div class="row step${index % 2 === 1 ? ' flip' : ''}">
      <div>
        <span class="step-n">${index + 1}</span>
        <h3>${escapeHtml(scene.guide?.heading ?? '')}</h3>
        <p>${escapeHtml(scene.guide?.body ?? '')}</p>
      </div>
      ${mediaHtml(scene, media, scene.guide?.heading ?? scene.id)}
    </div>`
  )
  .join('\n')}
  </div>
  ${
    useCases.length > 0
      ? `<div style="margin-top:40px"><h3>Where teachers use it</h3>${list(useCases, 'chips')}</div>`
      : ''
  }
</section>`
      : '';

  const extras =
    outline.extras.length > 0
      ? `<section data-guide="extras">
  <p class="eyebrow">More it can do</p>
  <div class="extras">
${outline.extras
  .map(
    (scene) => `    <div>
      ${mediaHtml(scene, media, scene.guide?.heading ?? scene.id)}
      <h3>${escapeHtml(scene.guide?.heading ?? '')}</h3>
      <p>${escapeHtml(scene.guide?.body ?? '')}</p>
    </div>`
  )
  .join('\n')}
  </div>
</section>`
      : '';

  const willWont =
    guide && (guide.will.length > 0 || guide.wont.length > 0)
      ? `<section data-guide="will-wont">
  <h2>What it will and won’t do</h2>
  <div class="willwont">
    <div class="card will"><h3>What it will do</h3>${list(guide.will)}</div>
    <div class="card wont"><h3>What it won’t do</h3>${list(guide.wont)}</div>
  </div>
</section>`
      : '';

  const startHref = safeLink(params.startUrl);
  const startLabel = guide?.startLabel ? escapeHtml(guide.startLabel) : '';
  const start = startLabel
    ? startHref
      ? `<a class="start" href="${escapeHtml(startHref)}">${startLabel}</a>`
      : `<span class="start">${startLabel}</span>`
    : '';
  const footer = `<footer data-guide="footer">
  ${guide?.footerNote ? `<p>${escapeHtml(guide.footerNote)}</p>` : '<p></p>'}
  ${start}
</footer>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
${[hero, range, steps, extras, willWont, footer].filter(Boolean).join('\n')}
</main>
</body>
</html>
`;
}
