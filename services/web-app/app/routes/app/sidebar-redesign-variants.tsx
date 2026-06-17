import { Form, Link } from 'react-router';
import { Check, Eye, EyeOff, Pencil, Settings2 } from 'lucide-react';
import type { useUser } from '~/hooks/useUser';
import { cn } from '~/utils/misc';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { Button } from '~/components/ui/button';
import { Tooltip } from '~/components/ui/tooltip';
import {
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
  ExitIcon,
  XIcon,
} from '~/components/icons';
import { NavStateSwitch } from '../api.preferences.nav/route';
import { FLAT_SIDEBAR_SECTIONS, getVisibleSidebarSections } from './sidebar-nav';

type User = ReturnType<typeof useUser>;

export type SidebarVariantProps = {
  user: User;
  navExpanded: boolean;
  isMobileNavOpen: boolean;
  setIsMobileNavOpen: (v: boolean) => void;
  pathname: string;
  isClassDetailRoute: boolean;
  studentPreviewActive: boolean;
  canToggleStudentPreview: boolean;
  isReadOnlyImpersonation: boolean;
  setIsEditNameOpen: (v: boolean) => void;
};

function navLinkActive(to: string, pathname: string) {
  const p =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;
  if (to === '/app') return p === '/app';
  return p === to || p.startsWith(`${to}/`);
}

// ─── Shared popover content ────────────────────────────────────────────────

