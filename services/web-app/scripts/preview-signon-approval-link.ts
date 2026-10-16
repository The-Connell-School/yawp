/** Operator-only fixture helper: mint through the existing signer, never send mail. */
import { open, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  assertPreviewSignonTarget,
  qaId,
} from '../../../packages/prisma/scripts/seed-preview-signon-qa';
import { prisma } from '../app/utils/db.server';
import { mintSignedLink } from '../app/domain/free-tier/signed-link.server';

export async function writePreviewSignonApprovalLink(file: string) {
  const target = assertPreviewSignonTarget()!;
  if (
    !process.env.TMPDIR ||
    !path.resolve(file).startsWith(path.resolve(process.env.TMPDIR) + path.sep)
  )
    throw new Error('Use a private file under TMPDIR');
  const privateRoot = await realpath(process.env.TMPDIR!);
  const parent = await realpath(path.dirname(path.resolve(file)));
  if (parent !== privateRoot && !parent.startsWith(privateRoot + path.sep))
    throw new Error('Use a private file under TMPDIR');
  const output = await open(file, 'wx', 0o600);
  try {
    const url = await prisma.$transaction(async (tx) => {
      const [actual] = await tx.$queryRaw<
        { database: string; role: string }[]
      >`SELECT current_database() AS database, current_user AS role`;
      if (actual?.database !== target.database || actual?.role !== target.role)
        throw new Error('Isolated PR preview connection required');
      const approval = await tx.freeTierAdminApproval.findUniqueOrThrow({
        where: { id: qaId('admin-approval') },
      });
      if (approval.status !== 'PENDING')
        throw new Error(
          'Approval already exercised; recreate the disposable fixture database to reset'
        );
      const minted = await mintSignedLink({
        applicationId: approval.applicationId,
        purpose: 'ADMIN_APPROVE',
        tx,
      });
      await tx.freeTierAdminApproval.update({
        where: { id: approval.id },
        data: { signedLinkId: minted.linkId },
      });
      return `/free/admin/approve?t=${encodeURIComponent(minted.token)}`;
    });
    await output.writeFile(url);
  } catch (error) {
    await rm(file, { force: true });
    throw error;
  } finally {
    await output.close();
  }
}
if (import.meta.main) {
  try {
    await writePreviewSignonApprovalLink(process.argv[2] ?? '');
  } finally {
    await prisma.$disconnect();
  }
}
