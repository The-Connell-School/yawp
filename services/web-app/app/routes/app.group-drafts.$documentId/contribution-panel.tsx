import { useState } from 'react';
import { useFetcher } from 'react-router';
import {
  authorColor,
  buildAuthorColorScale,
  UNATTRIBUTED_COLOR,
} from '~/domain/collaboration/author-colors';
import { Button } from '~/components/ui/button';
import type {
  ContributionBreakdown,
  ContributionMember,
} from '~/domain/collaboration/contribution.server';
import type { AttributedRun } from '~/domain/collaboration/contribution';
import { effectiveGrade } from '~/domain/collaboration/grading';
import { fieldsForSuggestion } from '~/domain/collaboration/member-grade-suggestions';
import type { MemberGradeSuggestion } from '~/domain/collaboration/member-grade-suggestions';
import type { GroupGrade, MemberGrade } from '~/domain/collaboration/grading';

/**
 * Evidence about who wrote a shared draft, for a teacher to read and judge.
 *
 * Ordered by how much it actually tells you, which is close to the reverse of
 * how tempting each signal is:
 *
 * 1. The draft itself, tinted by author. A teacher can see who wrote the
 *    conclusion in about two seconds, and can check every number below against
 *    it.
 * 2. When each student worked, and across how many sittings. The best free-rider
 *    signal available, and it does not reward verbosity.
 * 3. Written / still here / removed, side by side — the split that keeps a
 *    student who tightened a partner's paragraph from reading as a freeloader.
 *
 * The share column answers "who did more", which is a real question — but it is
 * a share of *characters currently in the draft*, not of the work, and the panel
 * says so directly under the table. Nothing computes a grade from it: the
 * individual grade is typed by the teacher, informed by everything here.
 */

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function formatWhen(iso: string | null) {
  if (!iso) return '—';
  return dateFormat.format(new Date(iso));
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * One student's grade, saved on its own.
 *
 * A fetcher per student so marking one does not disturb a comment being typed
 * for another, and nothing navigates part-way through a group.
 */
function MemberGradeCard({
  membershipId,
  name,
  color,
  grade,
  groupGrade,
  suggestion,
}: {
  membershipId: string;
  name: string;
  color: string;
  grade?: MemberGrade;
  groupGrade: GroupGrade | null;
  /** A draft waiting in the boxes, never something already recorded. */
  suggestion?: MemberGradeSuggestion;
}) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  const saving = fetcher.state !== 'idle';
  const error =
    fetcher.data && fetcher.data.success === false ? fetcher.data.message : '';
  const released = Boolean(grade?.releasedAt);
  const effective = effectiveGrade({ member: grade, groupGrade });

  const savedScore = grade?.score ?? '';
  const savedFeedback = grade?.feedback ?? '';

  // Controlled, because a suggestion has to be able to fill these boxes after
  // they have already rendered — `defaultValue` only ever lands once.
  const [fields, setFields] = useState({
    score: savedScore,
    feedback: savedFeedback,
  });
  // The suggestion already dealt with, so one arriving is applied exactly once
  // and a teacher who discards it does not get it straight back.
  const [applied, setApplied] = useState<MemberGradeSuggestion | null>(null);
  const [showingDraft, setShowingDraft] = useState(false);
  const [savedKey, setSavedKey] = useState(`${savedScore}\u0000${savedFeedback}`);

  const currentSavedKey = `${savedScore}\u0000${savedFeedback}`;
  if (currentSavedKey !== savedKey) {
    // A save landed and the loader revalidated: the server's copy is the truth
    // now, and anything still marked as a draft has become a real grade.
    setSavedKey(currentSavedKey);
    setFields({ score: savedScore, feedback: savedFeedback });
    setShowingDraft(false);
  }

  if (suggestion && suggestion !== applied) {
    setApplied(suggestion);
    setShowingDraft(true);
    setFields(fieldsForSuggestion({ suggestion, savedScore, savedFeedback }));
  }

  const discardDraft = () => {
    setShowingDraft(false);
    setFields({ score: savedScore, feedback: savedFeedback });
  };

  return (
    <fetcher.Form method="post" className="grid gap-2 rounded-lg border p-4">
      <input type="hidden" name="membershipId" value={membershipId} />

      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-medium text-white"
            style={{ backgroundColor: color }}
          >
            {initials(name)}
          </span>
          {name}
        </span>
        <span
          className={`text-xs ${released ? 'text-green-700' : 'text-muted-foreground'}`}
        >
          {released ? 'Visible to student' : 'Not shared yet'}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        {effective.source === 'group'
          ? `Currently takes the group grade (${effective.score}).`
          : effective.source === 'individual'
            ? 'Graded individually.'
            : 'No grade yet.'}
      </p>

      <label className="grid gap-1 text-sm">
        Their own grade{' '}
        <span className="font-normal text-muted-foreground">
          — leave blank to use the group grade
        </span>
        <input
          type="text"
          name="score"
          value={fields.score}
          onChange={(event) =>
            setFields((current) => ({ ...current, score: event.target.value }))
          }
          placeholder={groupGrade?.score ?? '18/20, A-, meets expectations…'}
          maxLength={64}
          className="rounded border px-2 py-1"
        />
      </label>

      <label className="grid gap-1 text-sm">
        Comment for this student
        <textarea
          name="feedback"
          value={fields.feedback}
          onChange={(event) =>
            setFields((current) => ({
              ...current,
              feedback: event.target.value,
            }))
          }
          rows={3}
          className="rounded border px-2 py-1"
        />
      </label>

      {showingDraft ? (
        <div
          className="rounded border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          data-testid="member-grade-draft-notice"
        >
          <p>
            <span className="font-medium">Drafted, not saved.</span> Edit
            anything here, then press Save — nothing reaches this student until
            you do.
          </p>
          {applied?.score === null ? (
            <p className="mt-1">
              The assistant did not suggest a separate grade for them, so the
              grade box is untouched.
            </p>
          ) : null}
          <button
            type="button"
            onClick={discardDraft}
            className="mt-1 underline underline-offset-2"
          >
            Discard this draft
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          Save
        </Button>
        {/* Releasing is a separate press, so a half-written grade cannot reach a
            student by reflex. */}
        <Button
          type="submit"
          size="sm"
          variant="outline"
          name="release"
          value={released ? 'false' : 'true'}
          disabled={saving}
        >
          {released ? 'Take back' : 'Save and share with student'}
        </Button>
        {/* Explicit undo for a teacher who overrode by mistake, so they do not
            have to work out that clearing the box is what does it. */}
        {effective.source === 'individual' ? (
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            name="useGroupGrade"
            value="true"
            disabled={saving}
          >
            Use group grade
          </Button>
        ) : null}
      </div>
    </fetcher.Form>
  );
}

/**
 * The individual grades, and the one button that drafts them.
 *
 * The button lives here rather than on each card because the assistant reads
 * the group as a whole: what one student contributed only means anything beside
 * what the others did.
 *
 * What comes back is put in the boxes and nowhere else. No response from this
 * fetcher is saved — each card still has its own Save, which is what the teacher
 * has always pressed.
 */
function MemberGradesSection({
  members,
  grades,
  groupGrade,
  colorScale,
  hasWriting,
}: {
  members: ContributionMember[];
  grades: Record<string, MemberGrade>;
  groupGrade: GroupGrade | null;
  colorScale: Map<string, string>;
  hasWriting: boolean;
}) {
  const fetcher = useFetcher<{
    success?: boolean;
    message?: string;
    suggestions?: MemberGradeSuggestion[];
  }>();
  const drafting = fetcher.state !== 'idle';
  const error =
    fetcher.data && fetcher.data.success === false ? fetcher.data.message : '';
  // A fresh array each response, so asking twice re-fills the boxes rather than
  // looking like nothing happened.
  const suggestionFor = new Map(
    (fetcher.data?.suggestions ?? []).map((suggestion) => [
      suggestion.membershipId,
      suggestion,
    ])
  );

  return (
    <section aria-labelledby="contribution-grades">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id="contribution-grades" className="text-sm font-semibold">
          Individual grades
        </h2>
        {hasWriting ? (
          <fetcher.Form method="post">
            <input
              type="hidden"
              name="intent"
              value="suggest-member-grades"
            />
            <Button type="submit" size="sm" variant="outline" disabled={drafting}>
              {drafting
                ? 'Reading the draft…'
                : 'Grade individual contributions'}
            </Button>
          </fetcher.Form>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Everyone takes the group grade unless you give them their own here, for
        what they contributed — yours to decide, not calculated from the numbers
        above. The assistant can draft these from who wrote what; it fills the
        boxes and saves nothing. Students see nothing until you share it.
      </p>

      {error ? (
        <p className="mb-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {members.map((member) => (
          <MemberGradeCard
            key={member.membershipId}
            membershipId={member.membershipId}
            name={member.name}
            color={authorColor(colorScale, member.membershipId)}
            grade={grades[member.membershipId]}
            groupGrade={groupGrade}
            suggestion={suggestionFor.get(member.membershipId)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * The group's own grade: one judgement of the draft, shared by everyone in it.
 *
 * Lives on the group's Submission, so it is the same row and the same columns a
 * solo essay's grade uses. Until the group submits there is nothing to grade,
 * and the card says so rather than offering a form that cannot save.
 */
function GroupGradeCard({ groupGrade }: { groupGrade: GroupGrade | null }) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  const saving = fetcher.state !== 'idle';
  const error =
    fetcher.data && fetcher.data.success === false ? fetcher.data.message : '';
  const released = Boolean(groupGrade?.releasedAt);

  if (!groupGrade) {
    return (
      <div className="rounded-lg border border-dashed p-4">
        <h2 className="text-sm font-semibold">Group grade</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This group has not submitted their draft yet. Once they do, the grade
          you give here applies to everyone in the group.
        </p>
      </div>
    );
  }

  return (
    <fetcher.Form method="post" className="grid gap-2 rounded-lg border p-4">
      <input type="hidden" name="intent" value="group-grade" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Group grade</h2>
        <span
          className={`text-xs ${released ? 'text-green-700' : 'text-muted-foreground'}`}
        >
          {released ? 'Visible to the group' : 'Not shared yet'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        For the draft itself. Everyone in the group gets this unless you give
        them their own below.
      </p>

      <label className="grid gap-1 text-sm">
        Grade
        <input
          type="text"
          name="score"
          defaultValue={groupGrade.score ?? ''}
          placeholder="B+, 17/20, meets expectations…"
          maxLength={64}
          className="rounded border px-2 py-1"
        />
      </label>

      <label className="grid gap-1 text-sm">
        Comment for the group
        <textarea
          name="feedback"
          defaultValue={groupGrade.feedback ?? ''}
          rows={3}
          className="rounded border px-2 py-1"
        />
      </label>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          Save
        </Button>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          name="release"
          value={released ? 'false' : 'true'}
          disabled={saving}
        >
          {released ? 'Take back' : 'Save and share with the group'}
        </Button>
      </div>
    </fetcher.Form>
  );
}

/**
 * What each colour in the draft below means.
 *
 * The colour is unreadable without this: nothing else on the page puts a name
 * next to a student's colour, and matching a swatch against the avatars in the
 * table above is the wrong way to read a paragraph.
 *
 * Its own component so it can be tested without rendering the grade cards,
 * which need a router and a fetcher and have nothing to do with the key.
 */
export function DraftColourKey({
  members,
  paragraphs,
  colorScale,
}: {
  members: ContributionMember[];
  paragraphs: AttributedRun[][];
  colorScale: Map<string, string>;
}) {
  // Nothing written yet means no colour on the page to explain, and a key
  // listing three students beside "Nothing written yet" would imply otherwise.
  if (paragraphs.length === 0) return null;

  const nameFor = new Map(members.map((m) => [m.membershipId, m.name]));

  // Anyone whose writing survives in the draft but who is not on the current
  // roster — the same "Former student" fallback the paragraphs use. Derived
  // from the same runs the text is rendered from, so the key and the colours
  // can never disagree about who a colour belongs to.
  const formerStudentIds = [
    ...new Set(
      paragraphs.flatMap((runs) =>
        runs
          .map((run) => run.membershipId)
          .filter((id): id is string => id !== null)
      )
    ),
  ].filter((id) => !nameFor.has(id));

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b bg-muted/30 px-4 py-2 text-xs"
      aria-label="Colour key"
      data-testid="contribution-draft-key"
    >
      {members.map((member) => (
        <span key={member.membershipId} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: authorColor(colorScale, member.membershipId) }}
          />
          {member.name}
        </span>
      ))}
      {formerStudentIds.map((id) => (
        <span key={id} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: authorColor(colorScale, id) }}
          />
          Former student
        </span>
      ))}
    </div>
  );
}

/**
 * The draft itself, every run marked with who wrote it.
 *
 * Two channels, deliberately. The tint is the glance — it shows the shape of who
 * wrote what without anyone having to read anything. The underline is the answer
 * — full-strength colour, where two writers are far enough apart to actually
 * tell apart, including for a reader with colour blindness. Relying on the tint
 * alone was the bug: a wash light enough to read black text through has almost
 * no chroma left, so every hue drifts toward the same pale grey.
 *
 * Its own component so it can be tested without a router or a fetcher, the same
 * reason `DraftColourKey` is.
 */
export function AttributedDraft({
  paragraphs,
  colorScale,
  nameFor,
}: {
  paragraphs: AttributedRun[][];
  colorScale: Map<string, string>;
  nameFor: Map<string, string>;
}) {
  if (paragraphs.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        Nothing written yet.
      </p>
    );
  }

  return (
    <div
      className="px-4 py-4 font-times text-base leading-relaxed"
      data-testid="contribution-draft-body"
    >
      {paragraphs.map((runs, index) => (
        <p key={index} className="mb-3 last:mb-0">
          {runs.map((run, runIndex) => {
            const name = run.membershipId
              ? (nameFor.get(run.membershipId) ?? 'Former student')
              : 'No recorded author';
            const color = run.membershipId
              ? authorColor(colorScale, run.membershipId)
              : null;
            return (
              <span
                key={runIndex}
                title={name}
                className="rounded-sm"
                style={{
                  // Light enough to read black text through, which is exactly
                  // why it cannot be the only cue.
                  backgroundColor: color ? `${color}2E` : 'transparent',
                  // The underline is what actually tells two writers apart. A
                  // wash that pale has almost no chroma left: at 20% over white
                  // the closest pair in a group of three sits about 10 ΔE apart
                  // in normal vision and 4 with colour blindness simulated,
                  // which is the "these two look the same" complaint. At full
                  // strength the same pair is 27 apart. Grey and dashed for text
                  // nobody is recorded as writing, so it cannot be mistaken for
                  // a person.
                  borderBottom: color
                    ? `2px solid ${color}`
                    : `1px dashed ${UNATTRIBUTED_COLOR}`,
                }}
              >
                {run.text}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}

export function ContributionPanel({
  breakdown,
  grades,
  groupGrade,
}: {
  breakdown: ContributionBreakdown;
  grades: Record<string, MemberGrade>;
  groupGrade: GroupGrade | null;
}) {
  const { members, paragraphs, unattributedChars } = breakdown;
  const nameFor = new Map(members.map((m) => [m.membershipId, m.name]));
  const silent = members.filter((m) => !m.hasWritten);

  // One scale for the whole page, current members first so the people being
  // graded get the colours that are hardest to confuse, and anyone who wrote and
  // has since left the group after them. Built from the same member set the
  // student's editor uses, so a colour means the same person on both pages.
  const colorScale = buildAuthorColorScale([
    ...members.map((member) => member.membershipId),
    ...paragraphs.flatMap((runs) =>
      runs
        .map((run) => run.membershipId)
        .filter((id): id is string => id !== null)
    ),
  ]);

  return (
    <div className="grid gap-6">
      <section
        aria-labelledby="contribution-people"
        className="rounded-lg border"
      >
        <h2
          id="contribution-people"
          className="border-b px-4 py-2 text-sm font-semibold"
        >
          Who worked on this
        </h2>

        {silent.length > 0 ? (
          <p
            className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900"
            role="status"
          >
            {silent.map((m) => m.name).join(', ')}{' '}
            {silent.length === 1 ? 'has' : 'have'} not written in this draft
            yet.
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-4 py-2 font-medium">
                  Student
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Sittings
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  First
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Last
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Written
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Still here
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Share of draft
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Removed
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr
                  key={member.membershipId}
                  className="border-b last:border-0"
                >
                  <th scope="row" className="px-4 py-2 font-normal">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-medium text-white"
                        style={{
                          backgroundColor: authorColor(
                            colorScale,
                            member.membershipId
                          ),
                        }}
                      >
                        {initials(member.name)}
                      </span>
                      {member.name}
                    </span>
                  </th>
                  <td className="px-4 py-2">{member.sessionCount}</td>
                  <td className="px-4 py-2">
                    {formatWhen(member.firstSeenAt)}
                  </td>
                  <td className="px-4 py-2">{formatWhen(member.lastSeenAt)}</td>
                  <td className="px-4 py-2">{member.charsInserted}</td>
                  <td className="px-4 py-2">{member.survivingChars}</td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      {/* A bar as well as a number: proportion is easier to
                          judge at a glance and harder to mistake for a score. */}
                      <span
                        aria-hidden
                        className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted"
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${member.survivingShare}%`,
                            backgroundColor: authorColor(
                              colorScale,
                              member.membershipId
                            ),
                          }}
                        />
                      </span>
                      {member.survivingShare}%
                    </span>
                  </td>
                  <td className="px-4 py-2">{member.charsDeleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          Share is of the characters currently in the draft — a proportion of
          text, not of the work. One student often types while the group talks,
          the person who wrote the load-bearing sentence may hold very little of
          it, and removing weak text counts for nothing here. Read the draft
          below before you grade.
        </p>
      </section>

      <GroupGradeCard groupGrade={groupGrade} />

      <MemberGradesSection
        members={members}
        grades={grades}
        groupGrade={groupGrade}
        colorScale={colorScale}
        hasWriting={breakdown.totalChars > 0}
      />

      <section
        aria-labelledby="contribution-draft"
        className="rounded-lg border"
      >
        <h2
          id="contribution-draft"
          className="border-b px-4 py-2 text-sm font-semibold"
        >
          The draft, coloured by who wrote it
        </h2>

        <DraftColourKey
          members={members}
          paragraphs={paragraphs}
          colorScale={colorScale}
        />

        {unattributedChars > 0 ? (
          <p className="border-b bg-gray-50 px-4 py-2 text-xs text-muted-foreground">
            {unattributedChars} characters have no recorded author — written
            before this draft started tracking authorship. Shown in grey.
          </p>
        ) : null}

        <AttributedDraft
          paragraphs={paragraphs}
          colorScale={colorScale}
          nameFor={nameFor}
        />
      </section>
    </div>
  );
}
