import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { loadSiteLicenseLockedAssignmentTiles } from '~/domain/free-tier/site-license-locked-assignment-tiles.server';
import { readFreeAccountUsage } from '~/domain/free-tier/inapp-usage.server';
import { getGrammarGradingAssignmentTypeIds } from '~/domain/assignment-types/assignment-type-grading-config.server';
import { redirect } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  filterAssignmentTypesForOrganizationPlan,
  loadAssignmentCreationQuotasForTypes,
} from '~/utils/assignment-quota.server';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import { formatClassCardTitle, formatClassLabel } from '~/utils/class-display';
import type { AssignmentCreationAssignmentType } from '~/components/assignments/assignment-creation-sheet';
import type { SiteLicenseLockedAssignmentTile } from '~/domain/free-tier/site-license-locked-assignment-tiles';

export type AssignmentBuilderV3Class = {
  id: string;
  label: string;
};

export type AssignmentBuilderV3LoaderData = {
  assignmentTypes: AssignmentCreationAssignmentType[];
  siteLicenseLockedAssignmentTiles: SiteLicenseLockedAssignmentTile[];
  classes: AssignmentBuilderV3Class[];
};

export async function loadAssignmentBuilderV3Data(
  request: Request
): Promise<AssignmentBuilderV3LoaderData> {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') {
    throw redirect('/app');
  }

  const classes = await prisma.class.findMany({
    where: { teachers: { some: { id: profile.id } }, isArchived: false },
    select: {
      id: true,
      schoolId: true,
      grade: true,
      period: true,
      title: true,
      school: { select: { name: true, organizationId: true } },
    },
    orderBy: [{ grade: 'asc' }, { period: 'asc' }],
  });

  const scopes = [
    {
      organizationId: profile.organization.id,
      schoolId: classes[0]?.schoolId,
      teacherProfileId: profile.id,
    },
  ];

  const availableAssignmentTypes =
    await getAvailableAssignmentTypesForScopes<{
      id: string;
      title: string;
      kind: string | null;
      systemKey: string | null;
      collaborationSupported: boolean;
      image: { id: string; altText: string | null } | null;
      rubric: { name: string } | null;
    }>({
      scopes,
      select: {
        id: true,
        title: true,
        kind: true,
        systemKey: true,
        collaborationSupported: true,
        image: { select: { id: true, altText: true } },
        rubric: { select: { name: true } },
      },
      orderBy: { position: 'asc' },
    });

  const creationTypeRows = filterAssignmentTypesForOrganizationPlan(
    profile.organization,
    availableAssignmentTypes.filter(
      (type) => type.systemKey !== AP_HISTORY_ASSIGNMENT_TYPE_KEY
    )
  );

  const gradesGrammarIds = await getGrammarGradingAssignmentTypeIds(
    creationTypeRows.map((type) => type.id)
  );

  const quotaByTypeId = await loadAssignmentCreationQuotasForTypes(
    profile.organization,
    creationTypeRows.map((type) => ({
      id: type.id,
      kind: type.kind ?? null,
    }))
  );

  const siteLicenseLockedAssignmentTiles =
    await loadSiteLicenseLockedAssignmentTiles(profile.organization);

  await readFreeAccountUsage(profile, true, userId);

  const assignmentTypes: AssignmentCreationAssignmentType[] =
    creationTypeRows.map((type) => ({
      id: type.id,
      title: type.title,
      kind: type.kind,
      collaborationSupported: type.collaborationSupported,
      gradesGrammar: gradesGrammarIds.has(type.id),
      imageId: type.image?.id ?? null,
      imageTitle: type.image?.altText ?? null,
      rubricName: type.rubric?.name ?? null,
      ...quotaByTypeId.get(type.id),
    }));

  return {
    assignmentTypes,
    siteLicenseLockedAssignmentTiles,
    classes: classes.map((klass) => ({
      id: klass.id,
      label: formatClassCardTitle(klass),
    })),
  };
}

export function classLabelById(
  classes: AssignmentBuilderV3Class[],
  classId: string
) {
  return classes.find((klass) => klass.id === classId)?.label ?? classId;
}

export function formatClassLabelsForIds(
  classes: AssignmentBuilderV3Class[],
  classIds: string[]
) {
  return classIds.map((id) => classLabelById(classes, id));
}

/** Detail/edit routes use `formatClassLabel` on nested class rows. */
export { formatClassLabel };
