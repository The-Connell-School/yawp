import { DbqAssignmentScreen } from '~/components/dbq/dbq-assignment-screen';
import type { DbqPrompt, DbqSource } from '~/components/dbq/types';
import { apHistorySourceImageUrl } from '~/components/ap-history/source-card';
import type { ApHistorySnapshot } from '~/domain/ap-history/schema';

type Props = {
  snapshot: ApHistorySnapshot;
  tutor?: React.ReactNode;
  editor?: React.ReactNode;
  comments?: React.ReactNode;
};

function toDbqSources(sources: ApHistorySnapshot['sources']): DbqSource[] {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return sources.map((source, index) => ({
    id: source.externalKey,
    label: letters[index] ?? `${index + 1}`,
    title: source.title,
    attribution: source.attribution,
    body: source.body,
    caption: source.caption ?? undefined,
    imageUrl:
      source.mediaType === 'image'
        ? (apHistorySourceImageUrl(source.externalKey) ?? source.imageUrl)
        : null,
    imageAlt: source.imageAlt ?? null,
  }));
}

function getReasoningSkill(value: string): DbqPrompt['reasoningSkill'] {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'comparison') return 'comparison';
  if (normalized === 'continuity-and-change' || normalized === 'ccot') {
    return 'continuity-and-change';
  }
  if (normalized === 'periodization') return 'periodization';
  return 'causation';
}

export function DbqLayout({ snapshot, tutor, editor, comments }: Props) {
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
      durationMinutes={snapshot.timing.durationMinutes}
      tutor={tutor}
      editor={editor}
      comments={comments}
    />
  );
}
