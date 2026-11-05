import { data as dataResponse, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { z } from 'zod';
import {
  addAccessListEntry,
  listAccessList,
  removeAccessListEntry,
} from '~/domain/access-lists/access-lists.server';
import { TEACHER_LOUNGE_ACCESS_LIST_KEY } from '~/domain/access-lists/access-lists';
import {
  auditItemLabel,
  classifyAuditEntry,
  formatAuditChangeSummary,
  listAdminConfigAudit,
  listAdminConfigAuditActors,
  isRestorableFeatureFlagAudit,
  type AdminConfigAuditRow,
} from '~/domain/admin-config/admin-config-audit-query.server';
import {
  FEATURE_FLAG_MODES,
  isFeatureFlagKey,
  normalizeFeatureFlagValue,
  parseFeatureFlagValue,
  type FeatureFlagKey,
} from '~/domain/feature-flags/feature-flags';
import {
  findUnknownOrganizationIds,
  listFeatureFlags,
  setFeatureFlag,
} from '~/domain/feature-flags/feature-flags.server';
import {
  getImpersonationState,
  requireAdmin,
  requireMutableRequest,
  requireSuperAdmin,
  requireUserId,
} from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { normalizeEmail } from '~/utils/normalize-email';

const intentSchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('set-feature-flag'),
    key: z.string(),
    mode: z.enum(FEATURE_FLAG_MODES),
    orgIds: z.string().optional(),
    reason: z.string().max(2000).optional(),
    confirmEveryone: z.literal('true').optional(),
  }),
  z.object({
    intent: z.literal('add-access-list'),
    email: z.string().email().max(320),
    reason: z.string().max(2000).optional(),
  }),
  z.object({
    intent: z.literal('remove-access-list'),
    email: z.string().email().max(320),
    reason: z.string().max(2000).optional(),
  }),
  z.object({
    intent: z.literal('restore-audit'),
    auditId: z.string().min(1),
    reason: z.string().max(2000).optional(),
  }),
]);

function parseAuditFilters(request: Request) {
  const url = new URL(request.url);
  const entityKey = url.searchParams.get('flag') || undefined;
  const actorEmail = url.searchParams.get('actor') || undefined;
  const actionKind = url.searchParams.get('action') as
    | 'all'
    | 'mode'
    | 'schools'
    | 'access'
    | undefined;
  const fromRaw = url.searchParams.get('from');
  const toRaw = url.searchParams.get('to');
  const from = fromRaw ? new Date(fromRaw) : undefined;
  const to = toRaw ? new Date(toRaw) : undefined;
  return {
    entityKey,
    actorEmail,
    actionKind: actionKind ?? 'all',
    from: from && !Number.isNaN(from.getTime()) ? from : undefined,
    to: to && !Number.isNaN(to.getTime()) ? to : undefined,
  };
}

type AccessListRow = Awaited<ReturnType<typeof listAccessList>>[number];

async function loadAccessListRows() {
  const entries = await listAccessList(TEACHER_LOUNGE_ACCESS_LIST_KEY);
  const emails = entries.map((entry: AccessListRow) => entry.email);
  const users = emails.length
    ? await prisma.user.findMany({
        where: { email: { in: emails } },
        select: {
          id: true,
          email: true,
          name: true,
          memberships: {
            where: { isActive: true },
            take: 1,
            select: {
              organization: { select: { id: true, name: true } },
            },
          },
        },
      })
    : [];
  const usersByEmail = new Map(
    users.map((user) => [user.email?.toLowerCase() ?? '', user])
  );
  const creatorIds = [
    ...new Set(
      entries.map((entry: AccessListRow) => entry.createdByUserId).filter(Boolean)
    ),
  ] as string[];
  const creators = creatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const creatorsById = new Map(creators.map((user) => [user.id, user]));

  return entries.map((entry: AccessListRow) => {
    const matched = usersByEmail.get(entry.email.toLowerCase());
    const creator = entry.createdByUserId
      ? creatorsById.get(entry.createdByUserId)
      : null;
    return {
      id: entry.id,
      email: entry.email,
      createdAt: entry.createdAt.toISOString(),
      matchedUser: matched
        ? {
            id: matched.id,
            name: matched.name ?? matched.email ?? entry.email,
            organizationName:
              matched.memberships[0]?.organization.name ?? null,
          }
        : null,
      addedBy: creator?.name ?? creator?.email ?? '—',
    };
  });
}

