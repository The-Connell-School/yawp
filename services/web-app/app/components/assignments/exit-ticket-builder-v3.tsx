import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import { Checkbox } from '~/components/ui/checkbox';
import {
  EXIT_TICKET_CHOICE_GROUPS,
  EXIT_TICKET_QUESTIONS_LINE,
  EXIT_TICKET_V3_CONTEXT_FIELD,
  EXIT_TICKET_LESSON_NOTE_MAX_LENGTH,
  EXIT_TICKET_PROMPT_TEXT_MAX_LENGTH,
  EXIT_TICKET_TOPIC_MAX_LENGTH,
  exitTicketActivityKind,
  exitTicketActivityOption,
  exitTicketChoiceFor,
  exitTicketModeForKind,
  exitTicketOffersQuestionsLine,
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
  /** "Anything Yawp! should know…", stored as the `mainPoints` note. */
  contextNote: string;
  onContextNoteChange: (value: string) => void;
  /** A mix-up note from an older form or the planner, posted unchanged. */
  keptWatchFor?: string;
  /** The composed prompt, or empty while something is still missing. */
  preview: string;
  disabled: boolean;
};

/**
 * A typed prompt follows the teacher between "Answer a question" and
 * "Grapple with a text or source", which both take one. A reflection
 * question is not carried into a check, or a check into a reflection.
 */
function draftPatchForChoice(
  current: ExitTicketV3Draft,
  choice: ExitTicketChoice
): Partial<ExitTicketV3Draft> {
  const next: Partial<ExitTicketV3Draft> = choice.startsWith('reflect:')
    ? {
        activity: 'reflect',
        starter:
          choice === 'reflect:custom'
            ? null
            : (choice.slice('reflect:'.length) as ExitTicketStarter),
      }
    : { activity: choice as ExitTicketActivity, starter: null };
  const sameKind =
    exitTicketActivityKind(current.activity) ===
    exitTicketActivityKind(next.activity!);
  return sameKind ? next : { ...next, promptText: '' };
}

const PROMPT_LABELS: Partial<Record<ExitTicketActivity, string>> = {
  reflect: 'Your question',
  'answer-question': 'Question',
  'engage-text': 'Prompt',
};

/**
 * The v3 exit ticket builder: what will students do, then whatever that
 * choice needs. The prompt (or concept) is the only thing it requires; the
 * correct answer, the questions line and the note for Yawp! are labelled
 * optional and never hold Create back.
 *
 * Controlled by the creation sheet, which owns the state and the submit gate.
 */
export function ExitTicketBuilderV3({
  draft,
  onDraftChange,
  answerContext,
  onAnswerContextChange,
  contextNote,
  onContextNoteChange,
  keptWatchFor = '',
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
            onDraftChange(draftPatchForChoice(draft, value as ExitTicketChoice))
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
                Describe the correct answer{' '}
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
                Yawp! uses it to give accurate feedback. Students don’t see it.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {exitTicketOffersQuestionsLine(draft) ? (
        <div className="flex items-start gap-2.5">
          <Checkbox
            id="assignment-create-exit-ticket-invites-questions"
            checked={draft.invitesQuestions}
            onCheckedChange={(checked) =>
              onDraftChange({ invitesQuestions: checked === true })
            }
            disabled={disabled}
            className="mt-0.5 size-4 shrink-0"
          />
          <Label
            htmlFor="assignment-create-exit-ticket-invites-questions"
            className="cursor-pointer font-normal leading-snug"
          >
            Add a line inviting questions{' '}
            <span className="text-muted-foreground">(optional)</span>
            <span className="block text-sm text-muted-foreground">
              Students see: “{EXIT_TICKET_QUESTIONS_LINE}”
            </span>
          </Label>
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

      <div className="space-y-1.5">
        <Label htmlFor="assignment-create-exit-ticket-context-note">
          {EXIT_TICKET_V3_CONTEXT_FIELD.label}{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="assignment-create-exit-ticket-context-note"
          name="exitTicketLessonMainPoints"
          value={contextNote}
          onChange={(event) => onContextNoteChange(event.target.value)}
          rows={2}
          maxLength={EXIT_TICKET_LESSON_NOTE_MAX_LENGTH}
          placeholder={EXIT_TICKET_V3_CONTEXT_FIELD.placeholder}
          disabled={disabled}
        />
        <p className="text-sm text-muted-foreground">
          {EXIT_TICKET_V3_CONTEXT_FIELD.helperText}
        </p>
      </div>

      <input type="hidden" name="exitTicketActivity" value={draft.activity} />
      <input
        type="hidden"
        name="exitTicketInvitesQuestions"
        value={posted.invitesQuestions ? 'true' : 'false'}
      />
      {keptWatchFor ? (
        <input
          type="hidden"
          name="exitTicketLessonWatchFor"
          value={keptWatchFor}
        />
      ) : null}
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
