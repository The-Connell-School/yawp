import {
  data as dataResponse,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useFetcher,
  useLoaderData,
} from 'react-router';
import { useMemo, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Switch } from '~/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
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

  const [organizations, schools, settings] = await Promise.all([
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
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);

  const formData = await request.formData();
  const intent = formData.get('intent');
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
  const { flags, organizations, schools } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-5">
      {flags.map((flag) => (
        <FeatureFlagCard
          key={flag.key}
          flag={flag}
          organizations={organizations}
          schools={schools}
        />
      ))}
    </div>
  );
}

function FeatureFlagCard({
  flag,
  organizations,
  schools,
}: {
  flag: ReturnType<typeof useLoaderData<typeof loader>>['flags'][number];
  organizations: OrganizationOption[];
  schools: SchoolOption[];
}) {
  const fetcher = useFetcher();
  const [query, setQuery] = useState('');
  const targets = flag.targetKind === 'organization' ? organizations : schools;
  const enabledIds = new Set(flag.enabledTargetIds);
  const enabledTargetCount = targets.filter((target) =>
    enabledIds.has(target.id)
  ).length;
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
  const targetLabel =
    flag.targetKind === 'organization' ? 'organizations' : 'schools';

  const submitTargetToggle = (targetId: string, enabled: boolean) => {
    const formData = new FormData();
    formData.set('intent', 'toggle-target');
    formData.set('flag', flag.key);
    formData.set('targetId', targetId);
    formData.set('enabled', enabled ? 'true' : 'false');
    fetcher.submit(formData, { method: 'POST' });
  };

  const submitGlobalToggle = (enabled: boolean) => {
    const formData = new FormData();
    formData.set('intent', 'toggle-global');
    formData.set('flag', flag.key);
    formData.set('enabled', enabled ? 'true' : 'false');
    fetcher.submit(formData, { method: 'POST' });
  };

  return (
    <Card className="bg-muted">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>{flag.label}</CardTitle>
          <p className="text-sm text-muted-foreground">{flag.description}</p>
        </div>
        <Badge variant="secondary" className="w-fit">
          {enabledTargetCount} / {targets.length} {targetLabel}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {flag.globalSettingName ? (
          <div className="flex items-center justify-between rounded-md border bg-background p-3">
            <div className="flex flex-col gap-1">
              <p className="font-medium">{flag.globalLabel ?? 'Global'}</p>
              {flag.globalDescription ? (
                <p className="text-sm text-muted-foreground">
                  {flag.globalDescription}
                </p>
              ) : null}
            </div>
            <Switch
              checked={flag.globalEnabled}
              disabled={fetcher.state !== 'idle'}
              onCheckedChange={submitGlobalToggle}
            />
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

        <div className="overflow-x-auto rounded-md border bg-background">
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
                <TableHead className="w-[120px] text-right">Enabled</TableHead>
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
                    <TableCell className="text-right">
                      <Switch
                        checked={enabledIds.has(target.id)}
                        disabled={fetcher.state !== 'idle'}
                        onCheckedChange={(checked) =>
                          submitTargetToggle(target.id, checked)
                        }
                      />
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

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
