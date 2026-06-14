import {
  AlertTriangle,
  ChevronUp,
  FlaskConical,
  GraduationCap,
  Loader2,
  Shield,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { useFetcher, useSearchParams } from 'react-router';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Tooltip } from '~/components/ui/tooltip';
import { cn } from '~/utils/misc';

export type LocalDevLoginOption = {
  email: string;
  label: string;
  description: string;
  role: string;
};

type LocalDevEnvironmentBarProps = {
  bannerWarning: 'staging' | 'localhost' | null;
  localDevQuickLogin?: {
    enabled: boolean;
    options: LocalDevLoginOption[];
  };
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
    return { badge: 'Student', icon: GraduationCap, tone: 'secondary' as const };
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
  bannerWarning: 'staging' | 'localhost';
}) {
  const isStaging = bannerWarning === 'staging';

  return (
    <Tooltip
      text={
        isStaging
          ? 'This is a staging environment. Do not use real data.'
          : 'This is a local environment. Do not use real data.'
      }
      delayDuration={0}
    >
      <div
        className={cn(
          'rounded-full p-2.5',
          isStaging ? 'bg-yellow-400' : 'bg-red-300'
        )}
        aria-hidden="true"
      >
        {isStaging ? <AlertTriangle size={20} /> : <FlaskConical size={20} />}
      </div>
    </Tooltip>
  );
}

function LoginOptionRow({
  Form,
  option,
  redirectTo,
  isSubmitting,
  submittingEmail,
}: {
  Form: ReturnType<typeof useFetcher>['Form'];
  option: LocalDevLoginOption;
  redirectTo: string;
  isSubmitting: boolean;
  submittingEmail: string | null;
}) {
  const meta = roleMeta(option.role);
  const Icon = meta.icon;
  const isActive = isSubmitting && submittingEmail === option.email;

  return (
    <Form method="post" action="/auth/dev-login" className="block">
      <input type="hidden" name="email" value={option.email} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button
        type="submit"
        disabled={isSubmitting}
        title={option.description}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-60"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
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
  redirectTo,
  isSubmitting,
  submittingEmail,
}: {
  Form: ReturnType<typeof useFetcher>['Form'];
  label: string;
  options: LocalDevLoginOption[];
  redirectTo: string;
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
            redirectTo={redirectTo}
            isSubmitting={isSubmitting}
            submittingEmail={submittingEmail}
          />
        ))}
      </div>
    </div>
  );
}

function LocalDevQuickLoginPanel({
  options,
}: {
  options: LocalDevLoginOption[];
}) {
  const fetcher = useFetcher();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') ?? '/app';
  const isSubmitting = fetcher.state !== 'idle';
  const submittingEmail = isSubmitting
    ? String(fetcher.formData?.get('email') ?? '')
    : null;
  const { staff, students } = groupOptions(options);

  return (
    <div
      id="local-dev-quick-login-panel"
      className="max-h-72 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto border-b border-border/60 p-1.5"
    >
      <LoginOptionGroup
        Form={fetcher.Form}
        label="Staff"
        options={staff}
        redirectTo={redirectTo}
        isSubmitting={isSubmitting}
        submittingEmail={submittingEmail}
      />
      {staff.length > 0 && students.length > 0 ? (
        <div className="my-1.5 h-px bg-border/60" aria-hidden="true" />
      ) : null}
      <LoginOptionGroup
        Form={fetcher.Form}
        label="Students"
        options={students}
        redirectTo={redirectTo}
        isSubmitting={isSubmitting}
        submittingEmail={submittingEmail}
      />
    </div>
  );
}

export function LocalDevEnvironmentBar({
  bannerWarning,
  localDevQuickLogin,
}: LocalDevEnvironmentBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (!bannerWarning) {
    return null;
  }

  const showQuickLogin = localDevQuickLogin?.enabled ?? false;
  const options = localDevQuickLogin?.options ?? [];

  if (!showQuickLogin) {
    return (
      <div className="fixed bottom-4 right-4 z-30">
        <EnvironmentIcon bannerWarning={bannerWarning} />
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-30">
      <div className="overflow-hidden rounded-2xl border bg-popover/95 shadow-lg ring-1 ring-black/5 backdrop-blur">
        {expanded ? <LocalDevQuickLoginPanel options={options} /> : null}
        <div className="flex items-center pl-1 pr-1">
          <EnvironmentIcon bannerWarning={bannerWarning} />
          <div className="mx-1 h-6 w-px bg-border/60" aria-hidden="true" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-lg px-3 py-2 text-sm"
            aria-expanded={expanded}
            aria-controls="local-dev-quick-login-panel"
            onClick={() => setExpanded((open) => !open)}
          >
            Dev login
            <ChevronUp
              className={cn(
                'ml-1 size-4 transition-transform',
                expanded ? 'rotate-180' : ''
              )}
            />
          </Button>
        </div>
      </div>
    </div>
  );
}
