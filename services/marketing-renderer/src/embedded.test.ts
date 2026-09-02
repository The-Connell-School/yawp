import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import {
  buildEmbeddedRendererEnv,
  configuredChromiumPath,
  decideEmbeddedRenderer,
  nextRestartDelayMs,
  parseDevServerPort,
  resolvePlaywrightCli,
  selectPreviewSeatCode,
  stopGraceMs,
} from './embedded';

// What a seed-mode fast preview's web container actually receives from the
// compose render on main, minus secrets. The embedded renderer has to work
// from exactly this — it cannot ask the control plane for anything more.
const PREVIEW_WEB_ENV = {
  NODE_ENV: 'development',
  YAWP_ENVIRONMENT: 'preview',
  PREVIEW_DATA_MODE: 'seed',
  PREVIEW_ACCESS_GATE: 'on',
  PREVIEW_ACCESS_SEATS: JSON.stringify([
    { code: 'brave-falcon-7967', organizationId: 'local-dev-org', label: 'Seat 1' },
    { code: 'calm-heron-2210', organizationId: 'preview-seat-2', label: 'Seat 2' },
  ]),
  MARKETING_STUDIO_ENABLED: 'on',
  MARKETING_RENDER_TARGET_URL: 'https://pr-322.preview.yawp.school',
  MARKETING_RENDER_TARGET_IS_DEMO: 'confirmed',
  MARKETING_MEDIA_DIR: '/media',
  DATABASE_URL: 'postgresql://preview:pw@postgres:5432/pr_322',
} as NodeJS.ProcessEnv;

const PREVIEW_DEV_ARGS = ['--host', '0.0.0.0', '--port', '8080'];

describe('parseDevServerPort', () => {
  test('reads the port the dev server was told to listen on', () => {
    expect(parseDevServerPort(['--host', '0.0.0.0', '--port', '8080'], {})).toBe(8080);
    expect(parseDevServerPort(['--port=5199'], {})).toBe(5199);
  });

  test('falls back to PORT, the way vite.config.ts does', () => {
    expect(parseDevServerPort([], { PORT: '5176' })).toBe(5176);
  });

  test('prefers the explicit argument over the environment', () => {
    expect(parseDevServerPort(['--port', '8080'], { PORT: '5176' })).toBe(8080);
  });

  test('returns null rather than guessing', () => {
    expect(parseDevServerPort([], {})).toBeNull();
    expect(parseDevServerPort(['--port', 'eighty'], {})).toBeNull();
  });
});

describe('decideEmbeddedRenderer', () => {
  test('runs inside a seed-mode fast preview web container', () => {
    expect(decideEmbeddedRenderer(PREVIEW_WEB_ENV, PREVIEW_DEV_ARGS)).toEqual({
      run: true,
      port: 8080,
    });
  });

  test('runs for a local worktree that has turned the studio on', () => {
    const decision = decideEmbeddedRenderer(
      {
        NODE_ENV: 'development',
        PORT: '5176',
        MARKETING_STUDIO_ENABLED: 'on',
        MARKETING_RENDER_TARGET_URL: 'http://localhost:5176',
        MARKETING_RENDER_TARGET_IS_DEMO: 'confirmed',
        MARKETING_MEDIA_DIR: '/home/dev/yawp/.worktree-local/marketing-media',
      },
      []
    );
    expect(decision).toEqual({ run: true, port: 5176 });
  });

  // The production image never runs the dev script, but the guard is explicit
  // rather than relying on that: a worker spawned beside a production server
  // is exactly the thing the studio's design refuses.
  test('never runs outside a development server', () => {
    const decision = decideEmbeddedRenderer(
      { ...PREVIEW_WEB_ENV, NODE_ENV: 'production' },
      PREVIEW_DEV_ARGS
    );
    expect(decision.run).toBe(false);
    expect(decision).toMatchObject({ reason: expect.stringMatching(/development/) });
  });

  test('respects the explicit opt-out', () => {
    const decision = decideEmbeddedRenderer(
      { ...PREVIEW_WEB_ENV, MARKETING_EMBEDDED_RENDERER: 'off' },
      PREVIEW_DEV_ARGS
    );
    expect(decision).toMatchObject({ run: false, reason: expect.stringMatching(/off/) });
  });

  // prepare-e2e.ts turns the studio on for the e2e app. Downloading Chromium
  // and running apt inside every CI job is not what that flag means.
  test('stays out of e2e and CI runs', () => {
    expect(decideEmbeddedRenderer({ ...PREVIEW_WEB_ENV, E2E: 'true' }, PREVIEW_DEV_ARGS).run).toBe(false);
    expect(decideEmbeddedRenderer({ ...PREVIEW_WEB_ENV, CI: 'true' }, PREVIEW_DEV_ARGS).run).toBe(false);
  });

  test('requires the studio to be on and the demo target confirmed', () => {
    expect(
      decideEmbeddedRenderer({ ...PREVIEW_WEB_ENV, MARKETING_STUDIO_ENABLED: undefined }, PREVIEW_DEV_ARGS)
    ).toMatchObject({ run: false, reason: expect.stringMatching(/MARKETING_STUDIO_ENABLED/) });
    expect(
      decideEmbeddedRenderer({ ...PREVIEW_WEB_ENV, MARKETING_RENDER_TARGET_IS_DEMO: 'yes' }, PREVIEW_DEV_ARGS)
    ).toMatchObject({ run: false, reason: expect.stringMatching(/MARKETING_RENDER_TARGET_IS_DEMO/) });
  });

  // No media dir means this environment uploads to S3 and expects the ECS
  // renderer; an embedded worker there would need AWS credentials the dev
  // server does not hold, and would double up on a renderer that exists.
  test('only runs where renders are stored on disk', () => {
    const decision = decideEmbeddedRenderer(
      { ...PREVIEW_WEB_ENV, MARKETING_MEDIA_DIR: undefined },
      PREVIEW_DEV_ARGS
    );
    expect(decision).toMatchObject({ run: false, reason: expect.stringMatching(/MARKETING_MEDIA_DIR/) });
  });

  test('will not film a server whose port it cannot determine', () => {
    const decision = decideEmbeddedRenderer(PREVIEW_WEB_ENV, []);
    expect(decision).toMatchObject({ run: false, reason: expect.stringMatching(/port/) });
  });
});

