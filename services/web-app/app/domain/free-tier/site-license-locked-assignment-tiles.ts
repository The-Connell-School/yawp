import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { isThesisDrivenEssayTitle } from '~/domain/assignment-types/thesis-driven-essay';
import {
  FREE_CLASSROOM_ASSIGNMENT_KINDS,
  type FreeClassroomAssignmentQuotaKind,
} from '~/domain/free-tier/free-classroom-assignment-kinds';
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
  ownerOrgId?: string | null;
  ownerMembershipId?: string | null;
  image?: { id: string } | null;
};

export type SiteLicenseLockedAssignmentTile = {
  key: string;
  label: string;
  assignmentTypeId: string;
  imageId?: string | null;
};

/** User-facing labels for locked tiles (never sourced from assignment type titles). */
export const SITE_LICENSE_LOCKED_TILE_LABELS = {
  thesis_driven_essay: 'Thesis-Driven Essay',
  ap_history_essay: 'AP History Essay',
  daily_pages: 'Daily Pages',
  act_writing: 'ACT Writing Practice',
  ap_english_language: 'AP English Language',
  ap_english_literature: 'AP English Literature',
} as const;

/** Canonical platform ACT assignment type titles (prod-fidelity + migration). */
export const PLATFORM_ACT_WRITING_TITLES = [
  'ACT Writing Section',
  'ACT Writing Section ',
  'ACT Writing',
] as const;

export const PLATFORM_ACT_WRITING_TITLES_NORMALIZED =
  PLATFORM_ACT_WRITING_TITLES.map((title) => title.trim().toLowerCase());

function normalizedAssignmentTypeTitle(title: string) {
  return title.trim().toLowerCase();
}

function isPlatformOwned(type: AssignmentTypeCatalogRow) {
  return type.ownerOrgId == null && type.ownerMembershipId == null;
}

function isPlatformActWritingType(type: AssignmentTypeCatalogRow) {
  if (!isPlatformOwned(type)) return false;
  if (type.kind === 'act_writing') return true;
  return PLATFORM_ACT_WRITING_TITLES_NORMALIZED.includes(
    normalizedAssignmentTypeTitle(type.title)
  );
}

type LockedSpec = {
  key: keyof typeof SITE_LICENSE_LOCKED_TILE_LABELS;
  matches: (type: AssignmentTypeCatalogRow) => boolean;
  allowOrgOwned?: boolean;
};

/** Brian 2026-10-18: premium types surfaced as locked tiles on the free dashboard. */
const LOCKED_ASSIGNMENT_SPECS: LockedSpec[] = [
  {
    key: 'thesis_driven_essay',
    matches: (type) =>
      isPlatformOwned(type) && isThesisDrivenEssayTitle(type.title),
  },
  {
    key: 'ap_history_essay',
    matches: (type) => type.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY,
    allowOrgOwned: true,
  },
  {
    key: 'daily_pages',
    matches: (type) => isPlatformOwned(type) && type.kind === 'daily_pages',
  },
  {
    key: 'act_writing',
    matches: (type) => isPlatformActWritingType(type),
  },
  {
    key: 'ap_english_language',
    matches: (type) =>
      isPlatformOwned(type) &&
      normalizedAssignmentTypeTitle(type.title) === 'ap english language',
  },
  {
    key: 'ap_english_literature',
    matches: (type) =>
      isPlatformOwned(type) &&
      normalizedAssignmentTypeTitle(type.title) === 'ap english literature',
  },
];

function findLockedAssignmentTypeForSpec(
  catalogTypes: AssignmentTypeCatalogRow[],
  spec: LockedSpec
) {
  return catalogTypes.find((type) => {
    if (!spec.allowOrgOwned && !isPlatformOwned(type)) return false;
    return spec.matches(type);
  });
}

/** Rows loaded for locked-tile resolution (platform identities + AP History systemKey). */
export function siteLicenseLockedAssignmentTypesWhere() {
  const platformIdentityOr = [
    { kind: 'daily_pages' },
    { kind: 'act_writing' },
    ...PLATFORM_ACT_WRITING_TITLES.map((title) => ({
      title: { equals: title, mode: 'insensitive' as const },
    })),
    {
      title: {
        equals: 'The Thesis-Driven Essay',
        mode: 'insensitive' as const,
      },
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
  ];

  return {
    archivedAt: null,
    OR: [
      { systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY },
      {
        ownerOrgId: null,
        ownerMembershipId: null,
        OR: platformIdentityOr,
      },
    ],
  };
}

/** @deprecated use siteLicenseLockedAssignmentTypesWhere */
export const siteLicenseLockedPlatformAssignmentTypesWhere =
  siteLicenseLockedAssignmentTypesWhere;

export function resolveSiteLicenseLockedAssignmentTiles(
  catalogTypes: AssignmentTypeCatalogRow[]
): SiteLicenseLockedAssignmentTile[] {
  const tiles: SiteLicenseLockedAssignmentTile[] = [];
  for (const spec of LOCKED_ASSIGNMENT_SPECS) {
    const match = findLockedAssignmentTypeForSpec(catalogTypes, spec);
    if (!match) continue;
    if (isEntitledFreeAssignmentKind(match.kind)) continue;
    tiles.push({
      key: spec.key,
      label: SITE_LICENSE_LOCKED_TILE_LABELS[spec.key],
      assignmentTypeId: match.id,
      imageId: match.image?.id ?? null,
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

/** Whether an assignment type appears as a site-license-only locked carousel tile. */
export function assignmentTypeMatchesSiteLicenseLockedTile(
  type: Pick<
    AssignmentTypeCatalogRow,
    'title' | 'kind' | 'systemKey' | 'ownerOrgId' | 'ownerMembershipId'
  >
): boolean {
  if (isEntitledFreeAssignmentKind(type.kind)) return false;
  const row: AssignmentTypeCatalogRow = {
    id: '',
    title: type.title,
    kind: type.kind,
    systemKey: type.systemKey ?? null,
    ownerOrgId: type.ownerOrgId ?? null,
    ownerMembershipId: type.ownerMembershipId ?? null,
  };
  return LOCKED_ASSIGNMENT_SPECS.some((spec) => {
    if (!spec.allowOrgOwned && !isPlatformOwned(row)) return false;
    return spec.matches(row);
  });
}
