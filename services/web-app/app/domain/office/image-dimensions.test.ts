import { describe, expect, test } from 'bun:test';
import { imageDimensions, sniffPictureType } from './image-dimensions';

const png = (width: number, height: number) => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
};

describe('sniffPictureType', () => {
  test('knows the raster formats a browser shows, by their bytes', () => {
    expect(sniffPictureType(png(1, 1))).toBe('image/png');
    expect(sniffPictureType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffPictureType(new TextEncoder().encode('GIF89a......'))).toBe('image/gif');
    expect(sniffPictureType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
  });

  test('refuses everything else, SVG included', () => {
    expect(sniffPictureType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffPictureType(new Uint8Array([0x01, 0, 0, 0]))).toBeNull();
  });
});

describe('imageDimensions', () => {
  test('reads a PNG header', () => {
    expect(imageDimensions(png(1520, 1440))).toEqual({ width: 1520, height: 1440 });
  });

  test('reads a GIF header', () => {
    const gif = new Uint8Array([...new TextEncoder().encode('GIF89a'), 0x10, 0x00, 0x20, 0x00]);
    expect(imageDimensions(gif)).toEqual({ width: 16, height: 32 });
  });

  test('finds a JPEG frame past its other segments', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0, 2 bytes of payload
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0x01, 0x22, 0x00, // SOF0: 600 × 800
    ]);
    expect(imageDimensions(jpeg)).toEqual({ width: 800, height: 600 });
  });

  test('returns null for bytes it does not understand', () => {
    expect(imageDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(imageDimensions(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });
});
