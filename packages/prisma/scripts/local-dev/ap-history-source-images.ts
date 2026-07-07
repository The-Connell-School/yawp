// Self-hosted, illustrative stand-in images for the two curated AP History DBQ
// visual sources. Real rights-cleared Library of Congress scans can be dropped
// into the same imageBlob column later; these committed SVGs guarantee the
// "visual source" experience renders reliably in previews (no web egress) and
// are clearly labelled as renderings, with the original linked via provenance.

type FramedPrint = {
  title: string;
  date: string;
  attribution: string;
  scene: string;
};

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function framedPrint({ title, date, attribution, scene }: FramedPrint): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" width="640" height="480" role="img" aria-label="${esc(title)}, ${esc(date)} — illustrative rendering">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6ecd4"/>
      <stop offset="1" stop-color="#e7d5ab"/>
    </linearGradient>
  </defs>
  <rect width="640" height="480" fill="url(#paper)"/>
  <rect x="14" y="14" width="612" height="452" fill="none" stroke="#6b5222" stroke-width="3"/>
  <rect x="22" y="22" width="596" height="436" fill="none" stroke="#8a6c33" stroke-width="1.5"/>
  <text x="320" y="58" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="24" font-style="italic" fill="#4a3a17">${esc(title)}</text>
  <g stroke="#3f3115" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">${scene}</g>
  <text x="320" y="410" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#4a3a17">${esc(date)}</text>
  <text x="320" y="434" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="#755c2b">${esc(attribution)}</text>
  <g transform="translate(546 36) rotate(6)">
    <rect x="-52" y="-13" width="104" height="26" rx="4" fill="#b23b2e" opacity="0.9"/>
    <text x="0" y="4" text-anchor="middle" font-family="Georgia, serif" font-size="10" fill="#fff" letter-spacing="0.5">RENDERING</text>
  </g>
</svg>`;
}

export const AP_HISTORY_SOURCE_IMAGES: Record<
  string,
  { contentType: string; svg: string }
> = {
  'apush-dbq-american-independence-doc-7': {
    contentType: 'image/svg+xml',
    svg: framedPrint({
      title: 'The Bostonians Paying the Excise-Man',
      date: 'Hand-colored mezzotint, London, 1774',
      attribution:
        'After the Library of Congress Prints & Photographs original',
      scene: `
        <!-- Liberty Tree -->
        <path d="M150 300 L150 150"/>
        <path d="M150 165 Q110 135 92 170 M150 180 Q190 150 210 186 M150 150 Q135 120 150 104 Q165 120 150 150"/>
        <ellipse cx="150" cy="120" rx="66" ry="40"/>
        <!-- noose -->
        <path d="M150 165 L150 205 M144 205 a6 6 0 0 0 12 0"/>
        <!-- mob figure -->
        <circle cx="250" cy="205" r="14"/>
        <path d="M250 219 L250 275 M250 236 L224 254 M250 236 L280 250 M250 275 L236 320 M250 275 L268 320"/>
        <!-- victim being held -->
        <circle cx="320" cy="230" r="13"/>
        <path d="M320 243 L318 292 M320 258 L296 250 M320 258 L346 252 M318 292 L306 330 M318 292 L332 330"/>
        <!-- harbor waves + tea chests -->
        <path d="M400 330 q16 -14 32 0 t32 0 t32 0 t32 0" stroke-width="2.5"/>
        <path d="M400 348 q16 -14 32 0 t32 0 t32 0 t32 0" stroke-width="2.5"/>
        <rect x="452" y="300" width="26" height="20"/>
        <rect x="486" y="290" width="26" height="20"/>
        <path d="M470 300 l6 -10 M496 290 l6 -10"/>`,
    }),
  },
  'apush-dbq-federal-power-1790s-doc-5': {
    contentType: 'image/svg+xml',
    svg: framedPrint({
      title: 'Congressional Pugilists',
      date: 'Hand-colored etching, Philadelphia, 1798',
      attribution:
        'After the Library of Congress Prints & Photographs original',
      scene: `
        <!-- floor line -->
        <path d="M120 330 L520 330" stroke-width="2.5"/>
        <!-- Griswold with cane, swinging -->
        <circle cx="250" cy="150" r="16"/>
        <path d="M250 166 L252 250 M250 188 L214 176 M250 188 L292 168 M252 250 L236 322 M252 250 L276 322"/>
        <path d="M292 168 L330 140" stroke-width="4"/>
        <!-- Lyon with fireplace tongs, lunging -->
        <circle cx="388" cy="158" r="16"/>
        <path d="M388 174 L384 252 M388 196 L424 180 M388 196 L348 182 M384 252 L368 322 M384 252 L404 320"/>
        <path d="M348 182 L306 168 M306 168 l-10 -8 M306 168 l-10 8" stroke-width="2.5"/>
        <!-- seated onlookers -->
        <circle cx="150" cy="250" r="11"/>
        <path d="M150 261 L150 300 M150 274 L134 288 M150 274 L166 288"/>
        <circle cx="490" cy="250" r="11"/>
        <path d="M490 261 L490 300 M490 274 L474 288 M490 274 L506 288"/>`,
    }),
  },
};
