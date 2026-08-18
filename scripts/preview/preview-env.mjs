import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = '/srv/yawp-preview';
const DEFAULT_DATABASE_HOST = 'preview-postgres';
const DEFAULT_DATABASE_PORT = '5432';
const DEFAULT_TEMPLATE_DATABASE_NAME = 'yawp_template';

function trimSlashes(value) {
  return value.replace(/^\/+|\/+$/g, '');
}

function requirePositiveInteger(value) {
  const text = String(value ?? '').trim();
  if (!/^[1-9][0-9]*$/.test(text)) {
    throw new Error('PR_NUMBER must be a positive integer');
  }
  return text;
}

function requireDomain(value) {
  const domain = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!domain || domain.includes('/') || domain.includes(':')) {
    throw new Error(
      'PREVIEW_DOMAIN must be a bare domain like preview.yawp.school'
    );
  }
  return trimSlashes(domain);
}

function requireRuntime(value) {
  const runtime = String(value || 'fast')
    .trim()
    .toLowerCase();
  if (!['fast', 'production'].includes(runtime)) {
    throw new Error('PREVIEW_RUNTIME must be fast or production');
  }
  return runtime;
}

function requireDataMode(value) {
  const dataMode = String(value || 'seed')
    .trim()
    .toLowerCase();
  if (!['seed', 'production-dump', 'sanitized-production'].includes(dataMode)) {
    throw new Error(
      'PREVIEW_DATA_MODE must be seed, production-dump, or sanitized-production'
    );
  }
  return dataMode;
}

export function requirePreviewAccessCodes(value) {
  const codes = String(value ?? '')
    .split(/[;,\n]/)
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean);
  if (codes.length === 0) {
    throw new Error('PREVIEW_ACCESS_CODES is required for preview deployments');
  }
  if (codes.some((code) => !/^[a-z]+-[a-z]+-[1-9][0-9]{3}$/.test(code))) {
    throw new Error(
      'PREVIEW_ACCESS_CODES must contain two-word, four-digit codes'
    );
  }
  return codes.join(',');
}

export function requirePreviewAccessSeats(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    throw new Error('PREVIEW_ACCESS_SEATS is required for preview deployments');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('PREVIEW_ACCESS_SEATS must be valid JSON');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('PREVIEW_ACCESS_SEATS is required for preview deployments');
  }

  const seats = parsed.map((seat) => {
    const code = String(seat?.code ?? '')
      .trim()
      .toLowerCase();
    const organizationId = String(seat?.organizationId ?? '').trim();
    const label = String(seat?.label ?? '').trim();
    if (
      !/^[a-z]+-[a-z]+-[1-9][0-9]{3}$/.test(code) ||
      !/^[a-z0-9][a-z0-9-]{0,127}$/.test(organizationId) ||
      !label ||
      label.length > 100
    ) {
      throw new Error(
        'PREVIEW_ACCESS_SEATS must contain valid code, organizationId, and label values'
      );
    }
    return { code, organizationId, label };
  });
  if (
    new Set(seats.map(({ code }) => code)).size !== seats.length ||
    new Set(seats.map(({ organizationId }) => organizationId)).size !==
      seats.length
  ) {
    throw new Error(
      'PREVIEW_ACCESS_SEATS must use a unique code and organization for every seat'
    );
  }
  return JSON.stringify(seats);
}

export function requirePreviewSessionSecret(value) {
  const secret = String(value ?? '').trim();
  if (!secret) {
    throw new Error(
      'PREVIEW_SESSION_SECRET is required for preview deployments'
    );
  }
  if (secret.length < 32) {
    throw new Error('PREVIEW_SESSION_SECRET must be at least 32 characters');
  }
  return secret;
}

export function requirePreviewAccessSecret(value) {
  const secret = String(value ?? '').trim();
  if (!secret) {
    throw new Error(
      'PREVIEW_ACCESS_SECRET is required for preview deployments'
    );
  }
  if (secret.length < 32) {
    throw new Error('PREVIEW_ACCESS_SECRET must be at least 32 characters');
  }
  return secret;
}

// A named environment (the long-lived demo box) reuses this whole pipeline; only the
// slug differs. Without the override every environment is forced to be "pr-<n>", which
// would mean a second, divergent deploy path for the one environment that must not drift.
function normaliseSlug(value) {
  const slug = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!/^[a-z][a-z0-9-]{0,30}$/.test(slug)) {
    throw new Error('PREVIEW_SLUG must be a short lowercase name like demo');
  }
  return slug;
}

