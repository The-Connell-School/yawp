/**
 * The title slide's picture as a screen print (Kevin, Nov 25: public photos
 * "aren't doing it for us"; a candid snapshot of the author on the title
 * slide "kinda stinks", and the engraved portrait looked "like a weird
 * obituary"). The book's world, a real place or thing from a real photo, is
 * redrawn in a few flat inks taken from the photo itself, with a little paper
 * grain: one look for every deck, and still the real thing.
 *
 * Pure JavaScript (jpeg-js), no native image library. JPEG only; anything
 * else is left as it was.
 */
import jpeg from 'jpeg-js';

/** The poster half of a 1280×720 slide is 640×720: 8:9, drawn at 800×900. */
export const POSTER_WIDTH = 800;
export const POSTER_HEIGHT = 900;
/** Fewer inks read as a print; more read as a bad photo. */
const INKS = 6;
/** A photo narrower than this is too small to fill half a projected slide. */
const MIN_SOURCE_WIDTH = 500;

type Rgb = [number, number, number];
type Image = { width: number; height: number; data: Uint8Array };

function decode(bytes: Uint8Array): Image | null {
  try {
    const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: false, maxResolutionInMP: 60, maxMemoryUsageInMB: 600 });
    return { width: image.width, height: image.height, data: image.data as Uint8Array };
  } catch {
    return null;
  }
}

/**
 * The 8:9 window of the photo, a little above center (a building's face, a
 * landscape's horizon), averaged down to the poster's size.
 */
function cropAndScale(image: Image, width: number, height: number, focusY = 0.42): Image {
  const want = width / height;
  let cw = image.width;
  let ch = Math.round(cw / want);
  if (ch > image.height) {
    ch = image.height;
    cw = Math.round(ch * want);
  }
  const cx = Math.round((image.width - cw) / 2);
  const cy = Math.max(0, Math.min(image.height - ch, Math.round((image.height - ch) * focusY)));
  const out = new Uint8Array(width * height * 3);
  const sx = cw / width;
  const sy = ch / height;
  for (let y = 0; y < height; y++) {
    const y0 = cy + Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, cy + Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x++) {
      const x0 = cx + Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, cx + Math.floor((x + 1) * sx));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * image.width + x0) * 3;
        for (let xx = x0; xx < x1; xx++, i += 3) {
          r += image.data[i]!;
          g += image.data[i + 1]!;
          b += image.data[i + 2]!;
          n++;
        }
      }
      const o = (y * width + x) * 3;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
    }
  }
  return { width, height, data: out };
}

/** A box blur, run twice: the photo's texture goes, its shapes stay. */
function soften(image: Image, radius: number): Image {
  const { width, height } = image;
  let src = Float32Array.from(image.data);
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(src.length);
    for (let y = 0; y < height; y++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let x = -radius; x <= radius; x++) sum += src[(y * width + Math.min(width - 1, Math.max(0, x))) * 3 + c]!;
        for (let x = 0; x < width; x++) {
          tmp[(y * width + x) * 3 + c] = sum / (2 * radius + 1);
          const add = Math.min(width - 1, x + radius + 1);
          const drop = Math.max(0, x - radius);
          sum += src[(y * width + add) * 3 + c]! - src[(y * width + drop) * 3 + c]!;
        }
      }
    }
    const out = new Float32Array(src.length);
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let y = -radius; y <= radius; y++) sum += tmp[(Math.min(height - 1, Math.max(0, y)) * width + x) * 3 + c]!;
        for (let y = 0; y < height; y++) {
          out[(y * width + x) * 3 + c] = sum / (2 * radius + 1);
          const add = Math.min(height - 1, y + radius + 1);
          const drop = Math.max(0, y - radius);
          sum += tmp[(add * width + x) * 3 + c]! - tmp[(drop * width + x) * 3 + c]!;
        }
      }
    }
    src = out;
  }
  return { width, height, data: Uint8Array.from(src, (v) => Math.round(v)) };
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
/** Distance as the eye judges it, roughly: green counts most. */
const distance = (r: number, g: number, b: number, ink: Rgb) => 2 * (r - ink[0]) ** 2 + 4 * (g - ink[1]) ** 2 + 3 * (b - ink[2]) ** 2;

/**
 * The photo's own inks: k-means on a sample, started from its tones dark to
 * light so the same photo always prints the same. Then pushed toward a print:
 * a little more color, the darkest nearly black, the lightest the paper.
 */
