import {
  Form,
  Link,
  NavLink,
  Outlet,
  data,
  useLoaderData,
  useLocation,
  useMatches,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect,
  useFetcher,
  useRevalidator,
} from 'react-router';
import {
  BookOpen,
  CogIcon,
  GaugeIcon,
  GraduationCap,
  LockIcon,
  MonitorPlay,
  Settings2,
  UserIcon,
  Users,
  Pencil,
} from 'lucide-react';
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

export const NavExpandedContext = createContext({
  isMobileNavOpen: false,
  setIsMobileNavOpen: (() => {}) as any,
});

export const handle: BreadcrumbHandle = { breadcrumb: 'Home' };

type RequiresContext = {
  user: ReturnType<typeof useUser>;
  featureFlags: { essayExamples: boolean };
};
type RequiresFn = (ctx: RequiresContext) => boolean | null | undefined;

const LINKS: {
  to: string;
  label: string;
  end?: boolean;
  position?: 'top' | 'bottom';
  icon: React.ReactNode;
  requires?: { OR: RequiresFn[] } | { AND: RequiresFn[] } | RequiresFn;
}[] = [
  {
    to: '/app',
    label: 'Dashboard',
    end: true,
    icon: <GaugeIcon size={20} />,
  },
  {
    to: '/app/my-classes',
    label: 'My Classes',
    icon: <Users size={20} />,
    requires: ({ user }) => !!user.selectedProfile?.teacherProfile,
  },
  {
    to: '/app/teacher-trainings',
    label: "Teacher's Lounge",
    icon: <MonitorPlay size={20} />,
    requires: ({ user }) => !!user.selectedProfile?.teacherProfile,
  },
  {
    to: '/app/organization',
    label: 'Organization',
    icon: <CogIcon size={20} />,
    requires: ({ user }) => user.selectedProfile?.isOwner,
  },
  {
    to: '/app/admin',
    label: 'Admin',
    icon: <LockIcon size={20} />,
    requires: ({ user }) => user.isAdmin,
  },
  {
    to: '/app/yawp-library',
    label: 'YAWP! Library',
    icon: <BookOpen size={20} />,
    position: 'bottom',
    requires: ({ featureFlags }) => featureFlags.essayExamples,
  },
];

const EditNameSchema = z.object({
  name: NameSchema,
});

export async function loader({ request }: LoaderFunctionArgs) {
  const { getUserId } = await import('~/utils/auth.server.ts');
  const { isEssayExamplesEnabledForOrganization } = await import(
    '~/utils/feature-flags.server.ts'
  );
  const { prisma } = await import('~/utils/db.server.ts');
  const { getProfileId } = await import('~/cookies/profile-id.server.ts');

  const userId = await getUserId(request);
  if (!userId) {
    return data({ featureFlags: { essayExamples: false } });
  }

  const profileId = await getProfileId(request);
  const profile = profileId
    ? await prisma.profile.findUnique({
        where: { id: profileId, userId },
        select: { organization: { select: { id: true } } },
      })
    : await prisma.profile.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { organization: { select: { id: true } } },
      });

  const essayExamples = await isEssayExamplesEnabledForOrganization(
    profile?.organization?.id
  );

  return data({ featureFlags: { essayExamples } });
}

export default function Route() {
  const location = useLocation();
  const user = useUser();
  const { featureFlags } = useLoaderData<typeof loader>();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isEditNameOpen, setIsEditNameOpen] = useState(false);

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
            onClick={() => setIsMobileNavOpen(false)}
          >
            <XIcon />
          </Button>
        </div>
        <div className="grid gap-1 p-3">
          {(() => {
            const ctx = { user, featureFlags };
            const visible = LINKS.filter(
              (link) =>
                !link.requires ||
                (typeof link.requires === 'object'
                  ? 'OR' in link.requires
                    ? link.requires.OR.some((r) => r(ctx))
                    : link.requires.AND.every((r) => r(ctx))
                  : link.requires(ctx))
            );
            const top = visible.filter((l) => l.position !== 'bottom');
            const bottom = visible.filter((l) => l.position === 'bottom');
            const renderLink = (link: (typeof LINKS)[number]) => (
              <NavLink
                key={link.to}
                className={({ isActive }) =>
                  cn(
                    'flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground',
                    {
                      'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary font-bold':
                        isActive,
                      'py-2': !navExpanded,
                    }
                  )
                }
                to={link.to}
                end={link.end}
              >
                {link.icon ? (
                  navExpanded ? (
                    link.icon
                  ) : (
                    <Tooltip
                      key={link.to}
                      text={link.label}
                      open={navExpanded ? false : undefined}
                      contentProps={{ side: 'right' }}
                    >
                      {link.icon}
                    </Tooltip>
                  )
                ) : null}
                {navExpanded ? (
                  <span className="w-full">{link.label}</span>
                ) : null}
              </NavLink>
            );
            return (
              <>
                {top.map(renderLink)}
                {bottom.length > 0 ? (
                  <>
                    <div className="my-1 border-t" aria-hidden />
                    {bottom.map(renderLink)}
                  </>
                ) : null}
              </>
            );
          })()}
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
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="opacity-40 hover:opacity-100"
                  onClick={() => setIsEditNameOpen(true)}
                >
                  <Pencil size={14} />
                </Button>
              </div>
              {/* Organization / Profile selector */}
              {user.profiles?.length ? (
                <div className="max-h-64 overflow-auto p-1 border-b space-y-1">
                  {user.profiles.map((p) => {
                    const isSelected = user.selectedProfile
                      ? user.selectedProfile?.id === p.id
                      : user.profiles?.[0]?.id === p.id;
                    return (
                      <Form method="POST" action="/api/profile-id" key={p.id}>
                        <input
                          type="hidden"
                          name="intent"
                          value="switch-profile"
                        />
                        <input type="hidden" name="profileId" value={p.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant={isSelected ? 'secondary' : 'ghost'}
                          className="w-full justify-between rounded-lg px-3 py-2 disabled:opacity-100 disabled:bg-foreground/10 disabled:font-bold"
                          disabled={isSelected}
                        >
                          <span className="flex min-w-0 flex-col text-left">
                            <span className="truncate">
                              {p.organization?.name ?? 'Organization'}
                            </span>
                          </span>
                          {isSelected ? <Check size={16} /> : null}
                        </Button>
                      </Form>
                    );
                  })}
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
          'min-w-full flex-1 transition-all duration-300 ease-in-out sm:min-w-0 sm:translate-x-0',
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
        <NavExpandedContext.Provider
          value={{ isMobileNavOpen, setIsMobileNavOpen }}
        >
          <Outlet />
        </NavExpandedContext.Provider>
      </div>
      <EditNameDialog
        open={isEditNameOpen}
        onOpenChange={setIsEditNameOpen}
        currentName={user.name || ''}
      />
    </main>
  );
}

function EditNameDialog({
  open,
  onOpenChange,
  currentName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
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
      onOpenChange(false);
      setWasSubmitting(false);
    }
  }, [fetcher.state, wasSubmitting, onOpenChange, revalidator]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Name</DialogTitle>
          <DialogDescription>Update your display name</DialogDescription>
        </DialogHeader>
        <fetcher.Form {...form.getFormProps()}>
          <FormInput
            scope={form.scope('name')}
            type="text"
            label="Name"
            autoComplete="name"
          />
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              Save
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
