import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';
import {
  findLockedAssignmentTypeTeaser,
  LOCKED_ASSIGNMENT_TYPE_TEASERS,
  lockedAssignmentTypeTeasersAvailable,
  lockedAssignmentTypeTeasersFor,
} from './locked-assignment-types';

const FREE_TEACHER = {
  freeTierEnabled: true,
  role: 'TEACHER',
  plan: 'FREE_CLASSROOM',
} as const;

describe('locked assignment type teasers', () => {
  test('are The Thesis-Driven Essay, AP History Essay, and Daily Pages', () => {
    expect(LOCKED_ASSIGNMENT_TYPE_TEASERS.map((teaser) => teaser.slug)).toEqual(
      ['thesis-driven-essay', 'ap-history-essay', 'daily-pages']
    );
  });

  test('give Daily Pages its own card art', () => {
    expect(findLockedAssignmentTypeTeaser('daily-pages')).toEqual({
      slug: 'daily-pages',
      title: 'Daily Pages',
      image: '/img/daily-pages-guide/card.jpg',
    });
  });

  test('are shown to a free classroom teacher while the flag is on', () => {
    expect(lockedAssignmentTypeTeasersAvailable(FREE_TEACHER)).toBe(true);
    expect(lockedAssignmentTypeTeasersFor(FREE_TEACHER)).toEqual(
      LOCKED_ASSIGNMENT_TYPE_TEASERS.map((teaser) => ({
        slug: teaser.slug,
        title: teaser.title,
        image: teaser.image,
      }))
    );
  });

  test('are never shown with the flag off, at paid schools or to students', () => {
    for (const viewer of [
      { ...FREE_TEACHER, freeTierEnabled: false },
      { ...FREE_TEACHER, plan: 'SCHOOL' },
      { ...FREE_TEACHER, plan: 'FOUNDING_FACULTY' },
      { ...FREE_TEACHER, role: 'STUDENT' },
      { ...FREE_TEACHER, role: null },
      { ...FREE_TEACHER, plan: undefined },
    ]) {
      expect(lockedAssignmentTypeTeasersAvailable(viewer)).toBe(false);
      expect(lockedAssignmentTypeTeasersFor(viewer)).toEqual([]);
    }
  });

  test('are found by slug, and an unknown slug finds nothing', () => {
    expect(findLockedAssignmentTypeTeaser('ap-history-essay')?.title).toBe(
      'AP History Essay'
    );
    expect(findLockedAssignmentTypeTeaser('class-starter')).toBeNull();
    expect(findLockedAssignmentTypeTeaser(undefined)).toBeNull();
    expect(findLockedAssignmentTypeTeaser('')).toBeNull();
  });

  test('point at images the app actually serves', () => {
    for (const teaser of LOCKED_ASSIGNMENT_TYPE_TEASERS) {
      expect(teaser.image.startsWith('/img/')).toBe(true);
      const file = fileURLToPath(
        new URL(`../../../public${teaser.image}`, import.meta.url)
      );
      expect(existsSync(file)).toBe(true);
    }
  });
});
