import { useState, type ReactNode } from 'react';
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
  EXIT_TICKET_ANSWER_TYPE_OPTIONS,
  EXIT_TICKET_ASSESS_FOR_MAX_LENGTH,
  EXIT_TICKET_GRADING_BASIS_OPTIONS,
  EXIT_TICKET_LESSON_NOTE_FIELDS,
  EXIT_TICKET_LESSON_NOTE_MAX_LENGTH,
  EXIT_TICKET_MIN_SENTENCES_MAX,
  EXIT_TICKET_MIN_WORDS_MAX,
  EXIT_TICKET_CUSTOM_PROMPT_MAX_LENGTH,
  EXIT_TICKET_REFLECTION_PROMPT_OPTIONS,
  EXIT_TICKET_FOCUS_OPTIONS,
  EXIT_TICKET_KIND_OPTIONS,
  EXIT_TICKET_TOPIC_MAX_LENGTH,
  exitTicketCriteriaNoteKeys,
  exitTicketFocusOption,
  exitTicketTargetingHint,
  exitTicketKindForMode,
  exitTicketModeForKind,
  type ExitTicketFocus,
  type ExitTicketGradingBasis,
  type ExitTicketLessonNotes,
  type ExitTicketKind,
  type ExitTicketMode,
  type ExitTicketReflectionPromptId,
} from '~/domain/assignment-types/exit-ticket';

/**
 * The grading answers as the form holds them: strings, because they are
 * inputs, and validated by the same parser the server runs.
 */
export type ExitTicketGradingDraft = {
  basis: ExitTicketGradingBasis;
  minWords: string;
  minSentences: string;
  assessFor: string;
};

/**
 * The quick exit ticket builder.
 *
 * The original form put every choice and every explanation on screen at once,
 * which is a lot to read for something a teacher makes in the last minute of a
 * lesson. This one asks one question first — reflection or check — and only
 * reveals the rest when the teacher's answers need it. Everything it posts is
 * a superset of what the original form posts, so the server and every stored
 * ticket read the same either way.
 *
 * Controlled: the creation sheet owns the state, because the same state feeds
 * its submit gate and the composed prompt it posts.
 */
export type ExitTicketBuilderProps = {
  mode: ExitTicketMode;
  onModeChange: (mode: ExitTicketMode) => void;
  focus: ExitTicketFocus;
  onFocusChange: (focus: ExitTicketFocus) => void;
  topic: string;
  onTopicChange: (topic: string) => void;
  /** Empty until answered: there is no safe default. */
  answerType: string;
  onAnswerTypeChange: (answerType: string) => void;
  reflectionPromptId: ExitTicketReflectionPromptId;
  onReflectionPromptIdChange: (id: ExitTicketReflectionPromptId) => void;
  /** The teacher's own question; used only when the id is 'custom'. */
  reflectionPromptText: string;
  onReflectionPromptTextChange: (text: string) => void;
  /** The gradebook switch. The sheet posts `submitForGrade` from it. */
  graded: boolean;
  onGradedChange: (graded: boolean) => void;
  pointValue: string;
  onPointValueChange: (pointValue: string) => void;
  grading: ExitTicketGradingDraft;
  onGradingChange: (patch: Partial<ExitTicketGradingDraft>) => void;
  lessonNotes: ExitTicketLessonNotes;
  onLessonNoteChange: (key: keyof ExitTicketLessonNotes, value: string) => void;
  /** The composed prompt, or empty while the form is incomplete. */
  preview: string;
  disabled: boolean;
};

/**
 * What a lesson note is called when it is a grading criterion rather than a
 * note. The stored key is the same; only the question changes.
 */
const CRITERIA_LABELS: Partial<Record<keyof ExitTicketLessonNotes, string>> = {
  mainPoints: 'Main points of the lesson',
  mustMention: 'Correct answer or key points',
  watchFor: 'Common mix-ups (optional)',
};

const REQUIRED_CRITERIA: (keyof ExitTicketLessonNotes)[] = ['mustMention'];

