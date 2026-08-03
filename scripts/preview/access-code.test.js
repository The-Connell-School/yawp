import { describe, expect, test } from 'bun:test';
import {
  ACCESS_CODE_ADJECTIVES,
  ACCESS_CODE_ANIMALS,
  generatePreviewAccessCode,
} from './access-code.mjs';

describe('preview access-code generator', () => {
  test('uses curated adjective and animal lists with a four-digit number', () => {
    for (let index = 0; index < 100; index += 1) {
      const code = generatePreviewAccessCode();
      const [adjective, animal, number] = code.split('-');

      expect(ACCESS_CODE_ADJECTIVES).toContain(adjective);
      expect(ACCESS_CODE_ANIMALS).toContain(animal);
      expect(number).toMatch(/^[1-9][0-9]{3}$/);
    }
  });

  test('keeps enough curated combinations to avoid repetitive codes', () => {
    expect(ACCESS_CODE_ADJECTIVES.length).toBeGreaterThanOrEqual(20);
    expect(ACCESS_CODE_ANIMALS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ACCESS_CODE_ADJECTIVES).size).toBe(
      ACCESS_CODE_ADJECTIVES.length,
    );
    expect(new Set(ACCESS_CODE_ANIMALS).size).toBe(ACCESS_CODE_ANIMALS.length);
  });
});
