import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import {
  EXIT_TICKET_CHOICE_GROUPS,
  EXIT_TICKET_LESSON_NOTE_MAX_LENGTH,
  EXIT_TICKET_PROMPT_TEXT_MAX_LENGTH,
  EXIT_TICKET_TOPIC_MAX_LENGTH,
  exitTicketActivityKind,
  exitTicketActivityOption,
  exitTicketChoiceFor,
  exitTicketModeForKind,
  exitTicketV3DraftInput,
  type ExitTicketActivity,
  type ExitTicketChoice,
  type ExitTicketStarter,
  type ExitTicketV3Draft,
} from '~/domain/assignment-types/exit-ticket';

export type ExitTicketBuilderV3Props = {
  draft: ExitTicketV3Draft;
  onDraftChange: (patch: Partial<ExitTicketV3Draft>) => void;
  /** The correct answer and any context; stored as the `mustMention` note. */
  answerContext: string;
  onAnswerContextChange: (value: string) => void;
  /** The composed prompt, or empty while something is still missing. */
  preview: string;
  disabled: boolean;
};

function draftPatchForChoice(choice: ExitTicketChoice): Partial<ExitTicketV3Draft> {
  if (choice.startsWith('reflect:')) {
    const starter = choice.slice('reflect:'.length);
    return {
      activity: 'reflect',
      starter: starter === 'custom' ? null : (starter as ExitTicketStarter),
    };
  }
  return { activity: choice as ExitTicketActivity, starter: null };
}

const PROMPT_LABELS: Partial<Record<ExitTicketActivity, string>> = {
  reflect: 'Your question',
  'answer-question': 'Question',
  'engage-text': 'Prompt',
};

/**
 * The v3 exit ticket builder: what will students do, then whatever that
 * choice needs. Nothing on it is optional in disguise: every field it shows
 * is either filled for the teacher or plainly needed.
 *
 * Controlled by the creation sheet, which owns the state and the submit gate.
 */
export function ExitTicketBuilderV3({
  draft,
  onDraftChange,
  answerContext,
  onAnswerContextChange,
  preview,
  disabled,
}: ExitTicketBuilderV3Props) {
  const choice = exitTicketChoiceFor(draft.activity, draft.starter);
  const kind = exitTicketActivityKind(draft.activity);
  const option = exitTicketActivityOption(draft.activity);
  const posted = exitTicketV3DraftInput(draft);
  const writesPrompt =
    draft.activity !== 'explain-concept' &&
    !(draft.activity === 'reflect' && draft.starter);

  return (
    <div className="space-y-5 rounded-md border p-3">
      <div className="space-y-3">
        <Label id="assignment-create-exit-ticket-activity-label">
          What will students do?
        </Label>
        <RadioGroup
          aria-labelledby="assignment-create-exit-ticket-activity-label"
          value={choice}
          onValueChange={(value) =>
            onDraftChange(draftPatchForChoice(value as ExitTicketChoice))
          }
          disabled={disabled}
          className="gap-4"
        >
          {EXIT_TICKET_CHOICE_GROUPS.map((group) => (
            <div key={group.kind} className="space-y-2">
              <p className="text-sm text-muted-foreground">{group.label}</p>
              {group.choices.map((entry) => {
                const id = `assignment-create-exit-ticket-choice-${entry.value.replace(':', '-')}`;
                return (
                  <div key={entry.value} className="flex items-center gap-2.5">
                    <RadioGroupItem
                      id={id}
                      value={entry.value}
                      className="size-4 shrink-0"
                    />
                    <Label htmlFor={id} className="cursor-pointer font-normal">
                      {entry.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          ))}
        </RadioGroup>
      </div>

      {draft.activity === 'explain-concept' ? (
        <div className="space-y-2">
          <Label htmlFor="assignment-create-exit-ticket-topic">
            Which concept?
          </Label>
          <Input
            id="assignment-create-exit-ticket-topic"
            value={draft.topic}
            onChange={(event) => onDraftChange({ topic: event.target.value })}
            maxLength={EXIT_TICKET_TOPIC_MAX_LENGTH}
            placeholder={option?.placeholder}
            disabled={disabled}
            required
          />
        </div>
      ) : null}

      {writesPrompt ? (
        <div className="space-y-2">
          <Label htmlFor="assignment-create-exit-ticket-prompt">
            {PROMPT_LABELS[draft.activity] ?? 'Prompt'}
          </Label>
          <Textarea
            id="assignment-create-exit-ticket-prompt"
            value={draft.promptText}
            onChange={(event) =>
              onDraftChange({ promptText: event.target.value })
            }
            rows={draft.activity === 'engage-text' ? 4 : 2}
            maxLength={EXIT_TICKET_PROMPT_TEXT_MAX_LENGTH}
            placeholder={option?.placeholder}
            disabled={disabled}
            required
          />
        </div>
      ) : null}

      {kind === 'check' ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label id="assignment-create-exit-ticket-answer-label">
              Is there a correct answer?
            </Label>
            <RadioGroup
              aria-labelledby="assignment-create-exit-ticket-answer-label"
              value={draft.answerType}
              onValueChange={(value) =>
                onDraftChange({
                  answerType: value === 'objective' ? 'objective' : 'subjective',
                })
              }
              disabled={disabled}
              className="flex gap-5"
            >
              {(
                [
                  ['objective', 'Yes'],
                  ['subjective', 'No'],
                ] as const
              ).map(([value, label]) => (
                <div key={value} className="flex items-center gap-2">
                  <RadioGroupItem
                    id={`assignment-create-exit-ticket-answer-${value}`}
                    value={value}
                    className="size-4 shrink-0"
                  />
                  <Label
                    htmlFor={`assignment-create-exit-ticket-answer-${value}`}
                    className="cursor-pointer font-normal"
                  >
                    {label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          {draft.answerType === 'objective' ? (
            <div className="space-y-1.5">
              <Label htmlFor="assignment-create-exit-ticket-answer-context">
                The answer{' '}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="assignment-create-exit-ticket-answer-context"
                name="exitTicketLessonMustMention"
                value={answerContext}
                onChange={(event) => onAnswerContextChange(event.target.value)}
                rows={3}
                maxLength={EXIT_TICKET_LESSON_NOTE_MAX_LENGTH}
                placeholder="e.g., Allie is Holden’s younger brother, who died of leukemia. “His brother” is enough."
                disabled={disabled}
              />
              <p className="text-sm text-muted-foreground">
                Add the answer and any context for reading responses. Students
                don’t see this.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

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
            className="whitespace-pre-line rounded-md bg-muted p-3 text-sm"
          >
            {preview}
          </p>
        ) : (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            {draft.activity === 'explain-concept'
              ? 'Name the concept to see the prompt.'
              : 'Write the prompt to see it here.'}
          </p>
        )}
      </div>

      <input type="hidden" name="exitTicketActivity" value={draft.activity} />
      <input type="hidden" name="exitTicketKind" value={kind} />
      <input
        type="hidden"
        name="exitTicketMode"
        value={exitTicketModeForKind(kind)}
      />
      <input
        type="hidden"
        name="exitTicketPromptText"
        value={posted.promptText ?? ''}
      />
      {posted.starter ? (
        <input type="hidden" name="exitTicketStarter" value={posted.starter} />
      ) : null}
      {posted.topic ? (
        <input type="hidden" name="exitTicketTopic" value={posted.topic} />
      ) : null}
      {posted.answerType ? (
        <input
          type="hidden"
          name="exitTicketAnswerType"
          value={posted.answerType}
        />
      ) : null}
    </div>
  );
}