async function loadViewer(request: Request) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, isSuperAdmin: true },
  });
  const impersonation = await getImpersonationState(request);
  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const isImpersonating = Boolean(impersonation.impersonatorUserId);
  const canEdit = isSuperAdmin && !isImpersonating;
  return {
    userId,
    displayName: user?.name ?? user?.email ?? 'Admin',
    isSuperAdmin,
    isImpersonating,
    canEdit,
  };
}

function auditRowsToCsv(rows: AdminConfigAuditRow[]) {
  const header = ['when', 'actor', 'action', 'item', 'from', 'to', 'reason'];
  const lines = rows.map((row) => {
    const { actionLabel } = classifyAuditEntry(row);
    const change = formatAuditChangeSummary(row);
    return [
      row.createdAt.toISOString(),
      row.actorEmail,
      actionLabel,
      auditItemLabel(row),
      change.from,
      change.to,
      row.reason ?? '',
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',');
  });
  return [header.join(','), ...lines].join('\n');
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const viewer = await loadViewer(request);
  const flags = await listFeatureFlags();
  const unknownByFlag = Object.fromEntries(
    await Promise.all(
      flags.map(async (flag) => {
        if (flag.persisted.mode !== 'targeted' || flag.persisted.orgIds.length === 0) {
          return [flag.key, [] as string[]] as const;
        }
        return [
          flag.key,
          await findUnknownOrganizationIds(flag.persisted.orgIds),
        ] as const;
      })
    )
  );
  const auditFilters = parseAuditFilters(request);
  const auditEntries = await listAdminConfigAudit({
    ...auditFilters,
    limit: 200,
  });
  const auditActors = await listAdminConfigAuditActors();
  const accessList = await loadAccessListRows();
  const superAdmins = await prisma.user.findMany({
    where: { isSuperAdmin: true },
    select: { name: true, email: true },
    orderBy: { email: 'asc' },
  });
  const url = new URL(request.url);
  const orgSearch = url.searchParams.get('orgSearch')?.trim() ?? '';
  const targetedOrgIds = [
    ...new Set(
      flags.flatMap((flag) =>
        flag.persisted.mode === 'targeted' ? flag.persisted.orgIds : []
      )
    ),
  ];
  const [searchOrgs, selectedOrgs] = await Promise.all([
    orgSearch
      ? prisma.organization.findMany({
          where: {
            OR: [
              { name: { contains: orgSearch, mode: 'insensitive' } },
              { id: orgSearch },
            ],
          },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
          take: 20,
        })
      : Promise.resolve([]),
    targetedOrgIds.length
      ? prisma.organization.findMany({
          where: { id: { in: targetedOrgIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const organizations = [
    ...new Map(
      [...selectedOrgs, ...searchOrgs].map((org) => [org.id, org] as const)
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  if (url.searchParams.get('export') === 'csv') {
    const csv = auditRowsToCsv(auditEntries);
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="admin-access-flags-audit.csv"',
      },
    });
  }

  return dataResponse({
    viewer,
    flags,
    unknownByFlag,
    accessList,
    auditEntries: auditEntries.map(serializeAuditRow),
    auditActors,
    auditFilters,
    superAdmins: superAdmins.map((row) => row.name ?? row.email ?? 'Super admin'),
    organizations,
    orgSearch,
  });
}

function serializeAuditRow(row: AdminConfigAuditRow) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

async function assertCanMutate(request: Request) {
  await requireSuperAdmin(request);
  await requireMutableRequest(request);
  const impersonation = await getImpersonationState(request);
  if (impersonation.impersonatorUserId) {
    return dataResponse(
      {
        ok: false,
        error: 'impersonating',
        message:
          'Flag and access changes are turned off while you impersonate another user.',
      },
      { status: 403 }
    );
  }
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const denied = await assertCanMutate(request);
  if (denied) return denied;

  const form = await request.formData();
  const parsed = intentSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) {
    return dataResponse({ ok: false, error: 'invalid_input' }, { status: 400 });
  }
  const operator = await requireSuperAdmin(request);
  const operatorEmail = operator.email ?? 'unknown@yawp.local';
  const actor = {
    actorUserId: operator.id,
    actorEmail: operatorEmail,
    source: 'web_admin' as const,
  };

  if (parsed.data.intent === 'set-feature-flag') {
    if (!isFeatureFlagKey(parsed.data.key)) {
      return dataResponse({ ok: false, error: 'unknown_flag' }, { status: 404 });
    }
    const key = parsed.data.key as FeatureFlagKey;
    const orgIds = parsed.data.orgIds
      ? parsed.data.orgIds.split(/[\s,]+/).filter(Boolean)
      : [];
    const next = normalizeFeatureFlagValue(parsed.data.mode, orgIds);
    if (next.mode === 'targeted' && next.orgIds.length === 0) {
      return dataResponse(
        { ok: false, error: 'targeted_requires_orgs' },
        { status: 400 }
      );
    }
    const flags = await listFeatureFlags();
    const current = flags.find((flag) => flag.key === key);
    const previous = current?.persisted ?? { mode: 'off', orgIds: [] };
    if (
      previous.mode === 'targeted' &&
      previous.orgIds.length > 0 &&
      next.mode === 'everyone' &&
      parsed.data.confirmEveryone !== 'true'
    ) {
      return dataResponse(
        {
          ok: false,
          error: 'confirm_everyone',
          key,
          previousOrgCount: previous.orgIds.length,
        },
        { status: 409 }
      );
    }
    const unknownOrgIds = await findUnknownOrganizationIds(next.orgIds);
    if (unknownOrgIds.length > 0) {
      return dataResponse(
        { ok: false, error: 'unknown_orgs', unknownOrgIds, key },
        { status: 400 }
      );
    }
    try {
      await setFeatureFlag(key, next, operatorEmail, {
        ...actor,
        reason: parsed.data.reason ?? null,
      });
      return dataResponse({ ok: true, intent: parsed.data.intent, key });
    } catch {
      return dataResponse(
        { ok: false, error: 'forbidden', key, message: 'Change not saved: forbidden' },
        { status: 403 }
      );
    }
  }

  if (parsed.data.intent === 'add-access-list') {
    const email = normalizeEmail(parsed.data.email);
    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    await addAccessListEntry(
      TEACHER_LOUNGE_ACCESS_LIST_KEY,
      { email, userId: user?.id ?? null },
      { ...actor, reason: parsed.data.reason ?? null }
    );
    return dataResponse({ ok: true, intent: parsed.data.intent, email });
  }

  if (parsed.data.intent === 'remove-access-list') {
    const email = normalizeEmail(parsed.data.email);
    await removeAccessListEntry(TEACHER_LOUNGE_ACCESS_LIST_KEY, email, {
      ...actor,
      reason: parsed.data.reason ?? null,
    });
    return dataResponse({ ok: true, intent: parsed.data.intent, email });
  }

  if (parsed.data.intent === 'restore-audit') {
    const row = await prisma.adminConfigAudit.findUnique({
      where: { id: parsed.data.auditId },
    });
    if (!row || !isRestorableFeatureFlagAudit(row as AdminConfigAuditRow)) {
      return dataResponse({ ok: false, error: 'not_restorable' }, { status: 400 });
    }
    const before = parseFeatureFlagValue(JSON.stringify(row.before));
    if (!isFeatureFlagKey(row.entityKey)) {
      return dataResponse({ ok: false, error: 'unknown_flag' }, { status: 404 });
    }
    const unknownOrgIds = await findUnknownOrganizationIds(before.orgIds);
    if (unknownOrgIds.length > 0) {
      return dataResponse(
        { ok: false, error: 'unknown_orgs', unknownOrgIds, key: row.entityKey },
        { status: 400 }
      );
    }
    await setFeatureFlag(row.entityKey as FeatureFlagKey, before, operatorEmail, {
      ...actor,
      reason: parsed.data.reason ?? 'Restored from audit history',
    });
    return dataResponse({ ok: true, intent: parsed.data.intent, key: row.entityKey });
  }

  return dataResponse({ ok: false, error: 'unknown_intent' }, { status: 400 });
}
