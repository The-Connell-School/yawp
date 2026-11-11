import { describe, expect, test } from 'bun:test';
import { containBox, pictureSlideText, pictureSrc } from './deck-pictures';

describe('deck pictures', () => {
  test('a picture fits its box whole, centred, keeping its shape', () => {
    expect(containBox({ x: 0, y: 0, w: 10, h: 10 }, { width: 200, height: 100 })).toEqual({ x: 0, y: 2.5, w: 10, h: 5 });
    expect(containBox({ x: 1, y: 1, w: 10, h: 10 }, { width: 100, height: 200 })).toEqual({ x: 3.5, y: 1, w: 5, h: 10 });
  });

  test('a picture of unknown size fills its box', () => {
    expect(containBox({ x: 0, y: 0, w: 4, h: 3 }, { width: null, height: null })).toEqual({ x: 0, y: 0, w: 4, h: 3 });
  });

  test('the src is the private picture route, escaped', () => {
    expect(pictureSrc('abc123')).toBe('/api/image/lesson-picture/abc123');
  });

  test('a picture slide speaks its question first', () => {
    expect(pictureSlideText({ question: 'What happened?', body: 'Look.' })).toBe('What happened?');
    expect(pictureSlideText({ body: 'Look.' })).toBe('Look.');
    expect(pictureSlideText({})).toBeNull();
  });
});
