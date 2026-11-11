import { describe, expect, test } from 'bun:test';
import {
  LOUNGE_FORM_KINDS,
  LOUNGE_FORM_TOPICS,
  LOUNGE_SUBJECTS,
  legacyLoungeColumns,
  loungeTagLabels,
  parseLoungeTags,
  resolveLoungePostTags,
} from './tags';

describe('the New Post tag choices', () => {
  test('post type offers Question and Share; Win stays readable on old posts only', () => {
    expect(LOUNGE_FORM_KINDS.map((kind) => kind.label)).toEqual(['Question', 'Share']);
  });

  test('subjects start with English and Social Studies', () => {
    expect(LOUNGE_SUBJECTS.map((subject) => subject.label).slice(0, 2)).toEqual(['English', 'Social Studies']);
  });

  test('module or topic leaves out "Something else": no topic checked means that', () => {
    expect(LOUNGE_FORM_TOPICS.some((topic) => topic.key === 'other')).toBe(false);
    expect(LOUNGE_FORM_TOPICS.map((topic) => topic.key)).toContain('daily-pages');
  });
});

describe('parseLoungeTags', () => {
  test('keeps every box checked, in the order the form lists them', () => {
    expect(
      parseLoungeTags({
        kinds: ['SHARE', 'QUESTION'],
        subjects: ['social-studies', 'english'],
        topics: ['grading', 'daily-pages'],
      })
    ).toEqual({
      ok: true,
      value: {
        kinds: ['QUESTION', 'SHARE'],
        subjects: ['english', 'social-studies'],
        topics: ['daily-pages', 'grading'],
      },
    });
  });

  test('a single checked box arrives as a string', () => {
    expect(parseLoungeTags({ kinds: 'SHARE', subjects: 'english', topics: 'reporter' })).toEqual({
      ok: true,
      value: { kinds: ['SHARE'], subjects: ['english'], topics: ['reporter'] },
    });
  });

  test('subjects and topics are optional', () => {
    expect(parseLoungeTags({ kinds: ['QUESTION'] })).toEqual({
      ok: true,
      value: { kinds: ['QUESTION'], subjects: [], topics: [] },
    });
  });

  test('needs at least one post type', () => {
    const result = parseLoungeTags({ kinds: [], subjects: ['english'] });
    expect(result).toEqual({ ok: false, errors: { kinds: 'Choose Question, Share, or both.' } });
  });

  test('drops values the form never offered, and repeats', () => {
    expect(
      parseLoungeTags({
        kinds: ['QUESTION', 'QUESTION', 'RANT', 'WIN'],
        subjects: ['english', 'astrology'],
        topics: ['other', 'gossip', 'reporter'],
      })
    ).toEqual({ ok: true, value: { kinds: ['QUESTION'], subjects: ['english'], topics: ['reporter'] } });
  });
});

describe('legacyLoungeColumns (dual-write)', () => {
  test('a question that is also a share is still a question to the old columns', () => {
    expect(legacyLoungeColumns({ kinds: ['QUESTION', 'SHARE'], subjects: [], topics: ['grading', 'reporter'] })).toEqual({
      kind: 'QUESTION',
      topic: 'grading',
    });
  });

  test('a share with no topic is "Something else"', () => {
    expect(legacyLoungeColumns({ kinds: ['SHARE'], subjects: ['english'], topics: [] })).toEqual({
      kind: 'SHARE',
      topic: 'other',
    });
  });
});

describe('resolveLoungePostTags', () => {
  test('a post written before tags reads its old kind and topic', () => {
    expect(
      resolveLoungePostTags({ kind: 'WIN', topic: 'daily-pages', kinds: [], subjects: [], topics: [] })
    ).toEqual({ kinds: ['WIN'], subjects: [], topics: ['daily-pages'] });
  });

  test('an old "Something else" post has no topic tag', () => {
    expect(resolveLoungePostTags({ kind: 'SHARE', topic: 'other', kinds: [], subjects: [], topics: [] })).toEqual({
      kinds: ['SHARE'],
      subjects: [],
      topics: [],
    });
  });

  test('a tagged post reads its tags', () => {
    expect(
      resolveLoungePostTags({
        kind: 'QUESTION',
        topic: 'grading',
        kinds: ['QUESTION', 'SHARE'],
        subjects: ['english'],
        topics: ['grading', 'reporter'],
      })
    ).toEqual({ kinds: ['QUESTION', 'SHARE'], subjects: ['english'], topics: ['grading', 'reporter'] });
  });

  test('a tagged post with no topic does not fall back to its "other" column', () => {
    expect(
      resolveLoungePostTags({ kind: 'SHARE', topic: 'other', kinds: ['SHARE'], subjects: ['english'], topics: [] })
    ).toEqual({ kinds: ['SHARE'], subjects: ['english'], topics: [] });
  });
});

describe('loungeTagLabels', () => {
  test('subjects then topics, with the feed filter for each topic', () => {
    expect(loungeTagLabels({ kinds: ['QUESTION'], subjects: ['english'], topics: ['grading'] })).toEqual([
      { key: 'subject:english', label: 'English', topic: null },
      { key: 'topic:grading', label: 'Grading & Rubrics', topic: 'grading' },
    ]);
  });

  test('an unknown stored subject is skipped rather than shown raw', () => {
    expect(loungeTagLabels({ kinds: [], subjects: ['retired-subject'], topics: [] })).toEqual([]);
  });
});
