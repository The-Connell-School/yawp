import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  YAWP_COURSE_TITLE,
  YAWP_LESSONS,
  YAWP_LESSON_SLUGS,
  isYawpLessonSlug,
  yawpLesson,
  yawpLessonHref,
  yawpLessonRequest,
} from './yawp-lessons';
import { fileableMaterial } from './fileable-material';
import { pieceKeysInReply } from './reply-pieces';
import { readPlanSteps } from './plan-steps';
import { isWritingStep, parseStepType, stepTypeFor } from './step-types';
import { stackCreateLink } from './stack-create-link';
import { looksLikeLessonPlan } from './suggestions';

const PUBLIC = join(import.meta.dir, '..', '..', '..', 'public');

/** Every lesson, with its pieces as the stack would file them. */
const LESSONS = YAWP_LESSON_SLUGS.map((slug) => {
  const lesson = YAWP_LESSONS[slug];
  const pieces = pieceKeysInReply(lesson.plan).map((key) => {
    const piece = fileableMaterial(lesson.plan, key);
    if (!piece) throw new Error(`${slug}: piece ${key} does not file`);
    return piece;
  });
  return { slug, lesson, pieces };
});

describe('the Yawp! lesson catalog', () => {
  test('is the six Thesis-Driven Essay lessons with a lesson plan, in course order', () => {
    expect(YAWP_LESSON_SLUGS).toEqual([
      'introduce-students-to-yawp',
      'pre-writing',
      'thesis-statement',
      'introduction-paragraph',
      'body-paragraphs',
      'conclusion-paragraph',
    ]);
    expect(LESSONS.map(({ lesson }) => lesson.lessonNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(LESSONS.map(({ lesson }) => lesson.title)).toEqual([
      'Introduce students to Yawp!',
      'Pre-writing',
      'Developing a thesis statement',
      'Introduction paragraph',
      'Body paragraphs',
      'The conclusion',
    ]);
    for (const { slug, lesson } of LESSONS) expect(lesson.slug).toBe(slug);
  });

  test('opens at /app/lesson-planner/yawp/<slug>, and only for a known slug', () => {
    expect(yawpLessonHref('pre-writing')).toBe('/app/lesson-planner/yawp/pre-writing');
    expect(yawpLesson('pre-writing')?.title).toBe('Pre-writing');
    expect(yawpLesson('not-a-lesson')).toBeNull();
    expect(yawpLesson(undefined)).toBeNull();
    expect(isYawpLessonSlug('thesis-statement')).toBe(true);
    expect(isYawpLessonSlug('')).toBe(false);
  });

  test('the teacher’s turn names the lesson and its place in the course', () => {
    expect(yawpLessonRequest(YAWP_LESSONS['pre-writing'])).toBe(
      `Open the Yawp! lesson “Pre-writing” (Lesson 2 of ${YAWP_COURSE_TITLE}).`
    );
  });

  test.each(LESSONS)('$slug reads as a plan, one notes block per step, each timed and typed', ({ lesson, pieces }) => {
    expect(looksLikeLessonPlan(lesson.plan)).toBe(true);
    expect(pieces.length).toBeGreaterThanOrEqual(5);
    // Every heading holds exactly its block, so the stack mirrors the headings.
    const steps = readPlanSteps(lesson.plan);
    expect(steps).toHaveLength(pieces.length);
    expect(steps.every((step) => !step.content.trim())).toBe(true);
    expect(steps.map((step) => step.title)).toEqual(
      pieces.map((piece) => piece.title.replace(/\s*\(\d+ min\)$/, ''))
    );
    for (const piece of pieces) {
      expect(piece.kind).toBe('notes');
      expect(piece.minutes).toBeGreaterThan(0);
      expect(parseStepType(piece.stepType)).not.toBeNull();
      expect(piece.content.trim().length).toBeGreaterThan(20);
    }
    expect(pieces.reduce((sum, piece) => sum + (piece.minutes ?? 0), 0)).toBe(
      lesson.periodMinutes
    );
    expect(lesson.periodMinutes).toBe(50);
    // The last step closes the lesson.
    expect(pieces.at(-1)!.stepType).toBe('closing');
  });

  test.each(LESSONS)('$slug never grows a “Create … in Yawp!” button: the assignment already exists', ({ lesson, pieces }) => {
    const typeIds = { dailyPages: 'dp', classStarter: 'cs', exitTicket: 'et', thesis: 'th' };
    for (const piece of pieces) {
      expect(
        stackCreateLink({
          kind: piece.kind,
          title: piece.title,
          stepType: piece.stepType ?? null,
          content: piece.content,
          blockKey: piece.key,
          sourceContent: lesson.plan,
          typeIds,
          conversationId: 'c1',
        })
      ).toBeNull();
    }
  });

  test('writing time in Yawp! counts as writing; the first lesson has none', () => {
    for (const { slug, pieces } of LESSONS) {
      const writing = pieces.filter((piece) =>
        isWritingStep({
          kind: piece.kind,
          stepType: stepTypeFor({ kind: piece.kind, title: piece.title, stored: piece.stepType }),
          title: piece.title,
          content: piece.content,
        })
      );
      if (slug === 'introduce-students-to-yawp') {
        expect(writing).toHaveLength(0);
      } else {
        expect(writing).toHaveLength(1);
        expect(writing[0]!.stepType).toBe('thesis_essay');
        expect(writing[0]!.title).toMatch(/^Writing time/);
        expect(writing[0]!.minutes).toBeGreaterThanOrEqual(15);
      }
    }
  });

  test.each(LESSONS)('$slug links Brian’s deck and PDF, and both files exist', ({ lesson }) => {
    for (const file of [lesson.deck, lesson.lessonPlanPdf]) {
      expect(file.href.startsWith('/courses/thesis-driven-essay/')).toBe(true);
      expect(existsSync(join(PUBLIC, file.href))).toBe(true);
      expect(lesson.plan).toContain(`](${file.href})`);
    }
    expect(lesson.deck.fileName.endsWith('.pptx')).toBe(true);
    expect(lesson.lessonPlanPdf.fileName.endsWith('.pdf')).toBe(true);
  });

  test.each(LESSONS)('$slug is written Yawp!, never Yawp or YAWP', ({ lesson }) => {
    const plain = lesson.plan.replace(/\(\/courses\/[^)]+\)/g, '').replace(/yawp\.school/g, '');
    expect(plain).not.toMatch(/\bYAWP\b/);
    expect(plain).not.toMatch(/\bYawp\b(?!!)/);
    // The planner's title line is the lesson's name.
    expect(lesson.plan.split('\n')[0]).toBe(`# ${lesson.title}`);
  });
});
