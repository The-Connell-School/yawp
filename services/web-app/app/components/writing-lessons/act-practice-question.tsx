import { CheckCircle2, XCircle } from 'lucide-react';

import {
  NO_CHANGE_LABEL,
  splitAroundUnderline,
  type ActGradeResult,
  type StudentActPracticeQuestion,
} from '~/utils/writing-lessons/act-practice.shared';

/**
 * Renders one ACT English question: the sentence with its underlined portion
 * highlighted, four selectable answer choices (A = "NO CHANGE"), and — once the
 * student has checked — a correct/incorrect result with the explanation.
 *
 * This is presentation only: the parent owns the selection state, grading, and
 * any persistence, so the same view can back the self-serve lesson panel, the
 * multi-skill session, and the teacher-assigned flow.
 */
export function ActPracticeQuestionView({
  question,
  selectedIndex,
  grade,
  onSelect,
}: {
  question: StudentActPracticeQuestion;
  selectedIndex: number | null;
  grade: ActGradeResult | null;
  onSelect: (index: number) => void;
}) {
  const isGraded = grade !== null;
  const parts = splitAroundUnderline(question.sentence, question.underline);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Choose the best answer
        </p>
        <p className="mt-2 text-base leading-relaxed text-foreground">
          {parts.before}
          {parts.underlined ? (
            <span className="font-semibold underline decoration-primary decoration-2 underline-offset-4">
              {parts.underlined}
            </span>
          ) : null}
          {parts.after}
        </p>
      </div>

      <fieldset className="space-y-2" disabled={isGraded}>
        <legend className="sr-only">Answer choices</legend>
        {question.choices.map((choice, index) => {
          const label = index === 0 ? NO_CHANGE_LABEL : choice;
          const isSelected = selectedIndex === index;
          const isCorrect = grade?.correctChoiceIndex === index;
          // After grading, tint the correct row green and a wrong pick red.
          const tone = isGraded
            ? isCorrect
              ? 'border-emerald-400 bg-emerald-50'
              : isSelected
                ? 'border-rose-300 bg-rose-50'
                : 'border-border/70'
            : isSelected
              ? 'border-primary bg-primary/5'
              : 'border-border/70 hover:border-primary/50';
          return (
            <label
              key={index}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-base transition-colors sm:text-sm ${tone}`}
            >
              <input
                type="radio"
                name={`act-choice-${question.id}`}
                className="mt-0.5 h-4 w-4"
                checked={isSelected}
                onChange={() => onSelect(index)}
              />
              <span className="flex-1">
                <span className="mr-1.5 font-semibold text-muted-foreground">
                  {String.fromCharCode(65 + index)}.
                </span>
                {label}
              </span>
            </label>
          );
        })}
      </fieldset>

      {grade ? <ActResultPanel question={question} grade={grade} /> : null}
    </div>
  );
}

/** The correct/incorrect banner + explanation shown after an answer is checked. */
export function ActResultPanel({
  question,
  grade,
}: {
  question: StudentActPracticeQuestion;
  grade: ActGradeResult;
}) {
  const correctLabel =
    grade.correctChoiceIndex === 0
      ? NO_CHANGE_LABEL
      : question.choices[grade.correctChoiceIndex];
  const correctLetter = String.fromCharCode(65 + grade.correctChoiceIndex);

  return (
    <div
      data-testid="act-result"
      className={`space-y-2 rounded-xl border p-4 ${
        grade.correct
          ? 'border-emerald-300 bg-emerald-50'
          : 'border-rose-300 bg-rose-50'
      }`}
    >
      <div className="flex items-center gap-2">
        {grade.correct ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <XCircle className="h-4 w-4 text-rose-600" />
        )}
        <span className="text-sm font-semibold text-foreground">
          {grade.correct ? 'Correct!' : 'Not quite'}
        </span>
      </div>

      {!grade.correct ? (
        <p className="text-sm text-foreground">
          The best answer is{' '}
          <span className="font-semibold">
            {correctLetter}. {correctLabel}
          </span>
          .
        </p>
      ) : null}

      <p className="text-sm leading-relaxed text-muted-foreground">
        {grade.explanation}
      </p>
    </div>
  );
}
