import { useFetcher } from 'react-router';
import { colorForMembership } from '../app_.collab-documents_.$id/collab-editor';
import { Button } from '~/components/ui/button';
import type { ContributionBreakdown } from '~/domain/collaboration/contribution.server';
import { effectiveGrade } from '~/domain/collaboration/grading';
import type {
  GroupGrade,
  MemberGrade,
} from '~/domain/collaboration/grading';

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
  grade,
  groupGrade,
}: {
  membershipId: string;
  name: string;
  grade?: MemberGrade;
  groupGrade: GroupGrade | null;
}) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  const saving = fetcher.state !== 'idle';
  const error =
    fetcher.data && fetcher.data.success === false ? fetcher.data.message : '';
  const released = Boolean(grade?.releasedAt);
  const effective = effectiveGrade({ member: grade, groupGrade });

  return (
    <fetcher.Form method="post" className="grid gap-2 rounded-lg border p-4">
      <input type="hidden" name="membershipId" value={membershipId} />

      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-medium text-white"
            style={{ backgroundColor: colorForMembership(membershipId) }}
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
          defaultValue={grade?.score ?? ''}
          placeholder={groupGrade?.score ?? '18/20, A-, meets expectations…'}
          maxLength={64}
          className="rounded border px-2 py-1"
        />
      </label>

      <label className="grid gap-1 text-sm">
        Comment for this student
        <textarea
          name="feedback"
          defaultValue={grade?.feedback ?? ''}
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
            {silent.length === 1 ? 'has' : 'have'} not written in this draft yet.
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
                <tr key={member.membershipId} className="border-b last:border-0">
                  <th scope="row" className="px-4 py-2 font-normal">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-medium text-white"
                        style={{
                          backgroundColor: colorForMembership(
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
                  <td className="px-4 py-2">{formatWhen(member.firstSeenAt)}</td>
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
                            backgroundColor: colorForMembership(
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

      <section aria-labelledby="contribution-grades">
        <h2 id="contribution-grades" className="mb-1 text-sm font-semibold">
          Individual grades
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Everyone takes the group grade unless you give them their own here, for
          what they contributed — yours to decide, not calculated from the numbers
          above. Students see nothing until you share it.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {members.map((member) => (
            <MemberGradeCard
              key={member.membershipId}
              membershipId={member.membershipId}
              name={member.name}
              grade={grades[member.membershipId]}
              groupGrade={groupGrade}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="contribution-draft" className="rounded-lg border">
        <h2
          id="contribution-draft"
          className="border-b px-4 py-2 text-sm font-semibold"
        >
          The draft, coloured by who wrote it
        </h2>

        {unattributedChars > 0 ? (
          <p className="border-b bg-gray-50 px-4 py-2 text-xs text-muted-foreground">
            {unattributedChars} characters have no recorded author — written
            before this draft started tracking authorship. Shown in grey.
          </p>
        ) : null}

        {paragraphs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Nothing written yet.
          </p>
        ) : (
          <div className="px-4 py-4 font-times text-base leading-relaxed">
            {paragraphs.map((runs, index) => (
              <p key={index} className="mb-3 last:mb-0">
                {runs.map((run, runIndex) => {
                  const name = run.membershipId
                    ? (nameFor.get(run.membershipId) ?? 'Former student')
                    : 'No recorded author';
                  return (
                    <span
                      key={runIndex}
                      title={name}
                      className="rounded-sm"
                      style={{
                        backgroundColor: run.membershipId
                          ? `${colorForMembership(run.membershipId)}33`
                          : 'transparent',
                        // Grey and dashed rather than tinted, so unattributed
                        // text cannot be mistaken for someone's colour.
                        borderBottom: run.membershipId
                          ? 'none'
                          : '1px dashed #9ca3af',
                      }}
                    >
                      {run.text}
                    </span>
                  );
                })}
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
