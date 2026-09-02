import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { JobStore } from './jobs';
import {
  buildTranscodeArgs,
  claimNextJob,
  markFailed,
  markSucceeded,
  shotFileName,
  missingRecordingError,
  rawStillFileName,
} from './jobs';

const prisma = {
  marketingMediaJob: {
    findFirst: mock(),
    updateMany: mock(),
    update: mock(),
  },
};

const db = () => prisma as unknown as JobStore;

const QUEUED_JOB = {
  id: 'job-1',
  kind: 'STILLS',
  status: 'QUEUED',
  attempts: 0,
  storyboard: {
    slug: 'teacher-loop',
    title: 'The teacher loop',
    persona: 'teacher',
    scenes: [{ id: 'dashboard', goto: '/app', waitFor: 'main' }],
  },
};

describe('claimNextJob', () => {
  beforeEach(() => {
    prisma.marketingMediaJob.findFirst.mockReset();
    prisma.marketingMediaJob.updateMany.mockReset();
  });

  test('returns null when nothing is queued', async () => {
    prisma.marketingMediaJob.findFirst.mockResolvedValue(null);

    expect(await claimNextJob({ prisma: db(), workerId: 'w1' })).toBeNull();
  });

  test('claims a queued job by writing a lock', async () => {
    prisma.marketingMediaJob.findFirst.mockResolvedValue(QUEUED_JOB);
    prisma.marketingMediaJob.updateMany.mockResolvedValue({ count: 1 });

    const claimed = await claimNextJob({ prisma: db(), workerId: 'w1' });

    expect(claimed?.id).toBe('job-1');
    const update = prisma.marketingMediaJob.updateMany.mock.calls[0][0];
    expect(update.where.id).toBe('job-1');
    expect(update.where.status).toBe('QUEUED');
    expect(update.data.status).toBe('RENDERING');
    expect(update.data.lockedBy).toBe('w1');
    expect(update.data.attempts.increment).toBe(1);
  });

  // markFailed keeps a retryable job's error message on the row so an admin
  // can see what went wrong — but that row goes back to QUEUED, and the next
  // claim must not leave that stale message sitting under a fresh RENDERING
  // badge. Reproduces the job page showing "This render failed" next to a
  // job actively filming attempt 2.
  test('clears the previous attempt error when claiming a retry', async () => {
    prisma.marketingMediaJob.findFirst.mockResolvedValue({
      ...QUEUED_JOB,
      attempts: 1,
      error: 'waitFor: Timeout 20000ms exceeded.',
    });
    prisma.marketingMediaJob.updateMany.mockResolvedValue({ count: 1 });

    await claimNextJob({ prisma: db(), workerId: 'w1' });

    const update = prisma.marketingMediaJob.updateMany.mock.calls[0][0];
    expect(update.data.error).toBeNull();
  });

  test('returns null when another worker won the race', async () => {
    prisma.marketingMediaJob.findFirst.mockResolvedValue(QUEUED_JOB);
    prisma.marketingMediaJob.updateMany.mockResolvedValue({ count: 0 });

    expect(await claimNextJob({ prisma: db(), workerId: 'w1' })).toBeNull();
  });

  test('rejects a job whose stored storyboard no longer validates', async () => {
    prisma.marketingMediaJob.findFirst.mockResolvedValue({
      ...QUEUED_JOB,
      storyboard: {
        slug: 'x',
        scenes: [{ id: 'nope', goto: '/app/admin/organizations' }],
      },
    });
    prisma.marketingMediaJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.marketingMediaJob.update = mock().mockResolvedValue({});

    const claimed = await claimNextJob({ prisma: db(), workerId: 'w1' });

    expect(claimed).toBeNull();
    expect(prisma.marketingMediaJob.update.mock.calls[0][0].data.status).toBe(
      'FAILED'
    );
  });

  test('looks for stale locks as well as queued work', async () => {
    prisma.marketingMediaJob.findFirst.mockResolvedValue(null);

    await claimNextJob({ prisma: db(), workerId: 'w1' });

    const where = prisma.marketingMediaJob.findFirst.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('RENDERING');
    expect(JSON.stringify(where)).toContain('lockedAt');
  });
});

