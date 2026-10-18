import { describe, expect, test } from 'bun:test';
import {
  LOUNGE_IMAGE_MAX_BYTES,
  LOUNGE_IMAGE_MAX_COUNT,
  kindAllowsImages,
  prepareLoungeImages,
  stripImageMetadata,
  validateLoungeImages,
} from './images';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u32le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

function includes(haystack: Uint8Array, needle: number[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** An EXIF APP1 segment (big-endian TIFF) with Orientation and a GPS pointer. */
function exifSegment(orientation: number): number[] {
  const tiff = [
    ...ascii('MM'), 0x00, 0x2a, ...u32be(8),
    ...u16be(2),
    // Orientation (0x0112), SHORT, 1, value
    ...u16be(0x0112), ...u16be(3), ...u32be(1), ...u16be(orientation), 0, 0,
    // GPSInfo (0x8825), LONG, 1, offset (a stand-in for the location block)
    ...u16be(0x8825), ...u16be(4), ...u32be(1), ...u32be(0x1234),
    ...u32be(0),
    ...ascii('LAT 37.7749 LON -122.4194'),
  ];
  const payload = [...ascii('Exif'), 0, 0, ...tiff];
  return [0xff, 0xe1, ...u16be(payload.length + 2), ...payload];
}

function jpeg(...segments: number[][]): Uint8Array {
  const sos = [0xff, 0xda, ...u16be(4), 0x01, 0x02];
  return bytes(0xff, 0xd8, ...segments.flat(), ...sos, 0x11, 0x22, 0x33, 0xff, 0xd9);
}

describe('Lounge images', () => {
  test('General question and Win can carry images; a shared assignment has its attachment instead', () => {
    expect(kindAllowsImages('QUESTION')).toBe(true);
    expect(kindAllowsImages('WIN')).toBe(true);
    expect(kindAllowsImages('SHARE')).toBe(false);
  });

  test('up to three images, each a PNG, JPEG, or WebP under the size cap', () => {
    const png = { size: 1000, type: 'image/png' };
    expect(validateLoungeImages([png, png, png])).toBeNull();
    expect(validateLoungeImages(Array(LOUNGE_IMAGE_MAX_COUNT + 1).fill(png))).toBe('Add up to 3 images.');
    expect(validateLoungeImages([{ size: LOUNGE_IMAGE_MAX_BYTES + 1, type: 'image/png' }])).toBe(
      'Each image has to be under 5 MB.'
    );
    expect(validateLoungeImages([{ size: 10, type: 'image/svg+xml' }])).toBe('Use a PNG, JPEG, or WebP image.');
    expect(validateLoungeImages([{ size: 0, type: 'image/png' }])).toBe('One of the images is empty.');
  });
});

describe('stripImageMetadata', () => {
  test('JPEG: drops EXIF (location included), XMP and comments, keeps the picture and its orientation', () => {
    const jfif = [0xff, 0xe0, ...u16be(16), ...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
    const comment = [0xff, 0xfe, ...u16be(2 + 9), ...ascii('Taken by ')];
    const xmpPayload = [...ascii('http://ns.adobe.com/xap/1.0/'), 0, ...ascii('<x:xmpmeta/>')];
    const xmp = [0xff, 0xe1, ...u16be(xmpPayload.length + 2), ...xmpPayload];
    const out = stripImageMetadata(jpeg(jfif, exifSegment(6), xmp, comment), 'image/jpeg');

    expect(includes(out, ascii('LAT 37.7749'))).toBe(false);
    expect(includes(out, ascii('xmpmeta'))).toBe(false);
    expect(includes(out, ascii('Taken by'))).toBe(false);
    expect(includes(out, ascii('JFIF'))).toBe(true);
    // The picture itself: start of scan through end of image, untouched.
    expect(includes(out, [0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9])).toBe(true);
    // Only orientation survives, so a phone photo still stands the right way up.
    expect(includes(out, [...ascii('Exif'), 0, 0])).toBe(true);
    expect(includes(out, [...u16be(0x0112), ...u16be(3), ...u32be(1), ...u16be(6)])).toBe(true);
    expect(includes(out, u16be(0x8825))).toBe(false);
  });

  test('JPEG without EXIF comes back without one', () => {
    const out = stripImageMetadata(jpeg(), 'image/jpeg');
    expect(includes(out, ascii('Exif'))).toBe(false);
    expect(Array.from(out.slice(0, 2))).toEqual([0xff, 0xd8]);
  });

  test('PNG: drops text, time and EXIF chunks, keeps the image chunks', () => {
    const chunk = (type: string, data: number[]) => [...u32be(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
    const png = bytes(
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...chunk('IHDR', Array(13).fill(1)),
      ...chunk('tEXt', ascii('Author\0Ms. Rivera')),
      ...chunk('eXIf', ascii('MM\0*GPS')),
      ...chunk('tIME', Array(7).fill(2)),
      ...chunk('IDAT', [9, 9, 9]),
      ...chunk('IEND', [])
    );
    const out = stripImageMetadata(png, 'image/png');
    expect(includes(out, ascii('Ms. Rivera'))).toBe(false);
    expect(includes(out, ascii('eXIf'))).toBe(false);
    expect(includes(out, ascii('tIME'))).toBe(false);
    for (const type of ['IHDR', 'IDAT', 'IEND']) expect(includes(out, ascii(type))).toBe(true);
  });

  test('WebP: drops EXIF and XMP chunks, clears their flags, and fixes the RIFF size', () => {
    const chunk = (type: string, data: number[]) => [
      ...ascii(type), ...u32le(data.length), ...data, ...(data.length % 2 ? [0] : []),
    ];
    const vp8x = chunk('VP8X', [0x0c, 0, 0, 0, 1, 0, 0, 1, 0, 0]);
    const body = [...ascii('WEBP'), ...vp8x, ...chunk('VP8 ', [5, 5, 5, 5]), ...chunk('EXIF', ascii('GPS!!')), ...chunk('XMP ', ascii('<x/>'))];
    const webp = bytes(...ascii('RIFF'), ...u32le(body.length), ...body);
    const out = stripImageMetadata(webp, 'image/webp');
    expect(includes(out, ascii('GPS!!'))).toBe(false);
    expect(includes(out, ascii('XMP '))).toBe(false);
    expect(includes(out, ascii('VP8 '))).toBe(true);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getUint32(4, true)).toBe(out.byteLength - 8);
    // VP8X flags: EXIF (0x08) and XMP (0x04) bits cleared.
    expect(out[20] & 0x0c).toBe(0);
  });

  test('something that is not what it claims comes back unchanged rather than half-parsed', () => {
    const junk = bytes(1, 2, 3, 4);
    expect(stripImageMetadata(junk, 'image/jpeg')).toEqual(junk);
  });
});

describe('prepareLoungeImages', () => {
  const pngBytes = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0);

  test('takes the real format from the bytes and describes each image', () => {
    const result = prepareLoungeImages(
      [
        { type: 'image/png', size: pngBytes.length, bytes: pngBytes },
        { type: 'image/png', size: pngBytes.length, bytes: pngBytes },
      ],
      'My class roster'
    );
    expect(result).toEqual({
      ok: true,
      images: [
        { contentType: 'image/png', bytes: pngBytes, altText: 'My class roster (image 1 of 2)' },
        { contentType: 'image/png', bytes: pngBytes, altText: 'My class roster (image 2 of 2)' },
      ],
    });
  });

  test('no files is fine and needs no description', () => {
    expect(prepareLoungeImages([], '')).toEqual({ ok: true, images: [] });
  });

  test('images need a description, for teachers who use a screen reader', () => {
    const result = prepareLoungeImages([{ type: 'image/png', size: pngBytes.length, bytes: pngBytes }], '  ');
    expect(result).toEqual({ ok: false, error: 'Describe the image in a few words, for teachers who use a screen reader.' });
  });

  test('refuses a file whose bytes are not the image it claims to be', () => {
    const fake = bytes(0x3c, 0x73, 0x76, 0x67);
    expect(prepareLoungeImages([{ type: 'image/png', size: 4, bytes: fake }], 'x')).toEqual({
      ok: false,
      error: 'That file is not a PNG, JPEG, or WebP image.',
    });
  });
});
