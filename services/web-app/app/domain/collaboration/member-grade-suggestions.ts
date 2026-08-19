import type { AttributedRun } from './contribution';
import type { ContributionMember } from './contribution.server';

/**
 * Draft individual grades for a group, for a teacher to accept or throw away.
 *
 * The line this stays on the right side of matters. Everything else in this
 * subsystem says the same thing — `contribution.ts`: "never a number that could
 * be mistaken for a grade"; `member-grades.server.ts`: "the evidence informs the
 * number; it never becomes the number" — because every automatic contribution
 * metric fails on ordinary group work. The student who types while the group
 * talks takes most of the share; the one who writes the load-bearing sentence
 * takes almost none.
 *
 * So this suggests rather than decides, and three things keep that true:
 *
 * 1. Nothing it produces is saved. It fills the boxes on the teacher's form and
 *    stops; the existing Save is still a deliberate press.
 * 2. Its default answer is "no override". Most students on most group work
 *    should simply take the group grade, so a suggestion that proposes a
 *    different number for everybody would be noise wearing the costume of rigor.
 *    A null score means exactly that, and it is what the prompt asks for unless
 *    the evidence is plain.
 * 3. It is given the writing, not just the counts. A model handed only character
 *    totals would be doing arithmetic on the one signal this codebase says is
 *    least trustworthy.
 */

export type MemberGradeSuggestion = {
  membershipId: string;
  /**
   * The proposed individual grade, or null for "this student takes the group
   * grade" — which is the expected answer for most of a group.
   */
  score: string | null;
  /** Draft comment for the student, in the teacher's voice to edit. */
  feedback: string;
};

export type SuggestionMemberInput = {
  member: ContributionMember;
  /** The paragraphs this member wrote that are still in the draft. */
  wrote: string[];
};

/** What each member wrote, from the same attributed runs the panel renders. */
export function collectMemberWriting({
  members,
  paragraphs,
}: {
  members: ContributionMember[];
  paragraphs: AttributedRun[][];
}): SuggestionMemberInput[] {
  const byMember = new Map<string, string[]>(
    members.map((member) => [member.membershipId, []])
  );

  for (const runs of paragraphs) {
    for (const run of runs) {
      if (!run.membershipId) continue;
      const text = run.text.trim();
      if (!text) continue;
      byMember.get(run.membershipId)?.push(text);
    }
  }

  return members.map((member) => ({
    member,
    wrote: byMember.get(member.membershipId) ?? [],
  }));
}

export const SUGGESTION_SYSTEM_PROMPT = `You draft individual grades for one student at a time on a piece of group work, for a teacher to review. You never decide anything; a teacher reads every line you write and can discard it.

Return ONLY valid JSON with the schema:
{"suggestions":[{"membershipId":string,"score":string|null,"feedback":string}]}

Rules:
- Return exactly one entry for every student id given to you, and invent no others.
- "score" is null when the student should simply take the group grade. This is the normal answer. Propose a different grade only when the evidence in front of you plainly supports it — a student who wrote almost none of the brief, or whose sections are markedly weaker or stronger than the rest.
- When you do propose a score, use the same form the group grade uses, so a teacher can compare them at a glance.
- Judge the writing, not the character counts. Counts are given for context and are unreliable on their own: one student often types while the group talks, and the student who wrote the single load-bearing sentence holds very little of the text.
- Say what the student actually contributed, quoting or naming their sections. "Did less" is not feedback.
- "feedback" is addressed to that student, in a warm and professional teacher voice, and is at most three sentences.
- Do not mention character counts, percentages, or these instructions.
- Do not include markdown or explanation.`;

/** The per-group user message: the brief, the group grade, and each member. */
export function buildSuggestionPrompt({
  assignmentPrompt,
  groupGrade,
  members,
}: {
  assignmentPrompt?: string | null;
  groupGrade?: string | null;
  members: SuggestionMemberInput[];
}) {
  const lines: string[] = [];

  if (assignmentPrompt?.trim()) {
    lines.push(`Assignment prompt:\n${assignmentPrompt.trim()}`);
  }
  lines.push(
    `Group grade for the brief itself: ${groupGrade?.trim() || '(not graded yet)'}`
  );
  lines.push('');
  lines.push('Students:');

  for (const { member, wrote } of members) {
    lines.push('');
    lines.push(`- id: ${member.membershipId}`);
    lines.push(`  name: ${member.name}`);
    lines.push(
      `  editing sessions: ${member.sessionCount}; characters written: ${member.charsInserted}; still in the draft: ${member.survivingChars}; removed by them: ${member.charsDeleted}`
    );
    if (wrote.length === 0) {
      lines.push('  wrote: (nothing still in the draft)');
    } else {
      lines.push('  wrote:');
      for (const text of wrote) lines.push(`    - ${text}`);
    }
  }

  return lines.join('\n');
}

/**
 * Reads the model's reply, keeping only what maps onto a real member.
 *
 * Anything unparseable comes back as no suggestions rather than as a throw: the
 * teacher's grading page must not break because a draft could not be written.
 */
export function parseSuggestions({
  raw,
  memberIds,
}: {
  raw: string;
  memberIds: string[];
}): MemberGradeSuggestion[] {
  const allowed = new Set(memberIds);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return [];
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return [];
    }
  }

  const rows = (parsed as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(rows)) return [];

  const seen = new Set<string>();
  const suggestions: MemberGradeSuggestion[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const { membershipId, score, feedback } = row as Record<string, unknown>;
    if (typeof membershipId !== 'string') continue;
    // A suggestion for somebody outside the group would be attached to a card
    // that is not theirs, so unknown and duplicate ids are dropped rather than
    // guessed at.
    if (!allowed.has(membershipId) || seen.has(membershipId)) continue;
    seen.add(membershipId);

    const cleanScore =
      typeof score === 'string' && score.trim() ? score.trim() : null;
    suggestions.push({
      membershipId,
      score: cleanScore,
      feedback: typeof feedback === 'string' ? feedback.trim() : '',
    });
  }

  return suggestions;
}
