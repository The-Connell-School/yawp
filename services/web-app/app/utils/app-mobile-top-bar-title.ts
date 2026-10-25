import {
  BreadcrumbHandleMatch,
  type BreadcrumbHandle,
} from '~/utils/breadcrumb';

/** Longest-prefix wins — covers child routes whose leaf match has no breadcrumb handle. */
const APP_PATH_PREFIX_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: '/app/reporter', title: 'Reporter' },
  { prefix: '/app/lesson-planner', title: 'Lesson Planner' },
  { prefix: '/app/my-classes', title: 'My Classes' },
  { prefix: '/app/assignments', title: 'My Assignments' },
  { prefix: '/app/documents', title: 'Documents' },
  { prefix: '/app/my-documents', title: 'My Documents' },
  { prefix: '/app/writing-lessons', title: 'Writing Lessons' },
  { prefix: '/app/organization', title: 'Organization' },
  { prefix: '/app/admin', title: 'Admin' },
  { prefix: '/app/settings', title: 'Settings' },
  { prefix: '/app/free-tier/pending', title: 'Approval status' },
  { prefix: '/app/free-tier/status', title: 'Approval status' },
].sort((a, b) => b.prefix.length - a.prefix.length);

function normalizePathname(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function breadcrumbTitlesFromMatches(
  matches: Array<{ handle?: BreadcrumbHandle | unknown }>
): string[] {
  const titles: string[] = [];
  for (const match of matches) {
    const parsed = BreadcrumbHandleMatch.safeParse(match);
    if (!parsed.success) continue;
    const crumb = parsed.data.handle.breadcrumb;
    if (typeof crumb === 'string') titles.push(crumb);
  }
  return titles;
}

function titleFromPathPrefix(pathname: string): string | null {
  const normalized = normalizePathname(pathname);
  for (const entry of APP_PATH_PREFIX_TITLES) {
    if (
      normalized === entry.prefix ||
      normalized.startsWith(`${entry.prefix}/`)
    ) {
      return entry.title;
    }
  }
  return null;
}

/** Mobile app shell top bar label — deepest breadcrumb, never a stray "Home" off `/app`. */
export function resolveAppMobileTopBarTitle(
  matches: Array<{ handle?: BreadcrumbHandle | unknown }>,
  pathname: string
): string {
  const normalized = normalizePathname(pathname);
  if (normalized === '/app') return 'Dashboard';

  const titles = breadcrumbTitlesFromMatches(matches);
  const deepest = titles.at(-1);
  if (deepest && deepest !== 'Home') return deepest;

  const fromPrefix = titleFromPathPrefix(normalized);
  if (fromPrefix) return fromPrefix;

  if (deepest) return deepest;
  return 'Dashboard';
}

export function appRouteDocumentTitle(mobileTitle: string): string {
  if (mobileTitle === 'Dashboard') return 'Yawp!';
  return `${mobileTitle} | Yawp!`;
}
