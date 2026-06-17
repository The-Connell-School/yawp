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
                  className="w-full justify-between rounded-lg px-3 py-2 disabled:bg-foreground/10 disabled:opacity-100"
                  disabled={isSelected}
                >
                  <span className="min-w-0 truncate text-left">
                    {m.organization?.name ?? 'Organization'}
                  </span>
                  {isSelected ? <Check size={16} className="shrink-0" /> : null}
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
          className="w-full justify-start gap-2 rounded-lg px-3 py-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <ExitIcon />
          Logout
        </Button>
      </Form>
    </>
  );
}

// ─── Option A: Brand Sand ──────────────────────────────────────────────────
// Uses the app's own sidebar CSS tokens — warm sand background, coral active
// state, user initial avatar at the bottom. This is what the sidebar was
// *designed* to look like based on the CSS variables defined for it.

export function SidebarBrandSand({
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
  const initials = (user.name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <nav
      className={cn(
        'z-20 flex h-full -translate-x-full flex-col transition-all duration-300 ease-in-out sm:translate-x-0',
        navExpanded
          ? 'w-[244px] min-w-[244px]'
          : 'w-[60px] min-w-0 items-center',
        { 'translate-x-0': isMobileNavOpen },
        'bg-[hsl(var(--sidebar))]'
      )}
    >
      {/* Header */}
      <div
        className={cn('flex shrink-0 items-center px-4 py-4', {
          'justify-between': navExpanded,
          'justify-center': !navExpanded,
        })}
      >
        {navExpanded ? (
          <Link to=".">
            <img
              src="/img/logo_for_light_mode.png"
              alt="Logo"
              className="h-8 w-auto"
            />
          </Link>
        ) : null}
        <NavStateSwitch>
          {({ state, fetcher }) => (
            <Button
              size="icon-sm"
              variant="ghost"
              className="hidden text-[hsl(var(--sidebar-foreground))]/50 hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))] sm:inline-flex"
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
          className="text-[hsl(var(--sidebar-foreground))]/50 sm:hidden"
          onClick={() => setIsMobileNavOpen(false)}
        >
          <XIcon />
        </Button>
      </div>

      {/* Nav links */}
      <div
        className={cn('flex-1 overflow-y-auto px-3', { 'px-2': !navExpanded })}
      >
        {sections.map((section, i) => (
          <div
            key={section.label ?? i}
            className={cn({ 'mt-4': i > 0 && navExpanded })}
          >
            {section.label && navExpanded ? (
              <p className="mb-1.5 px-2 text-xs font-medium uppercase tracking-wide text-[hsl(var(--sidebar-foreground))]/40">
                {section.label}
              </p>
            ) : null}
            <div className="grid gap-1">
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
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
                        {
                          'bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] shadow-sm':
                            isActive,
                          'text-[hsl(var(--sidebar-foreground))]/70 hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))]':
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

      {/* User area — avatar initials + name */}
      <div className="mt-auto border-t border-[hsl(var(--sidebar-border))] w-full">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-3 px-4 py-4 text-sm text-[hsl(var(--sidebar-foreground))]/60 hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))]',
                { 'justify-center px-3': !navExpanded }
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--sidebar-primary))] text-xs font-medium text-[hsl(var(--sidebar-primary-foreground))]">
                {initials}
              </span>
              {navExpanded ? (
                <span className="min-w-0 flex-1 truncate text-left text-[hsl(var(--sidebar-foreground))]">
                  {user.name}
                </span>
              ) : null}
              {navExpanded ? (
                <Settings2 size={14} className="shrink-0" />
              ) : null}
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

// ─── Option B: Coral Column ────────────────────────────────────────────────
// The sidebar IS the brand's coral/terracotta color. White icons and text
// throughout. Active items get a frosted white pill. Bold brand statement —
// the sidebar announces Yawp's identity the moment you open the app.

export function SidebarCoralColumn({
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
        'z-20 flex h-full -translate-x-full flex-col bg-primary transition-all duration-300 ease-in-out sm:translate-x-0',
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
              className="hidden text-primary-foreground/60 hover:bg-white/10 hover:text-primary-foreground sm:inline-flex"
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
          className="text-primary-foreground/60 hover:bg-white/10 hover:text-primary-foreground sm:hidden"
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
          <div key={section.label ?? i} className={cn({ 'mt-3': i > 0 })}>
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
                          'bg-white/20 text-primary-foreground': isActive,
                          'text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground':
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

      {/* User menu */}
      <div className="mt-auto border-t border-white/10 w-full">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-3 text-sm text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground',
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

// ─── Option C: Literary Serif ──────────────────────────────────────────────
// Navigation labels rendered in Cormorant Garamond — Yawp's editorial serif
// font. Clean white background. Active item gets coral text and a left accent
// rule. No filled backgrounds anywhere. Like a book's table of contents.
// Collapsed shows icon-only with coral dot for active.

export function SidebarLiterarySerif({
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
        'z-20 flex h-full -translate-x-full flex-col border-r border-foreground/8 bg-white transition-all duration-300 ease-in-out sm:translate-x-0',
        navExpanded
          ? 'w-[248px] min-w-[248px]'
          : 'w-[56px] min-w-0 items-center',
        { 'translate-x-0': isMobileNavOpen }
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex shrink-0 items-center border-b border-foreground/6 px-5 py-5',
          {
            'justify-between': navExpanded,
            'justify-center px-2': !navExpanded,
          }
        )}
      >
        {navExpanded ? (
          <Link to=".">
            <img
              src="/img/logo_for_light_mode.png"
              alt="Logo"
              className="h-8 w-auto"
            />
          </Link>
        ) : null}
        <NavStateSwitch>
          {({ state, fetcher }) => (
            <Button
              size="icon-sm"
              variant="ghost"
              className="hidden text-foreground/30 hover:text-foreground/70 sm:inline-flex"
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
          className="text-foreground/30 sm:hidden"
          onClick={() => setIsMobileNavOpen(false)}
        >
          <XIcon />
        </Button>
      </div>

      {/* Nav links — serif labels, no fill backgrounds */}
      <div
        className={cn('flex-1 overflow-y-auto py-4', {
          'px-4': navExpanded,
          'px-2': !navExpanded,
        })}
      >
        {sections.map((section, i) => (
          <div
            key={section.label ?? i}
            className={cn({ 'mt-6': i > 0 && navExpanded })}
          >
            {section.label && navExpanded ? (
              <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-foreground/30">
                {section.label}
              </p>
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
                        'group relative flex w-full items-center py-2',
                        navExpanded ? 'gap-3 pl-3 pr-2' : 'justify-center px-2',
                        {
                          'text-primary': isActive,
                          'text-foreground/50 hover:text-foreground/80': !isActive,
                        }
                      )}
                    >
                      {/* Left accent rule — only when expanded */}
                      {isActive && navExpanded ? (
                        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-primary" />
                      ) : null}

                      {/* Active dot — only when collapsed */}
                      {isActive && !navExpanded ? (
                        <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
                      ) : null}

                      <span className="shrink-0">{link.icon}</span>

                      {navExpanded ? (
                        <span
                          className="min-w-0 truncate text-[1.05rem] leading-snug"
                          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                        >
                          {link.label}
                        </span>
                      ) : null}
                    </Link>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* User menu — also serif */}
      <div className="mt-auto border-t border-foreground/8 w-full">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-3 px-5 py-4 text-foreground/40 hover:text-foreground/70',
                { 'justify-center': !navExpanded }
              )}
            >
              <Settings2 size={14} className="shrink-0" />
              {navExpanded ? (
                <span
                  className="text-sm"
                  style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                >
                  Settings
                </span>
              ) : null}
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

// ─── Option D: Cream Cards ─────────────────────────────────────────────────
// Each navigation item is a distinct raised card on a cream background.
// Active item gets a coral left border, stronger shadow, and full saturation.
// Collapsed: icon-only cards in a tight stack.
// The sidebar feels tactile — like pulling a tab from a card file.

export function SidebarCreamCards({
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
          ? 'w-[224px] min-w-[224px]'
          : 'w-[64px] min-w-0 items-center',
        { 'translate-x-0': isMobileNavOpen },
        'bg-[#f3f0e8] border-r border-[#e8e3d7]'
      )}
    >
      {/* Header */}
      <div
        className={cn('flex shrink-0 items-center px-3 py-3', {
          'justify-between': navExpanded,
          'justify-center': !navExpanded,
        })}
      >
        {navExpanded ? (
          <Link to="." className="px-1">
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
              className="hidden text-[#8a7f6e] hover:bg-[#e8e3d7] hover:text-[#3a3428] sm:inline-flex"
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
          className="text-[#8a7f6e] hover:bg-[#e8e3d7] sm:hidden"
          onClick={() => setIsMobileNavOpen(false)}
        >
          <XIcon />
        </Button>
      </div>

      {/* Nav cards */}
      <div
        className={cn('flex-1 overflow-y-auto', {
          'space-y-1.5 px-3 py-2': navExpanded,
          'space-y-1.5 px-2 py-2': !navExpanded,
        })}
      >
        {sections.map((section, i) => (
          <div key={section.label ?? i} className={cn({ 'mt-3': i > 0 && navExpanded })}>
            {section.label && navExpanded ? (
              <p className="mb-1.5 px-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[#8a7f6e]">
                {section.label}
              </p>
            ) : null}
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
                      'relative flex w-full items-center overflow-hidden rounded-xl text-sm',
                      navExpanded ? 'gap-3 px-3 py-2.5' : 'justify-center px-2 py-2.5',
                      isActive
                        ? 'bg-white text-[#3a3428] shadow-sm ring-1 ring-[#e07856]/20'
                        : 'text-[#6b6052] hover:bg-[#ece8de] hover:text-[#3a3428]'
                    )}
                  >
                    {/* Coral left accent — only when active and expanded */}
                    {isActive ? (
                      <span
                        className={cn(
                          'absolute left-0 inset-y-0 w-[3px] rounded-r-full bg-primary',
                          { hidden: !navExpanded }
                        )}
                      />
                    ) : null}
                    <span className={cn('shrink-0', { 'text-primary': isActive })}>
                      {link.icon}
                    </span>
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
      <div className="mt-auto border-t border-[#e8e3d7] w-full">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-3 px-3 py-3.5 text-sm text-[#8a7f6e] hover:bg-[#e8e3d7] hover:text-[#3a3428]',
                { 'justify-center': !navExpanded }
              )}
            >
              <Settings2 size={15} className="shrink-0" />
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
