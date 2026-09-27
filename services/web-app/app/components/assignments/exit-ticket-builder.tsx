import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
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
  EXIT_TICKET_FOCUS_OPTIONS,
  EXIT_TICKET_KIND_OPTIONS,
  EXIT_TICKET_TOPIC_MAX_LENGTH,
  exitTicketFocusOption,
  exitTicketKindForMode,
  exitTicketModeForKind,
  type ExitTicketFocus,
  type ExitTicketKind,
  type ExitTicketMode,
} from '~/domain/assignment-types/exit-ticket';

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
  /** The composed prompt, or empty while the form is incomplete. */
  preview: string;
  disabled: boolean;
};

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
  preview,
  disabled,
}: ExitTicketBuilderProps) {
  const kind = exitTicketKindForMode(mode);
  const selectedFocus = exitTicketFocusOption(focus);

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

      <input type="hidden" name="exitTicketKind" value={kind} />
    </div>
  );
}
