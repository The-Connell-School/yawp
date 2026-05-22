import { describe, expect, test } from 'bun:test';

import { deriveProductLabEnvironment, parseProductLabManifest } from './product-lab-env';

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
    expect(environment.terraformStateKey).toBe(
      'yawp/product-lab/product-lab-build-out/terraform.tfstate',
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
});
