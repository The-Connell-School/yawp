/**
 * Embedded renderer: runs the render worker beside the dev server it films.
 *
 * Fast-mode previews and local worktrees have no renderer container. Previews
 * define one in their compose file, but the deploy script on main never starts
 * it, and a worktree has nowhere to run one at all. In both, the studio's UI
 * works and every job sits in QUEUED forever.
 *
 * Both environments do have a dev server started from this repository's own
 * `dev` script, in a container (or shell) that already holds everything the
 * worker needs: the database URL, the preview seat codes, the demo
 * confirmation, and the disk the web app serves media from. So the dev script
 * starts this supervisor, which points the worker at `http://localhost:<port>`
 * — the server in the same container — and keeps it running.
 *
 * The gate here is deliberately narrow. It never runs outside a development
 * server, never overrides the studio's own explicit demo confirmation, and
 * only runs where renders are stored on disk (an S3 environment has a real
 * renderer and this would be a second one holding no credentials).
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  RENDERER_STATUS_FILE,
  type RendererState,
} from '@app/marketing-media';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type EmbeddedDecision =
  | { run: true; port: number }
  | { run: false; reason: string };

const DEFAULT_MASTER_ORGANIZATION_ID = 'local-dev-org';

/** A worker that exits faster than this did not get as far as filming. */
const SHORT_RUN_MS = 10_000;
const RESTART_DELAY_MS = 5_000;
const SHORT_RUN_RESTART_DELAY_MS = 15_000;
const MAX_RESTART_DELAY_MS = 5 * 60 * 1000;
/**
 * After asking the worker to stop, how long to let it finish what it is
 * filming before it is killed outright. A take is abandoned at that point;
 * its lock expires and another worker refilms it.
 */
const DEFAULT_STOP_GRACE_MS = 60_000;
/** Comfortably inside RENDERER_STATUS_STALE_MS, so a live worker stays believed. */
const RENDERER_HEARTBEAT_MS = 60_000;
/** One trial launch of the browser; the real launches in render.ts allow 60s. */
const LAUNCH_CHECK_TIMEOUT_MS = 45_000;
/** Between attempts to get a browser that launches, once the immediate fixes are spent. */
const LAUNCH_RETRY_DELAY_MS = 5 * 60 * 1000;

/**
 * Tell the studio what this renderer can do, beside the media it produces.
 * Best effort: a renderer that cannot write its status still films, and one
 * that cannot film has already logged why — this only makes the log visible
 * on the screen where somebody is waiting for a render.
 */
function publishStatus(
  env: NodeJS.ProcessEnv,
  state: RendererState,
  reason?: string
): void {
  const dir = env.MARKETING_MEDIA_DIR?.trim();
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, RENDERER_STATUS_FILE),
      JSON.stringify({
        state,
        reason,
        at: new Date().toISOString(),
        workerId: env.MARKETING_RENDERER_WORKER_ID,
      })
    );
  } catch {
    // Nothing to do: the log line beside this call is the fallback.
  }
}

function log(message: string, extra: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      message: `embedded renderer: ${message}`,
      ...extra,
    })
  );
}

/**
 * The port the dev server listens on. Read from the arguments the server was
 * given (`--port 8080` in previews), then from PORT the way vite.config.ts
 * does. Never guessed: filming the wrong port films nothing.
 */
export function parseDevServerPort(
  argv: string[],
  env: NodeJS.ProcessEnv
): number | null {
  let raw: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port') raw = argv[i + 1];
    else if (arg.startsWith('--port=')) raw = arg.slice('--port='.length);
  }
  raw ??= env.PORT;
  if (!raw) return null;
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

export function decideEmbeddedRenderer(
  env: NodeJS.ProcessEnv,
  argv: string[]
): EmbeddedDecision {
  if (env.MARKETING_EMBEDDED_RENDERER === 'off') {
    return { run: false, reason: 'MARKETING_EMBEDDED_RENDERER is off' };
  }
  if (env.NODE_ENV !== 'development') {
    return {
      run: false,
      reason: 'only runs beside a development server (NODE_ENV=development)',
    };
  }
  if (env.E2E === 'true' || env.CI) {
    return { run: false, reason: 'not used in e2e or CI runs' };
  }
  if (env.MARKETING_STUDIO_ENABLED !== 'on') {
    return { run: false, reason: 'MARKETING_STUDIO_ENABLED is not on' };
  }
  if (env.MARKETING_RENDER_TARGET_IS_DEMO !== 'confirmed') {
    return {
      run: false,
      reason: 'MARKETING_RENDER_TARGET_IS_DEMO is not "confirmed"',
    };
  }
  if (!env.MARKETING_MEDIA_DIR?.trim()) {
    return {
      run: false,
      reason:
        'MARKETING_MEDIA_DIR is not set; this environment stores renders in S3 and expects the dedicated renderer',
    };
  }
  const port = parseDevServerPort(argv, env);
  if (port === null) {
    return {
      run: false,
      reason: 'cannot determine the dev server port (pass --port or set PORT)',
    };
  }
  return { run: true, port };
}

