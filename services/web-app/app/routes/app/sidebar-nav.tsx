import { Link, useRouteLoaderData } from 'react-router';
import type { Route as RootRoute } from '../../+types/root';
import {
  BookOpenIcon,
  NotebookPen,
  CogIcon,
  FileText,
  GaugeIcon,
  Lightbulb,
  LockIcon,
  Microscope,
  MonitorPlay,
  MessageSquare,
  Users,
} from 'lucide-react';
import { Tooltip } from '~/components/ui/tooltip';
import { cn } from '~/utils/misc';
import type { useUser } from '~/hooks/useUser';
import { LOUNGE_NAME } from '~/domain/lounge/launch';
import { isTeacherLoungeTemporarilyDisabledForUser } from '~/domain/teacher-lounge/teacher-lounge-temporary-disable';

type User = ReturnType<typeof useUser>;

type RequiresFn = (
  user: User,
) => boolean | null | undefined;

export type SidebarNavLink = {
  to: string;
  label: string;
  end?: boolean;
  icon: React.ReactNode;
  alsoActiveFor?: string[];
  requires?: { OR: RequiresFn[] } | { AND: RequiresFn[] } | RequiresFn;
};

export type SidebarNavSection = {
  label?: string;
  links: SidebarNavLink[];
};

const teacher = (user: User) =>
  user.selectedMembership?.role === 'TEACHER';
const student = (user: User) => user.selectedMembership?.role === 'STUDENT';
const owner = (user: User) => user.selectedMembership?.isOrgOwner;
const admin = (user: User) => user.isAdmin;
const reporterNavVisible = (user: User) =>
  teacher(user) &&
  user.selectedMembership?.organization?.plan !== 'FREE_CLASSROOM';
const lessonPlannerNavVisible = (user: User) => teacher(user);
const teacherLoungeNavVisible = (user: User) =>
  teacher(user) &&
  !isTeacherLoungeTemporarilyDisabledForUser({ email: user.email });
const writingPracticeEnabled = (user: User) => teacher(user) || student(user);

const icons = {
  dashboard: <GaugeIcon size={20} className="shrink-0" />,
  classes: <Users size={20} className="shrink-0" />,
  studentWork: <FileText size={20} className="shrink-0" />,
  assignments: <NotebookPen size={20} className="shrink-0" />,
  myDocuments: <FileText size={20} className="shrink-0" />,
  lounge: <MonitorPlay size={20} className="shrink-0" />,
  loungeCommunity: <MessageSquare size={20} className="shrink-0" />,
  reporter: <Microscope size={20} className="shrink-0" />,
  lessonPlanner: <Lightbulb size={20} className="shrink-0" />,
  writingPractice: <BookOpenIcon size={20} className="shrink-0" />,
  organization: <CogIcon size={20} className="shrink-0" />,
  admin: <LockIcon size={20} className="shrink-0" />,
};

export const FLAT_SIDEBAR_SECTIONS: SidebarNavSection[] = [
  {
    links: [
      {
        to: '/app',
        label: 'Dashboard',
        end: true,
        icon: icons.dashboard,
      },
      {
        to: '/app/my-classes',
        label: 'My Classes',
        icon: icons.classes,
        requires: { OR: [teacher, student] },
      },
      {
        to: '/app/assignments',
        label: 'My Assignments',
        icon: icons.assignments,
        requires: teacher,
      },
      {
        to: '/app/documents',
        label: 'Documents',
        icon: icons.studentWork,
        requires: teacher,
      },
      {
        to: '/app/my-documents',
        label: 'My Documents',
        icon: icons.myDocuments,
        requires: student,
      },
      {
        to: '/app/writing-lessons',
        label: 'Writing Practice',
        icon: icons.writingPractice,
        requires: writingPracticeEnabled,
      },
      {
        to: '/app/teacher-trainings',
        label: "Teacher's Lounge",
        icon: icons.lounge,
        requires: teacherLoungeNavVisible,
      },
      {
        to: '/app/reporter',
        label: 'Reporter',
        icon: icons.reporter,
        requires: reporterNavVisible,
      },
      {
        to: '/app/lesson-planner',
        label: 'Lesson Planner',
        icon: icons.lessonPlanner,
        requires: lessonPlannerNavVisible,
      },
      {
        to: '/app/organization',
        label: 'Organization',
        icon: icons.organization,
        requires: owner,
      },
      {
        to: '/app/admin',
        label: 'Admin',
        icon: icons.admin,
        requires: admin,
      },
    ],
  },
];

const LOUNGE_TRAININGS_PATH = '/app/teacher-trainings';
const LOUNGE_COMMUNITY_PATH = '/app/lounge';

/**
 * With teacher_lounge_community on, the Teacher's Lounge nav item opens the
 * community feed and stays highlighted on the course grid URL.
 */
export function applyLoungeCommunityLink(
  sections: SidebarNavSection[],
  enabled: boolean,
): SidebarNavSection[] {
  if (!enabled) return sections;
  return sections.map((section) => ({
    ...section,
    links: section.links.map((link) =>
      link.to === LOUNGE_TRAININGS_PATH
        ? {
            ...link,
            label: LOUNGE_NAME,
            to: LOUNGE_COMMUNITY_PATH,
            icon: icons.loungeCommunity,
            alsoActiveFor: [LOUNGE_TRAININGS_PATH],
          }
        : link,
    ),
  }));
}

