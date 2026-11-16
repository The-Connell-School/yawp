import { parseRepairArgs, repairUnprovisionedFreeClassrooms } from '~/domain/free-tier/repair-unprovisioned-free-classrooms.server';

function databaseTarget() {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return 'DATABASE_URL is not set';
  try {
    const url = new URL(raw);
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  } catch {
    return 'DATABASE_URL is set';
  }
}

const { apply } = parseRepairArgs(process.argv.slice(2));
const result = await repairUnprovisionedFreeClassrooms({ apply });
console.log(
  `Free-tier unprovisioned classrooms (${result.mode})\ndatabase: ${databaseTarget()}\n${result.rows.length} application(s)`
);
for (const row of result.rows) {
  console.log(
    `- ${row.applicationId} ${row.email} ${row.schoolName} — ${row.reason}`
  );
}
if (result.mode === 'dry-run') {
  console.log('Re-run with --apply to provision these classrooms.');
} else {
  for (const row of result.results) {
    console.log(
      `- ${row.applicationId} ${row.status}${'organizationId' in row && row.organizationId ? ` ${row.organizationId}` : ''}`
    );
  }
}
