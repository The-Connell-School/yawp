import { useMemo } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { assignmentStudentLink } from '~/utils/assignment-links';
import { AssignmentCopyLinkButton } from './assignment-copy-link-button';
import { useAssignmentLinkCopy } from './assignment-link-copy';

export type AssignmentCreatedSuccessState = {
  assignmentId: string;
  title: string;
  assignmentTypeTitle: string;
  classLabels: string[];
  collaborationEnabled: boolean;
  nextStep?: { url: string; classCount: number } | null;
  saveForReuseWarning?: boolean;
};

type AssignmentCreatedSuccessPanelProps = {
  state: AssignmentCreatedSuccessState;
  onDone: () => void;
  onSetUpGroups?: () => void;
};

export function AssignmentCreatedSuccessPanel({
  state,
  onDone,
  onSetUpGroups,
}: AssignmentCreatedSuccessPanelProps) {
  const shareUrl = useMemo(
    () =>
      typeof window !== 'undefined'
        ? assignmentStudentLink(window.location.origin, state.assignmentId)
        : '',
    [state.assignmentId]
  );
  const { copied, copy, showFallbackLink, fallbackInputRef } =
    useAssignmentLinkCopy(shareUrl);

  const multiClass = state.classLabels.length > 1;
  const collabTitlePrefix = state.collaborationEnabled
    ? 'Collaborative · '
    : '';

  return (
    <div
      className="animate-in fade-in duration-150 flex flex-col gap-6"
      data-testid="assignment-created-success"
    >
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex items-center gap-2 text-emerald-900">
          <Check className="h-5 w-5 shrink-0" aria-hidden />
          <h2 className="text-lg font-semibold">Assignment created</h2>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          {collabTitlePrefix}
          {state.assignmentTypeTitle}
        </p>
        <p className="text-xl font-semibold text-foreground">{state.title}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {state.classLabels.map((label) => (
            <span
              key={label}
              className="rounded-full border border-border bg-muted/40 px-3 py-1 text-sm text-foreground"
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {state.saveForReuseWarning ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          data-testid="assignment-created-save-warning"
        >
          Saved, but couldn&apos;t save for reuse. The assignment is live for
          your class. Try saving it as a template again from Edit.
        </div>
      ) : null}

      {state.collaborationEnabled && state.nextStep ? (
        <div className="space-y-3 rounded-md border border-border p-4">
          <div>
            <p className="font-medium text-foreground">Next: set up groups</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Students work in groups on this one. Make or shuffle groups, then
              open them so students can start.
            </p>
          </div>
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={onSetUpGroups}
            data-testid="assignment-created-setup-groups"
          >
            Set up groups
            <Plus className="ml-2 h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Share with students</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            readOnly
            value={shareUrl}
            className="font-mono text-sm"
            data-testid="assignment-created-share-url"
            ref={showFallbackLink ? fallbackInputRef : undefined}
            onFocus={(e) => e.target.select()}
          />
          <AssignmentCopyLinkButton
            copied={copied}
            onCopy={copy}
            className="shrink-0"
            data-testid="assignment-created-copy-link"
          />
        </div>
        {showFallbackLink ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="assignment-created-copy-hint"
          >
            Couldn&apos;t copy automatically. The link is selected above: press
            ⌘C (Ctrl+C) to copy it.
          </p>
        ) : multiClass ? (
          <p className="text-sm text-muted-foreground">
            One link works for all {state.classLabels.length} classes. Each
            student lands in their own class.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Paste it into Google Classroom or your class page.
          </p>
        )}
        {state.collaborationEnabled ? (
          <p className="text-sm text-muted-foreground">
            Students can open it after groups are opened.
          </p>
        ) : null}
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="button"
          variant={state.collaborationEnabled ? 'outline' : 'default'}
          onClick={onDone}
          data-testid="assignment-created-done"
        >
          Done
        </Button>
      </div>
    </div>
  );
}
