import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Run the actual deploy functions with recording adapters, never Docker or a host.
for (const skip of [true, false]) for (const fail of [true, false]) {
  test(`flag follows all seeds before rollout: unchanged=${skip}, updater failure=${fail}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'signon-deploy-'));
    try {
      mkdirSync(join(root, 'packages/prisma/scripts'), { recursive: true });
      for (const seed of ['seed-local-dev', 'seed-free-tier-ship-review', 'seed-preview-seats', 'seed-preview-signon-qa']) {
        writeFileSync(join(root, `packages/prisma/scripts/${seed}.ts`), '');
      }
      writeFileSync(join(root, 'fingerprint'), skip ? 'current\n' : 'previous\n');
      const source = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
      const qaSeedGuard = source.match(/should_run_signon_qa_seed\(\) \{[\s\S]*?\n\}/)![0];
      const tooling = source.slice(source.indexOf('run_tooling_if_needed() {'), source.indexOf('\nprebuild_production_images()'));
      const seats = source.slice(source.indexOf('ensure_preview_seats() {'), source.indexOf('\nremove_legacy_project_postgres()'));
      const updater = source.slice(source.indexOf('apply_preview_signon_flag() {'), source.indexOf('\nensure_shared_postgres\n'));
      const order = source.slice(source.indexOf('\nrun_tooling_if_needed\n'), source.indexOf('\nhealth_url='));
      expect(order).toContain('apply_preview_signon_flag');
      const result = Bun.spawnSync(['bash', '-c', `set -euo pipefail
SOURCE_DIR="$TEST_ROOT"
TOOLING_FINGERPRINT_FILE="$TEST_ROOT/fingerprint"
SCRIPT_DIR="$TEST_ROOT"
DATABASE_CREATED=${skip ? '0' : '1'}
DATA_MODE=seed
RUNTIME=fast
SLUG=pr-565
compose=(record_compose)
compute_tooling_fingerprint() { echo current; }
preview_missing_tooling_artifacts() { :; }
should_run_free_tier_ship_review_seed() { return 0; }
assert_no_master_code_collision() { :; }
install_demo_backup_tooling() { :; }
export_demo_tester_feedback_before_reset() { :; }
restore_demo_tester_feedback_after_reset() { :; }
record_compose() { printf '%s\\n' "$*"; if [[ ${fail} == true && "$*" == *unified-signon-flag.mjs* ]]; then return 17; fi; }
${qaSeedGuard}
${tooling}
${seats}
${updater}
${order}
echo SERVING
`], { env: { ...process.env, TEST_ROOT: root } });
      const output = result.stdout.toString();
      expect(result.stderr.toString()).toBe('');
      expect(result.exitCode).toBe(fail ? 17 : 0);
      expect(output.includes('SERVING')).toBe(!fail);
      expect(output.match(/bun \/preview-control\/unified-signon-flag.mjs/g)?.length).toBe(1);
      expect(output.indexOf('unified-signon-flag.mjs')).toBeGreaterThan(output.indexOf('bun run seed-preview-signon-qa'));
      expect(output.match(/bun run seed-preview-signon-qa/g)?.length).toBe(1);
      expect(output.indexOf('unified-signon-flag.mjs')).toBeGreaterThan(output.indexOf('bun run seed-preview-seats'));
      expect(output.indexOf('unified-signon-flag.mjs')).toBeGreaterThan(output.indexOf('bun run seed-free-tier-ship-review'));
      if (!skip) {
        expect(output.indexOf('unified-signon-flag.mjs')).toBeGreaterThan(output.indexOf('bun run seed-local-dev'));
        expect(output.indexOf('unified-signon-flag.mjs')).toBeGreaterThan(
          output.indexOf('scripts/preview/prisma-cli.sh migrate deploy')
        );
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
test('named demo and production targets never invoke the updater', () => {
  const source = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('apply_preview_signon_flag() {'), source.indexOf('\nensure_shared_postgres\n'));
  for (const slug of ['demo', 'production', 'pr-', 'pr-0']) {
    const result = Bun.spawnSync(['bash', '-c', `set -euo pipefail
SLUG="$TEST_SLUG"
compose=(must_not_run)
must_not_run() { echo unexpected; return 19; }
${fn}
apply_preview_signon_flag
`], { env: { ...process.env, TEST_SLUG: slug } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe('');
  }
});
