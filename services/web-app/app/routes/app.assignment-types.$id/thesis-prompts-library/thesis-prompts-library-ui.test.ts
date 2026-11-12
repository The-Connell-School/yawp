import { describe, expect, test } from 'bun:test';
import {
  formatThesisGradeBands,
  formatThesisPromptMetaLine,
  thesisPromptPrimaryLine,
} from './thesis-prompts-library-ui';
import type { ThesisLibraryEntry } from './data';

const baseEntry: ThesisLibraryEntry = {
  id: '1',
  title: 'School start times',
  prompt: 'Para one.\n\nPara two.',
  collection: 'library',
  category: 'general',
  subjects: [],
  textsOrUnits: [],
  cognitiveMoves: ['argue-a-position'],
  sourceNeed: 'none',
  gradeBands: ['9', '10'],
};

describe('thesis-prompts-library-ui', () => {
  test('formatThesisGradeBands uses en-dash for consecutive bands', () => {
    expect(formatThesisGradeBands(['9', '10', '11'])).toBe('Grades 9–11');
  });

  test('formatThesisPromptMetaLine joins grades, category, and skill', () => {
    expect(formatThesisPromptMetaLine(baseEntry)).toBe(
      'Grades 9–10 · General (no text) · Skill: Argue a position'
    );
  });

  test('thesisPromptPrimaryLine prefers title for multi-paragraph prompts', () => {
    expect(thesisPromptPrimaryLine(baseEntry)).toBe('School start times');
  });
});
