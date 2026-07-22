import { randomUUID } from 'node:crypto';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { data, Link, useFetcher, useLoaderData } from 'react-router';
import { ChevronLeft, Plus, ShieldCheck } from 'lucide-react';
import { ConfirmationDialog } from '~/components/confirmation-dialog';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Textarea } from '~/components/ui/textarea';
import { TooltipIdCopy } from '~/components/ui/tooltip-id-copy';
import {
  createLtiRegistration,
  disableLtiRegistration,
  enableLtiRegistration,
  LtiPilotError,
  setLtiCourseMappingEnabled,
  setOrganizationLtiGate,
  upsertLtiCourseMapping,
} from '~/domain/lms/lti-pilot.server';
import { parseLtiRegistration } from '~/domain/lms/lti-registration';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

function requiredString(formData: FormData, field: string, maxLength = 255) {
  const value = formData.get(field);
  if (typeof value !== 'string' || !value || value.length > maxLength) {
    throw new LtiPilotError('invalid_request', `${field} is invalid.`);
  }
  return value;
}

function actionError(error: unknown) {
  if (error instanceof LtiPilotError) {
    return data(
      { ok: false as const, error: error.message },
      { status: error.status }
    );
  }
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002'
  ) {
    return data(
      {
        ok: false as const,
        error: 'That registration or mapping already exists.',
      },
      { status: 409 }
    );
  }
  return data(
    { ok: false as const, error: 'The LTI configuration could not be saved.' },
    { status: 400 }
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);
  if (!params.id) throw new Response('Not Found', { status: 404 });
  const organization = await prisma.organization.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      ltiEnabled: true,
      ltiRegistrations: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          displayName: true,
          provider: true,
          deploymentId: true,
          enabled: true,
          disabledAt: true,
          uninstalledAt: true,
          _count: { select: { courseMappings: true } },
          courseMappings: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              contextId: true,
              enabled: true,
              class: { select: { id: true, title: true, code: true } },
            },
          },
        },
      },
      schools: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          classes: {
            where: { isArchived: false },
            orderBy: [{ title: 'asc' }, { code: 'asc' }],
            select: { id: true, title: true, code: true },
          },
        },
      },
      ltiAuditEvents: {
        take: 100,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          eventType: true,
          outcome: true,
          subjectHash: true,
          contextId: true,
          registrationId: true,
        },
      },
    },
  });
  if (!organization) throw new Response('Not Found', { status: 404 });
  return data({ organization });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (!params.id) throw new Response('Not Found', { status: 404 });
  const organizationId = params.id;
  const formData = await request.formData();
  const intent = requiredString(formData, 'intent', 80);

  try {
    if (intent === 'set-organization-gate') {
      await setOrganizationLtiGate({
        organizationId,
        enabled: requiredString(formData, 'enabled', 5) === 'true',
        actorUserId: admin.id,
      });
    } else if (intent === 'create-registration') {
      const source = requiredString(formData, 'registrationJson', 32 * 1024);
      const decoded: unknown = JSON.parse(source);
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
        throw new LtiPilotError(
          'invalid_request',
          'Registration JSON must be an object.'
        );
      }
      const candidate = decoded as Record<string, unknown>;
      const registration = parseLtiRegistration({
        ...candidate,
        id:
          typeof candidate.id === 'string' && candidate.id
            ? candidate.id
            : `lti-${randomUUID()}`,
        organizationId,
        transportMode: 'https',
        enabled: false,
      });
      await createLtiRegistration({ registration, actorUserId: admin.id });
    } else if (intent === 'enable-registration') {
      await enableLtiRegistration({
        registrationId: requiredString(formData, 'registrationId'),
        organizationId,
        actorUserId: admin.id,
      });
    } else if (
      intent === 'disable-registration' ||
      intent === 'uninstall-registration'
    ) {
      await disableLtiRegistration({
        registrationId: requiredString(formData, 'registrationId'),
        organizationId,
        actorUserId: admin.id,
        uninstall: intent === 'uninstall-registration',
      });
    } else if (intent === 'save-course-mapping') {
      await upsertLtiCourseMapping({
        registrationId: requiredString(formData, 'registrationId'),
        organizationId,
        contextId: requiredString(formData, 'contextId'),
        classId: requiredString(formData, 'classId'),
        actorUserId: admin.id,
      });
    } else if (
      intent === 'enable-course-mapping' ||
      intent === 'disable-course-mapping'
    ) {
      await setLtiCourseMappingEnabled({
        mappingId: requiredString(formData, 'mappingId'),
        organizationId,
        enabled: intent === 'enable-course-mapping',
        actorUserId: admin.id,
      });
    } else {
      throw new LtiPilotError('invalid_request', 'Unknown LTI action.');
    }
    return data({ ok: true as const });
  } catch (error) {
    return actionError(error);
  }
}

