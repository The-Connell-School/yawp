import { describe, expect, test } from 'bun:test';
import {
  ACCESS_CODE_ADJECTIVES,
  ACCESS_CODE_ANIMALS,
  generatePreviewAccessCode,
  generatePreviewAccessSeats,
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
      ACCESS_CODE_ADJECTIVES.length
    );
    expect(new Set(ACCESS_CODE_ANIMALS).size).toBe(ACCESS_CODE_ANIMALS.length);
  });

  test('generates one stable mapping per seat while preserving existing codes', () => {
    const seats = generatePreviewAccessSeats({
      count: 6,
      existingCodes: ['brave-otter-4193'],
    });

    expect(seats).toHaveLength(6);
    expect(seats[0]).toEqual({
      code: 'brave-otter-4193',
      organizationId: 'local-dev-org',
      label: 'Master',
    });
    expect(seats[1]).toMatchObject({
      organizationId: 'preview-seat-2',
      label: 'Seat 2',
    });
    expect(seats.slice(2).map((seat) => seat.label)).toEqual([
      'Seat 3',
      'Seat 4',
      'Seat 5',
      'Seat 6',
    ]);
    expect(new Set(seats.map((seat) => seat.code)).size).toBe(6);
  });

  test('adding N+1 preserves all prior code mappings', () => {
    const first = generatePreviewAccessSeats({ count: 3 });
    const next = generatePreviewAccessSeats({
      count: 4,
      existingSeats: first,
    });

    expect(next.slice(0, 3)).toEqual(first);
    expect(next[3]).toMatchObject({
      organizationId: 'preview-seat-4',
      label: 'Seat 4',
    });
  });

  test('lowering the requested count never removes a retained seat mapping', () => {
    const first = generatePreviewAccessSeats({ count: 7 });
    const next = generatePreviewAccessSeats({
      count: 6,
      existingSeats: first,
    });

    expect(next).toEqual(first);
  });
});
