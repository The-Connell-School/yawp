import { describe, expect, test } from 'bun:test';
import { parseLoungePostEdit, parseLoungePostInput, parseLoungeReplyEdit, parseLoungeReplyInput } from './validation';
import { COMPOSER_TOPICS } from './topics';

const goodPost = {
  kind: 'QUESTION',
  topic: 'daily-pages',
  title: 'How are you pacing Daily Pages?',
  body: 'We lose ten minutes settling in.',
  askStaff: 'on',
  askPrivately: '',
};

describe('parseLoungePostInput', () => {
  test('accepts a well-formed question and trims it', () => {
    const result = parseLoungePostInput({ ...goodPost, title: '  How are you pacing Daily Pages?  ' });
    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'QUESTION',
        topic: 'daily-pages',
        title: 'How are you pacing Daily Pages?',
        body: 'We lose ten minutes settling in.',
        askStaff: true,
        askPrivately: false,
      },
    });
  });

  test('new posts are never private: private notes go through Contact Us', () => {
    const result = parseLoungePostInput({ ...goodPost, askStaff: '', askPrivately: 'on' });
    expect(result.ok && result.value).toMatchObject({ askStaff: false, askPrivately: false });
  });

  test('the topic is optional: no topic is stored as null', () => {
    const result = parseLoungePostInput({ ...goodPost, topic: '' });
    expect(result.ok && result.value.topic).toBeNull();
  });

  test('takes the new topics and refuses the retired one on a new post', () => {
    expect(parseLoungePostInput({ ...goodPost, topic: 'prewriting' }).ok).toBe(true);
    expect(parseLoungePostInput({ ...goodPost, topic: 'lessons-learned' }).ok).toBe(true);
    const retired = parseLoungePostInput({ ...goodPost, topic: 'ap-history' });
    expect(retired.ok).toBe(false);
    if (!retired.ok) expect(retired.errors.topic).toBeDefined();
  });

  test('names the three post types when the type is missing', () => {
    const result = parseLoungePostInput({ ...goodPost, kind: '' });
    expect(!result.ok && result.errors.kind).toBe('Choose General question, Share an assignment, or Win.');
  });

  test('rejects an unknown kind or topic', () => {
    const result = parseLoungePostInput({ ...goodPost, kind: 'RANT', topic: 'gossip' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(['kind', 'topic']);
    }
  });

  test('requires a title of at least a few characters and a body', () => {
    const result = parseLoungePostInput({ ...goodPost, title: 'Hi', body: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.title).toBeDefined();
      expect(result.errors.body).toBeDefined();
    }
  });

  test('caps title and body length', () => {
    const result = parseLoungePostInput({ ...goodPost, title: 'x'.repeat(161), body: 'y'.repeat(5001) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.title).toContain('160');
      expect(result.errors.body).toContain('5,000');
    }
  });

  test('every composer topic key is accepted', () => {
    for (const topic of COMPOSER_TOPICS) {
      expect(parseLoungePostInput({ ...goodPost, topic: topic.key }).ok).toBe(true);
    }
  });
});

describe('parseLoungeReplyInput', () => {
  test('accepts a body and drops an empty video link', () => {
    expect(parseLoungeReplyInput({ body: ' Twelve minutes. ', videoUrl: '' }, { isStaff: true })).toEqual({
      ok: true,
      value: { body: 'Twelve minutes.', videoUrl: null },
    });
  });

  test('the Yawp team can attach a Loom, YouTube, or Vimeo link', () => {
    for (const url of [
      'https://www.loom.com/share/abc',
      'https://youtu.be/abc',
      'https://www.youtube.com/watch?v=abc',
      'https://vimeo.com/123',
    ]) {
      const result = parseLoungeReplyInput({ body: 'Watch this', videoUrl: url }, { isStaff: true });
      expect(result.ok && result.value.videoUrl).toBe(url);
    }
  });

  test('rejects other video links and non-https links', () => {
    for (const url of ['http://www.loom.com/share/abc', 'https://evil.example/video', 'javascript:alert(1)']) {
      expect(parseLoungeReplyInput({ body: 'x', videoUrl: url }, { isStaff: true }).ok).toBe(false);
    }
  });

  test('teachers cannot attach a video link', () => {
    const result = parseLoungeReplyInput(
      { body: 'Watch this', videoUrl: 'https://www.loom.com/share/abc' },
      { isStaff: false }
    );
    expect(result.ok && result.value.videoUrl).toBe(null);
  });

  test('requires a body', () => {
    expect(parseLoungeReplyInput({ body: '  ' }, { isStaff: false }).ok).toBe(false);
  });
});

describe('parseLoungePostEdit', () => {
  test('keeps the title rules, and a question may stay all title', () => {
    expect(parseLoungePostEdit({ title: '  Revision policy?  ', body: '' })).toEqual({
      ok: true,
      value: { title: 'Revision policy?', body: '' },
    });
    expect(parseLoungePostEdit({ title: 'Hi', body: 'x' })).toMatchObject({ ok: false, errors: { title: expect.any(String) } });
    expect(parseLoungePostEdit({ title: 'A fine title', body: 'x'.repeat(5001) })).toMatchObject({
      ok: false,
      errors: { body: 'Keep it under 5,000 characters.' },
    });
  });
});

describe('parseLoungeReplyEdit', () => {
  test('a reply still needs words', () => {
    expect(parseLoungeReplyEdit({ body: ' Better. ' })).toEqual({ ok: true, value: { body: 'Better.' } });
    expect(parseLoungeReplyEdit({ body: '   ' })).toMatchObject({ ok: false, errors: { body: 'Write a few words.' } });
  });
});
