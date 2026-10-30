import { describe, expect, test } from 'bun:test';
import {
  CELEBRATION_COLORS,
  celebrationPieces,
  stepPiece,
  YAWP_SOUND,
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

  test('the sound is Brian’s own recording, served with the app', () => {
    expect(YAWP_SOUND).toBe('/lesson-planner/sounds/yaaawp.mp3');
  });
});