function GateControl({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">Enable LTI for this organization</p>
        <p className="text-sm text-muted-foreground">
          Turns on the LTI launch entry point for every registration below.
          Individual registrations still need their own toggle.
        </p>
        {fetcher.data && !fetcher.data.ok ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {fetcher.data.error}
          </p>
        ) : null}
      </div>
      <Switch
        aria-label="Enable LTI for this organization"
        checked={enabled}
        disabled={busy}
        onCheckedChange={(checked) =>
          fetcher.submit(
            {
              intent: 'set-organization-gate',
              enabled: String(checked),
              organizationId,
            },
            { method: 'post' }
          )
        }
      />
    </div>
  );
}

function RegistrationActions({
  registration,
}: {
  registration: {
    id: string;
    displayName: string;
    enabled: boolean;
    uninstalledAt: string | Date | null;
  };
}) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';
  if (registration.uninstalledAt) {
    return <span className="text-xs text-muted-foreground">No actions</span>;
  }
  return (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() =>
          fetcher.submit(
            {
              intent: registration.enabled
                ? 'disable-registration'
                : 'enable-registration',
              registrationId: registration.id,
            },
            { method: 'post' }
          )
        }
      >
        {registration.enabled ? 'Disable' : 'Enable'}
      </Button>
      <ConfirmationDialog
        title="Uninstall registration"
        description="This immediately stops all launches from this registration and cannot be undone. Anyone mid-launch will see a generic error. Existing course mappings and audit history are kept for your records."
        confirmText="Uninstall registration"
        variant="destructive"
        onConfirm={() =>
          fetcher.submit(
            {
              intent: 'uninstall-registration',
              registrationId: registration.id,
            },
            { method: 'post' }
          )
        }
      >
        <Button type="button" size="sm" variant="destructive-outline">
          Uninstall
        </Button>
      </ConfirmationDialog>
    </div>
  );
}

function MappingAction({
  mapping,
}: {
  mapping: { id: string; enabled: boolean };
}) {
  const fetcher = useFetcher<typeof action>();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={fetcher.state !== 'idle'}
      onClick={() =>
        fetcher.submit(
          {
            intent: mapping.enabled
              ? 'disable-course-mapping'
              : 'enable-course-mapping',
            mappingId: mapping.id,
          },
          { method: 'post' }
        )
      }
    >
      {mapping.enabled ? 'Disable' : 'Enable'}
    </Button>
  );
}