export function inksOf(image: Image, count = INKS): Rgb[] {
  const sample: Rgb[] = [];
  const step = Math.max(1, Math.floor((image.width * image.height) / 8000));
  for (let p = 0; p < image.width * image.height; p += step) {
    const i = p * 3;
    sample.push([image.data[i]!, image.data[i + 1]!, image.data[i + 2]!]);
  }
  const byTone = [...sample].sort((a, b) => luma(...a) - luma(...b));
  let inks: Rgb[] = Array.from({ length: count }, (_, k) => [...byTone[Math.min(byTone.length - 1, Math.floor(((k + 0.5) / count) * byTone.length))]!] as Rgb);
  for (let round = 0; round < 12; round++) {
    const sums = inks.map(() => [0, 0, 0, 0]);
    for (const [r, g, b] of sample) {
      let best = 0;
      let bestD = Infinity;
      inks.forEach((ink, k) => {
        const d = distance(r, g, b, ink);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      });
      const s = sums[best]!;
      s[0] += r;
      s[1] += g;
      s[2] += b;
      s[3]++;
    }
    inks = inks.map((ink, k) => {
      const s = sums[k]!;
      return s[3] ? ([s[0]! / s[3], s[1]! / s[3], s[2]! / s[3]] as Rgb) : ink;
    });
  }
  const sorted = inks.sort((a, b) => luma(...a) - luma(...b));
  return sorted.map((ink, k) => {
    const mean = (ink[0] + ink[1] + ink[2]) / 3;
    let out = ink.map((v) => mean + (v - mean) * 1.3) as Rgb;
    if (k === 0) out = out.map((v) => v * 0.55 + 4) as Rgb;
    if (k === sorted.length - 1) out = out.map((v, c) => v * 0.4 + [246, 242, 232][c]! * 0.6) as Rgb;
    return out.map((v) => Math.max(0, Math.min(255, Math.round(v)))) as Rgb;
  });
}

/** Each pixel takes the ink most of its neighbours took: specks and slivers go. */
function majority(labels: Uint8Array, width: number, height: number, radius: number, inks: number): Uint8Array {
  const out = new Uint8Array(labels.length);
  const counts = new Uint16Array(inks);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      counts.fill(0);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) counts[labels[yy * width + xx]!]!++;
      let best = labels[y * width + x]!;
      for (let k = 0; k < inks; k++) if (counts[k]! > counts[best]!) best = k;
      out[y * width + x] = best;
    }
  }
  return out;
}

/** The same grain every time, so a deck downloaded twice is the same file. */
function grain(i: number): number {
  let h = (i * 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return ((h & 0xff) / 255 - 0.5) * 12;
}

export type Print = { data: Uint8Array; width: number; height: number; contentType: 'image/jpeg' };

/** The photo as a screen print, 800×900; null when it can't be read or is too small. */
export function screenPrint(bytes: Uint8Array, contentType: string | null | undefined): Print | null {
  if (contentType !== 'image/jpeg') return null;
  const photo = decode(bytes);
  if (!photo || photo.width < MIN_SOURCE_WIDTH || photo.height < MIN_SOURCE_WIDTH * 0.5) return null;
  const width = POSTER_WIDTH;
  const height = POSTER_HEIGHT;
  const soft = soften(cropAndScale(photo, width, height), 3);
  const inks = inksOf(soft);
  let labels: Uint8Array = new Uint8Array(width * height);
  for (let p = 0; p < labels.length; p++) {
    const i = p * 3;
    const [r, g, b] = [soft.data[i]!, soft.data[i + 1]!, soft.data[i + 2]!];
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < inks.length; k++) {
      const d = distance(r, g, b, inks[k]!);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    labels[p] = best;
  }
  labels = majority(majority(labels, width, height, 3, inks.length), width, height, 2, inks.length);
  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0; p < labels.length; p++) {
    const ink = inks[labels[p]!]!;
    const n = grain(p);
    rgba[p * 4] = Math.max(0, Math.min(255, ink[0] + n));
    rgba[p * 4 + 1] = Math.max(0, Math.min(255, ink[1] + n));
    rgba[p * 4 + 2] = Math.max(0, Math.min(255, ink[2] + n));
    rgba[p * 4 + 3] = 255;
  }
  const encoded = jpeg.encode({ data: rgba, width, height }, 86);
  return { data: new Uint8Array(encoded.data), width, height, contentType: 'image/jpeg' };
}
