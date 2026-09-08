import { EventEmitter } from 'node:events';
import { describe, expect, test } from 'bun:test';
import { awaitChildExit } from './child';

/** A child process stand-in: exit and close are separate events, as in node. */
function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    pid?: number;
    kill: (signal?: string) => void;
    killed: string[];
  };
  child.pid = 4242;
  child.killed = [];
  child.kill = (signal = 'SIGTERM') => child.killed.push(signal);
  return child;
}

describe('awaitChildExit', () => {
  test('settles on close, keeping whatever the child printed', async () => {
    const child = fakeChild();
    const settled = awaitChildExit(child as never, { timeoutMs: 5_000 });
    child.emit('exit', 0, null);
    child.emit('close', 0, null);
    await expect(settled).resolves.toMatchObject({ code: 0, timedOut: false });
  });

  // The bug this exists for: the framing runner spawns Chromium, which
  // inherits the stdio pipes. Killing the runner leaves those orphans holding
  // the pipes open, so "close" never fires and the whole render hangs until
  // the attempt deadline — six minutes past the kill that was supposed to
  // bound it. "exit" fires regardless of who still holds a pipe.
  test('settles on exit even when close never comes', async () => {
    const child = fakeChild();
    const settled = awaitChildExit(child as never, {
      timeoutMs: 5_000,
      closeGraceMs: 10,
    });
    child.emit('exit', 137, 'SIGKILL');
    await expect(settled).resolves.toMatchObject({ code: 137 });
  });

  test('kills the process group on timeout, then still settles', async () => {
    const child = fakeChild();
    const killedGroups: number[] = [];
    const settled = awaitChildExit(child as never, {
      timeoutMs: 10,
      closeGraceMs: 10,
      killGroup: (pid) => killedGroups.push(pid),
    });
    await new Promise((r) => setTimeout(r, 40));
    child.emit('exit', null, 'SIGKILL');
    const result = await settled;
    expect(killedGroups).toEqual([4242]);
    expect(result.timedOut).toBe(true);
  });

  // A child that ignores the kill must not hold the render either.
  test('gives up on a child that never exits at all', async () => {
    const child = fakeChild();
    const result = await awaitChildExit(child as never, {
      timeoutMs: 10,
      closeGraceMs: 10,
      killGroup: () => {},
    });
    expect(result.timedOut).toBe(true);
    expect(result.code).toBeNull();
  });

  test('rejects when the child cannot be spawned', async () => {
    const child = fakeChild();
    const settled = awaitChildExit(child as never, { timeoutMs: 5_000 });
    child.emit('error', new Error('spawn node ENOENT'));
    await expect(settled).rejects.toThrow(/ENOENT/);
  });
});
