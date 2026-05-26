import {
  data as dataResponse,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useFetcher,
  useLoaderData,
} from 'react-router';
import { useMemo, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Switch } from '~/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { SlidersHorizontal } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  parseSettingIdList,
  setFeatureFlagBoolean,
  setTargetedFeatureFlagTarget,
  TARGETED_FEATURE_FLAGS,
  type TargetedFeatureFlag,
  type TargetedFeatureFlagDefinition,
} from '~/utils/feature-flags.server';

type OrganizationOption = {
  id: string;
  name: string;
};

type SchoolOption = {
  id: string;
  name: string;
  code: string;
  organizationId: string;
  organizationName: string;
};

type RegisteredFeatureFlag = TargetedFeatureFlagDefinition & {
  key: TargetedFeatureFlag;
};

type LoaderData = ReturnType<typeof useLoaderData<typeof loader>>;
type FlagData = LoaderData['flags'][number];
type PilotTargetRow = LoaderData['pilotTargetRows'][number];
type TargetOption = OrganizationOption | SchoolOption;
type PilotFeatureKey = 'assignments' | 'document_submission_grading';
type PilotTargetKind = 'teacher' | 'class';
type PilotTargetOption = {
  kind: PilotTargetKind;
  id: string;
  label: string;
  detail: string;
};

const PILOT_FEATURES: Array<{ key: PilotFeatureKey; label: string }> = [
  { key: 'assignments', label: 'Assignments' },
  {
    key: 'document_submission_grading',
    label: 'Document submission grading',
  },
];

function getRegisteredFeatureFlags(): RegisteredFeatureFlag[] {
  return Object.entries(TARGETED_FEATURE_FLAGS).map(([key, definition]) => ({
    key: key as TargetedFeatureFlag,
    label: definition.label,
    settingName: definition.settingName,
    targetKind: definition.targetKind,
    description: definition.description,
    globalSettingName:
      'globalSettingName' in definition
        ? definition.globalSettingName
        : undefined,
    globalLabel:
      'globalLabel' in definition ? definition.globalLabel : undefined,
    globalDescription:
      'globalDescription' in definition
        ? definition.globalDescription
        : undefined,
  }));
}

function getRegisteredFeatureFlag(
  key: FormDataEntryValue | null
): RegisteredFeatureFlag | null {
  if (typeof key !== 'string' || !(key in TARGETED_FEATURE_FLAGS)) {
    return null;
  }

  return getRegisteredFeatureFlags().find((flag) => flag.key === key) ?? null;
}