function lessonNoteName(key: keyof ExitTicketLessonNotes) {
  return `exitTicketLesson${key[0]!.toUpperCase()}${key.slice(1)}`;
}

/** Short labels for the right-answer question; the long ones sit in "Why?". */
const ANSWER_TYPE_SHORT_LABELS: Record<string, string> = {
  objective: 'Yes — there is a right answer',
  subjective: 'No — more than one answer can be right',
};

/**
 * The explanation behind a choice, for the teacher who wants it. Closed by
 * default so the form reads in seconds; a native disclosure, so it needs no
 * script and anything inside it still posts.
 */
export function WhyDisclosure({ children }: { children: ReactNode }) {
  return (
    <details className="group text-sm text-muted-foreground">
      <summary className="w-fit cursor-pointer select-none text-xs font-medium underline-offset-2 hover:underline">
        Why?
      </summary>
      <div className="mt-1.5 space-y-1.5">{children}</div>
    </details>
  );
}

const GUIDE_STEPS = ['What kind of ticket?', 'What it asks', 'Grading'];

export function ExitTicketBuilder({
  mode,
  onModeChange,
  focus,
  onFocusChange,
  topic,
  onTopicChange,
  answerType,
  onAnswerTypeChange,
  reflectionPromptId,
  onReflectionPromptIdChange,
  reflectionPromptText,
  onReflectionPromptTextChange,
  graded,
  onGradedChange,
  pointValue,
  onPointValueChange,
  grading,
  onGradingChange,
  lessonNotes,
  onLessonNoteChange,
  preview,
  disabled,
}: ExitTicketBuilderProps) {
  // null is the whole form at once; a number is the step being walked.
  const [guideStep, setGuideStep] = useState<number | null>(null);
  const shows = (step: number) => guideStep === null || guideStep === step;
  const kind = exitTicketKindForMode(mode);
  const selectedFocus = exitTicketFocusOption(focus);
  const criteriaKeys = exitTicketCriteriaNoteKeys({
    kind,
    graded,
    answerType,
    basis: grading.basis,
  });
  const asksWhatToAssess =
    graded && kind === 'check' && answerType === 'subjective';

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
            onModeChange(exitTicketModeForKind(value as ExitTicketKind))
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
            unclear — and has no answer to get wrong. It is the quick default,
            and good for catching what you did not think to ask.
          </p>
          <p>
            A check for understanding asks for evidence of one specific thing,
            so the responses tell you whether that one thing landed.
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
              value={reflectionPromptId}
              onValueChange={(value) =>
                onReflectionPromptIdChange(
                  value as ExitTicketReflectionPromptId
                )
              }
              disabled={disabled}
              className="flex flex-wrap gap-2"
            >
              {EXIT_TICKET_REFLECTION_PROMPT_OPTIONS.map((option) => (
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
            {reflectionPromptId === 'custom' ? (
              <Textarea
                id="assignment-create-exit-ticket-reflection-text"
                aria-label="Your question"
                name="exitTicketReflectionPromptText"
                value={reflectionPromptText}
                onChange={(event) =>
                  onReflectionPromptTextChange(event.target.value)
                }
                rows={2}
                maxLength={EXIT_TICKET_CUSTOM_PROMPT_MAX_LENGTH}
                placeholder="e.g., What would you explain to a friend who missed today?"
                disabled={disabled}
              />
            ) : null}
            {/* The default posts nothing, so a default reflection is stored
              exactly as the original builder stored a basic ticket. */}
            {reflectionPromptId !== 'learned' ? (
              <input
                type="hidden"
                name="exitTicketReflectionPrompt"
                value={reflectionPromptId}
              />
            ) : null}
          </div>
        ) : null}

        {kind === 'check' ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="assignment-create-exit-ticket-focus">
                What are you checking for?
              </Label>
              <Select
                value={focus}
                onValueChange={(value) =>
                  onFocusChange(value as ExitTicketFocus)
                }
                disabled={disabled}
              >
                <SelectTrigger id="assignment-create-exit-ticket-focus">
                  <SelectValue placeholder="Choose what to check for" />
                </SelectTrigger>
                <SelectContent>
                  {EXIT_TICKET_FOCUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFocus ? (
                <p className="text-sm text-muted-foreground">
                  {selectedFocus.helperText}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignment-create-exit-ticket-topic">
                What specifically?
              </Label>
              <Input
                id="assignment-create-exit-ticket-topic"
                value={topic}
                onChange={(event) => onTopicChange(event.target.value)}
                maxLength={EXIT_TICKET_TOPIC_MAX_LENGTH}
                placeholder={selectedFocus?.topicPlaceholder}
                disabled={disabled}
              />
            </div>

            {/* Nothing is preselected: the answer decides whether a student
              can be told they are wrong, so it is never guessed. */}
            <div className="space-y-2">
              <Label id="assignment-create-exit-ticket-answer-label">
                Is there a correct answer?
              </Label>
              <RadioGroup
                aria-labelledby="assignment-create-exit-ticket-answer-label"
                value={answerType}
                onValueChange={onAnswerTypeChange}
                disabled={disabled}
                className="gap-2"
              >
                {EXIT_TICKET_ANSWER_TYPE_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-start gap-2.5">
                    <RadioGroupItem
                      value={option.value}
                      id={`assignment-create-exit-ticket-answer-${option.value}`}
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <Label
                      htmlFor={`assignment-create-exit-ticket-answer-${option.value}`}
                      className="cursor-pointer font-normal"
                    >
                      {ANSWER_TYPE_SHORT_LABELS[option.value] ?? option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              <WhyDisclosure>
                <p>
                  Nothing is picked for you, because this decides whether a
                  student can be told they are wrong.
                </p>
                {EXIT_TICKET_ANSWER_TYPE_OPTIONS.map((option) => (
                  <p key={option.value}>
                    <span className="font-medium text-foreground">
                      {option.value === 'objective' ? 'Yes:' : 'No:'}
                    </span>{' '}
                    {option.helperText}
                  </p>
                ))}
              </WhyDisclosure>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="assignment-create-exit-ticket-preview">
            What students will see
          </Label>
          {preview ? (
            <p
              id="assignment-create-exit-ticket-preview"
              className="whitespace-pre-line rounded-md bg-muted p-3 text-sm"
            >
              {preview}
            </p>
          ) : (
            <p
              id="assignment-create-exit-ticket-preview"
              className="rounded-md border border-dashed p-3 text-sm text-muted-foreground"
            >
              Say what this checks for to see the prompt your students will get.
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
              <p>
                A general question does not give enough to grade against, so
                grading one asks what it should be judged on: completion, the
                main points, the correct answer, or a minimum length.
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

            {kind === 'reflection' ? (
              <div className="space-y-2">
                <Label id="assignment-create-exit-ticket-basis-label">
                  Graded on
                </Label>
                <RadioGroup
                  aria-labelledby="assignment-create-exit-ticket-basis-label"
                  value={grading.basis}
                  onValueChange={(value) =>
                    onGradingChange({ basis: value as ExitTicketGradingBasis })
                  }
                  disabled={disabled}
                  className="gap-2"
                >
                  {EXIT_TICKET_GRADING_BASIS_OPTIONS.map((option) => (
                    <div
                      key={option.value}
                      className="flex items-start gap-2.5"
                    >
                      <RadioGroupItem
                        id={`assignment-create-exit-ticket-basis-${option.value}`}
                        value={option.value}
                        className="mt-0.5 size-4 shrink-0"
                      />
                      <Label
                        htmlFor={`assignment-create-exit-ticket-basis-${option.value}`}
                        className="cursor-pointer font-normal"
                      >
                        <span className="font-medium">{option.label}</span>{' '}
                        <span className="text-muted-foreground">
                          — {option.helperText}
                        </span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                <input
                  type="hidden"
                  name="exitTicketGradingBasis"
                  value={grading.basis}
                />
              </div>
            ) : null}

            {criteriaKeys.map((key) => {
              const field = EXIT_TICKET_LESSON_NOTE_FIELDS.find(
                (entry) => entry.key === key
              )!;
              const id = `assignment-create-exit-ticket-criteria-${key}`;
              return (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={id}>
                    {CRITERIA_LABELS[key] ?? field.label}
                  </Label>
                  <Textarea
                    id={id}
                    name={lessonNoteName(key)}
                    value={lessonNotes[key]}
                    onChange={(event) =>
                      onLessonNoteChange(key, event.target.value)
                    }
                    rows={2}
                    maxLength={EXIT_TICKET_LESSON_NOTE_MAX_LENGTH}
                    placeholder={field.placeholder}
                    required={REQUIRED_CRITERIA.includes(key)}
                    disabled={disabled}
                  />
                </div>
              );
            })}

            {asksWhatToAssess ? (
              <div className="space-y-1.5">
                <Label htmlFor="assignment-create-exit-ticket-assess-for">
                  What should be assessed?
                </Label>
                <Textarea
                  id="assignment-create-exit-ticket-assess-for"
                  name="exitTicketAssessFor"
                  value={grading.assessFor}
                  onChange={(event) =>
                    onGradingChange({ assessFor: event.target.value })
                  }
                  rows={2}
                  maxLength={EXIT_TICKET_ASSESS_FOR_MAX_LENGTH}
                  placeholder="e.g., Points to a specific line and says what it does"
                  disabled={disabled}
                />
              </div>
            ) : null}

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
                    value={grading.minWords}
                    onChange={(event) =>
                      onGradingChange({ minWords: event.target.value })
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
                    value={grading.minSentences}
                    onChange={(event) =>
                      onGradingChange({ minSentences: event.target.value })
                    }
                    disabled={disabled}
                    className="tabular-nums"
                  />
                </div>
                <span>sentences</span>
              </div>
            </div>
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

      <input type="hidden" name="exitTicketKind" value={kind} />
    </div>
  );
}

/**
 * Teacher-only notes about the lesson, for "More options". Never composed
 * into the prompt, and posted only while switched on, so a ticket without
 * notes stores none. A note the grading section already asks for as a
 * criterion is not asked twice.
 */
export function ExitTicketLessonNotesSection({
  criteriaKeys,
  lessonNotes,
  onLessonNoteChange,
  enabled,
  onEnabledChange,
  disabled,
}: {
  criteriaKeys: (keyof ExitTicketLessonNotes)[];
  lessonNotes: ExitTicketLessonNotes;
  onLessonNoteChange: (key: keyof ExitTicketLessonNotes, value: string) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  disabled: boolean;
}) {
  const noteFields = EXIT_TICKET_LESSON_NOTE_FIELDS.filter(
    (field) => !criteriaKeys.includes(field.key)
  );
  if (noteFields.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <Checkbox
          id="assignment-create-exit-ticket-lesson-notes"
          checked={enabled}
          onCheckedChange={(checked) => onEnabledChange(checked === true)}
          disabled={disabled}
          className="size-4 shrink-0"
        />
        <Label
          htmlFor="assignment-create-exit-ticket-lesson-notes"
          className="cursor-pointer font-normal leading-none"
        >
          Add notes about the lesson{' '}
          <span className="text-muted-foreground">
            (students never see these)
          </span>
        </Label>
      </div>
      {enabled ? (
        <div className="space-y-3 pl-[calc(1rem+0.625rem)]">
          {noteFields.map((field) => {
            const id = `assignment-create-exit-ticket-lesson-${field.key}`;
            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={id}>{field.label}</Label>
                <Textarea
                  id={id}
                  name={lessonNoteName(field.key)}
                  value={lessonNotes[field.key]}
                  onChange={(event) =>
                    onLessonNoteChange(field.key, event.target.value)
                  }
                  rows={2}
                  maxLength={EXIT_TICKET_LESSON_NOTE_MAX_LENGTH}
                  placeholder={field.placeholder}
                  disabled={disabled}
                />
              </div>
            );
          })}
          <WhyDisclosure>
            <p>{exitTicketTargetingHint(lessonNotes)}</p>
          </WhyDisclosure>
        </div>
      ) : null}
    </div>
  );
}
