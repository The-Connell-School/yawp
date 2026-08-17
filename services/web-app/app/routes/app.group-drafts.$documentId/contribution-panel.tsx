import { colorForMembership } from '../app_.collab-documents_.$id/collab-editor';
import type { ContributionBreakdown } from '~/domain/collaboration/contribution.server';

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
 * No percentages and no computed score, deliberately: a percentage reads as a
 * grade, and character counts measure typing rather than contribution. The
 * individual grade stays the teacher's to set.
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

export function ContributionPanel({
  breakdown,
}: {
  breakdown: ContributionBreakdown;
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
                  <td className="px-4 py-2">{member.charsDeleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          Counts are characters, not a score. They measure typing, which is not
          the same as contribution — one student often types while the group
          talks, and removing weak text is real work. Read the draft below
          alongside them.
        </p>
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
