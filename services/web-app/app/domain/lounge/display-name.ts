/** The name of the shared, sign-in-less account the team posts launch questions from. */
export const LOUNGE_TEAM_ACCOUNT_NAME = 'Yawp! team';
/**
 * The account's name before the brand was spelled Yawp!. An account created
 * then keeps this name in the database (the seed never renames it), so it is
 * still recognised, and shown with the current spelling.
 */
export const LOUNGE_TEAM_ACCOUNT_LEGACY_NAME = 'YAWP! team';
export const LOUNGE_TEAM_ACCOUNT_NAMES = [LOUNGE_TEAM_ACCOUNT_NAME, LOUNGE_TEAM_ACCOUNT_LEGACY_NAME];

/** Whether a stored user name is the shared team account's, in either spelling. */
export function isLoungeTeamAccountName(name: string | null | undefined): boolean {
  return LOUNGE_TEAM_ACCOUNT_NAMES.includes((name ?? '').trim());
}

export type LoungeDisplayNameStyleKey =
  | 'FULL_NAME'
  | 'FIRST_NAME_LAST_INITIAL'
  | 'FIRST_NAME_ONLY';

export const DEFAULT_LOUNGE_DISPLAY_NAME_STYLE: LoungeDisplayNameStyleKey =
  'FIRST_NAME_LAST_INITIAL';

/** How a name appears to teachers at other schools. */
export function loungeDisplayName(
  name: string | null | undefined,
  style: LoungeDisplayNameStyleKey
): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'A teacher';
  if (style === 'FULL_NAME') return words.join(' ');
  if (style === 'FIRST_NAME_ONLY' || words.length === 1) return words[0];
  const last = words[words.length - 1];
  return `${words[0]} ${last.charAt(0).toUpperCase()}.`;
}

/**
 * The name and the grey detail after it ("Maria S." · "Cristo Rey"). Teachers
 * always appear as first name and last initial (Brian's launch rule); the
 * stored style is kept for old rows but no longer chosen. The Yawp! team
 * appears by full name.
 */
export function loungeByline(params: {
  name: string | null | undefined;
  style: LoungeDisplayNameStyleKey | null | undefined;
  schoolName: string | null | undefined;
  isStaff: boolean;
}): { name: string; detail: string | null } {
  if (params.isStaff) {
    // The shared team account is already called "Yawp! team".
    if (isLoungeTeamAccountName(params.name)) return { name: LOUNGE_TEAM_ACCOUNT_NAME, detail: null };
    return { name: loungeDisplayName(params.name, 'FULL_NAME'), detail: LOUNGE_TEAM_ACCOUNT_NAME };
  }
  return {
    name: loungeDisplayName(params.name, DEFAULT_LOUNGE_DISPLAY_NAME_STYLE),
    detail: params.schoolName?.trim() || null,
  };
}
