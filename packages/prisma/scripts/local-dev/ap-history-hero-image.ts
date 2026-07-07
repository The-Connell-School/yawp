// Card/hero art for the AP History Essay assignment type: a cheerful
// stick-figure historian in a tricorn hat holding a scroll and quill.
// Stored as an inline SVG so it stays crisp at any size and needs no
// binary asset checked into the repo. Seeded as an AssignmentTypeImage blob
// and served through the existing /api/image/course/:id route.

export const AP_HISTORY_HERO_IMAGE = {
  contentType: 'image/svg+xml',
  altText:
    'A cheerful stick-figure historian in a tricorn hat holding a scroll and a quill',
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480" width="480" height="480" role="img" aria-label="A cheerful stick figure historian in a tricorn hat holding a quill and a scroll">
  <defs>
    <linearGradient id="apHistoryHeroBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fdf6e3"/>
      <stop offset="1" stop-color="#f4e7c9"/>
    </linearGradient>
    <linearGradient id="apHistoryHeroScroll" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffdf7"/>
      <stop offset="1" stop-color="#f0e2bf"/>
    </linearGradient>
  </defs>

  <rect width="480" height="480" fill="url(#apHistoryHeroBg)"/>

  <path d="M40 300 Q240 220 440 300" fill="none" stroke="#c9b184" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>
  <circle cx="40" cy="300" r="5" fill="#b08d57"/>
  <circle cx="240" cy="243" r="5" fill="#b08d57"/>
  <circle cx="440" cy="300" r="5" fill="#b08d57"/>
  <text x="240" y="60" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="30" font-weight="bold" fill="#7a5a2e" letter-spacing="4">APUSH</text>
  <text x="240" y="88" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="#a07c42" letter-spacing="2">DBQ &#183; LEQ</text>

  <ellipse cx="215" cy="420" rx="90" ry="12" fill="#000" opacity="0.08"/>

  <g stroke="#2f2a24" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M205 415 L192 340"/>
    <path d="M205 415 L236 348"/>
    <path d="M205 240 L205 348"/>
    <path d="M205 275 L150 300"/>
    <path d="M205 268 L268 226"/>
  </g>

  <circle cx="205" cy="212" r="30" fill="#ffe0b2" stroke="#2f2a24" stroke-width="7"/>
  <circle cx="196" cy="208" r="3.4" fill="#2f2a24"/>
  <circle cx="214" cy="208" r="3.4" fill="#2f2a24"/>
  <path d="M193 220 Q205 231 217 220" fill="none" stroke="#2f2a24" stroke-width="4" stroke-linecap="round"/>

  <g fill="#3b4a63" stroke="#26324a" stroke-width="4" stroke-linejoin="round">
    <path d="M162 194 Q205 150 248 194 Q205 176 162 194 Z"/>
    <path d="M205 156 L221 190 L189 190 Z"/>
  </g>
  <circle cx="205" cy="182" r="4" fill="#e8c24a"/>

  <g transform="rotate(-14 135 305)">
    <rect x="108" y="286" width="54" height="40" rx="5" fill="url(#apHistoryHeroScroll)" stroke="#b79a63" stroke-width="3"/>
    <circle cx="108" cy="306" r="8" fill="#e9dcb8" stroke="#b79a63" stroke-width="3"/>
    <circle cx="162" cy="306" r="8" fill="#e9dcb8" stroke="#b79a63" stroke-width="3"/>
    <line x1="120" y1="298" x2="150" y2="298" stroke="#c3ab77" stroke-width="2.5"/>
    <line x1="120" y1="307" x2="150" y2="307" stroke="#c3ab77" stroke-width="2.5"/>
    <line x1="120" y1="316" x2="142" y2="316" stroke="#c3ab77" stroke-width="2.5"/>
  </g>

  <g stroke-linecap="round">
    <line x1="268" y1="226" x2="300" y2="150" stroke="#2f2a24" stroke-width="4"/>
    <path d="M300 150 Q322 168 300 196 Q292 172 300 150 Z" fill="#d9534f" stroke="#a33" stroke-width="2"/>
  </g>
</svg>`,
} as const;

export function apHistoryHeroImageBytes(): Buffer {
  return Buffer.from(AP_HISTORY_HERO_IMAGE.svg, 'utf8');
}
