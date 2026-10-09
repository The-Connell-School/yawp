import type { Prisma } from '@app/prisma';
import { INTERNAL_RUBRICS_FLAG, type FeatureFlagKey } from '~/domain/feature-flags/feature-flags';
import { perTypeKey } from './rubric-catalog.server';

/**
 * Rollout of rubrics managed in Yawp Internal (feature flag `internal_rubrics`).
 *
 * Yawp Internal releases a rubric version through the rubric catalog `stage`
 * endpoint, which appends an immutable `RubricRevision` and records it in
 * `RubricRelease` under the rubric's catalog key (library `Rubric.name`, or
 * `assignment-type:<typeId>` for a type's own rubric). The live rubric and
 * its current revision do not move.
 *
 * When a new assignment is created for classes of one school (organization)
 * that has the flag on, it pins to the released revision instead of the
 * rubric's current one. Everything else keeps today's pin: flag off, no
 * release, classes from more than one school (or none), a release that does
 * not belong to the assignment type's rubric, or an explicit pin on the create
 * input. Nothing here may block assignment creation: any read failure falls
 * back to the default pin.
 */

type ClassReader = Pick<Prisma.TransactionClient, 'class'>;

/** The one school (organization) all classes belong to, or null. */
async function singleOrganizationId(db: ClassReader, classIds: string[]) {
  const unique = [...new Set(classIds)];
  if (unique.length === 0) return null;
  const rows = await db.class.findMany({
    where: { id: { in: unique } },
    select: { id: true, school: { select: { organizationId: true } } },
  });
  if (rows.length !== unique.length) return null;
  const orgIds = new Set(rows.map((row) => row.school?.organizationId ?? null));
  if (orgIds.size !== 1) return null;
  const [orgId] = [...orgIds];
  return orgId ?? null;
}

/**
 * Whether a new assignment for these classes should use Internal-released
 * rubrics. Uses the global client (the flag reader does too), so call it
 * before opening the creation transaction. Fails closed.
 */
export async function shouldUseInternalRubricRelease(
  classIds: string[],
  deps: {
    db: ClassReader;
    isEnabled: (key: FeatureFlagKey, orgId: string) => Promise<boolean>;
  }
): Promise<boolean> {
  try {
    const orgId = await singleOrganizationId(deps.db, classIds);
    if (!orgId) return false;
    return await deps.isEnabled(INTERNAL_RUBRICS_FLAG, orgId);
  } catch (error) {
    console.warn('internal_rubric_release_flag_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

type TypeRubric = {
  id: string;
  rubricId: string | null;
  rubric: { name: string; currentRevisionId: string | null } | null;
  rubricBaseline: { rubricRevisionId: string } | null;
};

/**
 * The catalog key whose revisions the pin trigger accepts for this type:
 * its library rubric once that rubric has a current revision, else its own
 * per-type rubric when it has a baseline. Null when an explicit pin would be
 * rejected, so the default pin must be kept.
 */
export function catalogKeyForAssignmentType(type: TypeRubric): string | null {
  if (type.rubricId) return type.rubric?.currentRevisionId ? type.rubric.name : null;
  return type.rubricBaseline ? perTypeKey(type.id) : null;
}

type ReleaseReader = Pick<Prisma.TransactionClient, 'assignmentType' | 'rubricRelease'>;

/**
 * The released revision to pin a new assignment of this type to, or null to
 * keep the default pin. Plain reads, safe inside the creation transaction.
 */
export async function findReleasedRubricRevisionId(
  db: ReleaseReader,
  assignmentTypeId: string
): Promise<string | null> {
  const type = await db.assignmentType.findUnique({
    where: { id: assignmentTypeId },
    select: {
      id: true,
      rubricId: true,
      rubric: { select: { name: true, currentRevisionId: true } },
      rubricBaseline: { select: { rubricRevisionId: true } },
    },
  });
  if (!type) return null;
  const catalogKey = catalogKeyForAssignmentType(type);
  if (!catalogKey) return null;
  const release = await db.rubricRelease.findUnique({
    where: { catalogKey },
    select: { rubricRevisionId: true, rubricRevision: { select: { rubricName: true } } },
  });
  if (!release) return null;
  if (release.rubricRevision.rubricName !== catalogKey) {
    console.warn('internal_rubric_release_mismatch', {
      catalogKey,
      revisionId: release.rubricRevisionId,
    });
    return null;
  }
  return release.rubricRevisionId;
}
