import type { ReactNode, SVGProps } from 'react';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function AppNavSvg({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden
      width={17}
      height={17}
      viewBox="0 0 24 24"
      className="shrink-0"
      {...stroke}
      {...props}
    >
      {children}
    </svg>
  );
}

export const appSidebarIcons = {
  home: (
    <AppNavSvg>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </AppNavSvg>
  ),
  classes: (
    <AppNavSvg>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </AppNavSvg>
  ),
  assignments: (
    <AppNavSvg>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </AppNavSvg>
  ),
  documents: (
    <AppNavSvg>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </AppNavSvg>
  ),
  lessonPlanner: (
    <AppNavSvg>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </AppNavSvg>
  ),
  reporter: (
    <AppNavSvg>
      <path d="M6 18h8" />
      <path d="M3 22h18" />
      <path d="M14 22a7 7 0 1 0 0-14h-1" />
      <path d="M9 14h2" />
      <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
      <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
    </AppNavSvg>
  ),
  settings: (
    <AppNavSvg strokeWidth={1.75}>
      <path d="M20 7h-9" />
      <path d="M14 17H5" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
    </AppNavSvg>
  ),
} as const;

const APP_SIDEBAR_ICON_BY_PATH: Record<string, ReactNode> = {
  '/app': appSidebarIcons.home,
  '/app/my-classes': appSidebarIcons.classes,
  '/app/assignments': appSidebarIcons.assignments,
  '/app/documents': appSidebarIcons.documents,
  '/app/lesson-planner': appSidebarIcons.lessonPlanner,
  '/app/reporter': appSidebarIcons.reporter,
};

export function appSidebarIconForPath(path: string) {
  return APP_SIDEBAR_ICON_BY_PATH[path] ?? null;
}

export function sidebarNavIcon(path: string, fallback: ReactNode) {
  return appSidebarIconForPath(path) ?? fallback;
}

/** Primary /app nav destinations that always ship a custom icon. */
export function requiredAppSidebarIcon(path: string) {
  const icon = appSidebarIconForPath(path);
  if (!icon) {
    throw new Error(`Missing app sidebar icon for ${path}`);
  }
  return icon;
}
