import type { Prisma } from '@app/prisma';
import { prismaRaw } from './db.server';
import { withAuditSuppressed } from './audit-context.server';

export function persistAuditEvent(data: Prisma.AuditEventUncheckedCreateInput) {
  return withAuditSuppressed(() => prismaRaw.auditEvent.create({ data }));
}

export function createDocumentWriteJournal(
  data: Prisma.DocumentWriteJournalUncheckedCreateInput
) {
  return withAuditSuppressed(() =>
    prismaRaw.documentWriteJournal.create({
      data,
    })
  );
}

export function updateDocumentWriteJournal(
  id: string,
  data: Prisma.DocumentWriteJournalUncheckedUpdateInput
) {
  return withAuditSuppressed(() =>
    prismaRaw.documentWriteJournal.update({
      where: { id },
      data,
    })
  );
}
