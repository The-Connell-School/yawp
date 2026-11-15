/**
 * How to Teach It (Brian, Nov 2 2026): on an assignment-type page, teachers see
 * each module as a teaching step — what students do and how the tutor helps
 * (the module description) — with that step's lesson and tutorial video.
 * Students, and everyone while the flag is off, keep the plain Modules list.
 */

/**
 * A module's lesson or tutorial link, as an admin typed it. Only http(s) links
 * and in-app paths survive; anything else (blank, `javascript:`, `//host`, no
 * scheme) becomes null so the link is simply not shown.
 */
export function normalizeTeachLink(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (value.startsWith('/')) return value.startsWith('//') ? null : value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
}

/** Absolute links (videos, Drive) open in a new tab; in-app paths do not. */
export function isExternalTeachLink(href: string): boolean {
  return !href.startsWith('/');
}

export function showHowToTeachIt({
  isTeacher,
  flagEnabled,
  modulesVisible,
}: {
  isTeacher: boolean;
  flagEnabled: boolean;
  modulesVisible: boolean;
}): boolean {
  return isTeacher && flagEnabled && modulesVisible;
}
