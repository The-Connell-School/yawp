/**
 * Plausible human first names used as stand-ins for real student/teacher
 * names before a prompt leaves our servers for a third-party AI provider.
 *
 * These are deliberately ordinary first names, NOT placeholders like
 * "Student A" or "[REDACTED]". The grading system prompt forces the model
 * to open its comment with the student's name; a placeholder reads as
 * stilted, robotic prose and is the biggest quality-regression risk in
 * this scheme, so the pseudonym has to read exactly like a name.
 *
 * Deliberately gender-diverse and culturally varied so no pseudonym
 * telegraphs anything about the real student it stands in for.
 *
 * HARD RULE: no entry here may also be an ordinary English word. A
 * pseudonym is the key `rehydrate()` uses to write a REAL student name
 * back into model output that is then persisted and shown to the teacher
 * and the student. An entry like "Drew", "Gray", "Lane" or "Robin" makes
 * every innocent "drew"/"gray"/"lane"/"robin" in the model's prose a
 * candidate for that rewrite, which silently corrupts feedback. Enforced
 * by pseudonym-pool.server.test.ts against COMMON_WORD_FIRST_NAMES.
 */
export const PSEUDONYM_FIRST_NAME_POOL: readonly string[] = [
  'Alex',
  'Jordan',
  'Taylor',
  'Morgan',
  'Casey',
  'Riley',
  'Jamie',
  'Avery',
  'Quinn',
  'Rowan',
  'Skylar',
  'Reese',
  'Emerson',
  'Emory',
  'Dakota',
  'Hayden',
  'Peyton',
  'Charlie',
  'Darcy',
  'Elliot',
  'Finley',
  'Harper',
  'Kai',
  'Logan',
  'Micah',
  'Noor',
  'Parker',
  'Remy',
  'Sam',
  'Toni',
  'Amara',
  'Beckett',
  'Cass',
  'Devon',
  'Ellis',
  'Frankie',
  'Blair',
  'Amani',
  'Jules',
  'Kendall',
  'Kiran',
  'Marlowe',
  'Nico',
  'Oakley',
  'Presley',
  'Linnea',
  'Shay',
  'Teagan',
  'Val',
  'Zuri',
] as const;
