import type { ChildProcess } from 'node:child_process';

/**
 * Wait for a spawned child, bounded, without depending on its stdio closing.
 *
 * The framing runner spawns Chromium, which inherits the runner's stdout and
 * stderr pipes. "close" only fires once the process has exited AND every
 * holder of those pipes has let go — so killing the runner while Chromium
 * lives on means "close" never arrives. A render that hit this sat wedged
 * past the kill that was meant to bound it, until the attempt deadline six
 * minutes later; the retry then did the same work again.
 *
 * "exit" fires when the process dies, whoever still holds a pipe. So: prefer
 * "close" (its output is complete), fall back to "exit" plus a short grace,
 * and on timeout kill the whole process group so the orphans go too.
 */
export type ChildOutcome = {
  code: number | null;
  signal: NodeJS.Signals | null;
  /** The child outlived its deadline and was killed. */
  timedOut: boolean;
};

export type AwaitChildOptions = {
  timeoutMs: number;
  /** How long after "exit" to keep waiting for "close" to flush output. */
  closeGraceMs?: number;
  /** Kill the child's whole process group. Injected so it can be tested. */
  killGroup?: (pid: number) => void;
};

const DEFAULT_CLOSE_GRACE_MS = 2_000;

function killProcessGroup(pid: number): void {
  try {
    // Negative pid targets the group, so Chromium and its helpers die with
    // the runner rather than being orphaned onto the host.
    process.kill(-pid, 'SIGKILL');
  } catch {
    // Already gone, or never became a group leader; the direct kill below
    // is the fallback and its failure is equally uninteresting.
  }
}

export function awaitChildExit(
  child: ChildProcess,
  options: AwaitChildOptions
): Promise<ChildOutcome> {
  const closeGraceMs = options.closeGraceMs ?? DEFAULT_CLOSE_GRACE_MS;
  const killGroup = options.killGroup ?? killProcessGroup;

  return new Promise<ChildOutcome>((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      if (graceTimer) clearTimeout(graceTimer);
      resolve({ code, signal, timedOut });
    };

    const killTimer = setTimeout(() => {
      timedOut = true;
      if (typeof child.pid === 'number') killGroup(child.pid);
      try {
        child.kill('SIGKILL');
      } catch {
        // Nothing to kill; the exit handlers below still settle this.
      }
      // A child that ignores even SIGKILL — unkillable in uninterruptible
      // sleep, say — must not hold the render open either.
      graceTimer = setTimeout(() => settle(null, 'SIGKILL'), closeGraceMs);
    }, options.timeoutMs);

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      if (graceTimer) clearTimeout(graceTimer);
      reject(err);
    });

    child.on('exit', (code, signal) => {
      // Output may still be draining; give "close" a moment to deliver it,
      // but never wait on it — that is the hang this function exists for.
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = setTimeout(() => settle(code, signal), closeGraceMs);
    });

    child.on('close', (code, signal) => settle(code, signal));
  });
}
