import { describe, expect, test } from 'bun:test';
import { rubricCategories } from '~/domain/grading/rubric';
import {
  buildReporterSystemPrompt,
  RECOMMENDED_REPORTER_PROMPTS,
} from './build-system-prompt';

describe('buildReporterSystemPrompt', () => {
  const prompt = buildReporterSystemPrompt({
    teacherName: 'Ms. Rivera',
    organizationName: 'Connell School',
  });

  test('grounds the model in the canonical grading rubric, verbatim', () => {
    // Every rubric skill's real label and description must appear, so the model
    // uses Yawp's own definitions rather than inventing its own.
    for (const category of rubricCategories) {
      expect(prompt).toContain(category.label);
      expect(prompt).toContain(category.description);
    }
  });

  test('forbids inventing techniques or lesson titles', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('do not invent');
    expect(lower).toContain('do not make things up');
  });

  test('includes the teacher and organization context', () => {
    expect(prompt).toContain('Ms. Rivera');
    expect(prompt).toContain('Connell School');
  });

  test('exposes a stable set of recommended prompts', () => {
    expect(RECOMMENDED_REPORTER_PROMPTS.length).toBeGreaterThan(0);
    for (const entry of RECOMMENDED_REPORTER_PROMPTS) {
      expect(entry.id).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.prompt).toBeTruthy();
    }
  });
});
