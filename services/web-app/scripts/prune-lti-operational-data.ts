import { pruneExpiredLtiOperationalData } from '../app/domain/lms/lti-pilot.server';
import { prisma } from '../app/utils/db.server';

const confirmed = process.argv.includes('--confirm');
if (!confirmed) {
  throw new Error(
    'Refusing to prune without --confirm. This deletes only launch transactions and pending links expired for at least 24 hours.'
  );
}

const retentionArgument = process.argv.find((argument) =>
  argument.startsWith('--retention-days=')
);
const retentionDays = retentionArgument
  ? Number(retentionArgument.slice('--retention-days='.length))
  : 1;
if (!Number.isInteger(retentionDays) || retentionDays < 1) {
  throw new Error('--retention-days must be a positive integer.');
}

try {
  const result = await pruneExpiredLtiOperationalData({
    retentionMs: retentionDays * 24 * 60 * 60 * 1000,
  });
  process.stdout.write(
    `${JSON.stringify({ ok: true, deletedTransactions: result.count, retentionDays })}\n`
  );
} finally {
  await prisma.$disconnect();
}
