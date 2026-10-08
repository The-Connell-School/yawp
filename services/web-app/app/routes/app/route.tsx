import {
  Form,
  Link,
  Outlet,
  data,
  useLocation,
  useMatches,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useLoaderData,
  redirect,
  useFetcher,
  useRevalidator,
  useRouteLoaderData,
} from 'react-router';
import { Settings2, Cog } from 'lucide-react';
import { useCallback, useEffect, useState, createContext } from 'react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import {
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
  ExitIcon,
  HamburgerIcon,
  ReloadIcon,
  SlashIcon,
  XIcon,
} from '~/components/icons';
import { Button, button } from '~/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover.js';
import { Tooltip } from '~/components/ui/tooltip';
import useBreakpoint from '~/hooks/useBreakpoint';
import { useOnSwipe } from '~/hooks/useHorizontalSwipe';
import { useUser } from '~/hooks/useUser';
import {
  BreadcrumbHandleMatch,
  type BreadcrumbHandle,
} from '~/utils/breadcrumb';
import { cn } from '~/utils/misc';
import { NavStateSwitch, useNavState } from '../api.preferences.nav/route';
import { ContrastPreferenceSwitch } from '../api.preferences.contrast/route';
import { Switch } from '~/components/ui/switch';
import { Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { useForm } from '@rvf/react-router';
import { FormInput } from '~/components/rvf-forms/form-input';
import { z } from 'zod';
import { NameSchema } from '~/utils/schemas/user';
import {
  isDocumentRoutePath,
  writeLastNonDocumentRoute,
} from '~/utils/document-exit';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import {
  resolveSchoolYearScopeForMembership,
  schoolYearsForMembership,
} from '~/utils/school-year-scope.server';
import { ALL_SCHOOL_YEARS } from '~/utils/school-year';
import { SchoolYearScopeSwitcher } from './school-year-scope';
import type { Route as RootRoute } from '../../+types/root';
import { FLAT_SIDEBAR_SECTIONS, SidebarNavLinks } from './sidebar-nav';
import { prisma } from '~/utils/db.server';
import { shouldRedirectClasslessStudent } from '~/utils/classless-student-gate';
import { formatUserContactLabel } from '~/utils/user-display';

export const NavExpandedContext = createContext({
  isMobileNavOpen: false,
  setIsMobileNavOpen: (() => {}) as any,
});

export const handle: BreadcrumbHandle = { breadcrumb: 'Home' };

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const pathname = new URL(request.url).pathname;
  const { loadFreeTierGateApplication, enforceFreeTierTeacherGate } = await import(
    '~/domain/free-tier/free-tier-gate.server'
  );
  const freeTierApplication = await loadFreeTierGateApplication(userId);

  if (freeTierApplication) {
    const { retryFreeClassroomProvisioningForUser } = await import(
      '~/domain/free-tier/provision-free-classroom.server'
    );
    await retryFreeClassroomProvisioningForUser(userId);
    await enforceFreeTierTeacherGate({
      userId,
      pathname,
      organizationPlan: 'FREE_CLASSROOM',
      application: freeTierApplication,
    });
    if (pathname.startsWith('/app/free-tier')) {
      return data({
        schoolYearScope: {
          selected: ALL_SCHOOL_YEARS,
          options: [],
          isStudent: false,
        },
      });
    }
  }

  const profile = await requireMembership(request, userId);
  if (profile.role === 'TEACHER') {
    await enforceFreeTierTeacherGate({
      userId,
      pathname,
      organizationPlan: profile.organization.plan,
      application: freeTierApplication,
    });
  }

  if (profile.role === 'STUDENT' && !profile.isOrgOwner) {
    const classCount =
      (
        await prisma.orgMembership.findUnique({
          where: { id: profile.id },
          select: { _count: { select: { classesAsStudent: true } } },
        })
      )?._count.classesAsStudent ?? 0;

    if (
      shouldRedirectClasslessStudent({
        role: profile.role,
        isOrgOwner: profile.isOrgOwner,
        classCount,
        pathname: new URL(request.url).pathname,
      })
    ) {
      throw redirect('/app');
    }
  }

  const [selected, options] = await Promise.all([
    resolveSchoolYearScopeForMembership(request, profile),
    schoolYearsForMembership(profile),
  ]);

  // The selected year always has to be on the list, or the control renders
  // blank and a student who landed on a year through the shared cookie has no
  // way to read what they are looking at, let alone change it.
  const selectableOptions =
    selected === ALL_SCHOOL_YEARS || options.includes(selected)
      ? options
      : [selected, ...options].sort((a, b) => b.localeCompare(a));

  return data({
    schoolYearScope: {
      selected,
      options: selectableOptions,
      isStudent: profile.role === 'STUDENT',
    },
  });
}

