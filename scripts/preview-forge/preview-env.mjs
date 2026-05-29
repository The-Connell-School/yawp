import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = '/srv/yawp-preview-forge';
const DEFAULT_DATABASE_NAME = 'yawp_preview';

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
    throw new Error('PREVIEW_FORGE_DOMAIN must be a bare domain like preview.yawp.school');
  }
  return trimSlashes(domain);
}

function requireRuntime(value) {
  const runtime = String(value || 'fast').trim().toLowerCase();
  if (!['fast', 'production'].includes(runtime)) {
    throw new Error('PREVIEW_FORGE_RUNTIME must be fast or production');
  }
  return runtime;
}

export function buildPreviewForgeEnv({
  prNumber = process.env.PR_NUMBER,
  domain = process.env.PREVIEW_FORGE_DOMAIN,
  root = process.env.PREVIEW_FORGE_ROOT || DEFAULT_ROOT,
  sourceDir = process.env.SOURCE_DIR,
  directPort = process.env.PREVIEW_FORGE_DIRECT_PORT,
  tls = process.env.PREVIEW_FORGE_TLS !== 'false',
  runtime = process.env.PREVIEW_FORGE_RUNTIME || 'fast',
  databaseUrl = process.env.PREVIEW_DATABASE_URL,
} = {}) {
  const safePrNumber = requirePositiveInteger(prNumber);
  const safeDomain = requireDomain(domain);
  const safeRuntime = requireRuntime(runtime);
  const safeRoot = trimSlashes(String(root || DEFAULT_ROOT));
  const slug = `pr-${safePrNumber}`;
  const composeProject = `yawp-${slug}`;
  const postgresHost = `${composeProject}-postgres-1`;
  const hostname = `${slug}.${safeDomain}`;
  const previewRoot = safeRoot.startsWith('/') ? safeRoot : `/${safeRoot}`;
  const previewDir = path.posix.join(previewRoot, 'previews', slug);
  const resolvedSourceDir =
    sourceDir || path.posix.join(previewRoot, 'sources', slug);
  const scheme = tls ? 'https' : 'http';
  const url = directPort
    ? `http://127.0.0.1:${directPort}`
    : `${scheme}://${hostname}`;

  return {
    prNumber: safePrNumber,
    slug,
    composeProject,
    hostname,
    url,
    root: previewRoot,
    previewDir,
    sourceDir: resolvedSourceDir,
    directPort: directPort ? String(directPort) : '',
    tls,
    runtime: safeRuntime,
    databaseUrl:
      databaseUrl ||
      `postgresql://postgres:postgres@${postgresHost}:5432/${DEFAULT_DATABASE_NAME}`,
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
  const env = buildPreviewForgeEnv();
  if (output === 'shell') {
    printShell(env);
  } else {
    console.log(JSON.stringify(env, null, 2));
  }
}
