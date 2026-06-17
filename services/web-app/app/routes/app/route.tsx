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
import { useCallback, useEffect, useState, createContext } from 'react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import {
  HamburgerIcon,
  ReloadIcon,
  SlashIcon,
} from '~/components/icons';
import { Button, button } from '~/components/ui/button';
import useBreakpoint from '~/hooks/useBreakpoint';
import { useOnSwipe } from '~/hooks/useHorizontalSwipe';
import { useUser } from '~/hooks/useUser';
import {
  BreadcrumbHandleMatch,
  type BreadcrumbHandle,
} from '~/utils/breadcrumb';
import { cn } from '~/utils/misc';
import { useNavState } from '../api.preferences.nav/route';
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
  SidebarFloatingPanel,
  SidebarDarkInk,
  SidebarLineAccent,
  SidebarWarmTinted,
  type SidebarVariantProps,
} from './sidebar-redesign-variants';

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

// kept for existing code that may reference it via the export
export { normalizePathname as _normalizePathname };

export default function Route() {
  const location = useLocation();
  const user = useUser();
  const rootData =
    useRouteLoaderData<RootRoute.ComponentProps['loaderData']>('root');
  const isReadOnlyImpersonation =
    rootData?.impersonation?.isReadOnly ?? false;
  const studentPreviewActive = rootData?.studentPreview?.active ?? false;
  const canToggleStudentPreview =
    user.selectedMembership?.role === 'TEACHER' || user.isAdmin;
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
      {/* ── Sidebar picker ── 4 redesign options via ui.sh toolbar ─────── */}
      {(() => {
        const variantProps: SidebarVariantProps = {
          user,
          navExpanded,
          isMobileNavOpen,
          setIsMobileNavOpen,
          pathname: location.pathname,
          isClassDetailRoute,
          studentPreviewActive,
          canToggleStudentPreview: canToggleStudentPreview ?? false,
          isReadOnlyImpersonation,
          setIsEditNameOpen,
        };
        return (
          <div data-uidotsh-pick="Sidebar design" className="contents">
            <div data-uidotsh-option="Floating Panel" className="contents">
              <SidebarFloatingPanel {...variantProps} />
            </div>
            <div data-uidotsh-option="Dark Ink" className="contents" hidden>
              <SidebarDarkInk {...variantProps} />
            </div>
            <div data-uidotsh-option="Line Accent" className="contents" hidden>
              <SidebarLineAccent {...variantProps} />
            </div>
            <div data-uidotsh-option="Warm Tinted" className="contents" hidden>
              <SidebarWarmTinted {...variantProps} />
            </div>
          </div>
        );
      })()}
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
        {studentPreviewActive ? (
          <div className="border-b border-sky-300 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-900">
            Student preview active. You are viewing student pages read-only.
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
