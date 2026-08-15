import { describe, expect, test } from 'bun:test';
import { rubricCategories } from '~/domain/grading/rubric';
import {
  buildReporterSystemPrompt,
  buildReporterSystemPromptBlocks,
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

describe('buildReporterSystemPromptBlocks (prompt caching)', () => {
  const blocksA = buildReporterSystemPromptBlocks({
    teacherName: 'Ms. Rivera',
    organizationName: 'Connell School',
  });
  const blocksB = buildReporterSystemPromptBlocks({
    teacherName: 'Mr. Okafor',
    organizationName: 'Riverside Academy',
  });

  test('caches only the fixed instruction block, not the personalized one', () => {
    expect(blocksA).toHaveLength(2);
    expect(blocksA[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(blocksA[1]!.cache_control).toBeUndefined();
  });

  test('the cacheable block is byte-identical across different teachers and orgs', () => {
    // This is the load-bearing property: if the static block varied per
    // conversation, prompt caching would write a fresh cache entry on every
    // request and cache nothing. Two calls with completely different
    // teacher/org params must produce an identical static block.
    expect(blocksA[0]!.text).toBe(blocksB[0]!.text);
  });

  test('the personalized block, not the cacheable block, carries teacher and org name', () => {
    expect(blocksA[0]!.text).not.toContain('Ms. Rivera');
    expect(blocksA[0]!.text).not.toContain('Connell School');
    expect(blocksA[1]!.text).toContain('Ms. Rivera');
    expect(blocksA[1]!.text).toContain('Connell School');
  });

  test('the cacheable block still carries the rubric and grounding instructions', () => {
    for (const category of rubricCategories) {
      expect(blocksA[0]!.text).toContain(category.label);
      expect(blocksA[0]!.text).toContain(category.description);
    }
    const lower = blocksA[0]!.text.toLowerCase();
    expect(lower).toContain('do not invent');
    expect(lower).toContain('do not make things up');
  });

  test('concatenating the blocks reproduces every instruction in buildReporterSystemPrompt', () => {
    // Caching restructures *where* the personalized intro sits (after the
    // cacheable prefix instead of before it) but must not drop or alter any
    // instruction. Every non-blank line of the legacy single-string prompt
    // must show up in one of the two blocks.
    const legacy = buildReporterSystemPrompt({
      teacherName: 'Ms. Rivera',
      organizationName: 'Connell School',
    });
    const combined = `${blocksA[0]!.text}\n${blocksA[1]!.text}`;
    for (const line of legacy.split('\n')) {
      if (!line.trim()) continue;
      expect(combined).toContain(line);
    }
  });
});
