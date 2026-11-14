import { describe, it, expect, mock } from 'bun:test';
import { createRevisionScheduler } from './use-editor-sync';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('createRevisionScheduler', () => {
  it('fires after the interval if no further schedule() calls happen', async () => {
    let currentHash = 'h1';
    const fire = mock(() => Promise.resolve());
    const scheduler = createRevisionScheduler({
      intervalMs: 30,
      getHash: async () => currentHash,
      fireRevision: fire,
    });

    scheduler.schedule();
    await wait(60);

    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('resets the timer on each schedule() call (no fire if interrupted)', async () => {
    const fire = mock(() => Promise.resolve());
    const scheduler = createRevisionScheduler({
      intervalMs: 30,
      getHash: async () => 'h1',
      fireRevision: fire,
    });

    scheduler.schedule();
    await wait(20);
    scheduler.schedule(); // reset
    await wait(20);
    scheduler.schedule(); // reset again
    await wait(20);

    // Total 60ms elapsed but never 30ms without a reset
    expect(fire).toHaveBeenCalledTimes(0);

    await wait(40); // now 40ms idle past last schedule
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('dedupes: skips firing when content hash is unchanged since last revision', async () => {
    const fire = mock(() => Promise.resolve());
    const scheduler = createRevisionScheduler({
      intervalMs: 30,
      getHash: async () => 'same-hash',
      fireRevision: fire,
    });

    scheduler.schedule();
    await wait(60);
    expect(fire).toHaveBeenCalledTimes(1);

    // Content hash unchanged → next schedule should skip the fire
    scheduler.schedule();
    await wait(60);
    expect(fire).toHaveBeenCalledTimes(1); // still 1
  });

  it('fires again after a content change', async () => {
    let currentHash = 'h1';
    const fire = mock(() => Promise.resolve());
    const scheduler = createRevisionScheduler({
      intervalMs: 30,
      getHash: async () => currentHash,
      fireRevision: fire,
    });

    scheduler.schedule();
    await wait(60);
    expect(fire).toHaveBeenCalledTimes(1);

    currentHash = 'h2'; // content changed
    scheduler.schedule();
    await wait(60);
    expect(fire).toHaveBeenCalledTimes(2);
  });

  it('cancel() prevents a pending fire', async () => {
    const fire = mock(() => Promise.resolve());
    const scheduler = createRevisionScheduler({
      intervalMs: 30,
      getHash: async () => 'h',
      fireRevision: fire,
    });

    scheduler.schedule();
    await wait(15);
    scheduler.cancel();
    await wait(40);

    expect(fire).toHaveBeenCalledTimes(0);
  });
});
