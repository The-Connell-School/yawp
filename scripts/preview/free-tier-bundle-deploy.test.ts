import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Execute the actual tooling function with a recording compose adapter. No host,
// Docker, credentials, or deployment can be reached by this harness.
for (const [skip, failSeed] of [[true, false], [false, false], [true, true]] as const) {
  test(`demo code-only deployment seeds the bundle exactly once (${skip ? 'unchanged' : 'changed'} tooling, seed failure=${failSeed}) before serving`, () => {
    const root = mkdtempSync(join(tmpdir(), 'bundle-deploy-'));
    try {
      mkdirSync(join(root, 'packages/prisma/scripts'), { recursive: true });
      writeFileSync(join(root, 'packages/prisma/scripts/seed-free-tier-bundle-assignment-types.ts'), '');
      writeFileSync(join(root, 'packages/prisma/scripts/seed-preview-signon-qa.ts'), '');
      writeFileSync(join(root, 'fingerprint'), skip ? 'current\n' : 'previous\n');
      const source = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
      const qaSeedGuard = source.match(/should_run_signon_qa_seed\(\) \{[\s\S]*?\n\}/)![0];
      const fn = source.slice(source.indexOf('run_tooling_if_needed() {'), source.indexOf('\nprebuild_production_images()'));
      const script = `set -euo pipefail
SOURCE_DIR="$TEST_ROOT"
TOOLING_FINGERPRINT_FILE="$TEST_ROOT/fingerprint"
DATABASE_CREATED=0
DATABASE_NAME=yawp_demo
SLUG=demo
DEMO_RESET_DATA=false
DATA_MODE=sanitized-production
RUNTIME=production
compose=(record_compose)
compute_tooling_fingerprint() { echo current; }
preview_missing_tooling_artifacts() { :; }
build_or_pull_production_images() { :; }
record_compose() { printf '%s\\n' "$*"; if [[ ${failSeed} == true && "$*" == *seed-free-tier-bundle-assignment-types* ]]; then return 17; fi; }
${qaSeedGuard}
${fn}
run_tooling_if_needed
printf 'SERVING\\n'
`;
      const result = Bun.spawnSync(['bash', '-c', script], { env: { ...process.env, TEST_ROOT: root } });
      expect(new TextDecoder().decode(result.stderr)).toBe('');
      const output = new TextDecoder().decode(result.stdout);
      if (failSeed) {
        expect(result.exitCode).toBe(17);
        expect(output).not.toContain('SERVING');
        return;
      }
      expect(result.exitCode).toBe(0);
      expect(output.match(/bun run seed-free-tier-bundle-assignment-types/g)?.length).toBe(1);
      expect(output.indexOf('bun run seed-free-tier-bundle-assignment-types')).toBeLessThan(output.indexOf('SERVING'));
      if (!skip)
        expect(
          output.indexOf('scripts/preview/prisma-cli.sh migrate deploy')
        ).toBeLessThan(
          output.indexOf('bun run seed-free-tier-bundle-assignment-types')
        );
      expect(output).not.toContain('seed-preview-signon-qa');
      expect(output).not.toContain('seed-local-dev');
      expect(output).not.toContain('drop');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('Demo environment code-only workflow uses the reviewed deploy tooling with the demo target', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/demo-environment.yml', import.meta.url), 'utf8');
  expect(workflow).toContain("inputs.reset_data == true &&");
  expect(workflow).toContain("'true' || 'false'");
  expect(workflow).toContain('bash scripts/preview/deploy.sh');
  expect(workflow).toContain('yawp_demo');
});
