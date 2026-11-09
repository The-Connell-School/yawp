import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

for (const skip of [true, false]) {
  test(`preview seeds run before serving: unchanged=${skip}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'signon-deploy-'));
    try {
      mkdirSync(join(root, 'packages/prisma/scripts'), { recursive: true });
      for (const seed of [
        'seed-local-dev',
        'seed-free-tier-ship-review',
        'seed-preview-seats',
        'seed-preview-signon-qa',
      ]) {
        writeFileSync(join(root, `packages/prisma/scripts/${seed}.ts`), '');
      }
      writeFileSync(join(root, 'fingerprint'), skip ? 'current\n' : 'previous\n');
      const source = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
      const qaSeedGuard = source.match(/should_run_signon_qa_seed\(\) \{[\s\S]*?\n\}/)![0];
      const controlMountGuard = source.match(
        /preview_toolbox_uses_control_mount\(\) \{[\s\S]*?\n\}/
      )![0];
      const tooling = source.slice(
        source.indexOf('run_tooling_if_needed() {'),
        source.indexOf('\nprebuild_production_images()')
      );
      const seats = source.slice(
        source.indexOf('ensure_preview_seats() {'),
        source.indexOf('\nremove_legacy_project_postgres()')
      );
      const order = source.slice(
        source.indexOf('\nrun_tooling_if_needed\n'),
        source.indexOf('\nhealth_url=')
      );
      expect(order).not.toContain('unified-signon-flag.mjs');
      const result = Bun.spawnSync(
        [
          'bash',
          '-c',
          `set -euo pipefail
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
record_compose() { printf '%s\\n' "$*"; }
${qaSeedGuard}
${controlMountGuard}
${tooling}
${seats}
${order}
echo SERVING
`,
        ],
        { env: { ...process.env, TEST_ROOT: root } }
      );
      const output = result.stdout.toString();
      expect(result.stderr.toString()).toBe('');
      expect(result.exitCode).toBe(0);
      expect(output.includes('SERVING')).toBe(true);
      expect(output.match(/bun run seed-preview-signon-qa/g)?.length).toBe(1);
      if (!skip) {
        expect(output.indexOf('bun run seed-preview-signon-qa')).toBeGreaterThan(
          output.indexOf('bun run seed-local-dev')
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
