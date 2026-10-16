import { describe, expect, test } from 'bun:test';
import {
  baseVideoContentType,
  formatVideoDuration,
  isOwnLoungeVideoKey,
  loungeVideoKey,
  parseLoungeVideoInput,
  pickRecorderMimeType,
} from './video';

describe('baseVideoContentType', () => {
  test('keeps mp4, webm, and QuickTime, dropping codec details', () => {
    expect(baseVideoContentType('video/webm;codecs=vp9,opus')).toBe('video/webm');
    expect(baseVideoContentType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')).toBe('video/mp4');
    expect(baseVideoContentType('VIDEO/QUICKTIME')).toBe('video/quicktime');
  });

  test('rejects anything else', () => {
    expect(baseVideoContentType('video/x-msvideo')).toBeNull();
    expect(baseVideoContentType('image/png')).toBeNull();
    expect(baseVideoContentType('')).toBeNull();
  });
});

describe('video storage keys', () => {
  test('a key lives under the uploader and carries the right extension', () => {
    expect(loungeVideoKey('user_1', 'video/webm', 'abcdef0123456789')).toBe(
      'lounge/videos/user_1/abcdef0123456789.webm'
    );
    expect(loungeVideoKey('user_1', 'video/quicktime', 'abcdef0123456789')).toBe(
      'lounge/videos/user_1/abcdef0123456789.mov'
    );
  });

  test('only your own well-formed keys count as yours', () => {
    expect(isOwnLoungeVideoKey('lounge/videos/user_1/abcdef0123456789.mp4', 'user_1')).toBe(true);
    expect(isOwnLoungeVideoKey('lounge/videos/user_2/abcdef0123456789.mp4', 'user_1')).toBe(false);
    expect(isOwnLoungeVideoKey('lounge/videos/user_1/../user_2/abcdef0123456789.mp4', 'user_1')).toBe(false);
    expect(isOwnLoungeVideoKey('teacher-trainings/t/modules/m/video/x.mp4', 'user_1')).toBe(false);
  });
});

describe('parseLoungeVideoInput', () => {
  const key = 'lounge/videos/brian/abcdef0123456789.webm';

  test('no video fields means no video', () => {
    expect(parseLoungeVideoInput({}, { userId: 'brian', isStaff: true })).toEqual({ ok: true, value: null });
  });

  test('the Yawp team can attach their own uploaded video', () => {
    expect(
      parseLoungeVideoInput(
        { videoKey: key, videoContentType: 'video/webm', videoDurationSeconds: '161', videoTitle: '  One lesson, two thesis shapes ' },
        { userId: 'brian', isStaff: true }
      )
    ).toEqual({
      ok: true,
      value: { key, contentType: 'video/webm', durationSeconds: 161, title: 'One lesson, two thesis shapes' },
    });
  });

  test('a missing or odd duration is stored as unknown, not rejected', () => {
    const result = parseLoungeVideoInput(
      { videoKey: key, videoContentType: 'video/webm', videoDurationSeconds: 'NaN' },
      { userId: 'brian', isStaff: true }
    );
    expect(result.ok && result.value?.durationSeconds).toBeNull();
  });

  test('teachers cannot attach video, and nobody can claim another person\'s upload', () => {
    expect(parseLoungeVideoInput({ videoKey: key, videoContentType: 'video/webm' }, { userId: 'brian', isStaff: false })).toEqual({ ok: true, value: null });
    expect(parseLoungeVideoInput({ videoKey: key, videoContentType: 'video/webm' }, { userId: 'kevin', isStaff: true }).ok).toBe(false);
  });

  test('rejects a type that does not match the key or is unsupported', () => {
    expect(parseLoungeVideoInput({ videoKey: key, videoContentType: 'video/mp4' }, { userId: 'brian', isStaff: true }).ok).toBe(false);
    expect(parseLoungeVideoInput({ videoKey: key, videoContentType: 'video/avi' }, { userId: 'brian', isStaff: true }).ok).toBe(false);
  });

  test('caps the title', () => {
    const result = parseLoungeVideoInput(
      { videoKey: key, videoContentType: 'video/webm', videoTitle: 'x'.repeat(200) },
      { userId: 'brian', isStaff: true }
    );
    expect(result.ok && result.value?.title?.length).toBe(120);
  });
});

describe('formatVideoDuration', () => {
  test('minutes and zero-padded seconds', () => {
    expect(formatVideoDuration(161)).toBe('2:41');
    expect(formatVideoDuration(9)).toBe('0:09');
    expect(formatVideoDuration(3725)).toBe('62:05');
    expect(formatVideoDuration(null)).toBe('');
  });
});

describe('pickRecorderMimeType', () => {
  test('prefers mp4 so recordings also play on iPhones and Safari', () => {
    expect(pickRecorderMimeType(() => true)).toMatch(/^video\/mp4/);
  });

  test('falls back to webm, then to nothing', () => {
    expect(pickRecorderMimeType((type) => type.startsWith('video/webm'))).toMatch(/^video\/webm/);
    expect(pickRecorderMimeType(() => false)).toBeNull();
  });
});
