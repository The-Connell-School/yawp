import { describe, expect, test } from 'bun:test';
import { isLoungeTopic, loungeTopicLabel, LOUNGE_TOPICS } from './topics';
import { legacyLoungeColumns, loungeTagLabels, LOUNGE_FORM_TOPICS, parseLoungeTags } from './tags';

describe('retired AP History Lounge topic', () => {
  test('is absent from topic options and cannot be selected', () => {
    expect(LOUNGE_TOPICS.some((topic) => topic.key === ('ap-history' as string))).toBe(false);
    expect(LOUNGE_FORM_TOPICS.some((topic) => topic.key === ('ap-history' as string))).toBe(false);
    expect(isLoungeTopic('ap-history')).toBe(false);
    expect(loungeTopicLabel('ap-history')).toBe('Something else');
  });

  test('old posts remain readable without displaying a retired topic chip', () => {
    expect(loungeTagLabels({ kinds: ['QUESTION'], subjects: ['history'], topics: ['ap-history', 'grading'] })).toEqual([
      { key: 'subject:history', label: 'History', topic: null },
      { key: 'topic:grading', label: 'Grading & Rubrics', topic: 'grading' },
    ]);
  });

  test('stale form selections are ignored and still dual-write a valid legacy topic', () => {
    const parsed = parseLoungeTags({ kinds: ['QUESTION'], topics: ['ap-history', 'grading'] });
    expect(parsed).toEqual({ ok: true, value: { kinds: ['QUESTION'], subjects: [], topics: ['grading'] } });
    if (!parsed.ok) throw new Error('Expected valid tags');
    expect(legacyLoungeColumns(parsed.value)).toEqual({ kind: 'QUESTION', topic: 'grading' });
  });
});
