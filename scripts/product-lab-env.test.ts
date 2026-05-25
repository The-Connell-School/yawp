import { describe, expect, test } from 'bun:test';

import {
  appendSchemaToDatabaseUrl,
  deriveProductLabEnvironment,
  parseProductLabManifest,
} from './product-lab-env';

const manifest = `id: product-lab-build-out
name: Product Lab build-out
status: in-progress
owner: Kevin
priority: high
created: 2026-05-22
updated: 2026-05-22
pm_spec: pending
engineering_repo: yawp-2.0
engineering_branch: codex/product-lab-build-out
lab:
  environment_slug: product-lab-build-out
  data_checkpoint: pending
  preview_url: ""
qa:
  proof_packet: pending
  scenario_set: product-lab/scenarios/product-lab-build-out.md
queue:
  ai_engineer_state: queued
  next_task: Wire stable non-production Product Lab environment per initiative
ship_gate:
  state: blocked
  blocker: Needs stable lab environment, checkpoint, QA packet, and ship-gate checks
`;

describe('Product Lab environment contract', () => {
  test('parses the PM initiative manifest fields needed by yawp-2.0', () => {
    const parsed = parseProductLabManifest(manifest);

    expect(parsed.id).toBe('product-lab-build-out');
    expect(parsed.engineeringBranch).toBe('codex/product-lab-build-out');
    expect(parsed.environmentSlug).toBe('product-lab-build-out');
  });

  test('derives a stable non-production environment from an initiative manifest', () => {
    const environment = deriveProductLabEnvironment(parseProductLabManifest(manifest));

    expect(environment.appName).toBe('yawp-lab');
    expect(environment.environment).toBe('lab-product-lab-build-out');
    expect(environment.databaseSchema).toBe('lab_product_lab_build_out');
    expect(environment.imageTag).toBe('lab-product-lab-build-out');
    expect(environment.checkpointKey).toBe(
      'product-lab/product-lab-build-out/checkpoints/latest.sql',
    );
    expect(environment.terraformStateKey).toBe(
      'yawp/product-lab/product-lab-build-out/terraform.tfstate',
    );
    expect(environment.engineeringBranch).toBe('codex/product-lab-build-out');
  });

  test('derives a schema-scoped database URL for checkpoint commands', () => {
    const environment = deriveProductLabEnvironment(parseProductLabManifest(manifest));

    expect(appendSchemaToDatabaseUrl('postgresql://user:pass@preview.example/yawp', environment)).toBe(
      'postgresql://user:pass@preview.example/yawp?schema=lab_product_lab_build_out',
    );
  });

  test('rejects production-shaped database URLs for checkpoints', () => {
    const environment = deriveProductLabEnvironment(parseProductLabManifest(manifest));

    expect(() => appendSchemaToDatabaseUrl('postgresql://user:pass@prod.example/yawp', environment)).toThrow(
      /non-production/i,
    );
  });

  test('rejects production-shaped initiative names before infra can run', () => {
    expect(() =>
      deriveProductLabEnvironment({
        id: 'production',
        engineeringBranch: 'codex/production',
        environmentSlug: 'production',
      }),
    ).toThrow(/must not look like production/i);
  });

  test('rejects unsafe slugs', () => {
    expect(() => parseProductLabManifest('id: Bad Slug\nlab:\n  environment_slug: Bad Slug\n')).toThrow(
      /kebab-case/,
    );
  });

  test('rejects manifests whose id does not match the requested initiative', () => {
    expect(() => parseProductLabManifest(manifest, { expectedId: 'revision-flow' })).toThrow(
      /manifest id product-lab-build-out does not match requested initiative revision-flow/,
    );
  });

  test('rejects manifests for unsupported engineering repos', () => {
    const unsupportedRepoManifest = manifest.replace(
      'engineering_repo: yawp-2.0',
      'engineering_repo: yawp-experiments',
    );

    expect(() => parseProductLabManifest(unsupportedRepoManifest)).toThrow(
      /engineering_repo must be yawp-2.0/,
    );
  });

  test('rejects lab environment slug drift before infra can run', () => {
    const driftedEnvironmentManifest = manifest.replace(
      'environment_slug: product-lab-build-out',
      'environment_slug: other-lab',
    );

    expect(() => parseProductLabManifest(driftedEnvironmentManifest)).toThrow(
      /lab.environment_slug must match id/,
    );
  });

  test('rejects unsafe engineering branch refs before checkout', () => {
    const unsafeBranchManifest = manifest.replace(
      'engineering_branch: codex/product-lab-build-out',
      'engineering_branch: codex/product-lab-build-out;echo-nope',
    );

    expect(() => parseProductLabManifest(unsafeBranchManifest)).toThrow(
      /engineering_branch must be a safe branch ref/,
    );
  });
});
