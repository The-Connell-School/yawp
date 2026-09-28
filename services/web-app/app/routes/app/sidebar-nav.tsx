import { Link } from 'react-router';
import {
  BookOpenIcon,
  NotebookPen,
  CogIcon,
  FileText,
  GaugeIcon,
  LockIcon,
  Microscope,
  MonitorPlay,
  Users,
} from 'lucide-react';
import { Tooltip } from '~/components/ui/tooltip';
import { cn } from '~/utils/misc';
import type { useUser } from '~/hooks/useUser';

type User = ReturnType<typeof useUser>;

type RequiresFn = (
  user: User,
) => boolean | null | undefined;

export type SidebarNavLink = {
  to: string;
  label: string;
  end?: boolean;
  icon: React.ReactNode;
  requires?:
    | { OR: RequiresFn[] }
    | { AND: RequiresFn[] }
    | RequiresFn;
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
// Reporter and Writing Practice are now always on for all orgs.
// Keep role-based visibility (Reporter is teacher-only; Writing Practice is for teachers and students).
const reporterEnabled = (user: User) => teacher(user);
const writingPracticeEnabled = (user: User) => teacher(user) || student(user);

const icons = {
  dashboard: <GaugeIcon size={20} className="shrink-0" />,
  classes: <Users size={20} className="shrink-0" />,
  studentWork: <FileText size={20} className="shrink-0" />,
  assignments: <NotebookPen size={20} className="shrink-0" />,
  myDocuments: <FileText size={20} className="shrink-0" />,
  lounge: <MonitorPlay size={20} className="shrink-0" />,
  reporter: <Microscope size={20} className="shrink-0" />,
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
        requires: teacher,
      },
      {
        to: '/app/reporter',
        label: 'Reporter',
        icon: icons.reporter,
        requires: reporterEnabled,
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
};

export function SidebarNavLinks({
  sections,
  user,
  navExpanded,
  pathname,
  isAppNavLinkActive,
  forceFullNavigation = false,
}: SidebarNavLinksProps) {
  const visibleSections = getVisibleSidebarSections(
    sections,
    user
  );

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
              const isActive = isAppNavLinkActive(link.to, pathname);
              const className = cn(
                'flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
                {
                  'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary':
                    isActive,
                  'py-2': !navExpanded,
                }
              );

              if (forceFullNavigation) {
                return (
                  <Link
                    key={link.to}
                    aria-current={isActive ? 'page' : undefined}
                    className={className}
                    reloadDocument
                    to={link.to}
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
                      <span className="w-full min-w-0">{link.label}</span>
                    ) : null}
                  </Link>
                );
              }

              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={isActive ? 'page' : undefined}
                  className={className}
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
                    <span className="w-full min-w-0">{link.label}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
