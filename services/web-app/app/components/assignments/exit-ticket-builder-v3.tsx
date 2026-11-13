import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import {
  EXIT_TICKET_ACTIVITY_GROUPS,
  EXIT_TICKET_GRADING_BASIS_OPTIONS,
  EXIT_TICKET_LESSON_NOTE_MAX_LENGTH,
  EXIT_TICKET_PROMPT_TEXT_MAX_LENGTH,
  EXIT_TICKET_STARTER_OPTIONS,
  exitTicketActivityKind,
  exitTicketActivityOption,
  exitTicketModeForKind,
  type ExitTicketActivity,
  type ExitTicketGradingBasis,
  type ExitTicketStarter,
} from '~/domain/assignment-types/exit-ticket';

/** The v3 grading labels: "Understanding" reads better than "Quality" here. */
const BASIS_LABELS: Record<
  ExitTicketGradingBasis,
  { label: string; helperText: string }
> = {
  completion: {
    label: 'Completion',
    helperText: 'Full credit for any real attempt.',
  },
  bands: {
    label: 'Understanding',
    helperText: 'Scored on how well they show they understand it.',
  },
};

export type ExitTicketBuilderV3Props = {
  activity: ExitTicketActivity;
  onActivityChange: (activity: ExitTicketActivity) => void;
  promptText: string;
  onPromptTextChange: (promptText: string) => void;
  /** The reflection starter the prompt came from, if any. */
  starter: ExitTicketStarter | null;
  /** A starter chip fills the prompt box with its words. */
  onStarterChange: (starter: ExitTicketStarter) => void;
  /** Stored as the `mustMention` lesson note; checks only. */
  keyPoints: string;
  onKeyPointsChange: (keyPoints: string) => void;
  graded: boolean;
  onGradedChange: (graded: boolean) => void;
  pointValue: string;
  onPointValueChange: (pointValue: string) => void;
  gradingBasis: ExitTicketGradingBasis;
  onGradingBasisChange: (basis: ExitTicketGradingBasis) => void;
  /** The composed prompt, or empty while the prompt box is empty. */
  preview: string;
  disabled: boolean;
};

/**
 * The v3 exit ticket builder: what will students do, then the prompt.
 *
 * One screen and no disclosures. Each activity carries a sentence or two
 * that steers toward one purposeful ask, which is the reading the team wanted
 * to keep; everything else the quick builder explained is gone. The teacher
 * writes the prompt; the closing line follows the activity and shows in the
 * preview. Controlled by the creation sheet, which owns the state and the
 * submit gate.
 */
export function ExitTicketBuilderV3({
  activity,
  onActivityChange,
  promptText,
  onPromptTextChange,
  starter,
  onStarterChange,
  keyPoints,
  onKeyPointsChange,
  graded,
  onGradedChange,
  pointValue,
  onPointValueChange,
  gradingBasis,
  onGradingBasisChange,
  preview,
  disabled,
}: ExitTicketBuilderV3Props) {
  const kind = exitTicketActivityKind(activity);
  const selected = exitTicketActivityOption(activity);

  return (
    <div className="space-y-5 rounded-md border p-3">
      <div className="space-y-3">
        <Label id="assignment-create-exit-ticket-activity-label">
          What will students do?
        </Label>
        <RadioGroup
          aria-labelledby="assignment-create-exit-ticket-activity-label"
          value={activity}
          onValueChange={(value) =>
            onActivityChange(value as ExitTicketActivity)
          }
          disabled={disabled}
          className="gap-4"
        >
          {EXIT_TICKET_ACTIVITY_GROUPS.map((group) => (
            <div key={group.kind} className="space-y-2">
              <div>
                <p className="text-sm font-medium">{group.label}</p>
                <p className="text-sm text-muted-foreground">
                  {group.description}
                </p>
              </div>
              {group.activities.map((value) => {
                const option = exitTicketActivityOption(value)!;
                const id = `assignment-create-exit-ticket-activity-${value}`;
                return (
                  <div
                    key={value}
                    className="flex items-start gap-2.5 rounded-md border p-2.5"
                  >
                    <RadioGroupItem id={id} value={value} className="mt-1" />
                    <Label htmlFor={id} className="cursor-pointer font-normal">
                      <span className="font-medium">{option.label}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {option.description}
                      </span>
                    </Label>
                  </div>
                );
              })}
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor="assignment-create-exit-ticket-prompt">Prompt</Label>
        {activity === 'reflect' ? (
          <div className="flex flex-wrap gap-2">
            {EXIT_TICKET_STARTER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={starter === option.id}
                onClick={() => onStarterChange(option.id)}
                disabled={disabled}
                className={
                  starter === option.id
                    ? 'rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm disabled:opacity-50'
                    : 'rounded-full border px-3 py-1 text-sm disabled:opacity-50'
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        <Textarea
          id="assignment-create-exit-ticket-prompt"
          name="exitTicketPromptText"
          value={promptText}
          onChange={(event) => onPromptTextChange(event.target.value)}
          rows={activity === 'engage-text' ? 4 : 3}
          maxLength={EXIT_TICKET_PROMPT_TEXT_MAX_LENGTH}
          placeholder={selected?.placeholder}
          disabled={disabled}
          required
        />
      </div>

      {kind === 'check' ? (
        <div className="space-y-1.5">
          <Label htmlFor="assignment-create-exit-ticket-key-points">
            Correct answer or key points{' '}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Textarea
            id="assignment-create-exit-ticket-key-points"
            name="exitTicketLessonMustMention"
            value={keyPoints}
            onChange={(event) => onKeyPointsChange(event.target.value)}
            rows={2}
            maxLength={EXIT_TICKET_LESSON_NOTE_MAX_LENGTH}
            disabled={disabled}
          />
          <p className="text-sm text-muted-foreground">
            Students never see this. Responses are read against it, so a right
            answer in different words or spelling still counts.
          </p>
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
            Write the prompt to see what your students will get.
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
            Grading is optional. Set it for an easy grade or leave it ungraded
            if you just want to see who got it and who didn&apos;t.
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
            <div className="space-y-2">
              <Label id="assignment-create-exit-ticket-basis-label">
                Graded on
              </Label>
              <RadioGroup
                aria-labelledby="assignment-create-exit-ticket-basis-label"
                value={gradingBasis}
                onValueChange={(value) =>
                  onGradingBasisChange(value as ExitTicketGradingBasis)
                }
                disabled={disabled}
                className="gap-2"
              >
                {EXIT_TICKET_GRADING_BASIS_OPTIONS.map(({ value }) => (
                  <div key={value} className="flex items-start gap-2.5">
                    <RadioGroupItem
                      id={`assignment-create-exit-ticket-basis-${value}`}
                      value={value}
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <Label
                      htmlFor={`assignment-create-exit-ticket-basis-${value}`}
                      className="cursor-pointer font-normal"
                    >
                      <span className="font-medium">
                        {BASIS_LABELS[value].label}
                      </span>{' '}
                      <span className="text-muted-foreground">
                        — {BASIS_LABELS[value].helperText}
                      </span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              <input
                type="hidden"
                name="exitTicketGradingBasis"
                value={gradingBasis}
              />
            </div>
          </div>
        )}
      </div>

      <input type="hidden" name="exitTicketActivity" value={activity} />
      <input type="hidden" name="exitTicketKind" value={kind} />
      <input
        type="hidden"
        name="exitTicketMode"
        value={exitTicketModeForKind(kind)}
      />
      {starter ? (
        <input type="hidden" name="exitTicketStarter" value={starter} />
      ) : null}
    </div>
  );
}