describe('selectPreviewSeatCode', () => {
  // Dev-login personas live in local-dev-org, and the seat-session guard
  // destroys any session whose membership is not the seat's organization. So
  // the seat has to be that org's, whatever position it holds in the list.
  test('picks the local-dev-org seat, not merely the first one', () => {
    const seats = JSON.stringify([
      { code: 'calm-heron-2210', organizationId: 'preview-seat-2', label: 'Seat 2' },
      { code: 'brave-falcon-7967', organizationId: 'local-dev-org', label: 'Seat 1' },
    ]);
    expect(selectPreviewSeatCode({ PREVIEW_ACCESS_SEATS: seats })).toBe('brave-falcon-7967');
  });

  test('honours a configured master organization id', () => {
    const seats = JSON.stringify([
      { code: 'brave-falcon-7967', organizationId: 'local-dev-org', label: 'Seat 1' },
      { code: 'calm-heron-2210', organizationId: 'org-ua', label: 'UA' },
    ]);
    expect(
      selectPreviewSeatCode({
        PREVIEW_ACCESS_SEATS: seats,
        PREVIEW_ACCESS_MASTER_ORGANIZATION_ID: 'org-ua',
      })
    ).toBe('calm-heron-2210');
  });

  test('falls back to the first seat when no organization matches', () => {
    const seats = JSON.stringify([
      { code: 'calm-heron-2210', organizationId: 'somewhere-else', label: 'X' },
    ]);
    expect(selectPreviewSeatCode({ PREVIEW_ACCESS_SEATS: seats })).toBe('calm-heron-2210');
  });

  test('returns null for missing or malformed seats', () => {
    expect(selectPreviewSeatCode({})).toBeNull();
    expect(selectPreviewSeatCode({ PREVIEW_ACCESS_SEATS: 'not json' })).toBeNull();
    expect(selectPreviewSeatCode({ PREVIEW_ACCESS_SEATS: '[]' })).toBeNull();
  });
});