export function buildPreviewEnv({
  slug: slugOverride = process.env.PREVIEW_SLUG,
  prNumber = process.env.PR_NUMBER,
  domain = process.env.PREVIEW_DOMAIN,
  root = process.env.PREVIEW_ROOT || DEFAULT_ROOT,
  sourceDir = process.env.SOURCE_DIR,
  directPort = process.env.PREVIEW_DIRECT_PORT,
  tls = process.env.PREVIEW_TLS !== 'false',
  runtime = process.env.PREVIEW_RUNTIME || 'fast',
  dataMode = process.env.PREVIEW_DATA_MODE || 'seed',
  databaseHost = process.env.PREVIEW_DB_HOST || DEFAULT_DATABASE_HOST,
  databaseUser = process.env.PREVIEW_DB_USER,
  databasePassword = process.env.PREVIEW_DB_PASSWORD,
  databasePort = process.env.PREVIEW_DB_PORT || DEFAULT_DATABASE_PORT,
  templateDatabaseName = process.env.PREVIEW_DB_TEMPLATE_DB ||
    DEFAULT_TEMPLATE_DATABASE_NAME,
  databaseUrl = process.env.PREVIEW_DATABASE_URL,
} = {}) {
  const namedSlug = slugOverride ? normaliseSlug(slugOverride) : '';
  // A named environment has no PR behind it, so PR_NUMBER stops being required.
  const safePrNumber = namedSlug ? '' : requirePositiveInteger(prNumber);
  const safeDomain = requireDomain(domain);
  const safeRuntime = requireRuntime(runtime);
  const safeDataMode = requireDataMode(dataMode);
  const safeRoot = trimSlashes(String(root || DEFAULT_ROOT));
  const slug = namedSlug || `pr-${safePrNumber}`;
  const composeProject = `yawp-${slug}`;
  const databaseName = `yawp_${slug.replace(/-/g, '_')}`;
  const resolvedDatabaseUser = String(databaseUser || `${databaseName}_app`);
  const resolvedDatabasePassword = String(databasePassword || '');
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(resolvedDatabaseUser)) {
    throw new Error('PREVIEW_DB_USER must be a valid Postgres role name');
  }
  if (!databaseUrl && !/^[A-Za-z0-9_-]{32,}$/.test(resolvedDatabasePassword)) {
    throw new Error('PREVIEW_DB_PASSWORD must be a 32-character URL-safe secret');
  }
  const hostname = `${slug}.${safeDomain}`;
  const previewRoot = safeRoot.startsWith('/') ? safeRoot : `/${safeRoot}`;
  const previewDir = path.posix.join(previewRoot, 'previews', slug);
  const resolvedSourceDir =
    sourceDir || path.posix.join(previewRoot, 'sources', slug);
  const scheme = tls ? 'https' : 'http';
  const url = directPort
    ? `http://127.0.0.1:${directPort}`
    : `${scheme}://${hostname}`;
  const resolvedDatabaseUrl =
    databaseUrl ||
    `postgresql://${resolvedDatabaseUser}:${resolvedDatabasePassword}@${databaseHost}:${databasePort}/${databaseName}`;

  return {
    prNumber: safePrNumber,
    slug,
    composeProject,
    databaseName,
    databaseHost,
    databasePort,
    databaseUser: resolvedDatabaseUser,
    databasePassword: resolvedDatabasePassword,
    templateDatabaseName,
    hostname,
    url,
    root: previewRoot,
    previewDir,
    sourceDir: resolvedSourceDir,
    directPort: directPort ? String(directPort) : '',
    tls,
    runtime: safeRuntime,
    dataMode: safeDataMode,
    databaseUrl: resolvedDatabaseUrl,
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function printShell(env) {
  for (const [key, value] of Object.entries(env)) {
    const shellKey = key
      .replace(/[A-Z]/g, (char) => `_${char}`)
      .toUpperCase()
      .replace(/^_/, '');
    console.log(`${shellKey}=${shellQuote(value)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = process.argv.includes('--shell') ? 'shell' : 'json';
  const env = buildPreviewEnv();
  if (output === 'shell') {
    printShell(env);
  } else {
    console.log(JSON.stringify(env, null, 2));
  }
}
