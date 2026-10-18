import { describe, expect, test } from 'bun:test';
import { localLoungeVideoPath, loungeVideoStoreKind } from './video-storage.server';

describe('loungeVideoStoreKind', () => {
  test('real environments use S3', () => {
    expect(loungeVideoStoreKind({ NODE_ENV: 'production' })).toBe('s3');
    expect(loungeVideoStoreKind({ NODE_ENV: 'development' })).toBe('s3');
  });

  test('end-to-end tests, or an explicit local setting, keep videos on disk', () => {
    expect(loungeVideoStoreKind({ E2E: 'true' })).toBe('local');
    expect(loungeVideoStoreKind({ LOUNGE_VIDEO_LOCAL_STORE: 'true' })).toBe('local');
  });

  test('production never uses the local store, whatever else is set', () => {
    expect(loungeVideoStoreKind({ NODE_ENV: 'production', E2E: 'true', LOUNGE_VIDEO_LOCAL_STORE: 'true' })).toBe('s3');
  });

  test('PR previews keep videos in the container; demo uses S3', () => {
    expect(loungeVideoStoreKind({ NODE_ENV: 'production', YAWP_ENVIRONMENT: 'preview', PREVIEW_SLUG: 'pr-484' })).toBe('local');
    expect(loungeVideoStoreKind({ NODE_ENV: 'production', YAWP_ENVIRONMENT: 'preview', PREVIEW_SLUG: 'demo' })).toBe('s3');
    expect(loungeVideoStoreKind({ NODE_ENV: 'production', PREVIEW_SLUG: 'pr-484' })).toBe('s3');
  });
});

describe('localLoungeVideoPath', () => {
  test('maps a valid key inside the store folder', () => {
    expect(localLoungeVideoPath('/tmp/store', 'lounge/videos/u1/abcdef0123456789.webm')).toBe(
      '/tmp/store/u1/abcdef0123456789.webm'
    );
  });

  test('refuses anything that is not a well-formed video key', () => {
    expect(localLoungeVideoPath('/tmp/store', 'lounge/videos/u1/../../etc/passwd')).toBeNull();
    expect(localLoungeVideoPath('/tmp/store', '/etc/passwd')).toBeNull();
    expect(localLoungeVideoPath('/tmp/store', 'lounge/videos/u1/short.webm')).toBeNull();
  });
});