describe('buildEmbeddedRendererEnv', () => {
  const built = buildEmbeddedRendererEnv(PREVIEW_WEB_ENV, {
    port: 8080,
    repoRoot: '/app',
    hostname: 'web-1',
    pid: 42,
  });

  // The public hostname does not resolve to this container from inside the
  // compose network, and the server is right here. Chromium treats localhost
  // as a secure context, so the Secure session cookie a TLS preview sets is
  // still sent — the reason the compose renderer had to film over https does
  // not apply to a worker in the same container as the server.
  test('films the dev server it lives beside, over localhost', () => {
    expect(built.MARKETING_RENDER_TARGET_URL).toBe('http://localhost:8080');
  });

  test('stores renders on the disk the web app serves', () => {
    expect(built.MARKETING_MEDIA_STORAGE).toBe('disk');
    expect(built.MARKETING_MEDIA_DIR).toBe('/media');
  });

  test('presents the seat code when the preview gate is on', () => {
    expect(built.MARKETING_RENDERER_ACCESS_CODE).toBe('brave-falcon-7967');
  });

  test('presents no seat code where there is no gate', () => {
    const local = buildEmbeddedRendererEnv(
      { ...PREVIEW_WEB_ENV, PREVIEW_ACCESS_GATE: undefined },
      { port: 5176, repoRoot: '/home/dev/yawp', hostname: 'laptop', pid: 1 }
    );
    expect(local.MARKETING_RENDERER_ACCESS_CODE).toBeUndefined();
  });

  test('identifies itself as the embedded worker in job locks', () => {
    expect(built.MARKETING_RENDERER_WORKER_ID).toBe('embedded-web-1-42');
  });

  // node_modules is a named volume in fast previews, so a browser stored under
  // it survives the container being recreated on every deploy. The default
  // ~/.cache would be thrown away each time, re-downloading ~170MB.
  test('keeps Chromium under node_modules so it survives redeploys', () => {
    expect(built.PLAYWRIGHT_BROWSERS_PATH).toBe('/app/node_modules/.cache/ms-playwright');
  });

  test('leaves an explicitly configured browser path alone', () => {
    const pinned = buildEmbeddedRendererEnv(
      { ...PREVIEW_WEB_ENV, PLAYWRIGHT_BROWSERS_PATH: '/opt/pw-browsers' },
      { port: 8080, repoRoot: '/app', hostname: 'web-1', pid: 42 }
    );
    expect(pinned.PLAYWRIGHT_BROWSERS_PATH).toBe('/opt/pw-browsers');
  });

  test('passes the rest of the environment through untouched', () => {
    expect(built.DATABASE_URL).toBe(PREVIEW_WEB_ENV.DATABASE_URL);
    expect(built.MARKETING_RENDER_TARGET_IS_DEMO).toBe('confirmed');
  });
});

describe('nextRestartDelayMs', () => {
  test('restarts a worker that ran for a while after a short pause', () => {
    expect(nextRestartDelayMs([120_000])).toBe(5_000);
  });

  // A worker that dies at once is usually waiting on something outside it —
  // a database still coming up, a browser not yet installed. Backing off keeps
  // the log readable without ever abandoning a preview that will recover.
  test('backs off exponentially after consecutive quick exits, capped', () => {
    expect(nextRestartDelayMs([2_000])).toBe(15_000);
    expect(nextRestartDelayMs([2_000, 2_000])).toBe(30_000);
    expect(nextRestartDelayMs([2_000, 2_000, 2_000])).toBe(60_000);
    expect(nextRestartDelayMs([2_000, 2_000, 2_000, 2_000])).toBe(120_000);
    expect(nextRestartDelayMs([2_000, 2_000, 2_000, 2_000, 2_000])).toBe(240_000);
    expect(nextRestartDelayMs(new Array(6).fill(2_000))).toBe(300_000);
    expect(nextRestartDelayMs(new Array(12).fill(1_000))).toBe(300_000);
  });

  test('a long run resets the backoff', () => {
    expect(nextRestartDelayMs([1_000, 2_000, 60_000, 1_000])).toBe(15_000);
  });
});

describe('configuredChromiumPath', () => {
  // The compose renderer service and a local worktree with Playwright's
  // browsers elsewhere both hand the worker a binary directly. Installing a
  // second browser beside it would be waste, and in a sandbox that cannot
  // reach the download CDN it would be a failure for no reason.
  test('returns an explicitly configured binary that exists', () => {
    expect(
      configuredChromiumPath(
        { MARKETING_RENDERER_CHROMIUM_PATH: '/usr/bin/true' },
        (candidate) => candidate === '/usr/bin/true'
      )
    ).toBe('/usr/bin/true');
  });

  test('ignores a configured path that is missing', () => {
    expect(
      configuredChromiumPath(
        { MARKETING_RENDERER_CHROMIUM_PATH: '/nowhere/chrome' },
        () => false
      )
    ).toBeNull();
    expect(configuredChromiumPath({}, () => true)).toBeNull();
  });
});

describe('resolvePlaywrightCli', () => {
  // `playwright/cli.js` is not in the package's exports map, so a subpath
  // require fails under Bun. The CLI has to be found beside the entry point.
  test('locates the installed CLI', () => {
    const cli = resolvePlaywrightCli();
    expect(cli.endsWith('/playwright/cli.js')).toBe(true);
    expect(fs.existsSync(cli)).toBe(true);
  });
});

describe('stopGraceMs', () => {
  test('defaults to a minute and honours an override', () => {
    expect(stopGraceMs({})).toBe(60_000);
    expect(stopGraceMs({ MARKETING_EMBEDDED_STOP_GRACE_MS: '5000' })).toBe(5_000);
    expect(stopGraceMs({ MARKETING_EMBEDDED_STOP_GRACE_MS: 'soon' })).toBe(60_000);
  });
});
