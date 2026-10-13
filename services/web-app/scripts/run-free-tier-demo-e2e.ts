import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webAppRoot = path.resolve(__dirname, '..');

const defaultShotDir =
  '/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-regression-loop-post-fixes';
const shotDir =
  process.env.FREE_TIER_QA_SHOTS_DIR?.trim() ||
  process.env.QA_SCREENSHOT_DIR?.trim() ||
  defaultShotDir;
const defaultBrowsersPath = '/home/bryant/.cache/ms-playwright';

type SuiteSpec = {
  path: string;
  coverage: string;
  source: 'merged' | 'qa-repro-pr';
  runByDefault: boolean;
};

export const suiteSpecs: SuiteSpec[] = [
  {
    path: 'e2e/tests/free-tier.onboarding.spec.ts',
    coverage: 'waitlist, release join, approval, local free-tier onboarding',
    source: 'merged',
    runByDefault: true,
  },
  {
    path: 'e2e/tests/free-tier.feature-flag.spec.ts',
    coverage: 'free-tier route/flag availability',
    source: 'merged',
    runByDefault: true,
  },
  {
    path: 'e2e/tests/free-tier.bundle-quotas.spec.ts',
    coverage: 'free classroom caps and visible quota counters',
    source: 'merged',
    runByDefault: true,
  },
  {
    path: 'e2e/tests/auth.free-tier-handle-join.spec.ts',
    coverage: 'teacher handle join path',
    source: 'merged',
    runByDefault: false,
  },
  {
    path: 'e2e/tests/auth.free-tier-handle-join.qa-screens.spec.ts',
    coverage: 'teacher handle join screenshot evidence',
    source: 'merged',
    runByDefault: false,
  },
  {
    path: 'e2e/tests/auth.signup.student.spec.ts',
    coverage: 'student sign-up baseline',
    source: 'merged',
    runByDefault: false,
  },
  {
    path: 'e2e/tests/free-tier.event-auto-admit.spec.ts',
    coverage: 'demo event auto-admit link local stand-in and hosted skip',
    source: 'qa-repro-pr',
    runByDefault: true,
  },
  {
    path: 'e2e/tests/free-tier.event-waitlist.spec.ts',
    coverage: 'demo event waitlist link local stand-in and hosted skip',
    source: 'qa-repro-pr',
    runByDefault: true,
  },
  {
    path: 'e2e/tests/free-tier.disabled-expired.spec.ts',
    coverage: 'disabled and expired demo event links',
    source: 'qa-repro-pr',
    runByDefault: true,
  },
  {
    path: 'e2e/tests/free-tier.repeat-signup.spec.ts',
    coverage: 'repeat sign-up guardrails',
    source: 'qa-repro-pr',
    runByDefault: true,
  },
  {
    path: 'e2e/tests/free-tier.caps-limits.spec.ts',
    coverage: 'caps, cookies, and abuse limits',
    source: 'qa-repro-pr',
    runByDefault: true,
  },
  {
    path: 'e2e/tests/auth.free-tier-student-signin.spec.ts',
    coverage: 'free-tier student sign-in with handle/password',
    source: 'qa-repro-pr',
    runByDefault: true,
  },
];

const hostedDemoEnv = [
  'DEMO_FREE_TIER_BASE_URL',
  'DEMO_FREE_TIER_EVENT_TOKEN',
  'DEMO_FREE_TIER_JOIN_TOKEN',
  'DEMO_FREE_TIER_STUDENT_JOIN_TOKEN',
];

type BrowserCandidate = {
  family: 'chromium' | 'chromium-headless-shell';
  revision: number;
  executablePath: string;
};

type BrowserResolution = {
  env: NodeJS.ProcessEnv;
  executablePath?: string;
  message: string;
};

