import { describe, expect, test } from 'bun:test';
import {
  CELEBRATION_COLORS,
  celebrationPieces,
  pickYawpVoice,
  stepPiece,
  YAWP_LINE,
} from './celebration';

describe('the lesson-set celebration (Brian’s round 4, item 4)', () => {
  test('the confetti bursts from the middle of the screen, in Yawp! colors', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pieces = celebrationPieces(160, { width: 1000, height: 800 }, random);
    expect(pieces).toHaveLength(160);
    for (const piece of pieces) {
      expect(CELEBRATION_COLORS).toContain(piece.color);
      expect(piece.x).toBe(500);
      expect(piece.y).toBe(440);
      // Every piece flies up first.
      expect(piece.vy).toBeLessThan(0);
    }
  });

  test('a piece falls under gravity and keeps spinning', () => {
    const [piece] = celebrationPieces(1, { width: 1000, height: 800 }, () => 0.7);
    const later = stepPiece(piece!, 0.1);
    expect(later.vy).toBeGreaterThan(piece!.vy);
    expect(later.y).not.toBe(piece!.y);
    expect(later.rotation).not.toBe(piece!.rotation);
  });

  test('the voice is a man’s English voice when there is one', () => {
    const voices = [
      { name: 'Samantha', lang: 'en-US' },
      { name: 'Thomas', lang: 'fr-FR' },
      { name: 'Google UK English Male', lang: 'en-GB' },
    ];
    expect(pickYawpVoice(voices)?.name).toBe('Google UK English Male');
    expect(pickYawpVoice([{ name: 'Daniel', lang: 'en-GB' }, { name: 'Karen', lang: 'en-AU' }])?.name).toBe('Daniel');
  });

  test('otherwise any English voice, and otherwise the browser’s own', () => {
    expect(pickYawpVoice([{ name: 'Thomas', lang: 'fr-FR' }, { name: 'Samantha', lang: 'en-US' }])?.name).toBe('Samantha');
    expect(pickYawpVoice([{ name: 'Thomas', lang: 'fr-FR' }])).toBeNull();
    expect(pickYawpVoice([])).toBeNull();
  });

  test('what it says', () => {
    expect(YAWP_LINE).toBe('Yaaaawp!');
  });
});
