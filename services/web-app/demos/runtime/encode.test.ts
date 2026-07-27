import { describe, expect, it } from 'bun:test';
import { buildFfmpegArgs, type EncodeSpec } from './encode';

const spec = (overrides: Partial<EncodeSpec> = {}): EncodeSpec => ({
  input: '/tmp/raw.webm',
  output: '/tmp/out/writing-practice.mp4',
  trimStartMs: 0,
  width: 1280,
  height: 800,
  fps: 30,
  crf: 20,
  ...overrides,
});

/** Read the value that follows a flag, e.g. valueOf(args, '-crf'). */
function valueOf(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

describe('buildFfmpegArgs', () => {
  it('reads the input and writes the output', () => {
    const args = buildFfmpegArgs(spec());
    expect(valueOf(args, '-i')).toBe('/tmp/raw.webm');
    expect(args.at(-1)).toBe('/tmp/out/writing-practice.mp4');
  });

  it('produces H.264 in a pixel format every player accepts', () => {
    const args = buildFfmpegArgs(spec());
    expect(valueOf(args, '-c:v')).toBe('libx264');
    // Without yuv420p, Slack and QuickTime show a black or garbled frame.
    expect(valueOf(args, '-pix_fmt')).toBe('yuv420p');
  });

  it('moves the moov atom up front so the video streams before it downloads', () => {
    const args = buildFfmpegArgs(spec());
    expect(valueOf(args, '-movflags')).toBe('+faststart');
  });

  it('overwrites an existing file instead of hanging on a prompt', () => {
    expect(buildFfmpegArgs(spec())).toContain('-y');
  });

  it('drops the silent audio track', () => {
    expect(buildFfmpegArgs(spec())).toContain('-an');
  });

  it('passes through frame rate and quality', () => {
    const args = buildFfmpegArgs(spec({ fps: 24, crf: 18 }));
    expect(valueOf(args, '-r')).toBe('24');
    expect(valueOf(args, '-crf')).toBe('18');
  });

  describe('trimming', () => {
    it('omits the seek flag when there is nothing to trim', () => {
      expect(buildFfmpegArgs(spec({ trimStartMs: 0 }))).not.toContain('-ss');
    });

    it('seeks in seconds when trimming setup off the front', () => {
      const args = buildFfmpegArgs(spec({ trimStartMs: 2500 }));
      expect(valueOf(args, '-ss')).toBe('2.500');
    });

    it('seeks after the input so the trim lands on an exact frame', () => {
      // -ss before -i is fast but snaps to a keyframe, which can leave a
      // slice of the login screen at the head of the video.
      const args = buildFfmpegArgs(spec({ trimStartMs: 2500 }));
      expect(args.indexOf('-ss')).toBeGreaterThan(args.indexOf('-i'));
    });

    it('ignores a negative trim rather than seeking backwards', () => {
      expect(buildFfmpegArgs(spec({ trimStartMs: -400 }))).not.toContain('-ss');
    });
  });

  describe('scaling', () => {
    it('scales to the requested frame size', () => {
      const filter = valueOf(buildFfmpegArgs(spec()), '-vf');
      expect(filter).toContain('scale=1280:800');
    });

    it('rounds odd dimensions up to even, which H.264 requires', () => {
      const filter = valueOf(
        buildFfmpegArgs(spec({ width: 1281, height: 801 })),
        '-vf'
      );
      expect(filter).toContain('scale=1282:802');
    });

    it('pads rather than stretches when the capture aspect differs', () => {
      const filter = valueOf(buildFfmpegArgs(spec()), '-vf');
      expect(filter).toContain('force_original_aspect_ratio=decrease');
      expect(filter).toContain('pad=1280:800');
    });
  });

  it('rejects a non-mp4 output, since mp4 is what we promise callers', () => {
    expect(() => buildFfmpegArgs(spec({ output: '/tmp/out.webm' }))).toThrow(
      /mp4/i
    );
  });

  it('rejects a zero or negative frame size', () => {
    expect(() => buildFfmpegArgs(spec({ width: 0 }))).toThrow(/width/i);
    expect(() => buildFfmpegArgs(spec({ height: -10 }))).toThrow(/height/i);
  });

  it('rejects a frame rate that would produce no frames', () => {
    expect(() => buildFfmpegArgs(spec({ fps: 0 }))).toThrow(/fps/i);
  });
});
