import { Form, Link, useFetcher, useLoaderData, useNavigation, useSearchParams } from 'react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { cn } from '~/utils/misc';
import type { Route } from './+types/route';
import {
  formatAdminTimestamp,
  formatFlagModeLabel,
} from '~/domain/admin-config/admin-access-flags.presentation';
import { TEACHER_LOUNGE_ACCESS_LIST_KEY } from '~/domain/access-lists/access-lists';
import type { FeatureFlagKey } from '~/domain/feature-flags/feature-flags';

type LoaderData = Route.ComponentProps['loaderData'];
type AdminFlagRow = LoaderData['flags'][number];
type AuditEntryRow = LoaderData['auditEntries'][number];

function ModeBadge({ mode, orgCount }: { mode: string; orgCount: number }) {
  const label =
    mode === 'off'
      ? 'Off'
      : mode === 'everyone'
        ? 'Everyone'
        : orgCount === 1
          ? '1 school'
          : `${orgCount} schools`;
  return (
    <span
      className={cn(
        'inline-flex h-[18px] items-center rounded-sm px-1.5 text-[11px] font-semibold leading-[18px]',
        mode === 'everyone' && 'bg-emerald-100 text-emerald-900',
        mode === 'targeted' && 'bg-blue-100 text-blue-800',
        mode === 'off' && 'bg-stone-200 text-stone-600'
      )}
    >
      {label}
    </span>
  );
}

function ActionBadge({ label }: { label: string }) {
  const cls =
    label === 'Access added'
      ? 'bg-emerald-100 text-emerald-900'
      : label === 'Access removed'
        ? 'bg-red-100 text-red-800'
        : label === 'Schools updated'
          ? 'bg-blue-100 text-blue-800'
          : 'bg-stone-200 text-stone-700';
  return (
    <span className={cn('inline-flex h-[18px] items-center rounded-sm px-1.5 text-[11px] font-semibold', cls)}>
      {label}
    </span>
  );
}

function Panel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <section
      id={id}
      className="overflow-hidden rounded border border-border bg-card text-[13px] leading-[18px] text-foreground"
    >
      {children}
    </section>
  );
}

function PanelHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[38px] items-center gap-2.5 border-b border-border px-3.5">{children}</div>
  );
}

