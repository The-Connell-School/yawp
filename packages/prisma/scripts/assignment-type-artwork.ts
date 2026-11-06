import { createHash } from 'node:crypto';

import type { PrismaClient } from '../generated/prisma';

/**
 * Card artwork a seed ships for an assignment type: the bytes of the image in
 * the repo, its MIME type, and a description of the drawing for screen readers.
 */
export type SeedArtwork = {
  blob: Buffer;
  contentType: string;
  altText: string;
};

export type SeedArtworkOutcome = 'created' | 'replaced' | 'kept';

type ArtworkClient = Pick<PrismaClient, 'assignmentTypeImage'>;

export function artworkMd5(blob: Uint8Array | string): string {
  return createHash('md5').update(blob).digest('hex');
}

/**
 * Whether an AssignmentTypeImage row still holds a drawing a seed put there
 * earlier. Only those are the repo's to replace; anything else is somebody's
 * own upload.
 */
export function isRetiredSeedArtwork(
  blob: Uint8Array | string | null | undefined,
  retiredMd5s: readonly string[]
): boolean {
  if (blob == null || retiredMd5s.length === 0) return false;
  return retiredMd5s.includes(artworkMd5(blob));
}

/**
 * Attach the seed's card to an assignment type, or swap it in where the type
 * still shows a card the seed drew earlier.
 *
 * - no image yet: create it.
 * - the image is one of `retiredMd5s`, a drawing a seed shipped before: replace
 *   it, so a redrawn card reaches every database that still shows the old one.
 * - anything else, including the current card: leave it alone. An admin who
 *   uploaded their own artwork keeps it; re-running a seed never reverts that.
 */
export async function syncSeedArtwork(
  prisma: ArtworkClient,
  assignmentTypeId: string,
  artwork: SeedArtwork,
  retiredMd5s: readonly string[]
): Promise<SeedArtworkOutcome> {
  const existing = await prisma.assignmentTypeImage.findUnique({
    where: { assignmentTypeId },
    select: { id: true, blob: true },
  });

  // Node types a Buffer over ArrayBufferLike; Prisma's Bytes input wants a
  // Uint8Array over ArrayBuffer, which is what readFileSync actually returns.
  const blob = artwork.blob as Uint8Array<ArrayBuffer>;

  if (!existing) {
    await prisma.assignmentTypeImage.create({
      data: {
        assignmentTypeId,
        blob,
        contentType: artwork.contentType,
        altText: artwork.altText,
      },
    });
    return 'created';
  }

  if (!isRetiredSeedArtwork(existing.blob, retiredMd5s)) {
    return 'kept';
  }

  await prisma.assignmentTypeImage.update({
    where: { assignmentTypeId },
    data: {
      blob,
      contentType: artwork.contentType,
      altText: artwork.altText,
      updatedAt: new Date(),
    },
  });
  return 'replaced';
}
