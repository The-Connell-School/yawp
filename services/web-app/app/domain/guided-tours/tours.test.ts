import { describe, expect, test } from 'bun:test';
import {
  TOUR_IDS,
  getTour,
  guidedToursAvailable,
  isTourId,
  isTourStatus,
  nextTourStatus,
  tourForPage,
  tourForPathname,
} from './tours';

describe('tourForPathname', () => {
  test('matches each toured page', () => {
    expect(tourForPathname('/app')?.id).toBe('dashboard');
    expect(tourForPathname('/app/')?.id).toBe('dashboard');
    expect(tourForPathname('/app/my-classes')?.id).toBe('my-classes');
    expect(tourForPathname('/app/my-classes/cls_123')?.id).toBe('class');
    expect(tourForPathname('/app/assignments')?.id).toBe('my-assignments');
    expect(tourForPathname('/app/documents')?.id).toBe('documents');
    expect(tourForPathname('/app/writing-lessons')?.id).toBe(
      'writing-practice'
    );
    expect(tourForPathname('/app/teacher-trainings')?.id).toBe(
      'teachers-lounge'
    );
    expect(tourForPathname('/app/lesson-planner')?.id).toBe('lesson-planner');
    expect(tourForPathname('/app/organization')?.id).toBe('organization');
    expect(tourForPathname('/app/organization/classes')?.id).toBe(
      'organization'
    );
    expect(tourForPathname('/app/organization/teachers')?.id).toBe(
      'organization'
    );
  });

  test('every page in the teacher sidebar has a tour', () => {
    for (const path of [
      '/app',
      '/app/my-classes',
      '/app/assignments',
      '/app/documents',
      '/app/writing-lessons',
      '/app/teacher-trainings',
      '/app/lesson-planner',
      '/app/organization',
    ]) {
      expect(tourForPathname(path)).not.toBeNull();
    }
  });

  test('has no tour for pages deeper in a class or elsewhere', () => {
    expect(tourForPathname('/app/my-classes/cls_123/assignment/a1')).toBeNull();
    expect(tourForPathname('/app/assignments/a1')).toBeNull();
    expect(tourForPathname('/app/writing-lessons/commas')).toBeNull();
    expect(tourForPathname('/app/teacher-trainings/course-1')).toBeNull();
    expect(tourForPathname('/app/lesson-planner/library')).toBeNull();
    expect(tourForPathname('/app/organization/classes/extra')).toBeNull();
    expect(tourForPathname('/free')).toBeNull();
  });
});

describe('tourForPage', () => {
  test('each free classroom assignment type page has its own tour', () => {
    const path = '/app/assignment-types/at_123';
    expect(tourForPage(path, 'class_starter')?.id).toBe('type-class-starter');
    expect(tourForPage(path, 'prewriting')?.id).toBe('type-prewriting');
    expect(tourForPage(path, 'thesis_statement')?.id).toBe(
      'type-thesis-statement'
    );
    expect(tourForPage(path, 'class_starter')?.welcome.title).toBe(
      'Welcome to Class Starter'
    );
  });

  test('no tour for other types, or before the page says which type it is', () => {
    const path = '/app/assignment-types/at_123';
    expect(tourForPage(path, 'daily_pages')).toBeNull();
    expect(tourForPage(path, null)).toBeNull();
    expect(
      tourForPage('/app/assignment-types/at_123/how-it-works', 'class_starter')
    ).toBeNull();
  });

  test('a variant left over from another page does not change its tour', () => {
    expect(tourForPage('/app/documents', 'class_starter')?.id).toBe(
      'documents'
    );
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
