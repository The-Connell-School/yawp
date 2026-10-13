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
 * The name and the grey detail after it ("Maria S." · "Cristo Rey"). The
 * Yawp team always appears by full name. A teacher who chose first name only
 * keeps their school hidden.
 */
export function loungeByline(params: {
  name: string | null | undefined;
  style: LoungeDisplayNameStyleKey | null | undefined;
  schoolName: string | null | undefined;
  isStaff: boolean;
}): { name: string; detail: string | null } {
  if (params.isStaff) {
    return { name: loungeDisplayName(params.name, 'FULL_NAME'), detail: 'Yawp team' };
  }
  const style = params.style ?? DEFAULT_LOUNGE_DISPLAY_NAME_STYLE;
  return {
    name: loungeDisplayName(params.name, style),
    detail: style === 'FIRST_NAME_ONLY' ? null : params.schoolName?.trim() || null,
  };
}
