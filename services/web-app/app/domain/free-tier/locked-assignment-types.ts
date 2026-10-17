/**
 * Assignment types a free classroom doesn't include, shown to its teacher as
 * grayed-out tiles beside the free ones. A locked tile isn't a dead end: it
 * opens that type's "See how it works" guide as a teaser. See
 * docs/free-tier/locked-assignment-types.md.
 *
 * These are plain data, not database rows. A free classroom has no link to a
 * paid type, and a preview or local database may not have the type at all,
 * so nothing here may depend on it.
 *
 * Shared by the server and the browser, so nothing here may import server
 * code.
 */

export type LockedAssignmentTypeTeaser = {
  /** The teaser's address: /app/assignment-type-previews/<slug>. */
  slug: string;
  title: string;
  /** Tile art, served from public/. */
  image: string;
};

export const LOCKED_ASSIGNMENT_TYPE_TEASERS = [
  {
    slug: 'thesis-driven-essay',
    title: 'The Thesis-Driven Essay',
    image: '/img/thesis-essay-guide/hero.jpg',
  },
  {
    slug: 'ap-history-essay',
    title: 'AP History Essay',
    image: '/img/ap-history-guide/card.webp',
  },
  {
    slug: 'daily-pages',
    title: 'Daily Pages',
    // The card art Daily Pages has on a paid school's dashboard.
    image: '/img/daily-pages-guide/card.jpg',
  },
] as const satisfies readonly LockedAssignmentTypeTeaser[];

export type LockedAssignmentTypeSlug =
  (typeof LOCKED_ASSIGNMENT_TYPE_TEASERS)[number]['slug'];

/** Same audience as the free-tier page tours. */
export function lockedAssignmentTypeTeasersAvailable({
  freeTierEnabled,
  role,
  plan,
}: {
  freeTierEnabled: boolean;
  role: string | null | undefined;
  plan: string | null | undefined;
}) {
  return freeTierEnabled && role === 'TEACHER' && plan === 'FREE_CLASSROOM';
}

/** The locked tiles to show this viewer, or none. */
export function lockedAssignmentTypeTeasersFor(viewer: {
  freeTierEnabled: boolean;
  role: string | null | undefined;
  plan: string | null | undefined;
}): LockedAssignmentTypeTeaser[] {
  if (!lockedAssignmentTypeTeasersAvailable(viewer)) return [];
  return LOCKED_ASSIGNMENT_TYPE_TEASERS.map(({ slug, title, image }) => ({
    slug,
    title,
    image,
  }));
}

export function findLockedAssignmentTypeTeaser(
  slug: string | null | undefined
): (typeof LOCKED_ASSIGNMENT_TYPE_TEASERS)[number] | null {
  if (!slug) return null;
  return (
    LOCKED_ASSIGNMENT_TYPE_TEASERS.find((teaser) => teaser.slug === slug) ??
    null
  );
}
