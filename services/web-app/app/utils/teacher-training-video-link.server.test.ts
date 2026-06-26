import { describe, expect, it } from 'bun:test';
import { getTeacherTrainingPlaybackUrl } from './teacher-training-video-link.server';

describe('getTeacherTrainingPlaybackUrl', () => {
  it('returns null when a module has no video key', async () => {
    await expect(getTeacherTrainingPlaybackUrl(null)).resolves.toBeNull();
  });

  it('returns the signed playback URL', async () => {
    await expect(
      getTeacherTrainingPlaybackUrl('videos/module.mp4', async () => 'signed-url')
    ).resolves.toBe('signed-url');
  });

  it('keeps the module page renderable when signing fails', async () => {
    await expect(
      getTeacherTrainingPlaybackUrl(
        'videos/module.mp4',
        async () => {
          throw new Error('credentials unavailable');
        },
        () => {}
      )
    ).resolves.toBeNull();
  });
});