/**
 * When teacher_lounge_community is off, per-user hide uses teacherLoungeNavVisible
 * on the nav link. When the community flag is on, legacy trainings URLs stay
 * reachable behind the org flag without stripping the nav item here.
 */
export function hideLegacyLoungeNavWhenDisabled(
  sections: SidebarNavSection[],
  _communityEnabled: boolean,
): SidebarNavSection[] {
  return sections;
}

export function isSidebarLinkActive(
  link: Pick<SidebarNavLink, 'to' | 'alsoActiveFor'>,
  pathname: string,
  isAppNavLinkActive: (linkTo: string, pathname: string) => boolean,
) {
  return (
    isAppNavLinkActive(link.to, pathname) ||
    (link.alsoActiveFor ?? []).some((path) => isAppNavLinkActive(path, pathname))
  );
}

function linkIsVisible(
  link: SidebarNavLink,
  user: User,
) {
  if (!link.requires) return true;

  if (typeof link.requires === 'function') {
    return link.requires(user);
  }

  if ('OR' in link.requires) {
    return link.requires.OR.some((rule) => rule(user));
  }

  return link.requires.AND.every((rule) => rule(user));
}

export function getVisibleSidebarSections(
  sections: SidebarNavSection[],
  user: User,
) {
  return sections
    .map((section) => ({
      ...section,
      links: section.links.filter((link) =>
        linkIsVisible(link, user)
      ),
    }))
    .filter((section) => section.links.length > 0);
}

type SidebarNavLinksProps = {
  sections: SidebarNavSection[];
  user: User;
  navExpanded: boolean;
  pathname: string;
  isAppNavLinkActive: (linkTo: string, pathname: string) => boolean;
  forceFullNavigation?: boolean;
  renderLinkTrailing?: (link: SidebarNavLink) => React.ReactNode;
  renderNavRow?: (input: {
    link: SidebarNavLink;
    isActive: boolean;
    rowClassName: string;
    linkClassName: string;
    icon: React.ReactNode;
  }) => React.ReactNode | null;
};

export function SidebarNavLinks({
  sections,
  user,
  navExpanded,
  pathname,
  isAppNavLinkActive,
  forceFullNavigation = false,
  renderLinkTrailing,
  renderNavRow,
}: SidebarNavLinksProps) {
  const rootData =
    useRouteLoaderData<RootRoute.ComponentProps['loaderData']>('root');
  const lessonPlannerFlagOn = rootData?.lessonPlannerEnabled ?? false;
  const teacherLoungeCommunityOn =
    rootData?.teacherLoungeCommunityEnabled ?? false;
  const visibleSections = getVisibleSidebarSections(
    hideLegacyLoungeNavWhenDisabled(
      applyLoungeCommunityLink(sections, teacherLoungeCommunityOn),
      teacherLoungeCommunityOn,
    ),
    user,
  )
    .map((section) => ({
      ...section,
      links: section.links.filter(
        (link) => link.to !== '/app/lesson-planner' || lessonPlannerFlagOn,
      ),
    }))
    .filter((section) => section.links.length > 0);

  return (
    <>
      {visibleSections.map((section, sectionIndex) => (
        <div
          key={section.label ?? `section-${sectionIndex}`}
          className={cn({ 'mt-3': sectionIndex > 0 && navExpanded })}
        >
          {section.label && navExpanded ? (
            <p className="mb-1 px-3 text-sm font-medium text-muted-foreground">
              {section.label}
            </p>
          ) : null}
          <div className="grid gap-1">
            {section.links.map((link) => {
              const isActive = isSidebarLinkActive(link, pathname, isAppNavLinkActive);
              const rowClassName = cn(
                'flex w-full items-center gap-1 rounded-xl px-3 py-2 text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
                {
                  'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary':
                    isActive,
                  'justify-center py-2': !navExpanded,
                }
              );
              const linkClassName = cn(
                'flex min-w-0 flex-1 items-center gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring',
                { 'flex-1': navExpanded, 'justify-center': !navExpanded }
              );
              const trailing = renderLinkTrailing?.(link);
              const icon = link.icon ? (
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
              ) : null;

              const linkBody = (
                <>
                  {icon}
                  {navExpanded ? (
                    <span className="min-w-0 truncate">{link.label}</span>
                  ) : null}
                </>
              );

              const customRow = renderNavRow?.({
                link,
                isActive,
                rowClassName,
                linkClassName,
                icon,
              });
              if (customRow) return customRow;

              if (forceFullNavigation) {
                return (
                  <div key={link.to} className={rowClassName}>
                    <Link
                      aria-current={isActive ? 'page' : undefined}
                      className={linkClassName}
                      reloadDocument
                      to={link.to}
                    >
                      {linkBody}
                    </Link>
                    {trailing}
                  </div>
                );
              }

              return (
                <div key={link.to} className={rowClassName}>
                  <Link
                    to={link.to}
                    aria-current={isActive ? 'page' : undefined}
                    className={linkClassName}
                  >
                    {linkBody}
                  </Link>
                  {trailing}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
