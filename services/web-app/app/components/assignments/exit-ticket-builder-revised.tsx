import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  EXIT_TICKET_CORRECT_ANSWER_FIELD_COPY,
  EXIT_TICKET_CORRECT_ANSWER_MAX_LENGTH,
  EXIT_TICKET_CUSTOM_PROMPT_MAX_LENGTH,
  EXIT_TICKET_KIND_OPTIONS,
  EXIT_TICKET_MIN_SENTENCES_MAX,
  EXIT_TICKET_MIN_WORDS_MAX,
  EXIT_TICKET_PROMPT_TEXT_MAX_LENGTH,
  EXIT_TICKET_REVISED_FOCUS_OPTIONS,
  EXIT_TICKET_REVISED_PROMPT_VERSION,
  EXIT_TICKET_REVISED_QUESTION_PLACEHOLDER,
  EXIT_TICKET_REVISED_REFLECTION_OPTIONS,
  exitTicketModeForKind,
  type ExitTicketKind,
  type ExitTicketRevisedDraft,
  type ExitTicketRevisedFocus,
  type ExitTicketRevisedReflectionId,
} from '~/domain/assignment-types/exit-ticket';
import { WhyDisclosure } from './exit-ticket-builder';

const GUIDE_STEPS = [
  'Reflection or check?',
  'What students will answer',
  'Grading',
];

/**
 * Menus open in a portal beside the creation sheet, which sits above the
 * default popover layer. Without this the "What are you checking for?" menu
 * opened behind the sheet: open, but invisible and unusable.
 */
export const ABOVE_CREATION_SHEET = 'z-[70]';

export type ExitTicketBuilderRevisedProps = {
  draft: ExitTicketRevisedDraft;
  onDraftChange: (patch: Partial<ExitTicketRevisedDraft>) => void;
  /** The gradebook switch. The sheet posts `submitForGrade` from it. */
  graded: boolean;
  onGradedChange: (graded: boolean) => void;
  pointValue: string;
  onPointValueChange: (pointValue: string) => void;
  /** The composed prompt, or empty while something required is missing. */
  preview: string;
  disabled: boolean;
};

/**
 * The revised exit ticket builder (Brian, 2026-11-17). Reflection or check
 * first; a reflection is a stock question or the teacher's own, a check is
 * the teacher's whole question and its correct answer or key points. Grading
 * is points only, plus a minimum length on a check.
 *
 * Controlled: the creation sheet owns the state, because the same state feeds
 * its submit gate and the composed prompt it posts.
 */
