import {
  deckAsMaterial,
  DECK_SLOT,
  EXIT_TICKET_BLOCK_KEY,
  readLessonMaterials,
  type LessonMaterial,
} from './lesson-material';
import {
  readPlannedExitTickets,
  type PlannedExitTicket,
} from './exit-ticket-block';
import {
  DAILY_PAGES_BLOCK_KEY,
  dailyPagesBlockKey,
  dailyPagesIndexForKey,
  readDailyPagesExercises,
  WRITING_EXERCISE_LABELS,
  type DailyPagesExercise,
} from './daily-pages-block';
import { slugify } from './lesson-material';

export { DAILY_PAGES_BLOCK_KEY, dailyPagesBlockKey };

const EXERCISE_TITLE_CHARS = 60;

/**
 * A class starter or Daily Pages prompt, filed on its own (Brian's review,
 * B1). Each prompt gets its own slot, so three options are three pieces the
 * teacher can take or leave. The library id rides along as data, never in the
 * text a teacher reads (Brian's run 2, item 17).
 */
export function exerciseAsMaterial(
  exercise: DailyPagesExercise,
  key: string
): LessonMaterial {
  const label = WRITING_EXERCISE_LABELS[exercise.kind];
  const firstLine = exercise.prompt.split('\n')[0].trim();
  const short =
    firstLine.length > EXERCISE_TITLE_CHARS
      ? `${firstLine.slice(0, EXERCISE_TITLE_CHARS - 1).trimEnd()}…`
      : firstLine;
  return {
    key,
    slot: `${exercise.kind}:${slugify(exercise.prompt).slice(0, 48)}`,
    kind: exercise.kind,
    title: `${label}: ${short}`,
    audience: 'student',
    content: exercise.prompt,
    promptId: exercise.promptId ?? null,
  };
}

export function exitTicketAsMaterial(
  ticket: PlannedExitTicket,
  key: string = EXIT_TICKET_BLOCK_KEY
): LessonMaterial {
  const title =
    ticket.config.mode === 'specific' && ticket.config.topic.trim()
      ? `Exit ticket: ${ticket.config.topic}`
      : 'Exit ticket';
  return {
    key,
    slot: EXIT_TICKET_BLOCK_KEY,
    kind: 'exit-ticket',
    title,
    audience: 'student',
    content: ticket.prompt,
  };
}

/** Re-read one artifact from a saved assistant reply for packet filing. */
export function artifactFromAssistantReply(
  content: string,
  materialKey: string
): LessonMaterial | null {
  if (materialKey === DECK_SLOT) {
    return deckAsMaterial(content);
  }
  if (
    materialKey === EXIT_TICKET_BLOCK_KEY ||
    materialKey.startsWith(`${EXIT_TICKET_BLOCK_KEY}:`)
  ) {
    const index =
      materialKey === EXIT_TICKET_BLOCK_KEY
        ? 0
        : Number(materialKey.slice(EXIT_TICKET_BLOCK_KEY.length + 1));
    const { tickets } = readPlannedExitTickets(content);
    const ticket = tickets[index];
    return ticket ? exitTicketAsMaterial(ticket, materialKey) : null;
  }
  const exerciseIndex = dailyPagesIndexForKey(materialKey);
  if (exerciseIndex !== null) {
    const exercise = readDailyPagesExercises(content).exercises[exerciseIndex];
    return exercise ? exerciseAsMaterial(exercise, materialKey) : null;
  }
  const { materials } = readLessonMaterials(content);
  return materials.find((item) => item.key === materialKey) ?? null;
}
