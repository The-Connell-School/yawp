import { fileURLToPath } from 'node:url';
import {
  ACCESS_CODE_ADJECTIVES,
  ACCESS_CODE_ANIMALS,
  generatePreviewAccessCode,
  generatePreviewAccessSeats,
  buildPreviewAccessSeatRegistry,
} from '../../packages/prisma/preview-access-code.ts';

export {
  ACCESS_CODE_ADJECTIVES,
  ACCESS_CODE_ANIMALS,
  generatePreviewAccessCode,
  generatePreviewAccessSeats,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--seats')) {
    const existingCodes = String(process.env.PREVIEW_ACCESS_CODES ?? '')
      .split(/[;,\n]/)
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean);
    const existingSeats = process.env.PREVIEW_EXISTING_ACCESS_SEATS
      ? JSON.parse(process.env.PREVIEW_EXISTING_ACCESS_SEATS)
      : [];
    const reservedCodes = String(
      process.env.PREVIEW_RESERVED_ACCESS_CODES ??
        process.env.PREVIEW_MASTER_ACCESS_CODE ??
        ''
    )
      .split(/[;,\n]/)
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean);
    const count = Number(process.env.PREVIEW_SEAT_COUNT ?? 1);
    const masterOrganizationId =
      process.env.PREVIEW_ACCESS_MASTER_ORGANIZATION_ID || 'local-dev-org';
    const masterLabel = process.env.PREVIEW_ACCESS_MASTER_LABEL || 'Master';
    const previewSlug = process.env.PREVIEW_SLUG || null;
    const includePreviewFreeClassroomFixture =
      process.env.INCLUDE_PREVIEW_FREE_CLASSROOM_FIXTURE ?? null;
    process.stdout.write(
      `${JSON.stringify(
        buildPreviewAccessSeatRegistry({
          count,
          previewSlug,
          includePreviewFreeClassroomFixture,
          existingCodes,
          existingSeats,
          reservedCodes,
          masterOrganizationId,
          masterLabel,
        })
      )}\n`
    );
  } else {
    process.stdout.write(`${generatePreviewAccessCode()}\n`);
  }
}
