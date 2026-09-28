import { isActAttemptRecord } from './act-practice.shared';
import { isCompositionAttemptRecord } from './practice-feedback.shared';

/** How many missed questions the lesson page shows a teacher. */
const MAX_MISSES = 3;

export type LessonEvidenceAttempt = {
  membershipId: string;
  lessonSlug: string;
  promptId: string;
  status: string;
  /** The stored `feedbackJson`, still untyped at the DB boundary. */
  record: unknown;
  createdAt: Date;
};

export type LessonEvidenceDeployment = {
  classAssignmentId: string;
  classLabel: string;
  assignmentTitle: string;
  dueAt: Date | null;
  studentIds: string[];
  attempts: LessonEvidenceAttempt[];
};

export type LessonEvidenceClass = {
  classAssignmentId: string;
  classLabel: string;
  assignmentTitle: string;
  dueAt: string | null;
  /** Students enrolled in the class. */
  studentCount: number;
  /** Students who have answered at least one problem on this skill. */
  practicedCount: number;
  answeredCount: number;
  correctCount: number;
  masteredCount: number;
  revisingCount: number;
};

/** One question this skill's students get wrong, and what they pick instead. */
export type LessonEvidenceMiss = {
  sentence: string;
  underline: string;
  correctChoice: string;
  topWrongChoice: string;
  wrongCount: number;
  answeredCount: number;
  explanation: string;
};

export type LessonEvidence = {
  classes: LessonEvidenceClass[];
  studentsPracticed: number;
  answeredCount: number;
  correctCount: number;
  masteredCount: number;
  revisingCount: number;
  misses: LessonEvidenceMiss[];
};

type ResolvedAnswer = {
  membershipId: string;
  /** The student's latest attempt at this problem — the one that stands. */
  record: unknown;
  status: string;
  createdAt: Date;
};

/**
 * Collapses every revision of one problem by one student into a single answer:
 * the latest one. Composition problems are revised repeatedly on the way to
 * mastery, so counting raw rows would report a struggling student as the most
 * practised one in the class.
 */
function resolveAnswers(attempts: LessonEvidenceAttempt[], lessonSlug: string) {
  const byStudentPrompt = new Map<string, ResolvedAnswer>();
  const practiced = new Set<string>();

  for (const attempt of attempts) {
    if (attempt.lessonSlug !== lessonSlug) continue;
    practiced.add(attempt.membershipId);
    const key = `${attempt.membershipId}::${attempt.promptId}`;
    const existing = byStudentPrompt.get(key);
    if (existing && existing.createdAt > attempt.createdAt) continue;
    byStudentPrompt.set(key, {
      membershipId: attempt.membershipId,
      record: attempt.record,
      // Mastery is not lost by a later revision that scored lower.
      status: existing?.status === 'strong' ? 'strong' : attempt.status,
      createdAt: attempt.createdAt,
    });
  }

  return { answers: [...byStudentPrompt.values()], practiced };
}

type MissTally = {
  sentence: string;
  underline: string;
  correctChoice: string;
  explanation: string;
  answeredCount: number;
  wrongCount: number;
  /** Wrong choice text -> how many students picked it. */
  wrongChoices: Map<string, number>;
};

/**
 * What a teacher can see about one skill that a student cannot: how it has
 * actually landed in their classes — who has worked it, how much of it they
 * got right, and the specific questions that trip them up.
 *
 * Everything is scoped to this one skill, even when it was assigned inside a
 * mixed set, so no number on the panel is about work on a different lesson.
 */
export function summarizeLessonEvidence(params: {
  lessonSlug: string;
  deployments: LessonEvidenceDeployment[];
}): LessonEvidence {
  const { lessonSlug } = params;
  const classes: LessonEvidenceClass[] = [];
  const studentsPracticed = new Set<string>();
  // Questions are keyed by their text, not their prompt id: a generated set
  // gives every student their own ids, so the sentence is what makes two
  // students' problems the same problem.
  const misses = new Map<string, MissTally>();

  let answeredCount = 0;
  let correctCount = 0;
  let masteredCount = 0;
  let revisingCount = 0;

  for (const deployment of params.deployments) {
    const { answers, practiced } = resolveAnswers(
      deployment.attempts,
      lessonSlug
    );
    for (const membershipId of practiced) studentsPracticed.add(membershipId);

    let classAnswered = 0;
    let classCorrect = 0;
    let classMastered = 0;
    let classRevising = 0;

    for (const answer of answers) {
      if (isActAttemptRecord(answer.record)) {
        const record = answer.record;
        classAnswered += 1;
        if (record.correct) classCorrect += 1;

        const key = record.sentence.trim().toLowerCase();
        const tally: MissTally = misses.get(key) ?? {
          sentence: record.sentence.trim(),
          underline: record.underline,
          correctChoice: record.choices[record.correctChoiceIndex] ?? '',
          explanation: record.explanation,
          answeredCount: 0,
          wrongCount: 0,
          wrongChoices: new Map(),
        };
        tally.answeredCount += 1;
        if (!record.correct) {
          tally.wrongCount += 1;
          const picked = record.choices[record.selectedChoiceIndex];
          if (picked) {
            tally.wrongChoices.set(
              picked,
              (tally.wrongChoices.get(picked) ?? 0) + 1
            );
          }
        }
        misses.set(key, tally);
        continue;
      }

      if (isCompositionAttemptRecord(answer.record)) {
        if (answer.status === 'strong') classMastered += 1;
        else classRevising += 1;
      }
      // Anything else is a legacy or malformed record: the student still
      // practised, but there is nothing here to report about the work.
    }

    classes.push({
      classAssignmentId: deployment.classAssignmentId,
      classLabel: deployment.classLabel,
      assignmentTitle: deployment.assignmentTitle,
      dueAt: deployment.dueAt ? deployment.dueAt.toISOString() : null,
      studentCount: deployment.studentIds.length,
      practicedCount: practiced.size,
      answeredCount: classAnswered,
      correctCount: classCorrect,
      masteredCount: classMastered,
      revisingCount: classRevising,
    });

    answeredCount += classAnswered;
    correctCount += classCorrect;
    masteredCount += classMastered;
    revisingCount += classRevising;
  }

  const rankedMisses = [...misses.values()]
    .filter((tally) => tally.wrongCount > 0)
    .map((tally) => {
      let topWrongChoice = '';
      let topCount = 0;
      for (const [choice, count] of tally.wrongChoices) {
        if (count > topCount) {
          topWrongChoice = choice;
          topCount = count;
        }
      }
      return {
        sentence: tally.sentence,
        underline: tally.underline,
        correctChoice: tally.correctChoice,
        topWrongChoice,
        wrongCount: tally.wrongCount,
        answeredCount: tally.answeredCount,
        explanation: tally.explanation,
      };
    })
    .sort(
      (a, b) =>
        b.wrongCount - a.wrongCount ||
        b.wrongCount / b.answeredCount - a.wrongCount / a.answeredCount ||
        a.sentence.localeCompare(b.sentence)
    )
    .slice(0, MAX_MISSES);

  return {
    classes,
    studentsPracticed: studentsPracticed.size,
    answeredCount,
    correctCount,
    masteredCount,
    revisingCount,
    misses: rankedMisses,
  };
}
