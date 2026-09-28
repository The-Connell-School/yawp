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
  lessonNotesEnabled: boolean;
  onLessonNotesEnabledChange: (enabled: boolean) => void;
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
  lessonNotesEnabled,
  onLessonNotesEnabledChange,
  preview,
  disabled,
}: ExitTicketBuilderProps) {
  const kind = exitTicketKindForMode(mode);
  const selectedFocus = exitTicketFocusOption(focus);
  const criteriaKeys = exitTicketCriteriaNoteKeys({
    kind,
    graded,
    answerType,
    basis: grading.basis,
  });
  // Notes the grading section already asks for are not asked twice.
  const noteFields = EXIT_TICKET_LESSON_NOTE_FIELDS.filter(
    (field) => !criteriaKeys.includes(field.key)
  );
  const asksWhatToAssess =
    graded && kind === 'check' && answerType === 'subjective';

  return (
    <div className="space-y-4 rounded-md border p-3">
      <div className="space-y-2">
        <Label id="assignment-create-exit-ticket-kind-label">Exit ticket</Label>
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
      </div>

      {kind === 'reflection' ? (
        <div className="space-y-2">
          <Label id="assignment-create-exit-ticket-reflection-label">
            Question
          </Label>
          <RadioGroup
            aria-labelledby="assignment-create-exit-ticket-reflection-label"
            value={reflectionPromptId}
            onValueChange={(value) =>
              onReflectionPromptIdChange(value as ExitTicketReflectionPromptId)
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
              onValueChange={(value) => onFocusChange(value as ExitTicketFocus)}
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

      <div className="space-y-3 border-t pt-3">
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
          <p className="pl-[calc(1rem+0.625rem)] text-sm text-muted-foreground">
            Every response still gets feedback. Nothing goes in the gradebook.
          </p>
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

      {/* Teacher-only context. Never composed into the prompt, and posted
          only while switched on, so a ticket without notes stores none. */}
      {noteFields.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="assignment-create-exit-ticket-lesson-notes"
              checked={lessonNotesEnabled}
              onCheckedChange={(checked) =>
                onLessonNotesEnabledChange(checked === true)
              }
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
          {lessonNotesEnabled ? (
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
            </div>
          ) : null}
        </div>
      ) : null}

      <input type="hidden" name="exitTicketKind" value={kind} />
    </div>
  );
}
