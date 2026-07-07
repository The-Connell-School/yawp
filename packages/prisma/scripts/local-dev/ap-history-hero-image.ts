import { readFileSync } from 'node:fs';

// Card/hero art for the AP History Essay assignment type: an illustrated
// collage of history eras. Stored as a committed image asset and seeded as an
// AssignmentTypeImage blob, served through the existing /api/image/course/:id
// route.

export const AP_HISTORY_HERO_IMAGE = {
  contentType: 'image/webp',
  altText:
    'Illustrated collage of history eras: Ancient Egypt, Ancient Greece, the Roman Empire, Medieval Times, the Age of Exploration, and the Napoleonic Era.',
} as const;

export function apHistoryHeroImageBytes(): Buffer {
  return readFileSync(
    new URL('./assets/ap-history-hero.webp', import.meta.url)
  );
}
