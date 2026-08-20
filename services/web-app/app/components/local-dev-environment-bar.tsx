import {
  AlertTriangle,
  FlaskConical,
  GraduationCap,
  KeyRound,
  Loader2,
  Shield,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Form, useFetcher } from 'react-router';
import { Badge } from '~/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { Tooltip } from '~/components/ui/tooltip';
import { cn } from '~/utils/misc';

export type LocalDevLoginOption = {
  email: string;
  label: string;
  description: string;
  role: string;
};

type LocalDevEnvironmentBarProps = {
  bannerWarning: 'staging' | 'localhost' | 'preview' | null;
  localDevQuickLogin?: {
    enabled: boolean;
  };
  previewAccessGateEnabled?: boolean;
  previewAccessSeatLabel?: string | null;
};

const STAFF_ROLES = new Set(['admin', 'owner', 'teacher', 'teacher-multi']);

function roleMeta(role: string) {
  if (role === 'admin') {
    return { badge: 'Admin', icon: Shield, tone: 'info-soft' as const };
  }
  if (role === 'owner') {
    return { badge: 'Owner', icon: Shield, tone: 'secondary' as const };
  }
  if (role.startsWith('student')) {
    return {
      badge: 'Student',
      icon: GraduationCap,
      tone: 'secondary' as const,
    };
  }
  return { badge: 'Teacher', icon: UserRound, tone: 'secondary' as const };
}

function groupOptions(options: LocalDevLoginOption[]) {
  const staff = options.filter((option) => STAFF_ROLES.has(option.role));
  const students = options.filter((option) => !STAFF_ROLES.has(option.role));
  return { staff, students };
}

function EnvironmentIcon({
  bannerWarning,
}: {
  bannerWarning: 'staging' | 'localhost' | 'preview';
}) {
  const isStaging = bannerWarning === 'staging';
  const isPreview = bannerWarning === 'preview';

  return (
    <div
      className={cn(
        'rounded-full p-2.5',
        isStaging ? 'bg-yellow-400' : isPreview ? 'bg-sky-300' : 'bg-red-300'
      )}
      aria-hidden="true"
    >
      {isStaging ? <AlertTriangle size={20} /> : <FlaskConical size={20} />}
    </div>
  );
}

function LoginOptionRow({
  Form,
  option,
  isSubmitting,
  submittingEmail,
}: {
  Form: ReturnType<typeof useFetcher>['Form'];
  option: LocalDevLoginOption;
  isSubmitting: boolean;
  submittingEmail: string | null;
}) {
  const meta = roleMeta(option.role);
  const Icon = meta.icon;
  const isActive = isSubmitting && submittingEmail === option.email;

  return (
    <Form method="post" action="/auth/dev-login" className="block">
      <input type="hidden" name="email" value={option.email} />
      <button
        type="submit"
        disabled={isSubmitting}
        title={option.description}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-60"
      >
        <Icon
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{option.label}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {option.description}
          </span>
        </span>
        {isActive ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Badge variant={meta.tone} size="sm" className="shrink-0">
            {meta.badge}
          </Badge>
        )}
      </button>
    </Form>
  );
}

function LoginOptionGroup({
  Form,
  label,
  options,
  isSubmitting,
  submittingEmail,
}: {
  Form: ReturnType<typeof useFetcher>['Form'];
  label: string;
  options: LocalDevLoginOption[];
  isSubmitting: boolean;
  submittingEmail: string | null;
}) {
  if (options.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-col gap-0.5">
        {options.map((option) => (
          <LoginOptionRow
            key={option.email}
            Form={Form}
            option={option}
            isSubmitting={isSubmitting}
            submittingEmail={submittingEmail}
          />
        ))}
      </div>
    </div>
  );
}