/**
 * The seat code the worker presents to the preview access gate.
 *
 * Dev-login personas belong to the seed's local-dev-org, and the seat-session
 * guard destroys any session whose membership is not the seat's organization.
 * So the seat must be that organization's — the first seat in the list is
 * only a fallback when none matches.
 */
export function selectPreviewSeatCode(env: NodeJS.ProcessEnv): string | null {
  const raw = env.PREVIEW_ACCESS_SEATS?.trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const seats = parsed.filter(
    (seat): seat is { code: string; organizationId?: string } =>
      Boolean(seat) &&
      typeof seat === 'object' &&
      typeof (seat as { code?: unknown }).code === 'string'
  );
  if (seats.length === 0) return null;
  const masterOrganizationId =
    env.PREVIEW_ACCESS_MASTER_ORGANIZATION_ID?.trim() ||
    DEFAULT_MASTER_ORGANIZATION_ID;
  const master = seats.find(
    (seat) => seat.organizationId === masterOrganizationId
  );
  return (master ?? seats[0]).code;
}

export function buildEmbeddedRendererEnv(
  env: NodeJS.ProcessEnv,
  params: { port: number; repoRoot: string; hostname: string; pid: number }
): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env };

  // The server is in this container; the public hostname may not route back
  // here. Chromium treats localhost as a secure context, so a TLS preview's
  // Secure session cookie is still sent.
  next.MARKETING_RENDER_TARGET_URL = `http://localhost:${params.port}`;
  next.MARKETING_MEDIA_STORAGE = 'disk';
  next.MARKETING_RENDERER_WORKER_ID = `embedded-${params.hostname}-${params.pid}`;

  if (env.PREVIEW_ACCESS_GATE === 'on') {
    const code = selectPreviewSeatCode(env);
    if (code) next.MARKETING_RENDERER_ACCESS_CODE = code;
  }

  // Under node_modules so that in a fast preview — where node_modules is a
  // named volume — the browser survives the container being recreated.
  if (!env.PLAYWRIGHT_BROWSERS_PATH?.trim()) {
    next.PLAYWRIGHT_BROWSERS_PATH = path.join(
      params.repoRoot,
      'node_modules',
      '.cache',
      'ms-playwright'
    );
  }

  return next;
}

/** Grace between SIGTERM and SIGKILL on stop; MARKETING_EMBEDDED_STOP_GRACE_MS overrides. */
export function stopGraceMs(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.MARKETING_EMBEDDED_STOP_GRACE_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_STOP_GRACE_MS;
}

/**
 * The one line of a failed browser launch worth reading. Playwright's message
 * is the launch command and every flag, then the browser's own stderr; the
 * missing library, when that is the cause, is named on the last line.
 */
export function describeLaunchFailure(message: string): string {
  const library = message.match(
    /error while loading shared libraries: ([^:\s]+)/
  );
  if (library) {
    return `missing system library ${library[1]} (Chromium cannot start without it)`;
  }
  const stderr = [...message.matchAll(/\[err\] (.+)/g)].map((m) => m[1].trim());
  if (stderr.length > 0) return stderr[stderr.length - 1];
  return message.split('\n')[0].trim();
}

/**
 * How long to wait before restarting an exited worker. `runDurationsMs` lists
 * how long each run lasted, oldest first. A quick exit usually means the
 * worker is waiting on something outside itself — a database still coming
 * up, a browser not yet installed — so consecutive quick exits back off
 * exponentially, to a cap, and never give up: a preview that recovers should
 * find its renderer waiting.
 */
export function nextRestartDelayMs(runDurationsMs: number[]): number {
  let consecutiveShort = 0;
  for (let i = runDurationsMs.length - 1; i >= 0; i--) {
    if (runDurationsMs[i] >= SHORT_RUN_MS) break;
    consecutiveShort++;
  }
  if (consecutiveShort === 0) return RESTART_DELAY_MS;
  return Math.min(
    SHORT_RUN_RESTART_DELAY_MS * 2 ** (consecutiveShort - 1),
    MAX_RESTART_DELAY_MS
  );
}

/**
 * A Chromium binary handed to the worker directly, when it exists. The compose
 * renderer service does this from Playwright's image; a worktree may point at
 * browsers installed elsewhere. Either way nothing needs downloading.
 */
