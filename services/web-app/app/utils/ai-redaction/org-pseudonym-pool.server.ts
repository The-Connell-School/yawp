/**
 * Plausible-sounding school/district names used as a stand-in for a real
 * organization name (e.g. "Meridian Academy" for "The Connell School")
 * before it reaches a third-party AI provider. Kept separate from the
 * person-name pool so a redacted org name reads like an institution, not
 * like a person, in a sentence such as "helps a teacher at {org}".
 */
export const ORG_PSEUDONYM_NAME_POOL: readonly string[] = [
  'Meridian Academy',
  'Lakeside School',
  'Northbridge Academy',
  'Cedar Hill School',
  'Fairview Academy',
  'Riverbend School',
  'Summit Preparatory Academy',
  'Elmwood School',
  'Harborview Academy',
  'Brookstone School',
] as const;