export default function AdminAccessFlagsPage() {
  const data = useLoaderData<LoaderData>();
  const navigation = useNavigation();
  const fetcher = useFetcher<typeof import('./route.server').action>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editingFlag, setEditingFlag] = useState<AdminFlagRow | null>(null);
  const [historyScope, setHistoryScope] = useState<
    { type: 'flag'; key: FeatureFlagKey } | { type: 'access' } | null
  >(null);
  const [pendingRemoveEmail, setPendingRemoveEmail] = useState<string | null>(null);
  const [confirmEveryoneOpen, setConfirmEveryoneOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'off' | 'everyone' | 'targeted'>('off');
  const [editorOrgIds, setEditorOrgIds] = useState<string[]>([]);
  const [editorReason, setEditorReason] = useState('');
  const [orgQuery, setOrgQuery] = useState('');
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, boolean>>({});

  const isSubmitting = navigation.state !== 'idle' || fetcher.state !== 'idle';
  const actionResult = fetcher.data as
    | { ok?: boolean; error?: string; key?: string; unknownOrgIds?: string[] }
    | undefined;

  const openEditor = useCallback((flag: AdminFlagRow) => {
    setEditingFlag(flag);
    setEditorMode(flag.persisted.mode);
    setEditorOrgIds([...flag.persisted.orgIds]);
    setEditorReason('');
    setOrgQuery('');
  }, []);

  const filteredHistory = useMemo(() => {
    if (!historyScope) return [] as AuditEntryRow[];
    return data.auditEntries.filter((row) => {
      if (historyScope.type === 'access') {
        return row.entityType === 'access_list';
      }
      return row.entityType === 'feature_flag' && row.entityKey === historyScope.key;
    });
  }, [data.auditEntries, historyScope]);

  const flagErrors = useMemo(() => {
    const errors: Record<string, { tag: string; text: string }> = {};
    for (const [key, unknownIds] of Object.entries(data.unknownByFlag)) {
      if (unknownIds.length > 0) {
        const flag = data.flags.find((f) => f.key === key);
        const total = flag?.persisted.orgIds.length ?? 0;
        errors[key] = {
          tag: `${unknownIds.length} unknown org${unknownIds.length === 1 ? '' : 's'}`,
          text: `${unknownIds.join(', ')} doesn't match any organization, so ${
            unknownIds.length === 1 ? "it's" : "they're"
          } skipped at runtime. The other ${Math.max(0, total - unknownIds.length)} school${
            total - unknownIds.length === 1 ? '' : 's'
          } still get the flag.`,
        };
      }
    }
    if (actionResult?.error === 'forbidden' && actionResult.key) {
      errors[actionResult.key] = {
        tag: 'Not saved · 403',
        text: 'Your change was refused. Still at the stored value.',
      };
    }
    return errors;
  }, [actionResult, data.flags, data.unknownByFlag]);

  function submitFlagSave(confirmEveryone = false) {
    if (!editingFlag) return;
    const form = new FormData();
    form.set('intent', 'set-feature-flag');
    form.set('key', editingFlag.key);
    form.set('mode', editorMode);
    form.set('orgIds', editorOrgIds.join(','));
    if (editorReason.trim()) form.set('reason', editorReason.trim());
    if (confirmEveryone) form.set('confirmEveryone', 'true');
    fetcher.submit(form, { method: 'post' });
  }

  useEffect(() => {
    const result = fetcher.data;
    if (!result) return;
    if ('ok' in result && result.ok && 'intent' in result && result.intent === 'set-feature-flag') {
      setEditingFlag(null);
      setConfirmEveryoneOpen(false);
    }
    if ('error' in result && result.error === 'confirm_everyone') {
      setConfirmEveryoneOpen(true);
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (!editingFlag || !orgQuery.trim()) return;
    const timeout = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      next.set('orgSearch', orgQuery.trim());
      setSearchParams(next, { preventScrollReset: true });
    }, 300);
    return () => clearTimeout(timeout);
  }, [editingFlag, orgQuery, searchParams, setSearchParams]);

  return (
    <div className="flex flex-col gap-5 p-3 md:p-5" data-testid="admin-access-flags">
      {!data.viewer.isSuperAdmin ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded border border-stone-300 bg-stone-200/80 px-3.5 py-3 text-[13px] text-stone-700"
        >
          <span className="rounded-sm bg-stone-700 px-1.5 py-0.5 text-[11px] font-semibold text-stone-50">
            Read-only
          </span>
          <div className="flex-1">
            <b className="text-stone-900">
              You can view flags and Lounge access, but only super admins can change them.
            </b>{' '}
            History and the audit log are open to you. Ask a super admin if something needs to change.
          </div>
          <span className="text-xs text-muted-foreground" title={data.superAdmins.join(', ')}>
            Super admins: {data.superAdmins.slice(0, 3).join(', ')}
            {data.superAdmins.length > 3 ? '…' : ''}
          </span>
        </div>
      ) : null}

      {data.viewer.isImpersonating ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded border border-orange-200 bg-orange-100 px-3.5 py-3 text-[13px] text-orange-950"
        >
          <span className="mt-0.5 rounded-sm bg-orange-800 px-1.5 py-0.5 text-[11px] font-semibold text-orange-50">
            Changes off
          </span>
          <div className="flex-1">
            <div className="font-bold">Flag and access changes are turned off while you impersonate.</div>
            <div className="mt-0.5">
              Anything saved now would be logged under the impersonated user, not you. Stop impersonating to
              edit flags or the Lounge list. Viewing, history and the audit log still work.
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/auth/logout">Stop impersonating</Link>
          </Button>
        </div>
      ) : null}

      {Object.entries(flagErrors).map(([key, err]) =>
        dismissedAlerts[key] ? null : (
          <div
            key={key}
            role="alert"
            className="flex items-start gap-3 rounded border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] text-red-900"
          >
            <span className="mt-0.5 rounded-sm bg-red-700 px-1.5 py-0.5 text-[11px] font-semibold text-red-50">
              {err.tag}
            </span>
            <div className="flex-1">{err.text}</div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDismissedAlerts((prev) => ({ ...prev, [key]: true }))}
            >
              Dismiss
            </Button>
          </div>
        )
      )}

      <Panel>
        <PanelHeader>
          <h2 className="text-[13px] font-bold text-slate-900">Feature flags</h2>
          <span className="text-xs text-muted-foreground">
            {data.flags.length} flags · stored values, read on each request
          </span>
          <div className="flex-1" />
          <a href="#audit" className="text-primary text-xs hover:underline">
            Open audit log
          </a>
        </PanelHeader>
        <div className="grid grid-cols-[minmax(0,1fr)_150px_230px_170px] border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <div className="px-3.5 py-2">Flag</div>
          <div className="px-3.5 py-2">Mode</div>
          <div className="px-3.5 py-2">Last changed</div>
          <div className="px-3.5 py-2" />
        </div>
        {data.flags.map((flag) => {
          const when = formatAdminTimestamp(flag.updatedAt);
          const override = flag.runtimeOverride;
          const rowError = flagErrors[flag.key];
          return (
            <div
              key={flag.key}
              className="grid min-h-[42px] grid-cols-[minmax(0,1fr)_150px_230px_170px] border-b border-border/60 hover:bg-muted/20"
            >
              <div className="px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-stone-900">{flag.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{flag.key}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{flag.description}</p>
                {override ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="rounded-sm bg-orange-100 px-1.5 text-[11px] font-semibold text-orange-900">
                      {override.tag}
                    </span>
                    <span className="text-xs text-orange-900">{override.text}</span>
                  </div>
                ) : null}
                {rowError && !dismissedAlerts[flag.key] ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="rounded-sm bg-red-100 px-1.5 text-[11px] font-semibold text-red-800">
                      {rowError.tag}
                    </span>
                    <span className="text-xs text-red-800">{rowError.text}</span>
                  </div>
                ) : null}
              </div>
              <div className="px-3.5 py-3">
                <ModeBadge mode={flag.persisted.mode} orgCount={flag.persisted.orgIds.length} />
              </div>
              <div className="px-3.5 py-3">
                <div className="text-stone-900">{flag.lastChangedBy ?? '—'}</div>
                <div className="text-xs text-muted-foreground">{when.primary}</div>
              </div>
              <div className="whitespace-nowrap px-3.5 py-3 text-right">
                <button
                  type="button"
                  className="mr-3 text-primary text-xs hover:underline"
                  onClick={() => setHistoryScope({ type: 'flag', key: flag.key })}
                >
                  History
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!data.viewer.canEdit}
                  title={
                    !data.viewer.isSuperAdmin
                      ? 'Super admin only'
                      : data.viewer.isImpersonating
                        ? 'Stop impersonating to make changes'
                        : undefined
                  }
                  onClick={() => openEditor(flag)}
                >
                  Edit
                </Button>
              </div>
            </div>
          );
        })}
      </Panel>

      <Panel>
        <PanelHeader>
          <h2 className="text-[13px] font-bold text-slate-900">Teacher&apos;s Lounge access</h2>
          <span className="text-xs text-muted-foreground">
            People on this list can open the Lounge even when their school isn&apos;t targeted
          </span>
          <div className="flex-1" />
          <button
            type="button"
            className="text-primary text-xs hover:underline"
            onClick={() => setHistoryScope({ type: 'access' })}
          >
            History
          </button>
        </PanelHeader>
        <fetcher.Form
          method="post"
          className="flex items-end gap-2 border-b border-border px-3.5 py-3.5"
          onSubmit={(event) => {
            if (!data.viewer.canEdit) event.preventDefault();
          }}
        >
          <input type="hidden" name="intent" value="add-access-list" />
          <div className="flex w-[420px] max-w-full flex-col gap-1">
            <label htmlFor="add-email" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Add by email
            </label>
            <Input
              id="add-email"
              name="email"
              type="email"
              placeholder="name@school.org"
              disabled={!data.viewer.canEdit}
              required
            />
          </div>
          <Button type="submit" disabled={!data.viewer.canEdit || isSubmitting}>
            Add
          </Button>
          <span className="ml-2 self-center text-xs text-muted-foreground">
            Matched against existing Yawp users. An unmatched email gets access once that person signs up.
          </span>
        </fetcher.Form>
        {data.accessList.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-3.5 py-12 text-center">
            <div className="text-sm font-semibold text-stone-900">No one has Lounge access by email yet</div>
            <p className="max-w-md text-xs text-muted-foreground">
              Teachers at targeted schools already get the Lounge when the flag is on for their school. Add
              an email above to let in someone from anywhere else, like a pilot teacher at another school.
            </p>
            <button
              type="button"
              className="mt-1.5 text-primary text-xs hover:underline"
              onClick={() => setHistoryScope({ type: 'access' })}
            >
              See removed entries in history
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[300px_minmax(0,1fr)_150px_130px_200px] border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <div className="px-3.5 py-2">Email</div>
              <div className="px-3.5 py-2">Match</div>
              <div className="px-3.5 py-2">Added by</div>
              <div className="px-3.5 py-2">Added</div>
              <div className="px-3.5 py-2" />
            </div>
            {data.accessList.map((row: (typeof data.accessList)[number]) =>
              pendingRemoveEmail === row.email ? (
                <div
                  key={row.id}
                  className="grid grid-cols-[minmax(0,1fr)_200px] bg-red-50 px-3.5 py-3"
                >
                  <div>
                    <span className="font-semibold text-red-800">Remove {row.email} from the Lounge?</span>{' '}
                    <span className="text-xs text-red-800">
                      They lose access on their next page load.
                    </span>
                  </div>
                  <div className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mr-1.5"
                      onClick={() => setPendingRemoveEmail(null)}
                    >
                      Cancel
                    </Button>
                    <fetcher.Form method="post" className="inline">
                      <input type="hidden" name="intent" value="remove-access-list" />
                      <input type="hidden" name="email" value={row.email} />
                      <Button type="submit" variant="destructive" size="sm" disabled={!data.viewer.canEdit}>
                        Remove
                      </Button>
                    </fetcher.Form>
                  </div>
                </div>
              ) : (
                <div
                  key={row.id}
                  className="grid min-h-[42px] grid-cols-[300px_minmax(0,1fr)_150px_130px_200px] border-b border-border/60"
                >
                  <div className="px-3.5 py-3 font-mono text-xs text-stone-900">{row.email}</div>
                  <div className="px-3.5 py-3">
                    {row.matchedUser ? (
                      <>
                        <span className="rounded-sm bg-emerald-100 px-1.5 text-[11px] font-semibold text-emerald-900">
                          User
                        </span>
                        <span className="ml-2 text-stone-900">{row.matchedUser.name}</span>
                        {row.matchedUser.organizationName ? (
                          <span className="text-xs text-muted-foreground">
                            {' '}
                            · {row.matchedUser.organizationName}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <span className="rounded-sm bg-orange-100 px-1.5 text-[11px] font-semibold text-orange-900">
                          No user match
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          No Yawp account uses this email yet
                        </span>
                      </>
                    )}
                  </div>
                  <div className="px-3.5 py-3">{row.addedBy}</div>
                  <div className="px-3.5 py-3 text-xs text-muted-foreground">
                    {formatAdminTimestamp(row.createdAt).primary}
                  </div>
                  <div className="px-3.5 py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!data.viewer.canEdit}
                      onClick={() => setPendingRemoveEmail(row.email)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )
            )}
          </>
        )}
      </Panel>

      <Panel id="audit">
        <PanelHeader>
          <h2 className="text-[13px] font-bold text-slate-900">Audit log</h2>
          <span className="text-xs text-muted-foreground">Flag and Lounge access changes</span>
          <div className="flex-1" />
          <a
            href={`?${new URLSearchParams({ ...Object.fromEntries(searchParams), export: 'csv' }).toString()}`}
            className="text-primary text-xs hover:underline"
          >
            Export CSV
          </a>
        </PanelHeader>
        <Form method="get" className="flex flex-wrap items-end gap-3 border-b border-border px-3.5 py-3.5">
          <div className="flex w-[220px] flex-col gap-1">
            <label htmlFor="f-flag" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Flag
            </label>
            <select id="f-flag" name="flag" defaultValue={data.auditFilters.entityKey ?? ''} className="h-8 rounded border bg-muted/40 px-2 text-sm">
              <option value="">All flags</option>
              {data.flags.map((flag) => (
                <option key={flag.key} value={flag.key}>
                  {flag.label}
                </option>
              ))}
              <option value={TEACHER_LOUNGE_ACCESS_LIST_KEY}>Teacher&apos;s Lounge access</option>
            </select>
          </div>
          <div className="flex w-[200px] flex-col gap-1">
            <label htmlFor="f-actor" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Actor
            </label>
            <select id="f-actor" name="actor" defaultValue={data.auditFilters.actorEmail ?? ''} className="h-8 rounded border bg-muted/40 px-2 text-sm">
              <option value="">Anyone</option>
              {data.auditActors.map((actor: string) => (
                <option key={actor} value={actor}>
                  {actor}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date range</span>
            <div className="flex items-center gap-1.5">
              <Input type="date" name="from" defaultValue={searchParams.get('from') ?? ''} className="h-8 w-36" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" name="to" defaultValue={searchParams.get('to') ?? ''} className="h-8 w-36" />
            </div>
          </div>
          <div className="flex w-[200px] flex-col gap-1">
            <label htmlFor="f-action" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Action
            </label>
            <select id="f-action" name="action" defaultValue={data.auditFilters.actionKind ?? 'all'} className="h-8 rounded border bg-muted/40 px-2 text-sm">
              <option value="all">All actions</option>
              <option value="mode">Mode changed</option>
              <option value="schools">Schools updated</option>
              <option value="access">Access added / removed</option>
            </select>
          </div>
          <Button type="submit" variant="ghost" size="sm">
            Apply
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSearchParams({})}
          >
            Clear
          </Button>
          <span className="ml-auto self-center text-xs text-muted-foreground">
            {data.auditEntries.length} entries
          </span>
        </Form>
        <div className="grid grid-cols-[140px_130px_150px_200px_minmax(0,1fr)_260px] border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <div className="px-3.5 py-2">When</div>
          <div className="px-3.5 py-2">Actor</div>
          <div className="px-3.5 py-2">Action</div>
          <div className="px-3.5 py-2">Item</div>
          <div className="px-3.5 py-2">Change</div>
          <div className="px-3.5 py-2">Reason</div>
        </div>
        {data.auditEntries.map((row) => (
            <div
              key={row.id}
              className="grid min-h-[42px] grid-cols-[140px_130px_150px_200px_minmax(0,1fr)_260px] border-b border-border/60"
            >
              <div className="px-3.5 py-3 font-mono text-xs text-stone-900">
                {row.whenSecondary ?? row.whenPrimary}
              </div>
              <div className="px-3.5 py-3">{row.actorEmail}</div>
              <div className="px-3.5 py-3">
                <ActionBadge label={row.actionLabel} />
              </div>
              <div className="px-3.5 py-3 font-semibold text-stone-900">{row.itemLabel}</div>
              <div className="px-3.5 py-3">
                <span className="text-red-800 line-through">{row.changeFrom}</span>
                <span className="text-muted-foreground"> → </span>
                <span className="text-stone-900">{row.changeTo}</span>
              </div>
              <div className="px-3.5 py-3 text-xs text-muted-foreground">{row.reason ?? '—'}</div>
            </div>
          ))}
      </Panel>

      <Sheet open={Boolean(editingFlag)} onOpenChange={(open) => !open && setEditingFlag(null)}>
        <SheetContent side="right" className="flex w-[540px] max-w-none flex-col p-0 sm:max-w-none">
          {editingFlag ? (
            <>
              <SheetHeader className="border-b px-5 py-4 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Edit flag</p>
                <SheetTitle className="flex items-center gap-2 text-base">
                  {editingFlag.label}
                  <span className="font-mono text-xs font-normal text-muted-foreground">{editingFlag.key}</span>
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 text-[13px]">
                <p className="text-xs text-muted-foreground">
                  Stored:{' '}
                  <ModeBadge
                    mode={editingFlag.persisted.mode}
                    orgCount={editingFlag.persisted.orgIds.length}
                  />{' '}
                  · last changed {formatAdminTimestamp(editingFlag.updatedAt).primary} by{' '}
                  {editingFlag.lastChangedBy ?? '—'}
                </p>
                <fieldset className="space-y-2 border-0 p-0">
                  <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Mode
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    {(['off', 'everyone', 'targeted'] as const).map((mode) => (
                      <label
                        key={mode}
                        className={cn(
                          'flex cursor-pointer gap-2 rounded border p-2',
                          editorMode === mode && 'border-primary bg-muted/30'
                        )}
                      >
                        <input
                          type="radio"
                          name="editor-mode"
                          checked={editorMode === mode}
                          onChange={() => setEditorMode(mode)}
                        />
                        <span>
                          <span className="block font-semibold capitalize">{mode === 'targeted' ? 'Targeted' : mode === 'everyone' ? 'Everyone' : 'Off'}</span>
                          <span className="text-xs text-muted-foreground">
                            {mode === 'off'
                              ? 'Nobody gets it.'
                              : mode === 'everyone'
                                ? 'Every school, free tier too.'
                                : 'Only schools you pick.'}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {editorMode === 'targeted' ? (
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Schools
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {editorOrgIds.length} selected
                      </span>
                    </div>
                    <Input
                      value={orgQuery}
                      onChange={(event) => setOrgQuery(event.target.value)}
                      placeholder="Search by name or org ID"
                    />
                    <div className="max-h-48 overflow-y-auto rounded border">
                      {data.organizations.map((org) => {
                          const checked = editorOrgIds.includes(org.id);
                          return (
                            <label
                              key={org.id}
                              className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 last:border-0 hover:bg-muted/30"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setEditorOrgIds((ids) =>
                                    checked ? ids.filter((id) => id !== org.id) : [...ids, org.id]
                                  )
                                }
                              />
                              <span className="flex-1 font-semibold">{org.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">{org.id}</span>
                            </label>
                          );
                        })}
                    </div>
                    {data.organizations.length === 0 && orgQuery.trim() ? (
                      <p className="text-xs text-muted-foreground">No organizations match that search.</p>
                    ) : null}
                  </div>
                ) : null}
                <div className="space-y-1">
                  <label htmlFor="reason" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Reason <span className="normal-case tracking-normal font-normal">(optional, saved to the audit log)</span>
                  </label>
                  <textarea
                    id="reason"
                    className="min-h-[72px] w-full rounded border bg-muted/30 p-2 text-sm"
                    value={editorReason}
                    onChange={(event) => setEditorReason(event.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 border-t px-5 py-4">
                <span className="flex-1 text-xs text-muted-foreground">
                  Applies on the next request for each school.
                </span>
                <Button type="button" variant="outline" onClick={() => setEditingFlag(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    if (
                      editingFlag.persisted.mode === 'targeted' &&
                      editingFlag.persisted.orgIds.length > 0 &&
                      editorMode === 'everyone'
                    ) {
                      setConfirmEveryoneOpen(true);
                      return;
                    }
                    submitFlagSave(false);
                  }}
                >
                  Save · {editorMode === 'targeted' ? `${editorOrgIds.length} schools` : formatFlagModeLabel({ mode: editorMode, orgIds: editorOrgIds })}
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={confirmEveryoneOpen} onOpenChange={setConfirmEveryoneOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Turn on {editingFlag?.label ?? 'this flag'} for everyone?
            </DialogTitle>
            <DialogDescription>
              Every school on Yawp gets this on its next request, free-tier schools included. The{' '}
              {editingFlag?.persisted.orgIds.length ?? 0}-school target list is replaced. You can restore it
              from history.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded bg-muted px-2 py-2 text-sm">
            <ModeBadge mode="targeted" orgCount={editingFlag?.persisted.orgIds.length ?? 0} />
            <span>→</span>
            <ModeBadge mode="everyone" orgCount={0} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmEveryoneOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => submitFlagSave(true)}>
              Turn on for everyone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(historyScope)} onOpenChange={(open) => !open && setHistoryScope(null)}>
        <SheetContent side="right" className="flex w-[560px] max-w-none flex-col p-0 sm:max-w-none">
          <SheetHeader className="border-b px-5 py-4 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">History</p>
            <SheetTitle className="text-base">
              {historyScope?.type === 'access'
                ? "Teacher's Lounge access"
                : historyScope?.type === 'flag'
                  ? (data.flags.find((f) => f.key === historyScope.key)?.label ?? historyScope.key)
                  : 'History'}
            </SheetTitle>
          </SheetHeader>
          <ol className="flex-1 list-none overflow-y-auto p-0">
            {filteredHistory.map((row) => (
                <li key={row.id} className="border-b px-5 py-3.5">
                  <div className="mb-2 flex items-center gap-2">
                    <ActionBadge label={row.actionLabel} />
                    <span className="font-semibold">{row.actorEmail}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {row.whenSecondary ?? row.whenPrimary}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-red-800 line-through">{row.changeFrom}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span>{row.changeTo}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex-1 text-xs text-muted-foreground">{row.reason ?? 'No reason given'}</span>
                    {row.restorable && data.viewer.canEdit ? (
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="restore-audit" />
                        <input type="hidden" name="auditId" value={row.id} />
                        <Button type="submit" variant="link" className="h-auto p-0 text-xs">
                          Restore this state
                        </Button>
                      </fetcher.Form>
                    ) : null}
                  </div>
                </li>
              ))}
          </ol>
          <div className="border-t px-5 py-3 text-xs text-muted-foreground">
            Showing {filteredHistory.length} entries ·{' '}
            <a href="#audit" className="text-primary hover:underline" onClick={() => setHistoryScope(null)}>
              Open in Audit log →
            </a>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