function UserMenuPopoverContent({
  user,
  studentPreviewActive,
  canToggleStudentPreview,
  isReadOnlyImpersonation,
  setIsEditNameOpen,
}: Pick<
  SidebarVariantProps,
  | 'user'
  | 'studentPreviewActive'
  | 'canToggleStudentPreview'
  | 'isReadOnlyImpersonation'
  | 'setIsEditNameOpen'
>) {
  return (
    <>
      <div className="flex justify-between border-b p-3">
        <div className="flex flex-col">
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-sm text-zinc-500">{user.email}</p>
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
      {user.memberships?.length ? (
        <div className="max-h-64 space-y-1 overflow-auto border-b p-1">
          {user.memberships.map((m) => {
            const isSelected = user.selectedMembership
              ? user.selectedMembership?.id === m.id
              : user.memberships?.[0]?.id === m.id;
            return (
              <Form method="POST" action="/api/membership-id" key={m.id}>
                <input type="hidden" name="intent" value="switch-membership" />
                <input type="hidden" name="membershipId" value={m.id} />
                <Button
                  type="submit"
                  size="sm"
                  variant={isSelected ? 'secondary' : 'ghost'}
                  className="w-full justify-between rounded-lg px-3 py-2 disabled:bg-zinc-950/10 disabled:opacity-100"
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
      {canToggleStudentPreview ? (
        <div className="border-b p-1">
          <Form method="POST" action="/api/student-preview">
            <input
              type="hidden"
              name="intent"
              value={studentPreviewActive ? 'end' : 'start'}
            />
            <Button
              type="submit"
              size="sm"
              variant={studentPreviewActive ? 'secondary' : 'ghost'}
              className="w-full justify-start gap-2 rounded-lg px-3 py-2"
              disabled={isReadOnlyImpersonation}
              title={
                isReadOnlyImpersonation
                  ? 'Read-only impersonation active'
                  : studentPreviewActive
                    ? 'Exit student preview'
                    : 'View the app as a student'
              }
            >
              {studentPreviewActive ? <EyeOff size={16} /> : <Eye size={16} />}
              {studentPreviewActive ? 'Exit student preview' : 'View as student'}
            </Button>
          </Form>
        </div>
      ) : null}
      <Form action="/auth/logout" method="POST" className="p-1">
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          className="w-full justify-start gap-2 rounded-lg px-3 py-2 text-red-600 hover:bg-red-50 hover:text-red-600"
        >
          <ExitIcon />
          Logout
        </Button>
      </Form>
    </>
  );
}

// ─── Option A: Floating Panel ──────────────────────────────────────────────
// The sidebar lives inside a floating white card — inset from edges with
// rounded-2xl, shadow, and a soft ring. Active items use a soft gray fill.

export function SidebarFloatingPanel({
  user,
  navExpanded,
  isMobileNavOpen,
  setIsMobileNavOpen,
  pathname,
  isClassDetailRoute,
  studentPreviewActive,
  canToggleStudentPreview,
  isReadOnlyImpersonation,
  setIsEditNameOpen,
}: SidebarVariantProps) {
  const sections = getVisibleSidebarSections(
    FLAT_SIDEBAR_SECTIONS,
    user,
    studentPreviewActive
  );

  return (
    <nav
      className={cn(
        'z-20 flex h-full -translate-x-full flex-col transition-all duration-300 ease-in-out sm:translate-x-0',
        navExpanded
          ? 'w-[220px] min-w-[220px]'
          : 'w-[64px] min-w-0',
        { 'translate-x-0': isMobileNavOpen }
      )}
    >
      {/* Floating card inset from edges */}
      <div
        className={cn(
          'my-2 ml-2 flex h-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl bg-white shadow ring-1 ring-zinc-950/8',
          { 'items-center': !navExpanded }
        )}
      >
        {/* Header: logo + toggle */}
        <div
          className={cn('flex shrink-0 items-center gap-2 p-3', {
            'justify-between': navExpanded,
            'justify-center': !navExpanded,
          })}
        >
          {navExpanded ? (
            <Link to=".">
              <img
                src="/img/logo_for_light_mode.png"
                alt="Logo"
                className="h-7 w-auto"
              />
            </Link>
          ) : null}
          <NavStateSwitch>
            {({ state, fetcher }) => (
              <Button
                size="icon-sm"
                variant="ghost"
                className="hidden text-zinc-400 hover:text-zinc-700 sm:inline-flex"
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
            variant="ghost"
            size="icon-sm"
            className="sm:hidden"
            onClick={() => setIsMobileNavOpen(false)}
          >
            <XIcon />
          </Button>
        </div>

        {/* Nav links */}
        <div className={cn('flex-1 overflow-y-auto px-2', { 'px-1.5': !navExpanded })}>
          {sections.map((section, i) => (
            <div key={section.label ?? i} className="grid gap-0.5">
              {section.links.map((link) => {
                const isActive = navLinkActive(link.to, pathname);
                return (
                  <Tooltip
                    key={link.to}
                    text={link.label}
                    open={navExpanded ? false : undefined}
                    contentProps={{ side: 'right' }}
                  >
                    <Link
                      to={link.to}
                      reloadDocument={isClassDetailRoute || undefined}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm',
                        {
                          'bg-zinc-100 text-zinc-900': isActive,
                          'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800':
                            !isActive,
                          'justify-center px-2': !navExpanded,
                        }
                      )}
                    >
                      <span className="shrink-0">{link.icon}</span>
                      {navExpanded ? (
                        <span className="min-w-0 truncate">{link.label}</span>
                      ) : null}
                    </Link>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>

        {/* User menu */}
        <div className="mt-auto border-t border-zinc-950/5">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-3 text-sm text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800',
                  { 'justify-center': !navExpanded }
                )}
              >
                <Settings2 size={16} className="shrink-0" />
                {navExpanded ? <span>Settings</span> : null}
              </button>
            </PopoverTrigger>
            <PopoverContent className="m-1 p-0">
              <UserMenuPopoverContent
                user={user}
                studentPreviewActive={studentPreviewActive}
                canToggleStudentPreview={canToggleStudentPreview}
                isReadOnlyImpersonation={isReadOnlyImpersonation}
                setIsEditNameOpen={setIsEditNameOpen}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </nav>
  );
}

// ─── Option B: Dark Ink ────────────────────────────────────────────────────
// Deep zinc-900 sidebar. White/zinc-400 text. Active items get a zinc-700
// background. Stark, focused, high contrast.

export function SidebarDarkInk({
  user,
  navExpanded,
  isMobileNavOpen,
  setIsMobileNavOpen,
  pathname,
  isClassDetailRoute,
  studentPreviewActive,
  canToggleStudentPreview,
  isReadOnlyImpersonation,
  setIsEditNameOpen,
}: SidebarVariantProps) {
  const sections = getVisibleSidebarSections(
    FLAT_SIDEBAR_SECTIONS,
    user,
    studentPreviewActive
  );

  return (
    <nav
      className={cn(
        'z-20 flex h-full -translate-x-full flex-col bg-zinc-900 transition-all duration-300 ease-in-out sm:translate-x-0',
        navExpanded
          ? 'w-[212px] min-w-[212px]'
          : 'w-[56px] min-w-0 items-center',
        { 'translate-x-0': isMobileNavOpen }
      )}
    >
      {/* Header */}
      <div
        className={cn('flex shrink-0 items-center p-3', {
          'justify-between': navExpanded,
          'justify-center': !navExpanded,
        })}
      >
        {navExpanded ? (
          <Link to=".">
            <img
              src="/img/logo_for_light_mode.png"
              alt="Logo"
              className="h-7 w-auto brightness-0 invert"
            />
          </Link>
        ) : null}
        <NavStateSwitch>
          {({ state, fetcher }) => (
            <Button
              size="icon-sm"
              variant="ghost"
              className="hidden text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 sm:inline-flex"
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
          variant="ghost"
          size="icon-sm"
          className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 sm:hidden"
          onClick={() => setIsMobileNavOpen(false)}
        >
          <XIcon />
        </Button>
      </div>

      {/* Nav links */}
      <div
        className={cn('flex-1 overflow-y-auto px-2', { 'px-1.5': !navExpanded })}
      >
        {sections.map((section, i) => (
          <div key={section.label ?? i} className="grid gap-0.5">
            {section.links.map((link) => {
              const isActive = navLinkActive(link.to, pathname);
              return (
                <Tooltip
                  key={link.to}
                  text={link.label}
                  open={navExpanded ? false : undefined}
                  contentProps={{ side: 'right' }}
                >
                  <Link
                    to={link.to}
                    reloadDocument={isClassDetailRoute || undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm',
                      {
                        'bg-zinc-700 text-zinc-50': isActive,
                        'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100':
                          !isActive,
                        'justify-center px-2': !navExpanded,
                      }
                    )}
                  >
                    <span className="shrink-0">{link.icon}</span>
                    {navExpanded ? (
                      <span className="min-w-0 truncate">{link.label}</span>
                    ) : null}
                  </Link>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </div>

      {/* User menu */}
      <div className="mt-auto border-t border-zinc-950/50 w-full">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 px-3 py-3 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
                { 'justify-center': !navExpanded }
              )}
            >
              <Settings2 size={16} className="shrink-0" />
              {navExpanded ? <span>Settings</span> : null}
            </button>
          </PopoverTrigger>
          <PopoverContent className="m-1 p-0">
            <UserMenuPopoverContent
              user={user}
              studentPreviewActive={studentPreviewActive}
              canToggleStudentPreview={canToggleStudentPreview}
              isReadOnlyImpersonation={isReadOnlyImpersonation}
              setIsEditNameOpen={setIsEditNameOpen}
            />
          </PopoverContent>
        </Popover>
      </div>
    </nav>
  );
}

// ─── Option C: Line Accent ─────────────────────────────────────────────────
// White sidebar with clear section labels and a left-border accent on active
// items instead of a filled background. More structured and editorial.

export function SidebarLineAccent({
  user,
  navExpanded,
  isMobileNavOpen,
  setIsMobileNavOpen,
  pathname,
  isClassDetailRoute,
  studentPreviewActive,
  canToggleStudentPreview,
  isReadOnlyImpersonation,
  setIsEditNameOpen,
}: SidebarVariantProps) {
  const sections = getVisibleSidebarSections(
    FLAT_SIDEBAR_SECTIONS,
    user,
    studentPreviewActive
  );

  return (
    <nav
      className={cn(
        'z-20 flex h-full -translate-x-full flex-col border-r border-zinc-950/8 bg-white transition-all duration-300 ease-in-out sm:translate-x-0',
        navExpanded
          ? 'w-[240px] min-w-[240px]'
          : 'w-[56px] min-w-0 items-center',
        { 'translate-x-0': isMobileNavOpen }
      )}
    >
      {/* Header */}
      <div
        className={cn('flex shrink-0 items-center px-4 py-4', {
          'justify-between': navExpanded,
          'justify-center px-2': !navExpanded,
        })}
      >
        {navExpanded ? (
          <Link to=".">
            <img
              src="/img/logo_for_light_mode.png"
              alt="Logo"
              className="h-7 w-auto"
            />
          </Link>
        ) : null}
        <NavStateSwitch>
          {({ state, fetcher }) => (
            <Button
              size="icon-sm"
              variant="ghost"
              className="hidden text-zinc-400 hover:text-zinc-700 sm:inline-flex"
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
          variant="ghost"
          size="icon-sm"
          className="sm:hidden"
          onClick={() => setIsMobileNavOpen(false)}
        >
          <XIcon />
        </Button>
      </div>

      {/* Nav links with section labels */}
      <div
        className={cn('flex-1 overflow-y-auto px-3 pb-2', {
          'px-1.5': !navExpanded,
        })}
      >
        {sections.map((section, i) => (
          <div key={section.label ?? i} className={cn({ 'mt-5': i > 0 && navExpanded })}>
            {section.label && navExpanded ? (
              <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                {section.label}
              </p>
            ) : null}
            <div className="grid gap-px">
              {section.links.map((link) => {
                const isActive = navLinkActive(link.to, pathname);
                return (
                  <Tooltip
                    key={link.to}
                    text={link.label}
                    open={navExpanded ? false : undefined}
                    contentProps={{ side: 'right' }}
                  >
                    <Link
                      to={link.to}
                      reloadDocument={isClassDetailRoute || undefined}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'relative flex w-full items-center gap-2.5 rounded-lg py-2 text-sm',
                        navExpanded ? 'pl-3 pr-3' : 'justify-center px-2',
                        {
                          'text-zinc-900': isActive,
                          'text-zinc-500 hover:text-zinc-800': !isActive,
                        }
                      )}
                    >
                      {isActive && navExpanded ? (
                        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-zinc-900" />
                      ) : null}
                      <span className="shrink-0">{link.icon}</span>
                      {navExpanded ? (
                        <span className="min-w-0 truncate">{link.label}</span>
                      ) : null}
                    </Link>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* User menu */}
      <div className="mt-auto border-t border-zinc-950/8 w-full">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 px-4 py-3.5 text-sm text-zinc-500 hover:text-zinc-800',
                { 'justify-center': !navExpanded }
              )}
            >
              <Settings2 size={16} className="shrink-0" />
              {navExpanded ? <span>Settings</span> : null}
            </button>
          </PopoverTrigger>
          <PopoverContent className="m-1 p-0">
            <UserMenuPopoverContent
              user={user}
              studentPreviewActive={studentPreviewActive}
              canToggleStudentPreview={canToggleStudentPreview}
              isReadOnlyImpersonation={isReadOnlyImpersonation}
              setIsEditNameOpen={setIsEditNameOpen}
            />
          </PopoverContent>
        </Popover>
      </div>
    </nav>
  );
}

// ─── Option D: Warm Tinted ─────────────────────────────────────────────────
// Stone/amber-50 warm tinted background. Feels editorial and cozy. Active
// items use a warm stone-200 fill. User area shows name when expanded.

export function SidebarWarmTinted({
  user,
  navExpanded,
  isMobileNavOpen,
  setIsMobileNavOpen,
  pathname,
  isClassDetailRoute,
  studentPreviewActive,
  canToggleStudentPreview,
  isReadOnlyImpersonation,
  setIsEditNameOpen,
}: SidebarVariantProps) {
  const sections = getVisibleSidebarSections(
    FLAT_SIDEBAR_SECTIONS,
    user,
    studentPreviewActive
  );

  return (
    <nav
      className={cn(
        'z-20 flex h-full -translate-x-full flex-col border-r border-stone-200 bg-stone-50 transition-all duration-300 ease-in-out sm:translate-x-0',
        navExpanded
          ? 'w-[212px] min-w-[212px]'
          : 'w-[56px] min-w-0 items-center',
        { 'translate-x-0': isMobileNavOpen }
      )}
    >
      {/* Header */}
      <div
        className={cn('flex shrink-0 items-center p-3', {
          'justify-between': navExpanded,
          'justify-center': !navExpanded,
        })}
      >
        {navExpanded ? (
          <Link to=".">
            <img
              src="/img/logo_for_light_mode.png"
              alt="Logo"
              className="h-7 w-auto opacity-90"
            />
          </Link>
        ) : null}
        <NavStateSwitch>
          {({ state, fetcher }) => (
            <Button
              size="icon-sm"
              variant="ghost"
              className="hidden text-stone-400 hover:bg-stone-200 hover:text-stone-700 sm:inline-flex"
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
          variant="ghost"
          size="icon-sm"
          className="text-stone-500 hover:bg-stone-200 sm:hidden"
          onClick={() => setIsMobileNavOpen(false)}
        >
          <XIcon />
        </Button>
      </div>

      {/* Nav links */}
      <div
        className={cn('flex-1 overflow-y-auto px-2', { 'px-1.5': !navExpanded })}
      >
        {sections.map((section, i) => (
          <div key={section.label ?? i} className={cn({ 'mt-3': i > 0 && navExpanded })}>
            {section.label && navExpanded ? (
              <p className="mb-1 px-3 text-xs text-stone-400">{section.label}</p>
            ) : null}
            <div className="grid gap-0.5">
              {section.links.map((link) => {
                const isActive = navLinkActive(link.to, pathname);
                return (
                  <Tooltip
                    key={link.to}
                    text={link.label}
                    open={navExpanded ? false : undefined}
                    contentProps={{ side: 'right' }}
                  >
                    <Link
                      to={link.to}
                      reloadDocument={isClassDetailRoute || undefined}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm',
                        {
                          'bg-stone-200 text-stone-900': isActive,
                          'text-stone-500 hover:bg-stone-100 hover:text-stone-800':
                            !isActive,
                          'justify-center px-2': !navExpanded,
                        }
                      )}
                    >
                      <span className="shrink-0">{link.icon}</span>
                      {navExpanded ? (
                        <span className="min-w-0 truncate">{link.label}</span>
                      ) : null}
                    </Link>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* User area — shows name+role chip when expanded */}
      <div className="mt-auto border-t border-stone-200 w-full">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-3 text-sm text-stone-500 hover:bg-stone-100 hover:text-stone-800',
                { 'justify-center': !navExpanded }
              )}
            >
              {navExpanded ? (
                <>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-medium text-stone-700">
                    {(user.name ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left text-stone-700">
                    {user.name}
                  </span>
                  <Settings2 size={14} className="shrink-0 text-stone-400" />
                </>
              ) : (
                <Settings2 size={16} className="shrink-0" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="m-1 p-0">
            <UserMenuPopoverContent
              user={user}
              studentPreviewActive={studentPreviewActive}
              canToggleStudentPreview={canToggleStudentPreview}
              isReadOnlyImpersonation={isReadOnlyImpersonation}
              setIsEditNameOpen={setIsEditNameOpen}
            />
          </PopoverContent>
        </Popover>
      </div>
    </nav>
  );
}