function isSchoolOption(
  target: OrganizationOption | SchoolOption
): target is SchoolOption {
  return 'organizationName' in target;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const definitions = getRegisteredFeatureFlags();
  const settingNames = Array.from(
    new Set(
      definitions.flatMap((definition) =>
        [definition.settingName, definition.globalSettingName].filter(
          (name): name is string => Boolean(name)
        )
      )
    )
  );

  const [
    organizations,
    schools,
    settings,
    teacherProfiles,
    classes,
    featureAccessTargets,
  ] = await Promise.all([
    prisma.organization.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.school.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        organizationId: true,
        organization: { select: { name: true } },
      },
      orderBy: [{ organization: { name: 'asc' } }, { name: 'asc' }],
    }),
    prisma.setting.findMany({
      where: { name: { in: settingNames } },
      select: { name: true, value: true, valueType: true },
    }),
    prisma.teacherProfile.findMany({
      where: { isActive: true },
      select: {
        id: true,
        profile: {
          select: {
            organization: { select: { name: true } },
            user: { select: { email: true, name: true } },
          },
        },
      },
      orderBy: {
        profile: {
          user: {
            name: 'asc',
          },
        },
      },
    }),
    prisma.class.findMany({
      where: { isArchived: false },
      select: {
        id: true,
        code: true,
        grade: true,
        period: true,
        schoolYear: true,
        title: true,
        school: {
          select: {
            name: true,
            organization: { select: { name: true } },
          },
        },
      },
      orderBy: [{ schoolYear: 'desc' }, { code: 'asc' }],
    }),
    prisma.featureAccessTarget.findMany({
      where: {
        featureKey: { in: PILOT_FEATURES.map((feature) => feature.key) },
        targetKind: { in: ['teacher', 'class'] },
      },
      select: {
        id: true,
        featureKey: true,
        targetKind: true,
        targetId: true,
        enabled: true,
        expiresAt: true,
        note: true,
      },
      orderBy: [{ featureKey: 'asc' }, { targetKind: 'asc' }],
    }),
  ]);

  const settingsByName = new Map(
    settings.map((setting) => [setting.name, setting])
  );
  const flags = definitions.map((definition) => {
    const targetSetting = settingsByName.get(definition.settingName);
    const globalSetting = definition.globalSettingName
      ? settingsByName.get(definition.globalSettingName)
      : undefined;

    return {
      ...definition,
      enabledTargetIds: Array.from(parseSettingIdList(targetSetting?.value)),
      globalEnabled:
        globalSetting?.valueType === 'boolean' &&
        globalSetting.value === 'true',
    };
  });

  return dataResponse({
    flags,
    organizations,
    schools: schools.map((school) => ({
      id: school.id,
      name: school.name,
      code: school.code,
      organizationId: school.organizationId,
      organizationName: school.organization.name,
    })),
    pilotTargetRows: buildPilotTargetRows({
      teacherTargets: teacherProfiles.map((teacher) => ({
        kind: 'teacher',
        id: teacher.id,
        label:
          teacher.profile.user.name ??
          teacher.profile.user.email ??
          'Unnamed teacher',
        detail: joinDetailParts([
          teacher.profile.user.email,
          teacher.profile.organization.name,
        ]),
      })),
      classTargets: classes.map((classTarget) => ({
        kind: 'class',
        id: classTarget.id,
        label:
          classTarget.title ??
          joinDetailParts([
            classTarget.grade ? `Grade ${classTarget.grade}` : null,
            classTarget.period ? `Period ${classTarget.period}` : null,
            classTarget.code,
          ]) ??
          classTarget.code,
        detail: joinDetailParts([
          classTarget.code,
          classTarget.grade ? `Grade ${classTarget.grade}` : null,
          classTarget.period ? `Period ${classTarget.period}` : null,
          classTarget.school.name,
          classTarget.school.organization.name,
        ]),
      })),
      featureAccessTargets,
    }),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);

  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'toggle-pilot-target') {
    const feature = getPilotFeature(formData.get('featureKey'));
    const targetKind = getPilotTargetKind(formData.get('targetKind'));
    const targetId = formData.get('targetId');
    const enabled = formData.get('enabled') === 'true';

    if (!feature) {
      return dataResponse({ error: 'Unknown pilot feature.' }, { status: 400 });
    }
    if (!targetKind) {
      return dataResponse(
        { error: 'Invalid pilot target kind.' },
        { status: 400 }
      );
    }
    if (typeof targetId !== 'string' || !targetId) {
      return dataResponse({ error: 'Target is required.' }, { status: 400 });
    }

    if (targetKind === 'teacher') {
      const teacher = await prisma.teacherProfile.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!teacher) {
        return dataResponse({ error: 'Teacher not found.' }, { status: 404 });
      }
    } else {
      const classTarget = await prisma.class.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!classTarget) {
        return dataResponse({ error: 'Class not found.' }, { status: 404 });
      }
    }

    const target = await prisma.featureAccessTarget.upsert({
      where: {
        featureKey_targetKind_targetId: {
          featureKey: feature.key,
          targetKind,
          targetId,
        },
      },
      create: {
        featureKey: feature.key,
        targetKind,
        targetId,
        enabled,
        expiresAt: null,
      },
      update: enabled ? { enabled, expiresAt: null } : { enabled },
    });

    return dataResponse({ success: true, target });
  }

  const definition = getRegisteredFeatureFlag(formData.get('flag'));

  if (!definition) {
    return dataResponse({ error: 'Unknown feature flag.' }, { status: 400 });
  }

  if (intent === 'toggle-target') {
    const targetId = formData.get('targetId') as string | null;
    const enabled = formData.get('enabled') === 'true';

    if (!targetId) {
      return dataResponse({ error: 'Target is required.' }, { status: 400 });
    }

    if (definition.targetKind === 'organization') {
      const organization = await prisma.organization.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!organization) {
        return dataResponse(
          { error: 'Organization not found.' },
          { status: 404 }
        );
      }
    } else {
      const school = await prisma.school.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!school) {
        return dataResponse({ error: 'School not found.' }, { status: 404 });
      }
    }

    const value = await setTargetedFeatureFlagTarget(
      definition.key,
      targetId,
      enabled
    );
    return dataResponse({ success: true, value });
  }

  if (intent === 'toggle-global') {
    const enabled = formData.get('enabled') === 'true';
    if (!definition.globalSettingName) {
      return dataResponse(
        { error: 'Feature flag does not have a global switch.' },
        { status: 400 }
      );
    }

    const value = await setFeatureFlagBoolean(
      definition.globalSettingName,
      enabled,
      definition.globalDescription
    );
    return dataResponse({ success: true, value });
  }

  return dataResponse({ error: 'Invalid intent.' }, { status: 400 });
}

