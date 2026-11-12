import { describe, expect, test } from 'bun:test';
import { hideStepTypeTags } from './step-type-tags';

describe('hideStepTypeTags — planner tags never show to teachers', () => {
  test('## headings keep minutes and lose the curly tag', () => {
    expect(hideStepTypeTags('## Class Starter (4 min) {type: class_starter}')).toBe(
      '## Class Starter (4 min)'
    );
    expect(hideStepTypeTags('## Closing (4 min) {type: closing}')).toBe('## Closing (4 min)');
  });

  test('bold headings keep minutes and lose the tag', () => {
    expect(
      hideStepTypeTags('**Mini-Lesson: What Analysis Actually Is (8 min) {type: activity}**')
    ).toBe('**Mini-Lesson: What Analysis Actually Is (8 min)**');
    expect(hideStepTypeTags('**Daily Pages (10 min) {type: daily_pages}**')).toBe(
      '**Daily Pages (10 min)**'
    );
  });

  test('bracket tags are stripped too', () => {
    expect(hideStepTypeTags('## Thesis work [type: thesis_essay] (20 min)')).toBe(
      '## Thesis work (20 min)'
    );
    expect(hideStepTypeTags('**Exit ticket** [type: closing] (5 min)')).toBe(
      '**Exit ticket** (5 min)'
    );
  });

  test('a line that is only a tag does not become a blank heading', () => {
    expect(hideStepTypeTags('## {type: activity}')).toBe('');
    expect(hideStepTypeTags('{type: class_starter}')).toBe('');
  });

  test('prose without tags is unchanged', () => {
    const text = 'Objective: Students explain what a detail reveals.\n\nAsk pairs to share.';
    expect(hideStepTypeTags(text)).toBe(text);
  });

  test('tags inside code fences are left alone', () => {
    const fence = '```yawp-daily-pages\nkind: class-starter\ntype: class_starter\n```';
    const text = `## Warm-up {type: class_starter}\n\n${fence}`;
    expect(hideStepTypeTags(text)).toBe(`## Warm-up\n\n${fence}`);
  });

  test('markdown html never contains a type tag after teacherFacingMarkdown', async () => {
    const { teacherFacingMarkdown } = await import('./step-type-tags');
    const { markdownToHtml } = await import('~/components/ai-chat/assistant-markdown');
    const sample = [
      '## Class Starter (4 min) {type: class_starter}',
      '',
      'Students write independently.',
      '',
      '**Daily Pages (10 min) {type: daily_pages}**',
      '',
      'Reflect in Yawp.',
    ].join('\n');
    const html = markdownToHtml(teacherFacingMarkdown(sample), { codeAsText: true });
    expect(html).not.toMatch(/\{type:/i);
    expect(html).not.toMatch(/\[type:/i);
    expect(html).toContain('Class Starter');
    expect(html).toContain('(4 min)');
    expect(html).toContain('Daily Pages');
  });
});