function LocalDevQuickLoginPanel({
  isOpen,
  previewAccessGateEnabled,
  previewAccessSeatLabel,
}: {
  isOpen: boolean;
  previewAccessGateEnabled: boolean;
  previewAccessSeatLabel: string | null;
}) {
  const loginFetcher = useFetcher();
  const [options, setOptions] = useState<LocalDevLoginOption[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasLoadedFirstPage, setHasLoadedFirstPage] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState(false);
  const firstPageRequested = useRef(false);
  const loadInFlight = useRef(false);
  const isMounted = useRef(true);
  const isSubmitting = loginFetcher.state !== 'idle';
  const submittingEmail = isSubmitting
    ? String(loginFetcher.formData?.get('email') ?? '')
    : null;
  const { staff, students } = groupOptions(options);

  const loadPage = useCallback(async (cursor: number) => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    setIsLoadingOptions(true);
    setOptionsError(false);

    try {
      const response = await fetch(`/auth/dev-login/options?cursor=${cursor}`);
      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok || response.redirected || !contentType.includes('json')) {
        throw new Error('Unable to load preview users.');
      }
      const page = (await response.json()) as {
        options: LocalDevLoginOption[];
        nextCursor: number | null;
      };
      if (!isMounted.current) return;
      setOptions((current) => {
        const knownEmails = new Set(current.map((option) => option.email));
        return [
          ...current,
          ...page.options.filter((option) => !knownEmails.has(option.email)),
        ];
      });
      setNextCursor(page.nextCursor);
      setHasLoadedFirstPage(true);
    } catch {
      if (isMounted.current) setOptionsError(true);
    } finally {
      loadInFlight.current = false;
      if (isMounted.current) setIsLoadingOptions(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    if (isOpen && !firstPageRequested.current) {
      firstPageRequested.current = true;
      void loadPage(0);
    }
    return () => {
      isMounted.current = false;
    };
  }, [isOpen, loadPage]);

  const loadMore = useCallback(() => {
    if (nextCursor === null || loadInFlight.current) return;
    void loadPage(nextCursor);
  }, [loadPage, nextCursor]);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const panel = event.currentTarget;
      const remaining =
        panel.scrollHeight - panel.scrollTop - panel.clientHeight;
      if (remaining <= 48) loadMore();
    },
    [loadMore]
  );

  return (
    <div
      id="local-dev-quick-login-panel"
      className="max-h-72 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto p-1.5"
      onScroll={handleScroll}
    >
      <LoginOptionGroup
        Form={loginFetcher.Form}
        label="Staff"
        options={staff}
        isSubmitting={isSubmitting}
        submittingEmail={submittingEmail}
      />
      {staff.length > 0 && students.length > 0 ? (
        <div className="my-1.5 h-px bg-border/60" aria-hidden="true" />
      ) : null}
      <LoginOptionGroup
        Form={loginFetcher.Form}
        label="Students"
        options={students}
        isSubmitting={isSubmitting}
        submittingEmail={submittingEmail}
      />
      {isLoadingOptions ? (
        <div
          className="flex items-center justify-center gap-2 px-2 py-3 text-xs text-muted-foreground"
          role="status"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Loading preview users…
        </div>
      ) : null}
      {hasLoadedFirstPage && !isLoadingOptions && options.length === 0 ? (
        <p className="px-2 py-3 text-center text-xs text-muted-foreground">
          No preview users found.
        </p>
      ) : null}
      {optionsError ? (
        <p className="px-2 py-3 text-center text-xs text-destructive" role="alert">
          Unable to load preview users.
        </p>
      ) : null}
      {previewAccessGateEnabled ? (
        <>
          {options.length > 0 ? (
            <div className="my-1.5 h-px bg-border/60" aria-hidden="true" />
          ) : null}
          {previewAccessSeatLabel ? (
            <PreviewSeatIdentity label={previewAccessSeatLabel} />
          ) : null}
          <Form method="post" action="/auth/preview-access">
            <input type="hidden" name="intent" value="sign-out" />
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:outline-none"
            >
              <KeyRound className="size-4" aria-hidden="true" />
              Re-enter access code
            </button>
          </Form>
        </>
      ) : null}
    </div>
  );
}

export function PreviewSeatIdentity({ label }: { label: string }) {
  return (
    <p className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">
      Current seat:{' '}
      <span className="font-semibold text-foreground">{label}</span>
    </p>
  );
}

export function LocalDevEnvironmentBar({
  bannerWarning,
  localDevQuickLogin,
  previewAccessGateEnabled = false,
  previewAccessSeatLabel = null,
}: LocalDevEnvironmentBarProps) {
  const [isQuickLoginOpen, setIsQuickLoginOpen] = useState(false);

  if (!bannerWarning) {
    return null;
  }

  const showQuickLogin = localDevQuickLogin?.enabled ?? false;
  const environmentLabel =
    bannerWarning === 'staging'
      ? 'Staging environment'
      : bannerWarning === 'preview'
        ? 'Preview environment'
        : 'Local development environment';

  if (!showQuickLogin && !previewAccessGateEnabled) {
    return (
      <div className="fixed bottom-4 right-4 z-30">
        <Tooltip
          text={
            bannerWarning === 'staging'
              ? 'This is a staging environment. Do not use real data.'
              : bannerWarning === 'preview'
                ? 'This is a preview environment. Use seeded data only.'
                : 'This is a local environment. Do not use real data.'
          }
          delayDuration={0}
        >
          <EnvironmentIcon bannerWarning={bannerWarning} />
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-30">
      <Popover open={isQuickLoginOpen} onOpenChange={setIsQuickLoginOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="rounded-full shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${environmentLabel}. Open dev login menu.`}
            aria-controls="local-dev-quick-login-panel"
          >
            <EnvironmentIcon bannerWarning={bannerWarning} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={12}
          className="w-80 p-0"
        >
          <LocalDevQuickLoginPanel
            isOpen={isQuickLoginOpen}
            previewAccessGateEnabled={previewAccessGateEnabled}
            previewAccessSeatLabel={previewAccessSeatLabel}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