async function exists(root: string, relativePath: string) {
  try {
    await access(path.join(root, relativePath), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function classifySuiteSpecs(root = webAppRoot) {
  const present: SuiteSpec[] = [];
  const missing: SuiteSpec[] = [];

  for (const spec of suiteSpecs) {
    if (await exists(root, spec.path)) {
      present.push(spec);
    } else {
      missing.push(spec);
    }
  }

  return { present, missing };
}

export function requiredMissingSpecs(missing: SuiteSpec[]) {
  return missing.filter((spec) => spec.runByDefault);
}

function browserCandidates(root: string): BrowserCandidate[] {
  if (!existsSync(root)) return [];

  const candidates: BrowserCandidate[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const chromium = /^chromium-(\d+)$/.exec(entry.name);
    if (chromium) {
      const executablePath = path.join(root, entry.name, 'chrome-linux64', 'chrome');
      if (existsSync(executablePath)) {
        candidates.push({
          family: 'chromium',
          revision: Number(chromium[1]),
          executablePath,
        });
      }
      continue;
    }

    const headlessShell = /^chromium_headless_shell-(\d+)$/.exec(entry.name);
    if (headlessShell) {
      const executablePath = path.join(
        root,
        entry.name,
        'chrome-headless-shell-linux64',
        'chrome-headless-shell'
      );
      if (existsSync(executablePath)) {
        candidates.push({
          family: 'chromium-headless-shell',
          revision: Number(headlessShell[1]),
          executablePath,
        });
      }
    }
  }

  return candidates.sort((left, right) => {
    if (left.family !== right.family) {
      return left.family === 'chromium' ? -1 : 1;
    }
    return right.revision - left.revision;
  });
}

export function resolveBrowserEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env
): BrowserResolution {
  const explicitExecutable = env.PW_EXECUTABLE_PATH?.trim();
  const browsersPath = env.PLAYWRIGHT_BROWSERS_PATH?.trim() || defaultBrowsersPath;
  const nextEnv = {
    ...env,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  } as NodeJS.ProcessEnv;

  if (explicitExecutable) {
    if (!existsSync(explicitExecutable)) {
      throw new Error(
        `PW_EXECUTABLE_PATH points to a missing browser executable: ${explicitExecutable}`
      );
    }
    return {
      env: { ...nextEnv, PW_EXECUTABLE_PATH: explicitExecutable },
      executablePath: explicitExecutable,
      message: `Using browser from PW_EXECUTABLE_PATH: ${explicitExecutable}`,
    };
  }

  const [candidate] = browserCandidates(browsersPath);
  if (!candidate) {
    throw new Error(
      [
        `No cached Chrome/Chromium executable found under ${browsersPath}.`,
        'Run `bunx playwright install chromium` or set PW_EXECUTABLE_PATH to an existing Chrome executable before running the free-tier demo suite.',
      ].join(' ')
    );
  }

  return {
    env: { ...nextEnv, PW_EXECUTABLE_PATH: candidate.executablePath },
    executablePath: candidate.executablePath,
    message: `Using cached ${candidate.family} r${candidate.revision}: ${candidate.executablePath}`,
  };
}

async function writeSuiteEvidence(present: SuiteSpec[], missing: SuiteSpec[]) {
  await mkdir(shotDir, { recursive: true });

  const missingHosted = hostedDemoEnv.filter((key) => !process.env[key]?.trim());
  if (missingHosted.length > 0) {
    await writeFile(
      path.join(shotDir, 'hosted-demo-skip.txt'),
      [
        'Hosted demo free-tier suite cases skipped.',
        `Missing env/access: ${missingHosted.join(', ')}`,
        '',
        'Local deterministic Playwright coverage still runs for specs present in this checkout.',
      ].join('\n')
    );
  }

  await writeFile(
    path.join(shotDir, 'suite-manifest.txt'),
    [
      'Free-tier demo E2E suite manifest.',
      '',
      'Present specs:',
      ...present.map(
        (spec) =>
          `- ${spec.runByDefault ? 'run' : 'referenced'} ${spec.path}: ${spec.coverage}`
      ),
      '',
      'Referenced specs not present in this checkout yet:',
      ...(missing.length
        ? missing.map((spec) => `- ${spec.path}: ${spec.coverage}`)
        : ['- none']),
      '',
      `Screenshot directory: ${shotDir}`,
    ].join('\n')
  );
}

async function main() {
  const { present, missing } = await classifySuiteSpecs();

  await writeSuiteEvidence(present, missing);

  const missingDefault = requiredMissingSpecs(missing);

  if (process.argv.includes('--list')) {
    console.log('Free-tier demo E2E specs:');
    for (const spec of present) {
      console.log(
        `${spec.runByDefault ? 'run' : 'ref'}      ${spec.path} (${spec.coverage})`
      );
    }
    for (const spec of missing) {
      console.log(`missing  ${spec.path} (${spec.coverage})`);
    }
    console.log(`shotDir  ${shotDir}`);
    if (missingDefault.length > 0) {
      console.error(
        `Missing required free-tier demo E2E specs: ${missingDefault
          .map((spec) => spec.path)
          .join(', ')}`
      );
      process.exitCode = 1;
    }
    return;
  }

  if (missingDefault.length > 0) {
    throw new Error(
      `Missing required free-tier demo E2E specs: ${missingDefault
        .map((spec) => spec.path)
        .join(', ')}`
    );
  }

  const runnable = present.filter((spec) => spec.runByDefault);

  if (runnable.length === 0) {
    throw new Error('No free-tier E2E specs are present in this checkout.');
  }

  const childEnv = {
    ...process.env,
    QA_SCREENSHOT_DIR: shotDir,
    FREE_TIER_QA_SHOTS_DIR: shotDir,
  };
  const browserResolution = resolveBrowserEnv(childEnv);
  console.log(browserResolution.message);

  const prepare = spawnSync('bun', ['./e2e/ensure-e2e-env.ts'], {
    cwd: webAppRoot,
    stdio: 'inherit',
    env: browserResolution.env,
  });
  if (prepare.error) {
    throw prepare.error;
  }
  if (prepare.status !== 0) {
    process.exitCode = prepare.status ?? 1;
    return;
  }

  const playwrightBin = path.resolve(webAppRoot, '../../node_modules/.bin/playwright');
  const args = [
    playwrightBin,
    'test',
    '--config=playwright.free-tier-demo.config.ts',
    '--project=chromium',
    ...runnable.map((spec) => spec.path),
  ];
  const result = spawnSync('bun', args, {
    cwd: webAppRoot,
    stdio: 'inherit',
    env: browserResolution.env,
  });

  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
