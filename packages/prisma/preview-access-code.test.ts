import { describe, expect, mock, test } from 'bun:test';
import {
  ACCESS_CODE_ADJECTIVES,
  ACCESS_CODE_ANIMALS,
  generatePreviewAccessCode,
  generateUniquePreviewAccessCode,
} from './preview-access-code';

describe('shared preview access-code generator', () => {
  test('generates two curated words and four non-zero-leading digits', () => {
    for (let index = 0; index < 100; index += 1) {
      const code = generatePreviewAccessCode();
      const [adjective, animal, number] = code.split('-');

      expect(ACCESS_CODE_ADJECTIVES).toContain(adjective);
      expect(ACCESS_CODE_ANIMALS).toContain(animal);
      expect(code).toMatch(/^[a-z]+-[a-z]+-[1-9][0-9]{3}$/);
      expect(number).toHaveLength(4);
    }
  });

  test('retries collisions with the master and existing runtime-seat codes', () => {
    const generate = mock(() => 'brave-otter-4193');
    generate
      .mockReturnValueOnce('brave-otter-4193')
      .mockReturnValueOnce('calm-panda-8127')
      .mockReturnValueOnce('sunny-fox-2468');

    expect(
      generateUniquePreviewAccessCode(
        ['brave-otter-4193', 'calm-panda-8127'],
        generate
      )
    ).toBe('sunny-fox-2468');
    expect(generate).toHaveBeenCalledTimes(3);
  });
});
