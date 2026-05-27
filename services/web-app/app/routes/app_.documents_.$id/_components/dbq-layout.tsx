import { DbqAssignmentScreen } from '~/components/dbq/dbq-assignment-screen';
import type { DbqPrompt, DbqSource } from '~/components/dbq/types';

type SourceDoc = {
  id: string;
  title: string;
  attribution: string;
  body: string;
  position: number;
};

type Props = {
  sources: SourceDoc[];
  prompt: string;
  timedMode: string | null;
  durationMinutes: number | null;
};

function toDbqSources(sources: SourceDoc[]): DbqSource[] {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return sources.map((s, i) => ({
    id: s.id,
    label: letters[i] ?? `${i + 1}`,
    title: s.title,
    attribution: s.attribution,
    body: s.body,
  }));
}

export function DbqLayout({
  sources,
  prompt,
  timedMode,
  durationMinutes,
}: Props) {
  const dbqPrompt: DbqPrompt = {
    id: 'production',
    title: '',
    essayType: 'dbq',
    period: 'ap-ush',
    era: [],
    reasoningSkill: 'causation',
    dateWindow: { from: 1600, to: 1980 },
    prompt,
    sources: toDbqSources(sources),
  };

  return (
    <DbqAssignmentScreen
      prompt={dbqPrompt}
      initialTimeMode={timedMode === 'timed' ? 'timed' : 'untimed'}
    />
  );
}
