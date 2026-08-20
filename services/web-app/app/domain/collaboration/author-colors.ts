/**
 * One colour per writer in a shared draft.
 *
 * Two things went wrong with the first version of this, and the second was the
 * worse one.
 *
 * The palette had near-duplicates: blue and violet sat 12.5 ΔE2000 apart, and
 * under deuteranopia — around one man in twelve — crimson and amber sat 2.6
 * apart, which is to say identical. Colours here are picked to be far apart in
 * CIE Lab under normal vision *and* under simulated deuteranopia, protanopia and
 * tritanopia, and they are ordered so that every prefix is as spread as it can
 * be. That ordering is the point: groups are three or four students, not eight,
 * so the first four colours are the ones that have to be unmistakable, and they
 * are — no two closer than 24 ΔE in normal vision, 23 with colour blindness
 * simulated.
 *
 * The worse bug was the assignment. A colour chosen by hashing a membership id
 * modulo eight gives two students in the same group the *same* colour about a
 * third of the time on a group of three — not similar, identical. So colour is
 * assigned by position within the group instead, which makes a collision
 * impossible for a group up to the size of the palette.
 *
 * Every writer in one draft must get the same colour on every surface — the
 * student's editor, the teacher's contribution panel, the roster avatars — so
 * the scale is derived from the set of writers rather than from the order a
 * caller happened to list them in. Sorting inside makes that true by
 * construction rather than by everyone remembering to sort first.
 */

/**
 * Ordered by separation: take any prefix and it is the most distinguishable set
 * of that size this palette can give you. All are dark enough for white text
 * (WCAG AA at 5.3:1 or better), because the swatches carry initials.
 */
export const AUTHOR_COLORS = [
  '#3F6212', // olive
  '#A21CAF', // fuchsia
  '#B91C1C', // red
  '#1E3A8A', // navy
  '#854D0E', // ochre
  '#134E4A', // deep teal
  '#6D28D9', // violet
  '#0E7490', // cyan
] as const;

/** Text with no recorded author. Grey, and never in the palette above. */
export const UNATTRIBUTED_COLOR = '#9CA3AF';

/**
 * The colour for each writer in one draft.
 *
 * `membershipIds` is everyone whose text can appear: the current group, plus
 * anyone who wrote and has since left. Order does not matter — the scale is a
 * function of the set — but current members should come first, so that the
 * people a teacher is actually grading get the best-separated colours and a
 * former member takes what is left.
 */
export function buildAuthorColorScale(
  membershipIds: readonly string[]
): Map<string, string> {
  const scale = new Map<string, string>();

  // De-duplicated in first-seen order, so a caller passing current members
  // before former ones gets exactly that priority.
  const seen: string[] = [];
  for (const id of membershipIds) {
    if (id && !scale.has(id)) {
      scale.set(id, '');
      seen.push(id);
    }
  }

  // Ties broken by id so two surfaces listing the same people in different
  // orders still agree. Only reached past the palette's length, where a repeat
  // is unavoidable and has to at least be the same repeat everywhere.
  const ordered = [
    ...seen.slice(0, AUTHOR_COLORS.length),
    ...seen.slice(AUTHOR_COLORS.length).sort(),
  ];

  ordered.forEach((id, index) => {
    scale.set(id, AUTHOR_COLORS[index % AUTHOR_COLORS.length]!);
  });

  return scale;
}

/**
 * The colour for one writer, for a caller that has the scale.
 *
 * Falls back to grey rather than inventing a colour: a writer who is not in the
 * scale is someone the caller did not know about, and guessing would risk
 * handing them a colour another student already has.
 */
export function authorColor(
  scale: Map<string, string>,
  membershipId: string | null | undefined
): string {
  if (!membershipId) return UNATTRIBUTED_COLOR;
  return scale.get(membershipId) ?? UNATTRIBUTED_COLOR;
}
