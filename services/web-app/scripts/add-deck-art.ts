/**
 * Add a painting to the gallery deck's art library (Kevin, Oct 22: Brian's
 * Turner was an example, not a house painting, and the library needs more).
 *
 *   bun scripts/add-deck-art.ts <image> --id hopper-nighthawks --focal 0.55,0.5 [--out public/lesson-planner/art]
 *
 * Writes the whole image (1600px wide) and the three crops the deck uses
 * (swatch, big-idea strip, divider), cover-fit around the focal point, and
 * prints the DECK_ART entry with the painting's sampled colors. Fill in the
 * title, artist, year, medium, collection, rights, subject and themes, check
 * the colors by eye, and add the entry to app/domain/lesson-planner/deck-art.ts.
 * Public-domain or licensed images only. Needs ffmpeg.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { paletteFromPixels } from '../app/domain/lesson-planner/deck-colors';

/** Width and height of each box, as the Turner's crops are cut. */
const CROPS = {
  swatch: [96, 96],
  strip: [528, 1190],
  divider: [1268, 1190],
} as const;
const WIDE = 1600;

function argument(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : undefined;
}

function size(path: string): [number, number] {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path]);
  const [width, height] = out.toString().trim().split(',').map(Number);
  return [width!, height!];
}

function ffmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
}

const image = process.argv[2];
const id = argument('id');
const [fx, fy] = (argument('focal') ?? '0.5,0.5').split(',').map(Number) as [number, number];
const out = argument('out') ?? 'public/lesson-planner/art';
if (!image || !id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Usage: bun scripts/add-deck-art.ts <image> --id some-painting [--focal x,y] [--out dir]');
  process.exit(1);
}
mkdirSync(out, { recursive: true });

// The whole painting, 1600 wide.
const whole = join(out, `${id}.jpg`);
ffmpeg(['-i', image, '-vf', `scale=${WIDE}:-2`, '-q:v', '3', whole]);
const [width, height] = size(whole);

// Each crop: the largest box of its shape that fits, centred on the focal point.
for (const [name, [cw, ch]] of Object.entries(CROPS)) {
  const scale = Math.min(width / cw, height / ch);
  const w = Math.floor(cw * scale);
  const h = Math.floor(ch * scale);
  const x = Math.round(Math.min(Math.max(fx * width - w / 2, 0), width - w));
  const y = Math.round(Math.min(Math.max(fy * height - h / 2, 0), height - h));
  ffmpeg(['-i', whole, '-vf', `crop=${w}:${h}:${x}:${y},scale=${cw}:${ch}`, '-q:v', '3', join(out, `${id}--${name}.jpg`)]);
}

// The colors, from a small copy of the whole painting.
const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', whole, '-vf', 'scale=64:48', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
const pixels: Array<[number, number, number]> = [];
for (let at = 0; at + 2 < raw.length; at += 3) pixels.push([raw[at]!, raw[at + 1]!, raw[at + 2]!]);
const colors = paletteFromPixels(pixels);

const base = '${base}';
console.log(`  {
    id: '${id}',
    title: 'TODO',
    artist: 'TODO',
    year: 'TODO',
    medium: 'TODO',
    collection: 'TODO',
    src: \`${base}/${id}.jpg\`,
    crops: {
      swatch: \`${base}/${id}--swatch.jpg\`,
      strip: \`${base}/${id}--strip.jpg\`,
      divider: \`${base}/${id}--divider.jpg\`,
    },
    focal: { x: ${fx}, y: ${fy} },
    colors: ${JSON.stringify(colors).replace(/"/g, "'").replace(/,/g, ', ')},
    rights: 'Public domain',
    subject: 'TODO: what the painting shows, in a line',
    themes: ['TODO'],
  },`);
