import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = '/srv/yawp-preview';
const DEFAULT_DATABASE_HOST = 'preview-postgres';
const DEFAULT_DATABASE_USER = 'postgres';
const DEFAULT_DATABASE_PASSWORD = 'postgres';
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
  const domain = String(value ?? '').trim().toLowerCase();
  if (!domain || domain.includes('/') || domain.includes(':')) {
    throw new Error('PREVIEW_DOMAIN must be a bare domain like preview.yawp.school');
  }
  return trimSlashes(domain);
}

function requireRuntime(value) {
  const runtime = String(value || 'fast').trim().toLowerCase();
  if (!['fast', 'production'].includes(runtime)) {
    throw new Error('PREVIEW_RUNTIME must be fast or production');
  }
  return runtime;
}

function requireDataMode(value) {
  const dataMode = String(value || 'seed').trim().toLowerCase();
  if (!['seed', 'production-dump'].includes(dataMode)) {
    throw new Error('PREVIEW_DATA_MODE must be seed or production-dump');
  }
  return dataMode;
}

export function buildPreviewEnv({
  prNumber = process.env.PR_NUMBER,
  domain = process.env.PREVIEW_DOMAIN,
  root = process.env.PREVIEW_ROOT || DEFAULT_ROOT,
  sourceDir = process.env.SOURCE_DIR,
  directPort = process.env.PREVIEW_DIRECT_PORT,
  tls = process.env.PREVIEW_TLS !== 'false',
  runtime = process.env.PREVIEW_RUNTIME || 'fast',
  dataMode = process.env.PREVIEW_DATA_MODE || 'seed',
  databaseHost = process.env.PREVIEW_DB_HOST || DEFAULT_DATABASE_HOST,
  databaseUser = process.env.PREVIEW_DB_USER || DEFAULT_DATABASE_USER,
  databasePassword =
    process.env.PREVIEW_DB_PASSWORD || DEFAULT_DATABASE_PASSWORD,
  databasePort = process.env.PREVIEW_DB_PORT || DEFAULT_DATABASE_PORT,
  templateDatabaseName =
    process.env.PREVIEW_DB_TEMPLATE_DB || DEFAULT_TEMPLATE_DATABASE_NAME,
  databaseUrl = process.env.PREVIEW_DATABASE_URL,
} = {}) {
  const safePrNumber = requirePositiveInteger(prNumber);
  const safeDomain = requireDomain(domain);
  const safeRuntime = requireRuntime(runtime);
  const safeDataMode = requireDataMode(dataMode);
  const safeRoot = trimSlashes(String(root || DEFAULT_ROOT));
  const slug = `pr-${safePrNumber}`;
  const composeProject = `yawp-${slug}`;
  const databaseName = `yawp_pr_${safePrNumber}`;
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
    `postgresql://${databaseUser}:${databasePassword}@${databaseHost}:${databasePort}/${databaseName}`;

  return {
    prNumber: safePrNumber,
    slug,
    composeProject,
    databaseName,
    databaseHost,
    databasePort,
    databaseUser,
    databasePassword,
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