export function ExitTicketBuilderRevised({
  draft,
  onDraftChange,
  graded,
  onGradedChange,
  pointValue,
  onPointValueChange,
  preview,
  disabled,
}: ExitTicketBuilderRevisedProps) {
  // null is the whole form at once; a number is the step being walked.
  const [guideStep, setGuideStep] = useState<number | null>(null);
  const shows = (step: number) => guideStep === null || guideStep === step;
  const kind = draft.kind;
  const focus = EXIT_TICKET_REVISED_FOCUS_OPTIONS.find(
    (option) => option.value === draft.focus
  );

  return (
    <div className="space-y-4 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        {guideStep === null ? (
          <Label id="assignment-create-exit-ticket-kind-label">
            Exit ticket
          </Label>
        ) : (
          <p
            id="assignment-create-exit-ticket-kind-label"
            className="text-sm font-medium"
          >
            Step {guideStep + 1} of {GUIDE_STEPS.length}:{' '}
            {GUIDE_STEPS[guideStep]}
          </p>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={() => setGuideStep((step) => (step === null ? 0 : null))}
          disabled={disabled}
        >
          {guideStep === null ? 'Walk me through it' : 'Show everything'}
        </Button>
      </div>

      <div className="space-y-2" hidden={!shows(0)}>
        <RadioGroup
          aria-labelledby="assignment-create-exit-ticket-kind-label"
          value={kind}
          onValueChange={(value) =>
            onDraftChange({ kind: value as ExitTicketKind })
          }
          disabled={disabled}
          className="grid gap-2 sm:grid-cols-2"
        >
          {EXIT_TICKET_KIND_OPTIONS.map((option) => (
            <div
              key={option.value}
              className="flex items-start gap-2.5 rounded-md border p-2.5"
            >
              <RadioGroupItem
                id={`assignment-create-exit-ticket-kind-${option.value}`}
                value={option.value}
                className="mt-1"
              />
              <Label
                htmlFor={`assignment-create-exit-ticket-kind-${option.value}`}
                className="cursor-pointer font-normal"
              >
                <span className="font-medium">{option.label}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {option.helperText}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        <WhyDisclosure>
          <p>
            A reflection asks how the lesson landed — what stuck, what is still
            unclear — and has no correct answer. It’s good for getting students
            to think quickly at the end of class and for catching what you did
            not think to ask.
          </p>
          <p>
            A check for understanding asks for evidence of one specific thing.
            It’s good for knowing whether students truly got the lesson.
          </p>
        </WhyDisclosure>
      </div>

      <div className="space-y-4" hidden={!shows(1)}>
        {kind === 'reflection' ? (
          <div className="space-y-2">
            <Label id="assignment-create-exit-ticket-reflection-label">
              Question
            </Label>
            <RadioGroup
              aria-labelledby="assignment-create-exit-ticket-reflection-label"
              value={draft.reflectionPromptId}
              onValueChange={(value) =>
                onDraftChange({
                  reflectionPromptId: value as ExitTicketRevisedReflectionId,
                })
              }
              disabled={disabled}
              className="flex flex-wrap gap-2"
            >
              {EXIT_TICKET_REVISED_REFLECTION_OPTIONS.map((option) => (
                <div
                  key={option.id}
                  className="flex items-center gap-2 rounded-full border px-3 py-1.5"
                >
                  <RadioGroupItem
                    id={`assignment-create-exit-ticket-reflection-${option.id}`}
                    value={option.id}
                    className="size-4 shrink-0"
                  />
                  <Label
                    htmlFor={`assignment-create-exit-ticket-reflection-${option.id}`}
                    className="cursor-pointer text-sm font-normal"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {draft.reflectionPromptId === 'custom' ? (
              <Textarea
                id="assignment-create-exit-ticket-reflection-text"
                aria-label="Your question"
                name="exitTicketReflectionPromptText"
                value={draft.reflectionPromptText}
                onChange={(event) =>
                  onDraftChange({ reflectionPromptText: event.target.value })
                }
                rows={2}
                maxLength={EXIT_TICKET_CUSTOM_PROMPT_MAX_LENGTH}
                placeholder="e.g., What would you explain to a friend who missed today?"
                disabled={disabled}
              />
            ) : null}
            <input
              type="hidden"
              name="exitTicketReflectionPrompt"
              value={draft.reflectionPromptId}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="assignment-create-exit-ticket-focus">
                What are you checking for?
              </Label>
              <Select
                value={draft.focus}
                onValueChange={(value) =>
                  onDraftChange({ focus: value as ExitTicketRevisedFocus })
                }
                disabled={disabled}
              >
                <SelectTrigger id="assignment-create-exit-ticket-focus">
                  <SelectValue placeholder="Choose what to check for" />
                </SelectTrigger>
                <SelectContent className={ABOVE_CREATION_SHEET}>
                  {EXIT_TICKET_REVISED_FOCUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {focus ? (
                <p className="text-sm text-muted-foreground">
                  {focus.helperText}
                </p>
              ) : null}
              <input type="hidden" name="exitTicketFocus" value={draft.focus} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignment-create-exit-ticket-question">
                Your question
              </Label>
              <Textarea
                id="assignment-create-exit-ticket-question"
                name="exitTicketPromptText"
                value={draft.promptText}
                onChange={(event) =>
                  onDraftChange({ promptText: event.target.value })
                }
                rows={3}
                maxLength={EXIT_TICKET_PROMPT_TEXT_MAX_LENGTH}
                placeholder={EXIT_TICKET_REVISED_QUESTION_PLACEHOLDER}
                disabled={disabled}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assignment-create-exit-ticket-correct-answer">
                {EXIT_TICKET_CORRECT_ANSWER_FIELD_COPY.label}
              </Label>
              <p
                id="assignment-create-exit-ticket-correct-answer-help"
                className="text-sm text-muted-foreground"
              >
                {EXIT_TICKET_CORRECT_ANSWER_FIELD_COPY.helperText}
              </p>
              <Textarea
                id="assignment-create-exit-ticket-correct-answer"
                aria-describedby="assignment-create-exit-ticket-correct-answer-help"
                name="exitTicketCorrectAnswer"
                value={draft.correctAnswer}
                onChange={(event) =>
                  onDraftChange({ correctAnswer: event.target.value })
                }
                rows={3}
                maxLength={EXIT_TICKET_CORRECT_ANSWER_MAX_LENGTH}
                placeholder={EXIT_TICKET_CORRECT_ANSWER_FIELD_COPY.placeholder}
                disabled={disabled}
                required
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p
            id="assignment-create-exit-ticket-preview-label"
            className="text-sm font-medium"
          >
            What students will see
          </p>
          {preview ? (
            <p
              aria-labelledby="assignment-create-exit-ticket-preview-label"
              data-testid="exit-ticket-preview"
              className="whitespace-pre-line rounded-md bg-muted p-3 text-sm"
            >
              {preview}
            </p>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              {kind === 'check'
                ? 'Write your question and its correct answer or key points to see what students will get.'
                : 'Write your question to see it here.'}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 border-t pt-3" hidden={!shows(2)}>
        <div className="flex items-center gap-2.5">
          <Checkbox
            id="assignment-create-exit-ticket-graded"
            checked={graded}
            onCheckedChange={(checked) => onGradedChange(checked === true)}
            disabled={disabled}
            className="size-4 shrink-0"
          />
          <Label
            htmlFor="assignment-create-exit-ticket-graded"
            className="cursor-pointer font-normal leading-none"
          >
            Grade this ticket
          </Label>
        </div>
        {!graded ? (
          <div className="space-y-1 pl-[calc(1rem+0.625rem)]">
            <p className="text-sm text-muted-foreground">
              Every response still gets feedback. Nothing goes in the gradebook.
            </p>
            <WhyDisclosure>
              <p>
                Ungraded is the default because students answer honestly when
                there is nothing to lose by admitting what they missed, and you
                still see who understood it.
              </p>
            </WhyDisclosure>
          </div>
        ) : (
          <div className="space-y-4 pl-[calc(1rem+0.625rem)]">
            <div className="space-y-2">
              <Label htmlFor="assignment-create-exit-ticket-points">
                How many points?
              </Label>
              <div className="flex items-center gap-2">
                <div className="w-24">
                  <Input
                    id="assignment-create-exit-ticket-points"
                    name="pointValue"
                    type="number"
                    min={1}
                    max={1000}
                    step={1}
                    inputMode="numeric"
                    value={pointValue}
                    onChange={(event) => onPointValueChange(event.target.value)}
                    disabled={disabled}
                    required
                    className="tabular-nums"
                  />
                </div>
                <span className="text-sm text-muted-foreground">points</span>
              </div>
            </div>

            {kind === 'check' ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">
                  Minimum length{' '}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-20">
                    <Input
                      aria-label="Minimum words"
                      name="exitTicketMinWords"
                      type="number"
                      min={1}
                      max={EXIT_TICKET_MIN_WORDS_MAX}
                      step={1}
                      inputMode="numeric"
                      value={draft.minWords}
                      // Words or sentences: students are told one of them.
                      onChange={(event) =>
                        onDraftChange({
                          minWords: event.target.value,
                          ...(event.target.value ? { minSentences: '' } : {}),
                        })
                      }
                      disabled={disabled}
                      className="tabular-nums"
                    />
                  </div>
                  <span>words, or</span>
                  <div className="w-20">
                    <Input
                      aria-label="Minimum sentences"
                      name="exitTicketMinSentences"
                      type="number"
                      min={1}
                      max={EXIT_TICKET_MIN_SENTENCES_MAX}
                      step={1}
                      inputMode="numeric"
                      value={draft.minSentences}
                      onChange={(event) =>
                        onDraftChange({
                          minSentences: event.target.value,
                          ...(event.target.value ? { minWords: '' } : {}),
                        })
                      }
                      disabled={disabled}
                      className="tabular-nums"
                    />
                  </div>
                  <span>sentences</span>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {guideStep !== null ? (
        <div className="flex justify-between gap-2 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setGuideStep((step) => Math.max(0, (step ?? 0) - 1))}
            disabled={disabled || guideStep === 0}
          >
            Back
          </Button>
          {guideStep < GUIDE_STEPS.length - 1 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setGuideStep((step) => (step ?? 0) + 1)}
              disabled={disabled}
            >
              Next
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => setGuideStep(null)}
              disabled={disabled}
            >
              Done
            </Button>
          )}
        </div>
      ) : null}

      <input
        type="hidden"
        name="exitTicketPromptVersion"
        value={EXIT_TICKET_REVISED_PROMPT_VERSION}
      />
      <input type="hidden" name="exitTicketKind" value={kind} />
      <input
        type="hidden"
        name="exitTicketMode"
        value={exitTicketModeForKind(kind)}
      />
    </div>
  );
}
