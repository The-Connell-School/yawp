/**
 * Where found pictures are kept (Nov 22): rows of the lesson's own pictures,
 * marked `found`, with the subject each one is of. Only open pictures are
 * ever found, so one kept for a subject may be copied for any teacher's
 * lesson; a teacher's own uploads have no subject and are never shared.
 */
import { prisma } from '~/utils/db.server';
import type { PictureShelf } from './picture-lookup.server';

export const pictureShelf: PictureShelf = {
  async findKept(keys) {
    if (!keys.length) return [];
    const rows = await prisma.lessonPlanUploadPicture.findMany({
      where: { origin: 'found', subject: { in: keys } },
      orderBy: { createdAt: 'desc' },
      distinct: ['subject'],
      select: {
        id: true,
        subject: true,
        credit: true,
        altText: true,
        blob: true,
        contentType: true,
      },
    });
    return rows.flatMap((row) =>
      row.subject
        ? [
            {
              key: row.subject,
              id: row.id,
              credit: row.credit ?? '',
              altText: row.altText ?? '',
              blob: row.blob ? new Uint8Array(row.blob) : undefined,
              contentType: row.contentType,
            },
          ]
        : []
    );
  },
  async copy(id, owner, changes) {
    const row = await prisma.lessonPlanUploadPicture.findFirst({
      where: { id, origin: 'found' },
    });
    if (!row) throw new Error('That picture is no longer kept.');
    const {
      id: _id,
      createdAt: _createdAt,
      uploadId: _uploadId,
      membershipId: _membershipId,
      conversationId: _conversationId,
      ...picture
    } = row;
    return prisma.lessonPlanUploadPicture.create({
      data: {
        ...picture,
        // A credit kept before Commons' hidden Wikidata line was dropped (Nov 22).
        credit: picture.credit?.replace(/\s*label QS:[\s\S]*$/i, '') ?? null,
        ...(changes?.altText ? { altText: changes.altText } : {}),
        membershipId: owner.membershipId,
        conversationId: owner.conversationId,
        position: 0,
        slideNumbers: [],
      },
      select: { id: true },
    });
  },
  async forget(id) {
    await prisma.lessonPlanUploadPicture.update({
      where: { id },
      data: { subject: null },
    });
  },
  create: (data) =>
    prisma.lessonPlanUploadPicture.create({
      data: { ...data, blob: Buffer.from(data.blob) },
      select: { id: true },
    }),
};
