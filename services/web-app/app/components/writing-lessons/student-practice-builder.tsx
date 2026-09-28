import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import {
  PracticeSkillPicker,
  type PracticeSkillOption,
} from '~/components/writing-lessons/practice-skill-picker';

const PROBLEM_COUNT_PRESETS = [3, 5, 10, 15] as const;
const DEFAULT_PROBLEM_COUNT = 5;
// The session route clamps to the same window.
const MIN_PROBLEM_COUNT = 1;
const MAX_PROBLEM_COUNT = 20;

/**
 * The set sizes a session will honour. Refusing anything else here means a
 * student never starts a set only to be handed a different one.
 */
export function isValidProblemCount(raw: string): boolean {
  const value = Number(raw);
  return (
    raw.trim() !== '' &&
    Number.isInteger(value) &&
    value >= MIN_PROBLEM_COUNT &&
    value <= MAX_PROBLEM_COUNT
  );
}

/**
 * Practice a student gave themselves: pick the skills, pick how many problems,
 * and land in the same practice screen a teacher's assignment would put them
 * in. Nothing is persisted, so there is nothing to name or hand in — the
 * builder's whole job is the set.
 */
export function StudentPracticeBuilderContent({
  skills,
  onOpenChange,
}: {
  skills: PracticeSkillOption[];
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [problemCount, setProblemCount] = useState(
    String(DEFAULT_PROBLEM_COUNT)
  );

  const canStart = selected.length > 0 && isValidProblemCount(problemCount);

  function start() {
    if (!canStart) return;
    const params = new URLSearchParams({
      skills: selected.join(','),
      count: String(Number(problemCount)),
    });
    navigate(`/app/writing-lessons/practice?${params.toString()}`);
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Create practice</SheetTitle>
        <SheetDescription>
          Pick the skills you want to work on and how many problems. Choose more
          than one and they get mixed into a single set.
        </SheetDescription>
      </SheetHeader>

      <div className="mt-6 space-y-5">
        <div className="space-y-2">
          <Label>Skills to practice</Label>
          <p className="text-sm text-muted-foreground">
            Pick one, or several to mix them into one set.
          </p>
          <PracticeSkillPicker
            skills={skills}
            selected={selected}
            onSelectedChange={setSelected}
          />
        </div>

        <div className="space-y-2">
          <Label>How many problems?</Label>
          <div className="flex flex-wrap items-center gap-2">
            {PROBLEM_COUNT_PRESETS.map((preset) => {
              const isSelected = problemCount === String(preset);
              return (
                <button
                  key={preset}
                  type="button"
                  data-testid={`practice-count-${preset}`}
                  onClick={() => setProblemCount(String(preset))}
                  aria-pressed={isSelected}
                  className={`h-9 w-12 rounded-md border text-sm transition ${
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-muted'
                  }`}
                >
                  {preset}
                </button>
              );
            })}
            {/* The ui Input is full-width by default, so the box that sits in
                the preset row is sized by its own wrapper. */}
            <div className="w-20">
              <Input
                type="number"
                min={MIN_PROBLEM_COUNT}
                max={MAX_PROBLEM_COUNT}
                inputMode="numeric"
                data-testid="practice-count-custom"
                aria-label="Custom number of problems"
                value={problemCount}
                onChange={(event) => setProblemCount(event.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Between {MIN_PROBLEM_COUNT} and {MAX_PROBLEM_COUNT} problems.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            data-testid="start-mixed-practice"
            onClick={start}
            disabled={!canStart}
          >
            Start practice
          </Button>
        </div>
      </div>
    </>
  );
}

export function StudentPracticeBuilder({
  skills,
  onOpenChange,
}: {
  skills: PracticeSkillOption[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <StudentPracticeBuilderContent
          skills={skills}
          onOpenChange={onOpenChange}
        />
      </SheetContent>
    </Sheet>
  );
}