describe('markSucceeded and markFailed', () => {
  beforeEach(() => {
    prisma.marketingMediaJob.update = mock().mockResolvedValue({});
  });

  test('records outputs and finishes the job', async () => {
    await markSucceeded({
      prisma: db(),
      jobId: 'job-1',
      outputs: [
        {
          kind: 'IMAGE',
          key: 'marketing-media/job-1/01-dashboard.png',
          contentType: 'image/png',
          bytes: 10,
          label: 'dashboard',
        },
      ],
    });

    const data = prisma.marketingMediaJob.update.mock.calls[0][0].data;
    expect(data.status).toBe('SUCCEEDED');
    expect(data.outputs).toHaveLength(1);
    expect(data.error).toBeNull();
    expect(data.finishedAt).toBeInstanceOf(Date);
  });

  test('re-queues a failure that still has attempts left', async () => {
    await markFailed({
      prisma: db(),
      jobId: 'job-1',
      attempts: 1,
      error: new Error('navigation timeout'),
    });

    const data = prisma.marketingMediaJob.update.mock.calls[0][0].data;
    expect(data.status).toBe('QUEUED');
    expect(data.error).toContain('navigation timeout');
    expect(data.lockedBy).toBeNull();
  });

  test('gives up once the attempt budget is spent', async () => {
    await markFailed({
      prisma: db(),
      jobId: 'job-1',
      attempts: 3,
      error: new Error('navigation timeout'),
    });

    const data = prisma.marketingMediaJob.update.mock.calls[0][0].data;
    expect(data.status).toBe('FAILED');
    expect(data.finishedAt).toBeInstanceOf(Date);
  });
});

describe('shotFileName', () => {
  test('numbers and pads shots so the gallery keeps storyboard order', () => {
    expect(shotFileName(1, 'dashboard')).toBe('01-dashboard.png');
    expect(shotFileName(12, 'student-work')).toBe('12-student-work.png');
  });

  test('sanitizes a name that would not survive an object key', () => {
    expect(shotFileName(2, 'grade / feedback')).toBe('02-grade-feedback.png');
  });
});

describe('buildTranscodeArgs', () => {
  test('produces a silent, phone-safe mp4', () => {
    const args = buildTranscodeArgs('/tmp/in.webm', '/tmp/out.mp4');

    expect(args).toContain('-an');
    expect(args.join(' ')).toContain('libx264');
    expect(args.join(' ')).toContain('yuv420p');
    expect(args.join(' ')).toContain('+faststart');
    expect(args[args.length - 1]).toBe('/tmp/out.mp4');
  });

  test('trims the recorded lead-in when asked', () => {
    const args = buildTranscodeArgs('/tmp/in.webm', '/tmp/out.mp4', {
      trimStartSeconds: 6.42,
    });

    const ssIndex = args.indexOf('-ss');
    expect(ssIndex).toBeGreaterThan(args.indexOf('/tmp/in.webm'));
    expect(args[ssIndex + 1]).toBe('6.42');
  });

  test('does not emit a trim for zero or missing lead-in', () => {
    expect(buildTranscodeArgs('/tmp/in.webm', '/tmp/out.mp4')).not.toContain(
      '-ss'
    );
    expect(
      buildTranscodeArgs('/tmp/in.webm', '/tmp/out.mp4', {
        trimStartSeconds: 0,
      })
    ).not.toContain('-ss');
  });

  test('forces even dimensions so h264 does not reject the input', () => {
    expect(
      buildTranscodeArgs('/tmp/in.webm', '/tmp/out.mp4').join(' ')
    ).toContain('trunc(iw/2)*2');
  });
});

describe('framedStillFileName', () => {
  // The framed still is the deliverable and keeps the plain name the job page
  // and downloads already use; the raw capture sits beside it, marked.
  test('marks the raw capture beside the framed one', () => {
    expect(rawStillFileName('01-grading-hub.png')).toBe('01-grading-hub-raw.png');
  });
});

describe('missingRecordingError', () => {
  // A wedged teardown leaves no recording behind. Handing ffmpeg a path that
  // does not exist reported a 254 and a wall of build flags; the attempt
  // should say what actually happened so the retry reads as deliberate.
  test('names the cause rather than the symptom', () => {
    const error = missingRecordingError('/tmp/marketing-x/video/page@1.webm');
    expect(error.message).toMatch(/recording was not written/i);
    expect(error.message).toMatch(/shut down cleanly/i);
    expect(error.message).toContain('page@1.webm');
  });
});
