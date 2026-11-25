import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import {
  EXIT_TICKET_CORRECT_ANSWER_MAX_LENGTH,
  EXIT_TICKET_KIND_OPTIONS,
  EXIT_TICKET_MIN_SENTENCES_MAX,
  EXIT_TICKET_MIN_WORDS_MAX,
  EXIT_TICKET_PROMPT_TEXT_MAX_LENGTH,
  EXIT_TICKET_REVISED_REFLECTION_OPTIONS,
  EXIT_TICKET_SIMPLIFIED_CHECK_OPTIONS,
  EXIT_TICKET_SIMPLIFIED_CHECK_PLACEHOLDERS,
  EXIT_TICKET_SIMPLIFIED_COPY as COPY,
  EXIT_TICKET_SIMPLIFIED_PROMPT_VERSION,
  EXIT_TICKET_SIMPLIFIED_REFLECTION_PLACEHOLDER,
  exitTicketModeForKind,
  exitTicketRevisedDraftMinimum,
  exitTicketSimplifiedReflectionPrompt,
  withExitTicketLengthLine,
  type ExitTicketKind,
  type ExitTicketRevisedDraft,
  type ExitTicketRevisedReflectionId,
  type ExitTicketSimplifiedCheckOption,
} from '~/domain/assignment-types/exit-ticket';
import { WhyDisclosure } from './exit-ticket-builder';

const GUIDE_STEPS = ['Reflection or check?', 'The prompt', 'Grading'];

/**
 * Menus open in a portal beside the creation sheet, which sits above the
 * default popover layer. Kept for callers that still render a menu here.
 */
export const ABOVE_CREATION_SHEET = 'z-[70]';

const GRADING_LINE: Record<ExitTicketKind, string> = {
  reflection: COPY.reflectionGradingLine,
  check: COPY.checkGradingLine,
};

export type ExitTicketBuilderRevisedProps = {
  draft: ExitTicketRevisedDraft;
  onDraftChange: (patch: Partial<ExitTicketRevisedDraft>) => void;
  /** The gradebook switch. The sheet posts `submitForGrade` from it. */
  graded: boolean;
  onGradedChange: (graded: boolean) => void;
  pointValue: string;
  onPointValueChange: (pointValue: string) => void;
  disabled: boolean;
};

/**
 * The exit ticket builder (simplified, Brian 2026-11-24). Both kinds work the
 * same way: pick a preset or write your own, and the Prompt box holds exactly
 * what students see, including the length line. A check asks whether there
 * is a single correct answer and takes the answer, or notes on a strong one.
 *
 * Controlled: the creation sheet owns the state, because the same state feeds
 * its submit gate and the prompt it posts.
 */