export function configuredChromiumPath(
  env: NodeJS.ProcessEnv,
  exists: (candidate: string) => boolean = (candidate) =>
    fs.existsSync(candidate)
): string | null {
  const candidate = env.MARKETING_RENDERER_CHROMIUM_PATH?.trim();
  return candidate && exists(candidate) ? candidate : null;
}

/**
 * Path to Playwright's `cli.js`. The package's exports map does not expose it
 * as a subpath, so it is located beside the package's resolved entry point.
 */
export function resolvePlaywrightCli(): string {
  const requireCjs = createRequire(import.meta.url);
  const entry = requireCjs.resolve('playwright');
  return path.join(path.dirname(entry), 'cli.js');
}

// ---------------------------------------------------------------------------
// Process management. Nothing below is exercised by unit tests; it is the glue
// that the decisions above feed.
// ---------------------------------------------------------------------------

function commandExists(name: string): boolean {
  return spawnSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' })
    .status === 0;
}

function runToCompletion(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code));
  });
}

function isRoot(): boolean {
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

/**
 * ffmpeg (H.264 transcode) and node (the framing stage) are needed for CLIP
 * jobs. The preview web image has neither; install them when this is root on
 * a Debian-family image. Stills need neither, so a failure here is logged and
 * the worker still starts — a clip job then fails with the real error.
 */
async function ensureSystemTools(env: NodeJS.ProcessEnv): Promise<void> {
  const packages: string[] = [];
  if (!commandExists('node')) packages.push('nodejs');
  if (!commandExists(env.FFMPEG_PATH?.trim() || 'ffmpeg')) packages.push('ffmpeg');
  if (packages.length === 0) return;
  if (!isRoot() || !commandExists('apt-get')) {
    log('cannot install system tools here; clip renders will fail until they exist', {
      missing: packages,
    });
    return;
  }
  log('installing system tools', { packages });
  const aptEnv = { ...env, DEBIAN_FRONTEND: 'noninteractive' };
  try {
    await runToCompletion('apt-get', ['update', '-qq'], aptEnv);
    const code = await runToCompletion(
      'apt-get',
      ['install', '-y', '-qq', '--no-install-recommends', ...packages],
      aptEnv
    );
    if (code !== 0) log('system tool install failed', { packages, code });
  } catch (err) {
    log('system tool install failed', {
      packages,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function ensureChromium(env: NodeJS.ProcessEnv): Promise<boolean> {
  const configured = configuredChromiumPath(env);
  if (configured) {
    log('using configured Chromium', { path: configured });
    return true;
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH = env.PLAYWRIGHT_BROWSERS_PATH;
  const { chromium } = await import('playwright');
  const executable = () => {
    try {
      const candidate = chromium.executablePath();
      return candidate && fs.existsSync(candidate) ? candidate : null;
    } catch {
      return null;
    }
  };
  if (executable()) return true;

  const cli = resolvePlaywrightCli();
  // Playwright's CLI is written for Node; use it when the image has one.
  const runner = commandExists('node') ? 'node' : process.execPath;
  const withDeps = isRoot() && commandExists('apt-get') ? ['--with-deps'] : [];
  log('installing Chromium', {
    into: env.PLAYWRIGHT_BROWSERS_PATH,
    withSystemDeps: withDeps.length > 0,
  });
  try {
    const code = await runToCompletion(
      runner,
      [cli, 'install', ...withDeps, 'chromium'],
      env
    );
    if (code !== 0) log('Chromium install exited non-zero', { code });
  } catch (err) {
    log('Chromium install failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  const ready = executable() !== null;
  if (!ready) {
    log('Chromium is still missing; renders will fail until it is installed');
  }
  return ready;
}

/** Launch the browser once, the way a render would, and close it again. */
async function verifyChromiumLaunch(
  env: NodeJS.ProcessEnv
): Promise<{ ok: true } | { ok: false; error: string }> {
  process.env.PLAYWRIGHT_BROWSERS_PATH = env.PLAYWRIGHT_BROWSERS_PATH;
  const { chromium } = await import('playwright');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const browser = await Promise.race([
      chromium.launch({
        headless: true,
        executablePath: configuredChromiumPath(env) ?? undefined,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Browser launch check exceeded 45s')),
          LAUNCH_CHECK_TIMEOUT_MS
        );
      }),
    ]);
    await browser.close().catch(() => {});
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Chromium's system libraries, installed on their own. `install --with-deps`
 * does this too, but its failure is easy to miss inside the download's
 * output; when the browser is present and still will not start, this is the
 * step that was missing.
 */
async function installSystemDeps(env: NodeJS.ProcessEnv): Promise<boolean> {
  if (!isRoot() || !commandExists('apt-get')) {
    log('cannot install Chromium system libraries here: not root, or no apt-get');
    return false;
  }
  const runner = commandExists('node') ? 'node' : process.execPath;
  log('installing Chromium system libraries');
  try {
    const code = await runToCompletion(
      runner,
      [resolvePlaywrightCli(), 'install-deps', 'chromium'],
      env
    );
    if (code !== 0) log('system library install exited non-zero', { code });
    return code === 0;
  } catch (err) {
    log('system library install failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Do not hand the worker a browser that cannot start. Every job it claimed
 * would fail three times with a page of flags, when the honest state is
 * "no renderer attached" — which is what a queued job shows while this waits.
 * Fixes are tried in order (download, system libraries), then this checks
 * back every few minutes so a transient apt failure heals on its own.
 */
async function ensureBrowserLaunches(env: NodeJS.ProcessEnv): Promise<void> {
  publishStatus(env, 'starting');
  for (let attempt = 1; ; attempt += 1) {
    await ensureChromium(env);
    let result = await verifyChromiumLaunch(env);
    if (!result.ok) {
      log('Chromium cannot start', {
        attempt,
        reason: describeLaunchFailure(result.error),
      });
      if (await installSystemDeps(env)) {
        result = await verifyChromiumLaunch(env);
        if (!result.ok) {
          log('Chromium still cannot start after installing libraries', {
            reason: describeLaunchFailure(result.error),
          });
        }
      }
    }
    if (result.ok) {
      log('Chromium launches; starting the worker');
      publishStatus(env, 'ready');
      return;
    }
    const reason = describeLaunchFailure(result.error);
    log('no working browser; jobs will wait as "no renderer attached"', {
      retryInMs: LAUNCH_RETRY_DELAY_MS,
      reason,
    });
    publishStatus(env, 'blocked', reason);
    await new Promise((resolve) => setTimeout(resolve, LAUNCH_RETRY_DELAY_MS));
  }
}

async function superviseWorker(
  env: NodeJS.ProcessEnv,
  rendererDir: string
): Promise<void> {
  const workerPath = path.join(rendererDir, 'src', 'worker.ts');
  const runDurations: number[] = [];
  let stopping = false;
  let child: ChildProcess | null = null;

  const stop = () => {
    if (stopping) return;
    stopping = true;
    log('stopping');
    const worker = child;
    if (!worker) return;
    worker.kill('SIGTERM');
    // The worker finishes its current take, then exits. A worker that is
    // still here after the grace is wedged, not working.
    const grace = stopGraceMs(env);
    const killer = setTimeout(() => {
      if (worker.exitCode === null) {
        log('worker did not stop in time; killing it', { graceMs: grace });
        worker.kill('SIGKILL');
      }
    }, grace);
    killer.unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  // The claim to be ready has to stay fresh, or the studio correctly stops
  // believing it: a worker that is quietly filming looks the same as one
  // whose container has gone.
  const heartbeat = setInterval(
    () => publishStatus(env, 'ready'),
    RENDERER_HEARTBEAT_MS
  );
  heartbeat.unref();

  while (!stopping) {
    const startedAt = Date.now();
    log('starting worker', {
      target: env.MARKETING_RENDER_TARGET_URL,
      workerId: env.MARKETING_RENDERER_WORKER_ID,
      gated: Boolean(env.MARKETING_RENDERER_ACCESS_CODE),
    });
    const worker = spawn(process.execPath, ['run', workerPath], {
      cwd: rendererDir,
      env,
      stdio: 'inherit',
    });
    child = worker;
    const code = await new Promise<number | null>((resolve) => {
      worker.on('error', (err) => {
        log('worker failed to start', { error: err.message });
        resolve(1);
      });
      worker.on('exit', resolve);
    });
    child = null;
    if (stopping) break;

    runDurations.push(Date.now() - startedAt);
    const delay = nextRestartDelayMs(runDurations);
    log('worker exited; restarting', { exitCode: code, inMs: delay });
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  clearInterval(heartbeat);
}

async function main() {
  const argv = process.argv.slice(2);
  const decision = decideEmbeddedRenderer(process.env, argv);
  if (!decision.run) {
    log('off', { reason: decision.reason });
    return;
  }

  const rendererDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
  );
  const repoRoot = path.resolve(rendererDir, '..', '..');
  const env = buildEmbeddedRendererEnv(process.env, {
    port: decision.port,
    repoRoot,
    hostname: os.hostname(),
    pid: process.pid,
  });

  if (env.PREVIEW_ACCESS_GATE === 'on' && !env.MARKETING_RENDERER_ACCESS_CODE) {
    log('the preview access gate is on but PREVIEW_ACCESS_SEATS holds no usable seat; renders will be refused at the gate');
  }

  await ensureSystemTools(env);
  await ensureBrowserLaunches(env);
  await superviseWorker(env, rendererDir);
}

if (import.meta.main) {
  main().catch((err) => {
    log('crashed', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
