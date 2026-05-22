export type ProductLabManifest = {
  id: string;
  engineeringBranch: string;
  environmentSlug: string;
};

export type ProductLabEnvironment = {
  appName: string;
  environment: string;
  engineeringBranch: string;
  databaseSchema: string;
  imageTag: string;
  checkpointKey: string;
  terraformStateKey: string;
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BLOCKED_ENV_NAMES = new Set(['prod', 'production', 'staging', 'main']);
const BLOCKED_DATABASE_PARTS = ['prod', 'production'];

function parseScalar(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseProductLabManifest(
  rawManifest: string,
  options: { expectedId?: string } = {},
): ProductLabManifest {
  const values = new Map<string, string>();
  const parents: Array<{ indent: number; key: string }> = [];

  rawManifest.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim() || line.trimStart().startsWith('#')) return;
    if (line.includes('\t')) throw new Error(`line ${index + 1}: tabs are not allowed`);

    const indent = line.length - line.trimStart().length;
    if (indent % 2 !== 0) throw new Error(`line ${index + 1}: use two-space indentation`);

    const separatorIndex = line.trim().indexOf(':');
    if (separatorIndex < 1) throw new Error(`line ${index + 1}: expected key: value`);

    while (parents.length > 0 && parents[parents.length - 1].indent >= indent) {
      parents.pop();
    }

    const key = line.trim().slice(0, separatorIndex);
    const value = parseScalar(line.trim().slice(separatorIndex + 1));
    const fullKey = [...parents.map((parent) => parent.key), key].join('.');

    if (value) {
      values.set(fullKey, value);
    } else {
      parents.push({ indent, key });
    }
  });

  const id = values.get('id') ?? '';
  const environmentSlug = values.get('lab.environment_slug') ?? '';
  const engineeringBranch = values.get('engineering_branch') ?? '';

  for (const [field, value] of [
    ['id', id],
    ['lab.environment_slug', environmentSlug],
  ] as const) {
    if (!SLUG_RE.test(value)) {
      throw new Error(`${field} must be kebab-case`);
    }
  }

  if (!engineeringBranch) {
    throw new Error('engineering_branch is required');
  }

  if (options.expectedId && id !== options.expectedId) {
    throw new Error(`manifest id ${id} does not match requested initiative ${options.expectedId}`);
  }

  return { id, engineeringBranch, environmentSlug };
}

export function deriveProductLabEnvironment(manifest: ProductLabManifest): ProductLabEnvironment {
  if (BLOCKED_ENV_NAMES.has(manifest.id) || BLOCKED_ENV_NAMES.has(manifest.environmentSlug)) {
    throw new Error('Product Lab environment must not look like production or staging');
  }

  if (!SLUG_RE.test(manifest.id) || !SLUG_RE.test(manifest.environmentSlug)) {
    throw new Error('Product Lab initiative id and environment slug must be kebab-case');
  }

  return {
    appName: 'yawp-lab',
    environment: `lab-${manifest.environmentSlug}`,
    engineeringBranch: manifest.engineeringBranch,
    databaseSchema: `lab_${manifest.environmentSlug.replaceAll('-', '_')}`,
    imageTag: `lab-${manifest.environmentSlug}`,
    checkpointKey: `product-lab/${manifest.id}/checkpoints/latest.sql`,
    terraformStateKey: `yawp/product-lab/${manifest.id}/terraform.tfstate`,
  };
}

export function appendSchemaToDatabaseUrl(
  databaseUrl: string,
  environment: Pick<ProductLabEnvironment, 'databaseSchema'>,
): string {
  const url = new URL(databaseUrl);
  const unsafeParts = [url.hostname, url.pathname].join(' ').toLowerCase();
  if (BLOCKED_DATABASE_PARTS.some((part) => unsafeParts.includes(part))) {
    throw new Error('Product Lab checkpoints require a non-production database URL');
  }

  url.searchParams.set('schema', environment.databaseSchema);
  return url.toString();
}

if (import.meta.main) {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error('Usage: bun scripts/product-lab-env.ts <initiative-manifest.yaml> [expected-initiative-id]');
    process.exit(1);
  }

  const expectedId = process.argv[3];
  const manifest = parseProductLabManifest(await Bun.file(manifestPath).text(), { expectedId });
  const environment = deriveProductLabEnvironment(manifest);
  const databaseUrl = process.env.PRODUCT_LAB_DATABASE_URL;
  const output = databaseUrl
    ? { ...environment, labDatabaseUrl: appendSchemaToDatabaseUrl(databaseUrl, environment) }
    : environment;

  for (const [key, value] of Object.entries(output)) {
    console.log(`${key}=${value}`);
  }
}
