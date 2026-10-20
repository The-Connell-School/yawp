import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { isThesisDrivenEssayTitle } from '~/domain/assignment-types/thesis-driven-essay';
import {
  FREE_CLASSROOM_ASSIGNMENT_KINDS,
  type FreeClassroomAssignmentQuotaKind,
} from '~/utils/entitlements.server';
import type { OrganizationPlan } from '@app/prisma';

function isEntitledFreeAssignmentKind(kind: string | null | undefined) {
  return Boolean(
    kind &&
      FREE_CLASSROOM_ASSIGNMENT_KINDS.includes(
        kind as FreeClassroomAssignmentQuotaKind
      )
  );
}

export type AssignmentTypeCatalogRow = {
  id: string;
  title: string;
  kind?: string | null;
  systemKey?: string | null;
};

export type SiteLicenseLockedAssignmentTile = {
  key: string;
  label: string;
  assignmentTypeId: string;
};

type LockedSpec = {
  key: string;
  matches: (type: AssignmentTypeCatalogRow) => boolean;
};

/** Brian 2026-10-18: premium types surfaced as locked tiles on the free dashboard. */
const LOCKED_ASSIGNMENT_SPECS: LockedSpec[] = [
  {
    key: 'thesis_driven_essay',
    matches: (type) => isThesisDrivenEssayTitle(type.title),
  },
  {
    key: 'ap_history_essay',
    matches: (type) => type.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY,
  },
  {
    key: 'daily_pages',
    matches: (type) => type.kind === 'daily_pages',
  },
  {
    key: 'act_writing',
    matches: (type) => type.kind === 'act_writing',
  },
  {
    key: 'ap_english_language',
    matches: (type) =>
      normalizedAssignmentTypeTitle(type.title) === 'ap english language',
  },
  {
    key: 'ap_english_literature',
    matches: (type) =>
      normalizedAssignmentTypeTitle(type.title) === 'ap english literature',
  },
];

function normalizedAssignmentTypeTitle(title: string) {
  return title.trim().toLowerCase();
}

/** Platform-owned rows eligible for site-license locked tile resolution. */
export function siteLicenseLockedPlatformAssignmentTypesWhere() {
  return {
    ownerOrgId: null,
    ownerMembershipId: null,
    archivedAt: null,
    OR: [
      { systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY },
      { kind: 'daily_pages' },
      { kind: 'act_writing' },
      {
        title: { equals: 'The Thesis-Driven Essay', mode: 'insensitive' as const },
      },
      {
        title: { equals: 'AP English Language', mode: 'insensitive' as const },
      },
      {
        title: {
          equals: 'AP English Literature',
          mode: 'insensitive' as const,
        },
      },
    ],
  };
}

export function resolveSiteLicenseLockedAssignmentTiles(
  catalogTypes: AssignmentTypeCatalogRow[]
): SiteLicenseLockedAssignmentTile[] {
  const tiles: SiteLicenseLockedAssignmentTile[] = [];
  for (const spec of LOCKED_ASSIGNMENT_SPECS) {
    const match = catalogTypes.find(spec.matches);
    if (!match) continue;
    if (isEntitledFreeAssignmentKind(match.kind)) continue;
    tiles.push({
      key: spec.key,
      label: match.title.trim(),
      assignmentTypeId: match.id,
    });
  }
  return tiles;
}

export function siteLicenseLockedAssignmentTilesForOrganization(
  organization: Pick<{ plan: OrganizationPlan }, 'plan'>,
  catalogTypes: AssignmentTypeCatalogRow[]
): SiteLicenseLockedAssignmentTile[] {
  if (organization.plan !== 'FREE_CLASSROOM') return [];
  return resolveSiteLicenseLockedAssignmentTiles(catalogTypes);
}
