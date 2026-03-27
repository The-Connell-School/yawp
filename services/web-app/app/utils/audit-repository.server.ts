import type { Prisma } from '@app/prisma';
import { prismaRaw } from './db.server';

export function createDocumentWriteJournal(
  data: Prisma.DocumentWriteJournalUncheckedCreateInput
) {
  return prismaRaw.documentWriteJournal.create({ data });
}

export function updateDocumentWriteJournal(
  id: string,
  data: Prisma.DocumentWriteJournalUncheckedUpdateInput
) {
  return prismaRaw.documentWriteJournal.update({
    where: { id },
    data,
  });
}
