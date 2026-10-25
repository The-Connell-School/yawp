import { describe, expect, it, mock } from 'bun:test';
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

  it('redacts signing errors before logging', async () => {
    const warn = mock(() => {});
    const original = console.warn;
    console.warn = warn as typeof console.warn;
    try {
      await getTeacherTrainingPlaybackUrl('videos/module.mp4', async () => {
        throw new Error('token=AWS-SECRET-KEY teacher@school.edu');
      });
      const serialized = JSON.stringify(warn.mock.calls);
      expect(serialized).toContain('teacher_training_video_sign_failed');
      expect(serialized).not.toContain('AWS-SECRET-KEY');
      expect(serialized).not.toContain('teacher@school.edu');
    } finally {
      console.warn = original;
    }
  });
});
