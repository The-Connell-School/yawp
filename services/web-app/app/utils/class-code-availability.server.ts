import type { PrismaClient } from '@app/prisma';
import { normalizeClassCode } from '~/utils/class';
import { classCodeUniquenessEnabled } from '~/utils/class-code-write.server';

type AvailabilityClient = Pick<PrismaClient, 'class' | 'setting'>;

export type ClassCodeAvailabilityResult =
  | { enforcementEnabled: false }
  | { enforcementEnabled: true; available: boolean; normalizedCode: string };

/** Read-only hint for forms; create/update still enforce inside the write transaction. */
export async function getClassCodeAvailability(
  client: AvailabilityClient,
  rawCode: string,
  { excludeClassId }: { excludeClassId?: string } = {}
): Promise<ClassCodeAvailabilityResult> {
  if (!(await classCodeUniquenessEnabled(client))) {
    return { enforcementEnabled: false };
  }

  const normalizedCode = normalizeClassCode(rawCode);
  if (!normalizedCode) {
    return { enforcementEnabled: true, available: true, normalizedCode: '' };
  }

  const rows = await client.class.findMany({
    select: { id: true, code: true },
  });
  const own = excludeClassId
    ? rows.find((row) => row.id === excludeClassId)
    : undefined;
  if (own && normalizeClassCode(own.code) === normalizedCode) {
    return { enforcementEnabled: true, available: true, normalizedCode };
  }

  const taken = rows.some(
    (row) => normalizeClassCode(row.code) === normalizedCode
  );
  return { enforcementEnabled: true, available: !taken, normalizedCode };
}
