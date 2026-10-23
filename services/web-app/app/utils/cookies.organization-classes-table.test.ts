import { describe, expect, test } from 'bun:test';
import { parseOrganizationClassesTableCookie } from './cookies.server';

describe('parseOrganizationClassesTableCookie', () => {
  test('keeps valid sort and direction', () => {
    expect(
      parseOrganizationClassesTableCookie({
        sort: 'schoolYear',
        direction: 'desc',
        skip: 5,
        take: 20,
      })
    ).toEqual({
      sort: 'schoolYear',
      direction: 'desc',
      skip: 5,
      take: 20,
    });
  });

  test('defaults invalid sort to createdAt and invalid direction to asc', () => {
    expect(
      parseOrganizationClassesTableCookie({
        sort: ['code'],
        direction: 'sideways',
        skip: 0,
        take: 10,
      })
    ).toEqual({
      sort: 'createdAt',
      direction: 'asc',
      skip: 0,
      take: 10,
    });
  });

  test('rejects non-class sort fields that could reach Prisma', () => {
    for (const sort of ['studentJoinToken', 'nope', '', 42]) {
      expect(parseOrganizationClassesTableCookie({ sort, direction: 'asc' }).sort).toBe(
        'createdAt'
      );
    }
  });

  test('uses default table cookie when raw value is missing', () => {
    expect(parseOrganizationClassesTableCookie(null)).toEqual({
      sort: 'code',
      direction: 'asc',
      skip: 0,
      take: 10,
    });
  });
});
