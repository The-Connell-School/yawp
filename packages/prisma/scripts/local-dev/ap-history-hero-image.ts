// Card/hero art for the AP History Essay assignment type: a friendly
// stick-figure historian in a tricorn hat holding up a sealed historical
// document (a document-based question in miniature). Stored as an inline SVG
// so it stays crisp at any size and needs no binary asset checked into the
// repo. Seeded as an AssignmentTypeImage blob and served through the existing
// /api/image/course/:id route.

export const AP_HISTORY_HERO_IMAGE = {
  contentType: 'image/svg+xml',
  altText:
    'A friendly stick-figure historian in a tricorn hat holding up a sealed historical document',
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480" width="480" height="480" role="img" aria-label="A friendly stick figure in a tricorn hat holding up a historical document">
  <defs>
    <linearGradient id="apHistoryHeroBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fdf6e6"/>
      <stop offset="1" stop-color="#f2e6c9"/>
    </linearGradient>
    <linearGradient id="apHistoryHeroDoc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffdf6"/>
      <stop offset="1" stop-color="#f3e8ca"/>
    </linearGradient>
  </defs>

  <rect width="480" height="480" fill="url(#apHistoryHeroBg)"/>

  <text x="240" y="66" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="34" font-weight="bold" fill="#7a5a2e" letter-spacing="6">APUSH</text>
  <text x="240" y="94" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#a8823f" letter-spacing="3">DBQ &#183; LEQ</text>

  <ellipse cx="240" cy="430" rx="80" ry="11" fill="#000" opacity="0.07"/>

  <g stroke="#2f2a24" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M240 205 L240 320"/>
    <path d="M240 320 L219 392"/>
    <path d="M240 320 L261 392"/>
    <path d="M240 224 L198 250 L188 286"/>
    <path d="M240 224 L282 250 L292 286"/>
  </g>

  <circle cx="240" cy="175" r="30" fill="#ffe0b2" stroke="#2f2a24" stroke-width="7"/>
  <circle cx="231" cy="172" r="3.2" fill="#2f2a24"/>
  <circle cx="249" cy="172" r="3.2" fill="#2f2a24"/>
  <path d="M229 184 Q240 194 251 184" fill="none" stroke="#2f2a24" stroke-width="4" stroke-linecap="round"/>

  <g fill="#3b4a63" stroke="#26324a" stroke-width="4" stroke-linejoin="round">
    <path d="M197 157 Q240 116 283 157 Q240 138 197 157 Z"/>
    <path d="M240 120 L256 153 L224 153 Z"/>
  </g>
  <circle cx="240" cy="146" r="4" fill="#e8c24a"/>

  <g transform="rotate(-3 240 292)">
    <rect x="180" y="250" width="120" height="96" rx="4" fill="url(#apHistoryHeroDoc)" stroke="#b79a63" stroke-width="3"/>
    <line x1="196" y1="272" x2="284" y2="272" stroke="#5a4a2a" stroke-width="3"/>
    <line x1="196" y1="288" x2="284" y2="288" stroke="#c3ab77" stroke-width="2.5"/>
    <line x1="196" y1="300" x2="284" y2="300" stroke="#c3ab77" stroke-width="2.5"/>
    <line x1="196" y1="312" x2="284" y2="312" stroke="#c3ab77" stroke-width="2.5"/>
    <line x1="196" y1="324" x2="256" y2="324" stroke="#c3ab77" stroke-width="2.5"/>
    <circle cx="270" cy="326" r="12" fill="#c0392b" stroke="#8f271c" stroke-width="2"/>
    <path d="M265 326 l4 4 l7 -8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <circle cx="188" cy="286" r="7" fill="#ffe0b2" stroke="#2f2a24" stroke-width="4"/>
  <circle cx="292" cy="286" r="7" fill="#ffe0b2" stroke="#2f2a24" stroke-width="4"/>
</svg>`,
} as const;

export function apHistoryHeroImageBytes(): Buffer {
  return Buffer.from(AP_HISTORY_HERO_IMAGE.svg, 'utf8');
}