export function ExitTicketBuilderRevised({
  draft,
  onDraftChange,
  graded,
  onGradedChange,
  pointValue,
  onPointValueChange,
  disabled,
}: ExitTicketBuilderRevisedProps) {
  // null is the whole form at once; a number is the step being walked.
  const [guideStep, setGuideStep] = useState<number | null>(null);
  const shows = (step: number) => guideStep === null || guideStep === step;
  const kind = draft.kind;
  const checkOption = EXIT_TICKET_SIMPLIFIED_CHECK_OPTIONS.find(
    (option) => option.value === draft.focus
  );
  const single = draft.singleCorrectAnswer === 'yes';
  const placeholders =
    EXIT_TICKET_SIMPLIFIED_CHECK_PLACEHOLDERS[draft.focus][
      single ? 'yes' : 'no'
    ];
  const reflectionPreset = draft.reflectionPromptId !== 'custom';

  /** The prompt boxes with their length line brought up to date. */
  const promptsFor = (
    minimum: Pick<ExitTicketRevisedDraft, 'minWords' | 'minSentences'> | null
  ): Pick<ExitTicketRevisedDraft, 'reflectionPromptText' | 'promptText'> => {
    const numbers = minimum ? exitTicketRevisedDraftMinimum(minimum) : null;
    return {
      reflectionPromptText: withExitTicketLengthLine(
        draft.reflectionPromptText,
        numbers,
        { aimWhenNoMinimum: reflectionPreset }
      ),
      promptText: draft.promptText.trim()
        ? withExitTicketLengthLine(draft.promptText, numbers)
        : draft.promptText,
    };
  };

  const changeMinimum = (
    patch: Partial<Pick<ExitTicketRevisedDraft, 'minWords' | 'minSentences'>>
  ) => {
    const next = {
      minWords: draft.minWords,
      minSentences: draft.minSentences,
      ...patch,
    };
    onDraftChange({ ...patch, ...promptsFor(next) });
  };

  const changeGraded = (next: boolean) => {
    onGradedChange(next);
    // An ungraded ticket asks for no minimum, so the line comes off.
    onDraftChange(promptsFor(next ? draft : null));
  };

  const chooseReflection = (id: ExitTicketRevisedReflectionId) => {
    const minimum = graded ? exitTicketRevisedDraftMinimum(draft) : null;
    const stock = exitTicketSimplifiedReflectionPrompt(id);
    onDraftChange({
      reflectionPromptId: id,
      reflectionPromptText: stock
        ? withExitTicketLengthLine(stock, minimum)
        : withExitTicketLengthLine('', minimum),
    });
  };

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
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {GRADING_LINE[option.value]}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        <WhyDisclosure>
          <p>{COPY.reflectionWhy}</p>
          <p>{COPY.checkWhy}</p>
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
                chooseReflection(value as ExitTicketRevisedReflectionId)
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
            <input
              type="hidden"
              name="exitTicketReflectionPrompt"
              value={draft.reflectionPromptId}
            />
            <PromptBox
              value={draft.reflectionPromptText}
              onChange={(value) =>
                onDraftChange({ reflectionPromptText: value })
              }
              placeholder={EXIT_TICKET_SIMPLIFIED_REFLECTION_PLACEHOLDER}
              rows={reflectionPreset ? 6 : 3}
              disabled={disabled}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label id="assignment-create-exit-ticket-focus-label">
                What are you checking for?
              </Label>
              <RadioGroup
                aria-labelledby="assignment-create-exit-ticket-focus-label"
                value={draft.focus}
                onValueChange={(value) =>
                  onDraftChange({
                    focus: value as ExitTicketSimplifiedCheckOption,
                  })
                }
                disabled={disabled}
                className="flex flex-wrap gap-2"
              >
                {EXIT_TICKET_SIMPLIFIED_CHECK_OPTIONS.map((option) => (
                  <div
                    key={option.value}
                    className="flex items-center gap-2 rounded-full border px-3 py-1.5"
                  >
                    <RadioGroupItem
                      id={`assignment-create-exit-ticket-focus-${option.value}`}
                      value={option.value}
                      className="size-4 shrink-0"
                    />
                    <Label
                      htmlFor={`assignment-create-exit-ticket-focus-${option.value}`}
                      className="cursor-pointer text-sm font-normal"
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {checkOption?.helperText ? (
                <p className="text-sm text-muted-foreground">
                  {checkOption.helperText}
                </p>
              ) : null}
              <input type="hidden" name="exitTicketFocus" value={draft.focus} />
            </div>

            <PromptBox
              value={draft.promptText}
              onChange={(value) => onDraftChange({ promptText: value })}
              placeholder={placeholders.prompt}
              rows={3}
              disabled={disabled}
              required
            />

            <div className="space-y-2">
              <Label id="assignment-create-exit-ticket-single-label">
                {COPY.singleAnswerQuestion}
              </Label>
              <RadioGroup
                aria-labelledby="assignment-create-exit-ticket-single-label"
                value={draft.singleCorrectAnswer}
                onValueChange={(value) =>
                  onDraftChange({
                    singleCorrectAnswer: value === 'no' ? 'no' : 'yes',
                  })
                }
                disabled={disabled}
                className="grid gap-2"
              >
                {(
                  [
                    ['yes', 'Yes', COPY.singleAnswerYes],
                    ['no', 'No', COPY.singleAnswerNo],
                  ] as const
                ).map(([value, label, help]) => (
                  <div key={value} className="flex items-start gap-2.5">
                    <RadioGroupItem
                      id={`assignment-create-exit-ticket-single-${value}`}
                      value={value}
                      className="mt-1"
                    />
                    <Label
                      htmlFor={`assignment-create-exit-ticket-single-${value}`}
                      className="cursor-pointer font-normal"
                    >
                      <span className="font-medium">{label}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {help}
                      </span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              <input
                type="hidden"
                name="exitTicketSingleCorrectAnswer"
                value={draft.singleCorrectAnswer}
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 border-t pt-3" hidden={!shows(2)}>
        <div className="flex items-center gap-2.5">
          <Checkbox
            id="assignment-create-exit-ticket-graded"
            checked={graded}
            onCheckedChange={(checked) => changeGraded(checked === true)}
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
                    aria-label="Minimum sentences"
                    name="exitTicketMinSentences"
                    type="number"
                    min={1}
                    max={EXIT_TICKET_MIN_SENTENCES_MAX}
                    step={1}
                    inputMode="numeric"
                    value={draft.minSentences}
                    onChange={(event) =>
                      changeMinimum({ minSentences: event.target.value })
                    }
                    disabled={disabled}
                    className="tabular-nums"
                  />
                </div>
                <span>sentences and/or</span>
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
                    onChange={(event) =>
                      changeMinimum({ minWords: event.target.value })
                    }
                    disabled={disabled}
                    className="tabular-nums"
                  />
                </div>
                <span>words</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Shows up in the prompt automatically.
              </p>
            </div>
          </div>
        )}

        {kind === 'check' ? (
          <div className="space-y-1.5">
            <Label htmlFor="assignment-create-exit-ticket-correct-answer">
              {single ? COPY.correctAnswerLabel : COPY.strongAnswerLabel}
              {single ? null : (
                <span className="font-normal text-muted-foreground">
                  {' '}
                  (optional)
                </span>
              )}
            </Label>
            <p
              id="assignment-create-exit-ticket-correct-answer-help"
              className="text-sm text-muted-foreground"
            >
              {single ? COPY.correctAnswerHelp : COPY.strongAnswerHelp}
            </p>
            <Textarea
              id="assignment-create-exit-ticket-correct-answer"
              aria-describedby="assignment-create-exit-ticket-correct-answer-help"
              name="exitTicketCorrectAnswer"
              value={draft.correctAnswer}
              onChange={(event) =>
                onDraftChange({ correctAnswer: event.target.value })
              }
              rows={single ? 2 : 3}
              maxLength={EXIT_TICKET_CORRECT_ANSWER_MAX_LENGTH}
              placeholder={placeholders.answer}
              disabled={disabled}
              required={single}
            />
          </div>
        ) : null}
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
        value={EXIT_TICKET_SIMPLIFIED_PROMPT_VERSION}
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

/** The one editable box that holds exactly what students see. */
function PromptBox({
  value,
  onChange,
  placeholder,
  rows,
  disabled,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows: number;
  disabled: boolean;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="assignment-create-exit-ticket-prompt">
        {COPY.promptLabel}{' '}
        <span className="font-normal text-muted-foreground">
          {COPY.promptHint}
        </span>
      </Label>
      <Textarea
        id="assignment-create-exit-ticket-prompt"
        name="exitTicketPromptText"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        maxLength={EXIT_TICKET_PROMPT_TEXT_MAX_LENGTH}
        placeholder={placeholder}
        disabled={disabled}
        required={required ?? true}
      />
    </div>
  );
}
