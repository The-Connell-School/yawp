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
import { slugify, LESSON_STEP_KIND, PRACTICE_KIND } from './lesson-material';
import {
  describePlannedPractice,
  practicedLessons,
  practiceIndexForKey,
  readPlannedPractice,
  type PlannedPractice,
} from './practice-block';
import { planStepIndexForKey, readPlanSteps, type PlanStep } from './plan-steps';

export { DAILY_PAGES_BLOCK_KEY, dailyPagesBlockKey };

import { shortTitle } from './short-title';

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
  // A short, real title, never the prompt cut mid-word (Brian's run 3,
  // item 11): the planner's own, else the prompt's first clause.
  const short = exercise.title?.trim() || shortTitle(exercise.prompt);
  return {
    key,
    slot: `${exercise.kind}:${slugify(exercise.prompt).slice(0, 48)}`,
    kind: exercise.kind,
    title: `${label}: ${short}`,
    audience: 'student',
    content: exercise.prompt,
    promptId: exercise.promptId ?? null,
    minutes: exercise.minutes ?? null,
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

/** A step of a plan, filed on its own (Brian's run 2, A3). */
export function stepAsMaterial(step: PlanStep): LessonMaterial {
  return {
    key: step.key,
    slot: `${LESSON_STEP_KIND}:${slugify(step.title)}`,
    kind: LESSON_STEP_KIND,
    title: step.minutes !== null ? `${step.title} (${step.minutes} min)` : step.title,
    audience: 'teacher',
    content: step.content,
    minutes: step.minutes,
    stepType: step.stepType,
  };
}

/** Writing practice, filed on its own (Brian's run 2, A3). */
export function practiceAsMaterial(practice: PlannedPractice, key: string): LessonMaterial {
  return {
    key,
    slot: `${PRACTICE_KIND}:${practice.lessonSlugs.join('-')}`,
    kind: PRACTICE_KIND,
    title: `Writing practice: ${practice.title ?? practicedLessons(practice)}`,
    audience: 'teacher',
    content: describePlannedPractice(practice),
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
  const practiceIndex = practiceIndexForKey(materialKey);
  if (practiceIndex !== null) {
    const practice = readPlannedPractice(content).practices[practiceIndex];
    return practice ? practiceAsMaterial(practice, materialKey) : null;
  }
  const stepIndex = planStepIndexForKey(materialKey);
  if (stepIndex !== null) {
    const step = readPlanSteps(content)[stepIndex];
    return step ? stepAsMaterial(step) : null;
  }
  const exerciseIndex = dailyPagesIndexForKey(materialKey);
  if (exerciseIndex !== null) {
    const exercise = readDailyPagesExercises(content).exercises[exerciseIndex];
    return exercise ? exerciseAsMaterial(exercise, materialKey) : null;
  }
  const { materials } = readLessonMaterials(content);
  return materials.find((item) => item.key === materialKey) ?? null;
}
