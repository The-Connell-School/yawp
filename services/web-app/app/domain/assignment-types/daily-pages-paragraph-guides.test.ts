import { describe, expect, test } from 'bun:test';

import shortFormPrompts from '~/routes/app.assignment-types.$id/short-form-prompts-library/prompts.json';

import { DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT } from './daily-pages-analyze-sample-entries';
import {
  enabledParagraphModes,
  getParagraphMode,
} from './daily-pages-paragraph-modes';
import {
  enabledParagraphGuides,
  getParagraphGuide,
} from './daily-pages-paragraph-guides';

const libraryPrompts = (shortFormPrompts as Array<{ prompt: string }>).map(
  (prompt) => prompt.prompt
);

/**
 * What a student is aiming for, per paragraph type: the same model the tutor
 * coaches and the grader reads, explained several ways — the parts in plain
 * words, the part most often skipped, a marked model, a typical miss and its
 * fix, and the questions the tutor will ask.
 */
describe('the paragraph-type guides', () => {
  test('every switched-on type has a guide, and only those are offered', () => {
    expect(enabledParagraphGuides().map((guide) => guide.key)).toEqual(
      enabledParagraphModes().map((mode) => mode.key)
    );
  });

  test('looks a guide up by key, and only for a switched-on type', () => {
    expect(getParagraphGuide('analyze')?.key).toBe('analyze');
    expect(getParagraphGuide('compare')).toBeNull();
    expect(getParagraphGuide(null)).toBeNull();
  });

  /** A guide that named different parts from the tutor would teach two models. */
  test('names the same three parts the tutor coaches, in the same order', () => {
    for (const guide of enabledParagraphGuides()) {
      expect(guide.parts).toHaveLength(3);
      const tutor = getParagraphMode(guide.key)!.tutorInstructions!.toLowerCase();
      const positions = guide.parts.map((part) =>
        tutor.indexOf(`${part.name.toLowerCase()}.`)
      );
      for (const position of positions) expect(position).toBeGreaterThan(-1);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    }
  });

  test('marks each part in the model, with text that is really there', () => {
    for (const guide of enabledParagraphGuides()) {
      const marked = guide.model.marks.map((mark) => mark.part);
      expect(new Set(marked)).toEqual(new Set(guide.parts.map((p) => p.name)));
      for (const mark of guide.model.marks) {
        expect(guide.model.text).toContain(mark.excerpt);
      }
    }
  });

  /**
   * The guide is open while a student writes, so its model must not answer
   * an assignment they could be given: no library prompt, and not the
   * seeded Analyze assignment.
   */
  test('models on prompts no student is assigned from the library', () => {
    for (const guide of enabledParagraphGuides()) {
      expect(libraryPrompts).not.toContain(guide.model.prompt);
      expect(guide.model.prompt).not.toBe(DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT.prompt);
    }
  });

  test('pairs a typical miss with the one change that fixes it', () => {
    for (const guide of enabledParagraphGuides()) {
      expect(guide.miss.text.length).toBeGreaterThan(80);
      expect(guide.miss.whatsMissing.length).toBeGreaterThan(20);
      expect(guide.miss.fix.length).toBeGreaterThan(20);
    }
  });

  test('lists the questions the tutor will ask, one per part', () => {
    for (const guide of enabledParagraphGuides()) {
      expect(guide.tutorAsks).toHaveLength(3);
      for (const question of guide.tutorAsks) expect(question.endsWith('?')).toBe(true);
    }
  });

  test('says what students most often skip', () => {
    expect(getParagraphGuide('analyze')!.oftenSkipped.toLowerCase()).toContain(
      'explain'
    );
    expect(getParagraphGuide('argue')!.oftenSkipped.toLowerCase()).toContain(
      'test'
    );
  });
});
