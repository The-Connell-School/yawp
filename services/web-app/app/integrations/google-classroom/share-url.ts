/**
 * URL construction for the Google Classroom "Share to Classroom" flow.
 *
 * Pure and dependency-free on purpose: these two functions are the whole
 * contract with Google in the link-out integration, so they are worth pinning
 * down in isolation from prisma, request handling and React.
 *
 * The flow this supports: a teacher in YAWP hands Classroom a URL, Classroom
 * asks them which course to post it to and creates the coursework itself, and
 * students click through from Classroom back into YAWP. YAWP never calls a
 * Google API and never holds a Google token, which is what lets this work for
 * every school rather than only the ones on Education Plus.
 *
 * See docs/integrations/google-classroom.md for the two richer integrations
 * this deliberately stops short of.
 */

/**
 * Google's share endpoint. Documented at
 * https://developers.google.com/workspace/classroom/guides/sharebutton.
 */
export const GOOGLE_CLASSROOM_SHARE_ENDPOINT =
  'https://classroom.google.com/share';

/** The Classroom item the teacher is prompted to create. */
export type GoogleClassroomItemType =
  | 'announcement'
  | 'assignment'
  | 'material'
  | 'question';

export type BuildShareUrlInput = {
  /** Absolute URL Classroom will host. Required by Google. */
  url: string;
  /** Prefills the Classroom item title. */
  title?: string | null;
  /** Prefills the Classroom item description. */
  body?: string | null;
  /**
   * Sending this makes Classroom open its creation dialog straight after the
   * teacher picks a course, rather than leaving them on a bare link post.
   */
  itemType?: GoogleClassroomItemType;
};

/**
 * Path of the public launch route. One definition so the route file, the share
 * URL and the tests cannot drift apart.
 */
export const CLASSROOM_LAUNCH_PATH_PREFIX = '/classroom/launch';

/**
 * The URL Classroom hosts and students click. Absolute, because Classroom
 * renders it on classroom.google.com where a relative path means nothing.
 */
export function buildClassroomLaunchUrl(origin: string, token: string): string {
  const trimmedOrigin = origin.replace(/\/+$/, '');
  return `${trimmedOrigin}${CLASSROOM_LAUNCH_PATH_PREFIX}/${encodeURIComponent(token)}`;
}

/**
 * The classroom.google.com URL that opens Google's "choose a class" dialog.
 *
 * Empty optional values are dropped rather than sent blank: Classroom shows a
 * literal empty title if handed one, which looks like a YAWP bug to a teacher.
 */
export function buildGoogleClassroomShareUrl({
  url,
  title,
  body,
  itemType = 'assignment',
}: BuildShareUrlInput): string {
  if (!url) {
    throw new Error('A share URL is required to build a Classroom share link.');
  }

  const params = new URLSearchParams({ url });
  const trimmedTitle = title?.trim();
  const trimmedBody = body?.trim();
  if (trimmedTitle) params.set('title', trimmedTitle);
  if (trimmedBody) params.set('body', trimmedBody);
  if (itemType) params.set('itemtype', itemType);

  return `${GOOGLE_CLASSROOM_SHARE_ENDPOINT}?${params.toString()}`;
}