const EditNameSchema = z.object({
  name: NameSchema,
});

function normalizePathname(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isAppNavLinkActive(linkTo: string, pathname: string) {
  const normalized = normalizePathname(pathname);

  if (linkTo === '/app') {
    return normalized === '/app';
  }

  return normalized === linkTo || normalized.startsWith(`${linkTo}/`);
}

export default function Route() {
  const location = useLocation();
  const user = useUser();
  const { schoolYearScope } = useLoaderData<typeof loader>();
  const rootData =
    useRouteLoaderData<RootRoute.ComponentProps['loaderData']>('root');
  const isReadOnlyImpersonation = rootData?.impersonation?.isReadOnly ?? false;
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const matches = useMatches();
  const isInAssistants = !!matches.find((m) => m.id.includes('app.assistants'));

  const navState = useNavState();
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === 'base' || breakpoint === 'sm';
  const isNavExpanded = navState === 'expanded' || isMobile;
  const navExpanded = (isMobile && isMobileNavOpen) || isNavExpanded;

  const breadcrumbs = matches
    .map((m) => {
      const result = BreadcrumbHandleMatch.safeParse(m);
      if (!result.success || !result.data.handle.breadcrumb) return null;
      if (typeof result.data.handle.breadcrumb !== 'string')
        return result.data.handle.breadcrumb;
      return (
        <Link
          key={m.id}
          to={m.pathname}
          className={button({ variant: 'ghost', size: 'sm' })}
        >
          {result.data.handle.breadcrumb}
        </Link>
      );
    })
    .filter(Boolean);

  const onSwipe = useCallback(
    (direction: 'left' | 'right') => {
      if (direction === 'right' && !isMobileNavOpen) {
        setIsMobileNavOpen(true);
      } else if (direction === 'left' && isMobileNavOpen) {
        setIsMobileNavOpen(false);
      }
    },
    [isMobileNavOpen]
  );

  const swipeEvents = useOnSwipe({ onSwipe });

  // Close the navigation bar when the route changes
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location]);

  useEffect(() => {
    if (isDocumentRoutePath(location.pathname)) return;
    writeLastNonDocumentRoute(
      `${location.pathname}${location.search}${location.hash}`
    );
  }, [location.hash, location.pathname, location.search]);

  const isClassDetailRoute = /^\/app\/my-classes\/[^/]+/.test(
    location.pathname
  );

  const isFreeTierOnboardingShell = location.pathname.startsWith('/app/free-tier');

  if (isFreeTierOnboardingShell) {
    return (
      <main className="min-h-screen bg-background">
        <Outlet key={location.pathname} />
      </main>
    );
  }

  return (
    <main
      className={cn(
        'flex h-screen min-h-screen overflow-hidden bg-background',
        {
          'overflow-hidden': isMobileNavOpen,
        }
      )}
    >
      {/* Left navigation panel */}
      <nav
        className={cn(
          'z-20 flex h-full w-[212px] min-w-[212px] -translate-x-full transform flex-col border-r bg-background transition-all duration-300 ease-in-out sm:translate-x-0',
          {
            'translate-x-0': isMobileNavOpen,
            'w-[56px] min-w-0 items-center': !navExpanded,
          }
        )}
      >
        <div
          className={cn('mx-2 mt-1 flex justify-between py-2', {
            'p-3': navExpanded,
          })}
        >
          <Link to=".">
            <img
              src="/img/logo_for_light_mode.png"
              alt="Logo"
              className={cn('h-auto w-0 rounded object-cover py-2', {
                'w-24': navExpanded,
              })}
            />
          </Link>
          <NavStateSwitch>
            {({ state, fetcher }) => (
              <Button
                size="icon-sm"
                variant="ghost"
                className="hidden sm:inline-flex"
                aria-label={
                  state === 'expanded'
                    ? 'Collapse app navigation'
                    : 'Expand app navigation'
                }
                disabled={['submitting', 'loading'].includes(fetcher.state)}
              >
                {state === 'expanded' ? (
                  <DoubleArrowLeftIcon />
                ) : (
                  <DoubleArrowRightIcon />
                )}
              </Button>
            )}
          </NavStateSwitch>
          <Button
            variant="outline"
            size="icon-sm"
            className="sm:hidden"
            aria-label="Close app navigation"
            onClick={() => setIsMobileNavOpen(false)}
          >
            <XIcon />
          </Button>
        </div>
        <div className="p-3">
          <SidebarNavLinks
            sections={FLAT_SIDEBAR_SECTIONS}
            user={user}
            navExpanded={navExpanded}
            pathname={location.pathname}
            isAppNavLinkActive={isAppNavLinkActive}
            forceFullNavigation={isClassDetailRoute}
          />
        </div>
        <div className="flex flex-grow flex-col justify-end">
          <Popover>
            <PopoverTrigger>
              <div className="flex items-center gap-2 border-t p-4 pb-6 transition hover:bg-foreground/5 sm:pb-3">
                <Settings2 size={18} />
                {navExpanded ? <p className="">Settings</p> : null}
              </div>
            </PopoverTrigger>
            <PopoverContent className="m-1 p-0">
              <div className="flex justify-between p-3 border-b">
                <div className="flex flex-col">
                  <p className="text-sm font-bold">{user.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatUserContactLabel(user)}
                  </p>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="opacity-40 hover:opacity-100"
                  aria-label="User settings"
                  disabled={isReadOnlyImpersonation}
                  title={
                    isReadOnlyImpersonation
                      ? 'Read-only impersonation active'
                      : 'User settings'
                  }
                  onClick={() => setIsSettingsOpen(true)}
                >
                  <Cog size={18} />
                </Button>
              </div>
              {/* Organization / Membership selector */}
              {user.memberships?.length ? (
                <div className="max-h-64 overflow-auto p-1 border-b space-y-1">
                  {user.memberships.map((m) => {
                    const isSelected = user.selectedMembership
                      ? user.selectedMembership?.id === m.id
                      : user.memberships?.[0]?.id === m.id;
                    return (
                      <Form
                        method="POST"
                        action="/api/membership-id"
                        key={m.id}
                      >
                        <input
                          type="hidden"
                          name="intent"
                          value="switch-membership"
                        />
                        <input type="hidden" name="membershipId" value={m.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant={isSelected ? 'secondary' : 'ghost'}
                          className="w-full justify-between rounded-lg px-3 py-2 disabled:opacity-100 disabled:bg-foreground/10 disabled:font-bold"
                          disabled={isSelected}
                        >
                          <span className="flex min-w-0 flex-col text-left">
                            <span className="truncate">
                              {m.organization?.name ?? 'Organization'}
                            </span>
                          </span>
                          {isSelected ? <Check size={16} /> : null}
                        </Button>
                      </Form>
                    );
                  })}
                </div>
              ) : null}
              {schoolYearScope ? (
                <div className="space-y-1.5 border-b p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    School year
                  </p>
                  <SchoolYearScopeSwitcher scope={schoolYearScope} />
                  <p className="text-xs text-muted-foreground">
                    {schoolYearScope.isStudent
                      ? 'Shows the classes and work from this year. Switch back any time — nothing is ever removed.'
                      : 'Scopes your classes and grading queue. Students always keep their earlier work.'}
                  </p>
                </div>
              ) : null}
              <Form action="/auth/logout" method="POST" className="p-1">
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  className="text-destructive rounded-lg w-full justify-start gap-2 transition hover:text-destructive hover:bg-destructive/10"
                >
                  <ExitIcon />
                  Logout
                </Button>
              </Form>
            </PopoverContent>
          </Popover>
        </div>
      </nav>
      <div
        className={cn(
          'flex min-w-full flex-1 flex-col transition-all duration-300 ease-in-out sm:min-w-0 sm:translate-x-0',
          {
            'translate-x-0': isMobileNavOpen,
            '-translate-x-[212px]': isNavExpanded,
            'opacity-50': !isInAssistants && isMobileNavOpen,
          }
        )}
        onClick={
          isMobileNavOpen && !isInAssistants
            ? () => setIsMobileNavOpen(false)
            : undefined
        }
        {...swipeEvents}
      >
        {isReadOnlyImpersonation ? (
          <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900">
            Read-only impersonation active. You can navigate the app, but
            creates, edits, and deletes are disabled.
          </div>
        ) : null}
        {/* Mobile top menu */}
        <div
          className={cn(
            'flex items-center justify-between border-b bg-background p-2 sm:hidden',
            { 'opacity-50': !isInAssistants && isMobileNavOpen }
          )}
        >
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsMobileNavOpen(true)}
          >
            <HamburgerIcon />
          </Button>
          <div className="flex items-center">
            {breadcrumbs.map((bc, i) => (
              <slot key={bc.key}>
                {i === 0 ? (
                  bc
                ) : (
                  <>
                    <SlashIcon />
                    {bc}
                  </>
                )}
              </slot>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => window.location.reload()}
          >
            <ReloadIcon />
          </Button>
        </div>
        {/*
          min-h-0 lets the Outlet shrink to the space actually left after the
          banners and mobile menu above, instead of the browser giving it
          height:100% of this whole column (which double-counts that chrome
          and pushes fixed-height app shells like the Reporter off-screen).
        */}
        <NavExpandedContext.Provider
          value={{ isMobileNavOpen, setIsMobileNavOpen }}
        >
          <div className="min-h-0 flex-1">
            <Outlet key={location.pathname} />
          </div>
        </NavExpandedContext.Provider>
      </div>
      <UserSettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        currentName={user.name || ''}
        readOnly={isReadOnlyImpersonation}
      />
    </main>
  );
}

function UserSettingsDialog({
  open,
  onOpenChange,
  currentName,
  readOnly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  readOnly: boolean;
}) {
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const [wasSubmitting, setWasSubmitting] = useState(false);
  const isLoading = fetcher.state !== 'idle';

  const form = useForm({
    fetcher,
    schema: EditNameSchema,
    method: 'POST',
    action: '/api/user/name',
    defaultValues: {
      name: currentName,
    },
  });

  useEffect(() => {
    if (open) {
      form.resetForm({ name: currentName });
      setWasSubmitting(false);
    }
  }, [open, currentName]);

  useEffect(() => {
    if (fetcher.state === 'submitting' || fetcher.state === 'loading') {
      setWasSubmitting(true);
    }
  }, [fetcher.state]);

  useEffect(() => {
    if (fetcher.state === 'idle' && wasSubmitting) {
      revalidator.revalidate();
      setWasSubmitting(false);
    }
  }, [fetcher.state, wasSubmitting, revalidator]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your display name and accessibility preferences.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <fetcher.Form {...form.getFormProps()} className="space-y-3">
            <FormInput
              scope={form.scope('name')}
              type="text"
              label="Display name"
              autoComplete="name"
              disabled={readOnly}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading || readOnly}>
                Save name
              </Button>
            </div>
          </fetcher.Form>
          <div className="border-t pt-6">
            <ContrastPreferenceSwitch>
              {({ fetcher: contrastFetcher, highContrast, setPreference }) => (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">High contrast</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Darken text and controls for stronger contrast. Off by
                      default.
                    </p>
                  </div>
                  <Switch
                    aria-label="High contrast"
                    checked={highContrast}
                    disabled={contrastFetcher.state !== 'idle'}
                    onCheckedChange={(checked) =>
                      setPreference(checked ? 'high' : 'standard')
                    }
                  />
                </div>
              )}
            </ContrastPreferenceSwitch>
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
