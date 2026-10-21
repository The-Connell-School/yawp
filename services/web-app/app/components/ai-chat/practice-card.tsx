/**
 * Writing practice the lesson planned, with a way to actually assign it.
 *
 * A fundamentals lesson ends on practice, and in Yawp practice is something
 * students work on the practice screen and a teacher gets results from — not a
 * worksheet to retype. So the card names the Writing Fundamentals lessons the
 * set draws on and how many problems it holds, and its button opens the
 * assignment sheet with all of that already filled in. Nothing is assigned
 * until the teacher picks a class and a due date.
 *
 * Only lessons Yawp actually has make it onto the card: a slug the catalog does
 * not know is dropped, and a set left with none is not drawn at all.
 */
import { useState } from 'react';
import { Check, Dumbbell, Plus } from 'lucide-react';
import type { PracticeSkillOption } from '~/components/writing-lessons/practice-skill-picker';
import {
  WritingPracticeAssignmentSheet,
  type WritingPracticeAssignmentClass,
} from '~/components/writing-lessons/writing-practice-assignment-sheet';
import type { PlannedPractice } from '~/domain/lesson-planner/practice-block';

export function PracticeCard({
  practice,
  lessons,
  classes,
  added = false,
  onToggle,
  disabled = false,
}: {
  practice: PlannedPractice;
  /** Every lesson a practice set may name, for this school. */
  lessons: PracticeSkillOption[];
  /**
   * The teacher's classes. Null when the school has no Writing Practice —
   * then the card is still the plan's practice, just without a button into
   * something the teacher cannot use.
   */
  classes: WritingPracticeAssignmentClass[] | null;
  /** Whether this practice set is in the lesson's stack. */
  added?: boolean;
  /** Stack v2 (Brian's run 2, A3): practice is part of the lesson's outline too. */
  onToggle?: ((added: boolean) => void) | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const chosen = practice.lessonSlugs
    .map((slug) => lessons.find((lesson) => lesson.slug === slug))
    .filter((lesson): lesson is PracticeSkillOption => Boolean(lesson));
  if (chosen.length === 0) return null;

  const problems = `${practice.problemCount} ${
    practice.problemCount === 1 ? 'problem' : 'problems'
  }`;
  const strands = [...new Set(chosen.map((lesson) => lesson.section))];

  return (
    <div
      data-testid="practice-card"
      className="mt-3 overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.03]"
    >
      <div className="flex items-center gap-2 border-b border-primary/15 px-4 py-2.5">
        <Dumbbell size={15} className="shrink-0 text-primary" />
        <span className="text-sm font-medium">Writing practice</span>
        <span className="text-sm text-muted-foreground">
          {strands.join(' · ')}
        </span>
      </div>

      <div className="space-y-1.5 px-4 py-3.5 text-sm">
        {practice.title ? (
          <p className="font-medium">{practice.title}</p>
        ) : null}
        <p className="text-foreground/90">
          {problems} from{' '}
          {chosen.map((lesson, index) => (
            <span key={lesson.slug}>
              {index > 0 ? ', ' : null}
              <strong className="font-medium">{lesson.title}</strong>
            </span>
          ))}
        </p>
        {practice.instructions ? (
          <p className="whitespace-pre-wrap text-muted-foreground">
            {practice.instructions}
          </p>
        ) : null}
      </div>

      {classes || onToggle ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-primary/15 bg-primary/[0.04] px-4 py-2.5">
          {onToggle ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onToggle(!added)}
              data-testid="practice-stack-toggle"
              title={added ? 'Click to remove from stack' : undefined}
              className={
                added
                  ? 'inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/15 disabled:opacity-50'
                  : 'inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/5 disabled:opacity-50'
              }
            >
              {added ? <Check size={14} /> : <Plus size={14} />}
              {added ? 'In the stack' : 'Add to stack'}
            </button>
          ) : null}
          {classes ? (
            <button
              type="button"
              data-testid="practice-assign"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              Assign this practice to your class
            </button>
          ) : null}
        </div>
      ) : null}

      {open && classes ? (
        <WritingPracticeAssignmentSheet
          skillOptions={lessons}
          initial={{
            slugs: chosen.map((lesson) => lesson.slug),
            title: practice.title ?? undefined,
            problemCount: practice.problemCount,
            instructions: practice.instructions ?? undefined,
          }}
          teacherClasses={classes}
          onOpenChange={setOpen}
        />
      ) : null}
    </div>
  );
}
