import { describe, expect, test } from 'bun:test';
import {
  TOUR_IDS,
  getTour,
  guidedToursAvailable,
  isTourId,
  isTourStatus,
  nextTourStatus,
  tourForPathname,
} from './tours';

describe('tourForPathname', () => {
  test('matches each toured page', () => {
    expect(tourForPathname('/app')?.id).toBe('dashboard');
    expect(tourForPathname('/app/')?.id).toBe('dashboard');
    expect(tourForPathname('/app/my-classes')?.id).toBe('my-classes');
    expect(tourForPathname('/app/my-classes/cls_123')?.id).toBe('class');
    expect(tourForPathname('/app/assignments')?.id).toBe('my-assignments');
  });

  test('has no tour for pages deeper in a class or elsewhere', () => {
    expect(tourForPathname('/app/my-classes/cls_123/assignment/a1')).toBeNull();
    expect(tourForPathname('/app/assignments/a1')).toBeNull();
    expect(tourForPathname('/app/documents')).toBeNull();
    expect(tourForPathname('/free')).toBeNull();
  });
});

describe('tour definitions', () => {
  test('every tour has a welcome and at least one step', () => {
    for (const id of TOUR_IDS) {
      const tour = getTour(id);
      expect(tour.id).toBe(id);
      expect(tour.welcome.title.length).toBeGreaterThan(0);
      expect(tour.steps.length).toBeGreaterThan(0);
    }
  });

  test('step targets are unique within a tour', () => {
    for (const id of TOUR_IDS) {
      const targets = getTour(id).steps.map((step) => step.target);
      expect(new Set(targets).size).toBe(targets.length);
    }
  });
});

describe('guidedToursAvailable', () => {
  test('only free classroom teachers with the free tier on', () => {
    expect(
      guidedToursAvailable({
        freeTierEnabled: true,
        role: 'TEACHER',
        plan: 'FREE_CLASSROOM',
      })
    ).toBe(true);
    expect(
      guidedToursAvailable({
        freeTierEnabled: false,
        role: 'TEACHER',
        plan: 'FREE_CLASSROOM',
      })
    ).toBe(false);
    expect(
      guidedToursAvailable({
        freeTierEnabled: true,
        role: 'TEACHER',
        plan: 'SCHOOL',
      })
    ).toBe(false);
    expect(
      guidedToursAvailable({
        freeTierEnabled: true,
        role: 'STUDENT',
        plan: 'FREE_CLASSROOM',
      })
    ).toBe(false);
  });
});

describe('nextTourStatus', () => {
  test('records the first outcome', () => {
    expect(nextTourStatus(null, 'dismissed')).toBe('dismissed');
    expect(nextTourStatus(null, 'completed')).toBe('completed');
  });

  test('finishing a skipped tour upgrades it', () => {
    expect(nextTourStatus('dismissed', 'completed')).toBe('completed');
  });

  test('closing a replayed tour never downgrades a finished one', () => {
    expect(nextTourStatus('completed', 'dismissed')).toBeNull();
    expect(nextTourStatus('completed', 'completed')).toBeNull();
    expect(nextTourStatus('dismissed', 'dismissed')).toBeNull();
  });
});

describe('validators', () => {
  test('accept only known ids and statuses', () => {
    expect(isTourId('dashboard')).toBe(true);
    expect(isTourId('nope')).toBe(false);
    expect(isTourId(undefined)).toBe(false);
    expect(isTourStatus('completed')).toBe(true);
    expect(isTourStatus('started')).toBe(false);
  });
});
