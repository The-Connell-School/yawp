import {
  Form,
  Link,
  Outlet,
  data,
  useLocation,
  useMatches,
  type ActionFunctionArgs,
  redirect,
  useFetcher,
  useRevalidator,
  useRouteLoaderData,
} from 'react-router';
import { Settings2, Pencil } from 'lucide-react';
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
import type { Route as RootRoute } from '../../+types/root';
import {
  FLAT_SIDEBAR_SECTIONS,
  SidebarNavLinks,
} from './sidebar-nav';

export const NavExpandedContext = createContext({
  isMobileNavOpen: false,
  setIsMobileNavOpen: (() => {}) as any,
});

export const handle: BreadcrumbHandle = { breadcrumb: 'Home' };

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

  return (
    normalized === linkTo ||
    normalized.startsWith(`${linkTo}/`)
  );
}

export default function Route() {
  const location = useLocation();
  const user = useUser();
  const rootData =
    useRouteLoaderData<RootRoute.ComponentProps['loaderData']>('root');
  const isReadOnlyImpersonation =
    rootData?.impersonation?.isReadOnly ?? false;
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

  const isClassDetailRoute = /^\/app\/my-classes\/[^/]+/.test(
    location.pathname
  );

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
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="opacity-40 hover:opacity-100"
                  aria-label="Edit name"
                  disabled={isReadOnlyImpersonation}
                  title={
                    isReadOnlyImpersonation
                      ? 'Read-only impersonation active'
                      : 'Edit name'
                  }
                  onClick={() => setIsEditNameOpen(true)}
                >
                  <Pencil size={14} />
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
                      <Form method="POST" action="/api/membership-id" key={m.id}>
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
        <NavExpandedContext.Provider
          value={{ isMobileNavOpen, setIsMobileNavOpen }}
        >
          <Outlet key={location.pathname} />
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
