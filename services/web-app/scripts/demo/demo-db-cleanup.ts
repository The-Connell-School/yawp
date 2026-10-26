/** Demo-only database cleanup for PKG-02. Never run against production. */
import { writeFile } from 'node:fs/promises';
import {
  assertDemoCleanupApplyConfirmation,
  assertDemoCleanupTarget,
} from './demo-cleanup-guard';
import { applyDemoCleanupPlan } from './demo-cleanup-delete';
import {
  buildDemoCleanupPlan,
  formatDryRunReport,
  formatInventoryMarkdown,
  loadDemoCleanupSnapshots,
  parseDemoCleanupArgs,
} from './demo-cleanup-lib';

async function main() {
  assertDemoCleanupTarget(process.env);
  const { mode, outputPath } = parseDemoCleanupArgs(process.argv.slice(2));

  const { prisma } = await import('../../app/utils/db.server');
  try {
    const snapshots = await loadDemoCleanupSnapshots(prisma);
    const plan = buildDemoCleanupPlan(snapshots);

    if (mode === 'inventory') {
      const markdown = formatInventoryMarkdown(plan);
      if (outputPath) {
        await writeFile(outputPath, markdown, 'utf8');
        console.info(`Wrote inventory to ${outputPath}`);
      } else {
        console.info(markdown);
      }
      return;
    }

    if (mode === 'dry-run') {
      console.info(formatDryRunReport(plan));
      console.info('');
      console.info(
        'Dry-run only. Take a demo DB snapshot before apply. Destructive run requires DEMO_CLEANUP_CONFIRMATION=APPLY yawp_demo and --apply.'
      );
      return;
    }

    assertDemoCleanupApplyConfirmation(process.env);
    const result = await applyDemoCleanupPlan(prisma, plan);
    console.info(
      `Demo cleanup applied: deleted ${result.deletedUsers} user(s) and ${result.deletedOrganizations} organization(s).`
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (typeof Bun !== 'undefined' && Bun.main === import.meta.path) {
  main().catch(() => {
    // Do not print Prisma errors: they can contain connection details.
    console.error(
      'Demo DB cleanup failed. Check demo guards, yawp_demo target, and database connectivity.'
    );
    process.exitCode = 1;
  });
}