export default function OrganizationLtiRoute() {
  const { organization } = useLoaderData<typeof loader>();
  const createFetcher = useFetcher<typeof action>();
  const mappingFetcher = useFetcher<typeof action>();
  const classes = organization.schools.flatMap((school) =>
    school.classes.map((classRecord) => ({
      ...classRecord,
      schoolName: school.name,
    }))
  );
  const mappings = organization.ltiRegistrations.flatMap((registration) =>
    registration.courseMappings.map((mapping) => ({
      ...mapping,
      registrationName: registration.displayName,
    }))
  );

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" asChild>
          <Link to={`/app/admin/organizations/${organization.id}`}>
            <ChevronLeft size={18} />
            {organization.name}
          </Link>
        </Button>
        <Badge variant={organization.ltiEnabled ? 'success' : 'secondary'}>
          {organization.ltiEnabled ? 'LTI enabled' : 'LTI disabled'}
        </Badge>
      </div>

      <Card className="bg-muted/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" aria-hidden="true" />
            Organization LTI access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GateControl
            organizationId={organization.id}
            enabled={organization.ltiEnabled}
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="registrations">
        <TabsList>
          <TabsTrigger value="registrations">Registrations</TabsTrigger>
          <TabsTrigger value="mappings">Course mappings</TabsTrigger>
          <TabsTrigger value="audit">Recent activity</TabsTrigger>
        </TabsList>

        <TabsContent value="registrations" className="space-y-3">
          <div className="flex justify-end">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="secondary">
                  <Plus className="mr-2 size-4" aria-hidden="true" />
                  Add registration
                </Button>
              </SheetTrigger>
              <SheetContent className="overflow-y-auto sm:max-w-xl">
                <SheetHeader>
                  <SheetTitle>Add LTI registration</SheetTitle>
                </SheetHeader>
                <createFetcher.Form method="post" className="mt-6 space-y-4">
                  <input
                    type="hidden"
                    name="intent"
                    value="create-registration"
                  />
                  <div className="space-y-2">
                    <Label htmlFor="registrationJson">Registration JSON</Label>
                    <Textarea
                      id="registrationJson"
                      name="registrationJson"
                      required
                      rows={20}
                      className="font-mono text-xs"
                      placeholder={
                        '{\n  "provider": "blackboard",\n  "displayName": "Campus LMS",\n  "issuer": "https://…",\n  "clientId": "…",\n  "allowedAudiences": ["…"],\n  "deploymentId": "…",\n  "authorizationEndpoint": "https://…",\n  "tokenEndpoint": "https://…",\n  "jwksUrl": "https://…",\n  "allowedServiceOrigins": ["https://…"],\n  "loginInitiationUrl": "https://app.yawp.school/lti/login",\n  "launchUrl": "https://app.yawp.school/lti/launch",\n  "deepLinkingLaunchUrl": "https://app.yawp.school/lti/deep-link",\n  "toolJwksUrl": "https://app.yawp.school/.well-known/jwks.json",\n  "allowedTargetLinkUris": ["https://app.yawp.school/lti/launch", "https://app.yawp.school/lti/deep-link"],\n  "enabledScopes": ["https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly"]\n}'
                      }
                    />
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Partner-provided values are saved disabled. Review issuer,
                    deployment, endpoints, scopes, and tenant ownership before
                    enabling.
                  </p>
                  {createFetcher.data && !createFetcher.data.ok ? (
                    <p role="alert" className="text-sm text-destructive">
                      {createFetcher.data.error}
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    isLoading={createFetcher.state !== 'idle'}
                  >
                    Save disabled registration
                  </Button>
                </createFetcher.Form>
              </SheetContent>
            </Sheet>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Registration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Deployment</TableHead>
                <TableHead>Course mappings</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organization.ltiRegistrations.length ? (
                organization.ltiRegistrations.map((registration) => {
                  const status = registration.uninstalledAt
                    ? 'Uninstalled'
                    : registration.enabled
                      ? 'Active'
                      : 'Disabled';
                  return (
                    <TableRow key={registration.id}>
                      <TableCell>
                        <div className="font-medium">
                          {registration.displayName}
                        </div>
                        <div className="text-xs capitalize text-muted-foreground">
                          {registration.provider.replaceAll('-', ' ')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            status === 'Active'
                              ? 'success'
                              : status === 'Uninstalled'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <TooltipIdCopy id={registration.deploymentId}>
                          {registration.deploymentId.slice(0, 18)}
                          {registration.deploymentId.length > 18 ? '…' : ''}
                        </TooltipIdCopy>
                      </TableCell>
                      <TableCell>
                        {registration._count.courseMappings} mapped
                      </TableCell>
                      <TableCell>
                        <RegistrationActions registration={registration} />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No LTI registrations yet for this organization.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="mappings" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Map an LTI course</CardTitle>
            </CardHeader>
            <CardContent>
              <mappingFetcher.Form
                method="post"
                className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
              >
                <input
                  type="hidden"
                  name="intent"
                  value="save-course-mapping"
                />
                <div className="space-y-2">
                  <Label htmlFor="registrationId">Registration</Label>
                  <select
                    id="registrationId"
                    name="registrationId"
                    required
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Select registration</option>
                    {organization.ltiRegistrations
                      .filter((registration) => !registration.uninstalledAt)
                      .map((registration) => (
                        <option key={registration.id} value={registration.id}>
                          {registration.displayName}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contextId">LMS context identifier</Label>
                  <Input
                    id="contextId"
                    name="contextId"
                    required
                    maxLength={255}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="classId">Yawp class</Label>
                  <select
                    id="classId"
                    name="classId"
                    required
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Select class</option>
                    {classes.map((classRecord) => (
                      <option key={classRecord.id} value={classRecord.id}>
                        {classRecord.schoolName} —{' '}
                        {classRecord.title ?? classRecord.code}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  isLoading={mappingFetcher.state !== 'idle'}
                >
                  Save mapping
                </Button>
              </mappingFetcher.Form>
              {mappingFetcher.data && !mappingFetcher.data.ok ? (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {mappingFetcher.data.error}
                </p>
              ) : null}
            </CardContent>
          </Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>LMS context</TableHead>
                <TableHead>Yawp class</TableHead>
                <TableHead>Registration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.length ? (
                mappings.map((mapping) => (
                  <TableRow key={mapping.id}>
                    <TableCell className="font-mono text-xs">
                      <TooltipIdCopy id={mapping.contextId}>
                        {mapping.contextId.slice(0, 24)}
                        {mapping.contextId.length > 24 ? '…' : ''}
                      </TooltipIdCopy>
                    </TableCell>
                    <TableCell>
                      {mapping.class.title ?? mapping.class.code}
                    </TableCell>
                    <TableCell>{mapping.registrationName}</TableCell>
                    <TableCell>
                      <Badge
                        variant={mapping.enabled ? 'success' : 'secondary'}
                      >
                        {mapping.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <MappingAction mapping={mapping} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No LTI course mappings yet for this organization.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="audit">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Context</TableHead>
                <TableHead>Subject (hashed)</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organization.ltiAuditEvents.length ? (
                organization.ltiAuditEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium">
                      {event.eventType.replaceAll('_', ' ')}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          ['accepted', 'linked', 'link_required'].includes(
                            event.outcome
                          )
                            ? 'success'
                            : event.outcome.includes('disabled')
                              ? 'secondary'
                              : 'destructive'
                        }
                      >
                        {event.outcome.replaceAll('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {event.contextId
                        ? `${event.contextId.slice(0, 16)}${event.contextId.length > 16 ? '…' : ''}`
                        : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {event.subjectHash
                        ? `${event.subjectHash.slice(0, 12)}…`
                        : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <time dateTime={new Date(event.createdAt).toISOString()}>
                        {new Date(event.createdAt)
                          .toISOString()
                          .replace('T', ' ')
                          .slice(0, 16)}{' '}
                        UTC
                      </time>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No LTI activity recorded yet for this organization.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            Showing the most recent 100 events.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
