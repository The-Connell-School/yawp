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
    expect(tourForPathname('/app/documents/doc_123')?.id).toBe('document');
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

describe('first dashboard tour', () => {
  const firstTours = ['dashboard', 'waiting-preview'] as const;

  test('an approved teacher sees their class, the assignment tiles, then grading', () => {
    expect(getTour('dashboard').steps.map((step) => step.target)).toEqual([
      'dashboard-classes',
      'dashboard-assignments',
      'dashboard-grading',
    ]);
  });

  test('a teacher waiting for approval sees their class, the tiles, then the approval banner', () => {
    expect(getTour('waiting-preview').steps.map((step) => step.target)).toEqual([
      'dashboard-classes',
      'dashboard-assignments',
      'teaching-access-banner',
    ]);
  });

  test('the assignment step explains the tile and quick create for each state', () => {
    const approved = getTour('dashboard').steps[1].body;
    expect(approved).toMatch(/tile/i);
    expect(approved).toContain('New assignment');
    const waiting = getTour('waiting-preview').steps[1].body;
    expect(waiting).toMatch(/tile/i);
    expect(waiting).toMatch(/approv/i);
  });

  test('copy is short, plain, and has no em dashes, all-caps eyebrows, or video', () => {
    for (const id of firstTours) {
      const tour = getTour(id);
      expect(tour.steps.length).toBeLessThanOrEqual(3);
      const texts = [
        tour.welcome.title,
        tour.welcome.body,
        ...tour.steps.flatMap((step) => [step.title, step.body]),
      ];
      for (const text of texts) {
        expect(text).not.toContain('\u2014');
        expect(text).not.toMatch(/\b[A-Z]{2,}\b/);
        expect(text).not.toMatch(/video|clip|watch/i);
      }
      for (const step of tour.steps) {
        expect(step.title.split(' ').length).toBeLessThanOrEqual(4);
        expect(step.body.length).toBeLessThanOrEqual(170);
      }
    }
  });

  test('no tour copy uses an em dash', () => {
    for (const id of TOUR_IDS) {
      const tour = getTour(id);
      for (const text of [
        tour.welcome.title,
        tour.welcome.body,
        ...tour.steps.flatMap((step) => [step.title, step.body]),
      ]) {
        expect(text).not.toContain('\u2014');
      }
    }
  });
});

describe('teachers waiting for approval', () => {
  const waiting = { waitingForApproval: true };

  test('their dashboard shows the waiting tour, the only tour they can save', () => {
    expect(tourForPage('/app', null, waiting)?.id).toBe('waiting-preview');
    expect(tourForPage('/app/', null, waiting)?.id).toBe('waiting-preview');
    expect(tourForPage('/app/free-tier/preview', null, waiting)?.id).toBe(
      'waiting-preview'
    );
  });

  test('other pages show no tour until approval', () => {
    for (const path of [
      '/app/my-classes',
      '/app/my-classes/cls_123',
      '/app/assignments',
      '/app/documents',
      '/app/lesson-planner',
      '/app/organization',
      '/app/free-tier/pending',
    ]) {
      expect(tourForPage(path, null, waiting)).toBeNull();
    }
    expect(
      tourForPage('/app/assignment-types/at_123', 'class_starter', waiting)
    ).toBeNull();
  });

  test('approved teachers get the full dashboard tour on the same page', () => {
    expect(tourForPage('/app', null)?.id).toBe('dashboard');
    expect(tourForPage('/app', null, { waitingForApproval: false })?.id).toBe(
      'dashboard'
    );
  });
});

test('the old preview URL still maps to the waiting tour', () => {
  expect(tourForPathname('/app/free-tier/preview')?.id).toBe('waiting-preview');
  expect(tourForPathname('/app/free-tier/pending')).toBeNull();
  expect(tourForPathname('/app/free-tier/onboarding')).toBeNull();
});