export default function FeatureFlagsRoute() {
  const { flags, organizations, schools, pilotTargetRows } =
    useLoaderData<typeof loader>();
  const [selectedFlagKey, setSelectedFlagKey] =
    useState<TargetedFeatureFlag | null>(null);
  const selectedFlag =
    flags.find((flag) => flag.key === selectedFlagKey) ?? null;

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-5">
      <FeatureFlagOverview
        flags={flags}
        organizations={organizations}
        schools={schools}
        onManage={(flag) => setSelectedFlagKey(flag.key)}
      />
      <PilotFeatureTargetTable rows={pilotTargetRows} />
      <Sheet
        open={Boolean(selectedFlag)}
        onOpenChange={(open) => {
          if (!open) setSelectedFlagKey(null);
        }}
      >
        {selectedFlag ? (
          <FeatureFlagTargetSheet
            flag={selectedFlag}
            organizations={organizations}
            schools={schools}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function FeatureFlagOverview({
  flags,
  organizations,
  schools,
  onManage,
}: {
  flags: FlagData[];
  organizations: OrganizationOption[];
  schools: SchoolOption[];
  onManage: (flag: FlagData) => void;
}) {
  const fetcher = useFetcher();

  const submitGlobalToggle = (flag: FlagData, enabled: boolean) => {
    const formData = new FormData();
    formData.set('intent', 'toggle-global');
    formData.set('flag', flag.key);
    formData.set('enabled', enabled ? 'true' : 'false');
    fetcher.submit(formData, { method: 'POST' });
  };

  return (
    <Card className="bg-muted">
      <CardHeader className="border-b pb-4">
        <CardTitle>Feature flag rollout</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flag</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Rollout</TableHead>
                <TableHead>Global</TableHead>
                <TableHead className="w-[130px] text-right">Targets</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flags.map((flag) => {
                const targets = getTargets(flag, organizations, schools);
                const enabledTargetCount = getEnabledTargetCount(flag, targets);
                const targetLabel = getTargetLabel(flag);
                return (
                  <TableRow key={flag.key}>
                    <TableCell className="min-w-[260px]">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{flag.label}</span>
                        <span className="text-sm text-muted-foreground">
                          {flag.description}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{getScopeLabel(flag)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">
                          {enabledTargetCount} / {targets.length} {targetLabel}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {targets.length === 0
                            ? 'No targets available'
                            : `${Math.round((enabledTargetCount / targets.length) * 100)}% targeted`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {flag.globalSettingName ? (
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={flag.globalEnabled}
                            disabled={fetcher.state !== 'idle'}
                            onCheckedChange={(checked) =>
                              submitGlobalToggle(flag, checked)
                            }
                          />
                          <span className="text-sm">
                            {flag.globalEnabled ? 'On' : 'Off'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Not applicable
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onManage(flag)}
                      >
                        <SlidersHorizontal className="mr-2 h-4 w-4" />
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function FeatureFlagTargetSheet({
  flag,
  organizations,
  schools,
}: {
  flag: FlagData;
  organizations: OrganizationOption[];
  schools: SchoolOption[];
}) {
  return (
    <SheetContent className="flex w-full flex-col overflow-hidden p-0 sm:max-w-3xl">
      <SheetHeader className="border-b p-5">
        <div className="flex flex-col gap-2 pr-8">
          <SheetTitle>{flag.label}</SheetTitle>
          <SheetDescription>{flag.description}</SheetDescription>
        </div>
      </SheetHeader>
      <FeatureFlagTargetControls
        flag={flag}
        organizations={organizations}
        schools={schools}
      />
    </SheetContent>
  );
}

function FeatureFlagTargetControls({
  flag,
  organizations,
  schools,
}: {
  flag: FlagData;
  organizations: OrganizationOption[];
  schools: SchoolOption[];
}) {
  const fetcher = useFetcher();
  const [query, setQuery] = useState('');
  const targets = getTargets(flag, organizations, schools);
  const enabledIds = new Set(flag.enabledTargetIds);
  const enabledTargetCount = getEnabledTargetCount(flag, targets);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredTargets = useMemo(
    () =>
      targets.filter((target) => {
        if (!normalizedQuery) return true;
        if (isSchoolOption(target)) {
          return [target.name, target.code, target.organizationName].some(
            (value) => value.toLowerCase().includes(normalizedQuery)
          );
        }
        return target.name.toLowerCase().includes(normalizedQuery);
      }),
    [normalizedQuery, targets]
  );
  const targetLabel = getTargetLabel(flag);

  const submitTargetToggle = (targetId: string, enabled: boolean) => {
    const formData = new FormData();
    formData.set('intent', 'toggle-target');
    formData.set('flag', flag.key);
    formData.set('targetId', targetId);
    formData.set('enabled', enabled ? 'true' : 'false');
    fetcher.submit(formData, { method: 'POST' });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border bg-muted p-3">
          <p className="text-sm text-muted-foreground">Scope</p>
          <p className="font-medium">{getScopeLabel(flag)}</p>
        </div>
        <div className="rounded-md border bg-muted p-3">
          <p className="text-sm text-muted-foreground">Rollout</p>
          <p className="font-medium">
            {enabledTargetCount} / {targets.length} {targetLabel}
          </p>
        </div>
        <div className="rounded-md border bg-muted p-3">
          <p className="text-sm text-muted-foreground">Global</p>
          <p className="font-medium">
            {flag.globalSettingName
              ? flag.globalEnabled
                ? 'On'
                : 'Off'
              : 'Not applicable'}
          </p>
        </div>
      </div>

      {flag.globalSettingName && flag.globalEnabled ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          School allowlist is bypassed while global is enabled.
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${targetLabel}`}
          className="sm:max-w-sm"
        />
        <span className="text-sm text-muted-foreground">
          Showing {filteredTargets.length} of {targets.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {flag.targetKind === 'school' ? (
                <>
                  <TableHead>Code</TableHead>
                  <TableHead>Organization</TableHead>
                </>
              ) : null}
              <TableHead className="w-[130px] text-right">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTargets.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={flag.targetKind === 'school' ? 4 : 2}
                  className="h-20 text-center text-sm text-muted-foreground"
                >
                  No targets found.
                </TableCell>
              </TableRow>
            ) : (
              filteredTargets.map((target) => (
                <TableRow key={target.id}>
                  <TableCell className="font-medium">{target.name}</TableCell>
                  {isSchoolOption(target) ? (
                    <>
                      <TableCell className="font-mono text-xs">
                        {target.code}
                      </TableCell>
                      <TableCell>{target.organizationName}</TableCell>
                    </>
                  ) : null}
                  <TableCell>
                    <div className="flex items-center justify-end gap-3">
                      <span className="text-sm text-muted-foreground">
                        {enabledIds.has(target.id) ? 'Enabled' : 'Disabled'}
                      </span>
                      <Switch
                        checked={enabledIds.has(target.id)}
                        disabled={fetcher.state !== 'idle'}
                        onCheckedChange={(checked) =>
                          submitTargetToggle(target.id, checked)
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PilotFeatureTargetTable({ rows }: { rows: PilotTargetRow[] }) {
  const fetcher = useFetcher();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (!normalizedQuery) return true;
        return [
          row.featureLabel,
          row.targetKind,
          row.targetLabel,
          row.targetDetail,
          row.note ?? '',
        ].some((value) => value.toLowerCase().includes(normalizedQuery));
      }),
    [normalizedQuery, rows]
  );

  const submitPilotTargetToggle = (row: PilotTargetRow, enabled: boolean) => {
    const formData = new FormData();
    formData.set('intent', 'toggle-pilot-target');
    formData.set('featureKey', row.featureKey);
    formData.set('targetKind', row.targetKind);
    formData.set('targetId', row.targetId);
    formData.set('enabled', enabled ? 'true' : 'false');
    fetcher.submit(formData, { method: 'POST' });
  };

  return (
    <Card className="bg-muted">
      <CardHeader className="border-b pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Teacher and class pilots</CardTitle>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pilot targets"
            className="sm:max-w-sm"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-[130px] text-right">Enabled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-20 text-center text-sm text-muted-foreground"
                  >
                    No pilot targets found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => (
                  <TableRow
                    key={`${row.featureKey}:${row.targetKind}:${row.targetId}`}
                  >
                    <TableCell className="font-medium">
                      {row.featureLabel}
                    </TableCell>
                    <TableCell className="min-w-[260px]">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{row.targetLabel}</span>
                        <span className="text-sm text-muted-foreground">
                          {row.targetDetail}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {row.targetKind === 'teacher' ? 'Teacher' : 'Class'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(row.expiresAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.note ?? '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-3">
                        <span className="text-sm text-muted-foreground">
                          {row.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <Switch
                          checked={row.enabled}
                          disabled={fetcher.state !== 'idle'}
                          onCheckedChange={(checked) =>
                            submitPilotTargetToggle(row, checked)
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function getTargets(
  flag: FlagData,
  organizations: OrganizationOption[],
  schools: SchoolOption[]
): TargetOption[] {
  return flag.targetKind === 'organization' ? organizations : schools;
}

function getEnabledTargetCount(flag: FlagData, targets: TargetOption[]) {
  const enabledIds = new Set(flag.enabledTargetIds);
  return targets.filter((target) => enabledIds.has(target.id)).length;
}

function getTargetLabel(flag: FlagData) {
  return flag.targetKind === 'organization' ? 'organizations' : 'schools';
}

function getScopeLabel(flag: FlagData) {
  return flag.targetKind === 'organization' ? 'Organizations' : 'Schools';
}

function buildPilotTargetRows({
  teacherTargets,
  classTargets,
  featureAccessTargets,
}: {
  teacherTargets: PilotTargetOption[];
  classTargets: PilotTargetOption[];
  featureAccessTargets: Array<{
    id: string;
    featureKey: string;
    targetKind: string;
    targetId: string;
    enabled: boolean;
    expiresAt: Date | null;
    note: string | null;
  }>;
}) {
  const targetsByKey = new Map(
    featureAccessTargets.map((target) => [
      getPilotTargetMapKey(
        target.featureKey,
        target.targetKind,
        target.targetId
      ),
      target,
    ])
  );
  const targets = [...teacherTargets, ...classTargets];

  return PILOT_FEATURES.flatMap((feature) =>
    targets.map((target) => {
      const accessTarget = targetsByKey.get(
        getPilotTargetMapKey(feature.key, target.kind, target.id)
      );

      return {
        featureKey: feature.key,
        featureLabel: feature.label,
        targetKind: target.kind,
        targetId: target.id,
        targetLabel: target.label,
        targetDetail: target.detail,
        featureAccessTargetId: accessTarget?.id ?? null,
        enabled:
          accessTarget?.enabled === true && !isExpired(accessTarget.expiresAt),
        expiresAt: accessTarget?.expiresAt
          ? accessTarget.expiresAt.toISOString()
          : null,
        note: accessTarget?.note ?? null,
      };
    })
  );
}

function getPilotFeature(key: FormDataEntryValue | null) {
  if (typeof key !== 'string') return null;
  return PILOT_FEATURES.find((feature) => feature.key === key) ?? null;
}

function getPilotTargetKind(
  kind: FormDataEntryValue | null
): PilotTargetKind | null {
  return kind === 'teacher' || kind === 'class' ? kind : null;
}

function getPilotTargetMapKey(
  featureKey: string,
  targetKind: string,
  targetId: string
) {
  return `${featureKey}:${targetKind}:${targetId}`;
}

function joinDetailParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part)).join(' - ');
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function isExpired(value: Date | null) {
  return value !== null && value.getTime() <= Date.now();
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
