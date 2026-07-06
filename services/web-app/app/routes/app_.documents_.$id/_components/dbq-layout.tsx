import { DbqAssignmentScreen } from '~/components/dbq/dbq-assignment-screen';
import type { DbqPrompt, DbqSource } from '~/components/dbq/types';
import type { ApHistorySnapshot } from '~/domain/ap-history/schema';

type Props = {
  snapshot: ApHistorySnapshot;
};

function toDbqSources(sources: ApHistorySnapshot['sources']): DbqSource[] {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return sources.map((s, i) => ({
    id: s.externalKey,
    label: letters[i] ?? `${i + 1}`,
    title: s.title,
    attribution: s.attribution,
    body: s.body,
    caption: s.caption ?? undefined,
  }));
}

function getReasoningSkill(
  value: string
): DbqPrompt['reasoningSkill'] {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'comparison') return 'comparison';
  if (normalized === 'continuity-and-change' || normalized === 'ccot') {
    return 'continuity-and-change';
  }
  if (normalized === 'periodization') return 'periodization';
  return 'causation';
}

export function DbqLayout({ snapshot }: Props) {
  const dbqPrompt: DbqPrompt = {
    id: snapshot.libraryEntryId,
    title: snapshot.period,
    essayType: 'dbq',
    period: 'ap-ush',
    era: [],
    reasoningSkill: getReasoningSkill(snapshot.reasoningSkill),
    dateWindow: { from: 1600, to: 1980 },
    prompt: snapshot.prompt,
    sources: toDbqSources(snapshot.sources),
  };

  return (
    <DbqAssignmentScreen
      prompt={dbqPrompt}
      initialTimeMode={snapshot.timing.mode}
    />
  );
}
