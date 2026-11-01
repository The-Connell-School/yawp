import { describe, expect, test } from 'bun:test';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  THESIS_ESSAY_COURSE,
  THESIS_ESSAY_COURSE_TITLE,
} from './thesis-essay-course';

const PUBLIC_DIR = join(import.meta.dir, '../../../../public');

function publicFile(href: string) {
  expect(href.startsWith('/courses/thesis-driven-essay/')).toBe(true);
  return join(PUBLIC_DIR, href);
}

describe('The Thesis-Driven Essay course', () => {
  test("has Brian's eight lessons, in order, titled as in his mock-up", () => {
    expect(THESIS_ESSAY_COURSE_TITLE).toBe('The Thesis-Driven Essay course');
    expect(THESIS_ESSAY_COURSE.map((lesson) => lesson.title)).toEqual([
      'Introduce students to Yawp!',
      'Pre-writing',
      'Developing a thesis statement',
      'Introduction paragraph',
      'Body paragraphs',
      'The conclusion',
      'Titling your essay',
      'Review my essay',
    ]);
  });

  test('lessons 1–6 have a lesson plan and a slide deck, 7 a deck only, and 8 neither', () => {
    expect(
      THESIS_ESSAY_COURSE.map((lesson) => [
        lesson.lessonPlan !== null,
        lesson.decks.length > 0,
      ])
    ).toEqual([
      [true, true],
      [true, true],
      [true, true],
      [true, true],
      [true, true],
      [true, true],
      [false, true],
      [false, false],
    ]);
  });

  test('Body paragraphs runs over two decks: the paragraphs, then supporting quotes', () => {
    const body = THESIS_ESSAY_COURSE[4]!;
    expect(body.decks.map((deck) => deck.label)).toEqual([
      'Slide deck',
      'Supporting quotes',
    ]);
    for (const lesson of THESIS_ESSAY_COURSE.filter((l) => l !== body)) {
      expect(lesson.decks.map((deck) => deck.label)).toEqual(
        lesson.decks.length ? ['Slide deck'] : []
      );
    }
  });

  test('every slide deck is a real PowerPoint file in public/', () => {
    for (const deck of THESIS_ESSAY_COURSE.flatMap((lesson) => lesson.decks)) {
      const path = publicFile(deck.href);
      expect(deck.href.endsWith('.pptx')).toBe(true);
      expect(deck.fileName.endsWith('.pptx')).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(100_000);
      // A .pptx is a zip archive.
      expect(readFileSync(path).subarray(0, 2).toString('latin1')).toBe('PK');
    }
  });

  test('every lesson plan is a real PDF in public/', () => {
    for (const plan of THESIS_ESSAY_COURSE.flatMap((lesson) =>
      lesson.lessonPlan ? [lesson.lessonPlan] : []
    )) {
      const path = publicFile(plan.href);
      expect(plan.href.endsWith('.pdf')).toBe(true);
      expect(readFileSync(path).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }
  });

  test('no file is linked twice', () => {
    const hrefs = THESIS_ESSAY_COURSE.flatMap((lesson) => [
      ...lesson.decks.map((deck) => deck.href),
      ...(lesson.lessonPlan ? [lesson.lessonPlan.href] : []),
    ]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
