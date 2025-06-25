import {
  Form,
  Link,
  NavLink,
  Outlet,
  data,
  useLocation,
  useMatches,
} from 'react-router';
import {
  Building2,
  CogIcon,
  GaugeIcon,
  LockIcon,
  Settings2,
  User,
  UserIcon,
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
import { UserImage } from '~/components/user-image';
import useBreakpoint from '~/hooks/useBreakpoint';
import { useOnSwipe } from '~/hooks/useHorizontalSwipe';
import { useUser } from '~/hooks/useUser';
import {
  BreadcrumbHandleMatch,
  type BreadcrumbHandle,
} from '~/utils/breadcrumb';
import { prisma } from '~/utils/db.server';
import { FeatureFlags } from '~/utils/featureFlags/index.js';
import { cn } from '~/utils/misc';
import { NavStateSwitch, useNavState } from '../api.preferences.nav/route';

export const NavExpandedContext = createContext({
  isMobileNavOpen: false,
  setIsMobileNavOpen: (() => {}) as any,
});

export const handle: BreadcrumbHandle = { breadcrumb: 'Home' };

export async function loader() {
  const ffs = await prisma.featureFlag.findMany({
    where: { name: { in: [FeatureFlags.Courses, FeatureFlags.Assistants] } },
  });
  return data({
    enableCourses: ffs.some(
      (ff) => ff.name === FeatureFlags.Courses && ff.isEnabled
    ),
    enableAssistants: ffs.some(
      (ff) => ff.name === FeatureFlags.Assistants && ff.isEnabled
    ),
  });
}

type RequiresOptions = 'isAdmin' | 'teacherProfile' | 'isOwner';

const LINKS: {
  to: string;
  label: string;
  end?: boolean;
  icon: React.ReactNode;
  requires?:
    | { OR: RequiresOptions[] }
    | { AND: RequiresOptions[] }
    | RequiresOptions;
}[] = [
  {
    to: '/app',
    label: 'Dashboard',
    end: true,
    icon: <GaugeIcon size={20} />,
  },
  {
    to: '/app/students',
    label: 'My Students',
    icon: <User size={20} />,
    requires: 'teacherProfile',
  },
  {
    to: '/app/organization',
    label: 'Organization',
    icon: <CogIcon size={20} />,
    requires: 'isOwner',
  },
  {
    to: '/app/admin',
    label: 'Admin',
    icon: <LockIcon size={20} />,
    requires: 'isAdmin',
  },
];

export default function Route() {
  const location = useLocation();
  const user = useUser();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

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
          'z-20 flex h-full w-[190px] min-w-[190px] -translate-x-full transform flex-col border-r bg-background transition-all duration-300 ease-in-out sm:translate-x-0',
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
          {LINKS.filter(
            (link) =>
              !link.requires ||
              (typeof link.requires === 'object'
                ? 'OR' in link.requires
                  ? link.requires.OR.some((r) => user[r])
                  : link.requires.AND.every((r) => user[r])
                : user[link.requires])
          ).map((link) => (
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
          ))}
        </div>
        <div className="flex flex-grow flex-col justify-end">
          <Popover>
            <PopoverTrigger>
              <div className="flex items-center gap-2 border-t px-2 py-4 pb-6 transition hover:bg-foreground/5 sm:pb-3">
                <UserImage user={user} size="sm" />
                {navExpanded ? (
                  <div>
                    <p className="font-bold text-sm">{user.name}</p>
                    <p className="text-left text-sm text-muted-foreground">
                      {user.isAdmin
                        ? 'Admin'
                        : user.isOwner
                          ? 'Owner'
                          : user.teacherProfile
                            ? 'Teacher'
                            : 'Student'}
                    </p>
                  </div>
                ) : null}
              </div>
            </PopoverTrigger>
            <PopoverContent className="m-1 w-[170px] p-1">
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="rounded-xl w-full justify-start gap-2 text-muted-foreground transition hover:text-current"
              >
                <Link to="/app/profile">
                  <UserIcon size={15} />
                  Profile
                </Link>
              </Button>
              <Form action="/auth/logout" method="POST">
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  className="rounded-lg w-full justify-start gap-2 text-muted-foreground transition hover:text-current"
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
            '-translate-x-[190px]': isNavExpanded,
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
    </main>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
