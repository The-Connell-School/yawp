/** Same timestamp on user+assistant pairs is common; tie-break on id for stable order. */
export function compareTutorMessagesByTimeThenId(
  a: { id: string; createdAt: Date | string },
  b: { id: string; createdAt: Date | string }
) {
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  if (ta !== tb) return ta - tb;
  return a.id.localeCompare(b.id);
}
