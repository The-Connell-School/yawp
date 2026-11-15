/**
 * A numbered line's lead: "1. Protect your students." in "1. Protect your
 * students. No names, …". The House Rules (and any numbered list the YAWP!
 * team posts) set it in bold so each rule reads like a header (Brian's
 * review, Nov 11 2026).
 *
 * Only a one- or two-digit number counts, and the lead must end in . ? or !
 * before a space or the end of the line. A lead holding a mention token is
 * left alone, so a mention is never split.
 */
const NUMBERED_LEAD = /^(\d{1,2}\.\s+[^.?!\n]*?[.?!])(?=\s|$)/;

export function splitNumberedLead(line: string): { lead: string; rest: string } | null {
  const match = NUMBERED_LEAD.exec(line);
  if (!match) return null;
  const lead = match[1];
  if (lead.includes('@[')) return null;
  return { lead, rest: line.slice(lead.length) };
}
