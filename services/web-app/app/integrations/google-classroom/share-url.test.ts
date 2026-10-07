import { describe, expect, test } from 'bun:test';
import {
  GOOGLE_CLASSROOM_SHARE_ENDPOINT,
  buildClassroomLaunchUrl,
  buildGoogleClassroomShareUrl,
} from './share-url';

describe('buildClassroomLaunchUrl', () => {
  test('joins origin and token into an absolute launch URL', () => {
    expect(buildClassroomLaunchUrl('https://app.yawp.com', 'tok_123')).toBe(
      'https://app.yawp.com/classroom/launch/tok_123'
    );
  });

  test('tolerates a trailing slash on the origin', () => {
    expect(buildClassroomLaunchUrl('https://app.yawp.com/', 'tok_123')).toBe(
      'https://app.yawp.com/classroom/launch/tok_123'
    );
  });

  test('escapes a token so it cannot break out of the path', () => {
    expect(buildClassroomLaunchUrl('https://app.yawp.com', 'a/b?c')).toBe(
      'https://app.yawp.com/classroom/launch/a%2Fb%3Fc'
    );
  });
});

describe('buildGoogleClassroomShareUrl', () => {
  const launchUrl = 'https://app.yawp.com/classroom/launch/tok_123';

  test('points at Google and carries the launch URL', () => {
    const shareUrl = new URL(buildGoogleClassroomShareUrl({ url: launchUrl }));

    expect(`${shareUrl.origin}${shareUrl.pathname}`).toBe(
      GOOGLE_CLASSROOM_SHARE_ENDPOINT
    );
    expect(shareUrl.searchParams.get('url')).toBe(launchUrl);
  });

  test('defaults to creating an assignment, not a bare announcement', () => {
    const shareUrl = new URL(buildGoogleClassroomShareUrl({ url: launchUrl }));

    expect(shareUrl.searchParams.get('itemtype')).toBe('assignment');
  });

  test('passes title and body through for Classroom to prefill', () => {
    const shareUrl = new URL(
      buildGoogleClassroomShareUrl({
        url: launchUrl,
        title: 'Rhetorical Analysis',
        body: 'Draft your essay in YAWP.',
      })
    );

    expect(shareUrl.searchParams.get('title')).toBe('Rhetorical Analysis');
    expect(shareUrl.searchParams.get('body')).toBe('Draft your essay in YAWP.');
  });

  test('omits blank and whitespace-only values instead of sending them empty', () => {
    const shareUrl = new URL(
      buildGoogleClassroomShareUrl({ url: launchUrl, title: '   ', body: '' })
    );

    expect(shareUrl.searchParams.has('title')).toBe(false);
    expect(shareUrl.searchParams.has('body')).toBe(false);
  });

  test('honours a caller-chosen item type', () => {
    const shareUrl = new URL(
      buildGoogleClassroomShareUrl({ url: launchUrl, itemType: 'material' })
    );

    expect(shareUrl.searchParams.get('itemtype')).toBe('material');
  });

  test('refuses to build a share URL with nothing to share', () => {
    expect(() => buildGoogleClassroomShareUrl({ url: '' })).toThrow(
      /share URL is required/i
    );
  });
});
