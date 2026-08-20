import { History } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { submissionActivityUiContract } from '~/domain/submissions/submission-activity-ui-contract';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';

export type SubmissionActivityItem = {
  id: string;
  eventType: string;
  source: string;
  occurredAfterRelease: boolean;
  changes: unknown;
  metadata: unknown;
  createdAt: Date | string;
  actorType: string;
  actorName: string | null;
  actorEmail: string | null;
  actorMembership: {
    user: { name: string | null; email: string };
  } | null;
};

const eventLabels: Record<string, string> = {
  'submission.created': 'Submission created',
  'submission.title_updated': 'Title changed',
  'submission.body_updated': 'Submission body changed',
  'submission.grade_updated': submissionActivityUiContract.gradeUpdatedLabel,
  'submission.grade_finalized': 'Grade finalized',
  'submission.grade_released': 'Grade released',
  'submission.grading_assistant_updated': 'Grading Assistant suggestions saved',
  'submission.comment_created': 'Comment added',
  'submission.comment_updated': 'Comment changed',
  'submission.comment_deleted': 'Comment deleted',
  'submission.unsubmitted': 'Submission withdrawn',
};

export function formatSubmissionActivityEvent(eventType: string) {
  return eventLabels[eventType] ?? eventType.replaceAll(/[._]/g, ' ');
}

function fieldLabel(field: string) {
  return field
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatNestedValue(field: string, value: unknown) {
  if (field === 'rubricScores' && value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([category, raw]) => {
        const detail =
          raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as { score?: unknown; comment?: unknown })
            : { score: raw };
        const score =
          detail.score == null ? 'Not scored' : String(detail.score);
        const comment =
          typeof detail.comment === 'string' && detail.comment.trim()
            ? ` — ${detail.comment.trim()}`
            : '';
        return `${fieldLabel(category)}: ${score}${comment}`;
      })
      .join('\n');
  }

  if (field === 'grammarIssues' && Array.isArray(value)) {
    if (value.length === 0) return 'No issues';
    return value
      .map((raw, index) => {
        if (!raw || typeof raw !== 'object') return `Issue ${index + 1}`;
        const issue = raw as {
          kind?: unknown;
          excerpt?: unknown;
          message?: unknown;
        };
        const label =
          typeof issue.kind === 'string'
            ? fieldLabel(issue.kind)
            : `Issue ${index + 1}`;
        const excerpt =
          typeof issue.excerpt === 'string' ? ` “${issue.excerpt}”` : '';
        const message =
          typeof issue.message === 'string' ? ` — ${issue.message}` : '';
        return `${label}:${excerpt}${message}`;
      })
      .join('\n');
  }

  return null;
}

function formatValue(field: string, value: unknown) {
  if (value == null || value === '') return 'None';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return formatNestedValue(field, value) ?? JSON.stringify(value, null, 2);
}

function activityChanges(changes: unknown) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return [];
  }
  return Object.entries(changes as Record<string, unknown>).flatMap(
    ([field, raw]) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
      const change = raw as { before?: unknown; after?: unknown };
      return [{ field, before: change.before, after: change.after }];
    }
  );
}

export function SubmissionActivitySheet({
  activities,
}: {
  activities: SubmissionActivityItem[];
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          data-testid={submissionActivityUiContract.triggerTestId}
        >
          <History className="h-3.5 w-3.5" />
          Activity
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-lg"
        data-testid={submissionActivityUiContract.panelTestId}
      >
        <SheetHeader>
          <SheetTitle>Submission Activity</SheetTitle>
          <SheetDescription>
            A durable record of actions taken on this submission. Newest
            activity appears first; up to 100 recent events are shown.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4" data-testid="submission-activity-list">
          {activities.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No activity has been recorded for this submission yet.
            </p>
          ) : (
            activities.map((activity) => {
              const occurredAt = new Date(activity.createdAt);
              const actor =
                activity.actorName?.trim() ||
                activity.actorEmail ||
                activity.actorMembership?.user.name?.trim() ||
                activity.actorMembership?.user.email ||
                (activity.actorType === 'human' ? 'Former user' : 'System');
              return (
                <article
                  key={activity.id}
                  className="rounded-lg border bg-background p-4 shadow-sm"
                  data-testid={`submission-activity-${activity.id}`}
                  data-activity-item="true"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">
                        {formatSubmissionActivityEvent(activity.eventType)}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {actor} ·{' '}
                        <time
                          dateTime={occurredAt.toISOString()}
                          title={occurredAt.toISOString()}
                        >
                          {occurredAt.toLocaleString()}
                        </time>
                      </p>
                    </div>
                    {activity.occurredAfterRelease ? (
                      <Badge
                        variant="secondary"
                        data-testid={
                          submissionActivityUiContract.afterReleaseTestId
                        }
                      >
                        After release
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-3 space-y-2">
                    {activityChanges(activity.changes).map((change) => (
                      <div
                        key={change.field}
                        className="rounded-md bg-muted/50 px-3 py-2 text-xs"
                      >
                        <p className="font-medium">
                          {fieldLabel(change.field)}
                        </p>
                        <div className="mt-1 grid gap-2 sm:grid-cols-2">
                          <div className="min-w-0">
                            <span className="text-muted-foreground">
                              Before
                            </span>
                            <pre className="mt-0.5 whitespace-pre-wrap break-words font-sans">
                              {formatValue(change.field, change.before)}
                            </pre>
                          </div>
                          <div className="min-w-0">
                            <span className="text-muted-foreground">After</span>
                            <pre className="mt-0.5 whitespace-pre-wrap break-words font-sans">
                              {formatValue(change.field, change.after)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
