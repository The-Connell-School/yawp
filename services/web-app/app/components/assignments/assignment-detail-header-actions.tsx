import { useMemo } from 'react';
import { Link } from 'react-router';
import { Copy, MoreHorizontal, Pencil, UsersIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Input } from '~/components/ui/input';
import { assignmentStudentLink } from '~/utils/assignment-links';
import useBreakpoint from '~/hooks/useBreakpoint';
import { AssignmentCopyLinkButton } from './assignment-copy-link-button';
import { useAssignmentLinkCopy } from './assignment-link-copy';

type AssignmentDetailHeaderActionsProps = {
  assignmentId: string;
  canEdit: boolean;
  collaboration?: {
    groupsOpened: boolean;
    groupCount: number;
  } | null;
  classAssignmentId: string;
  onDuplicate: () => void;
  onEdit: () => void;
  duplicateDisabled?: boolean;
  duplicateDisabledNote?: React.ReactNode;
  classPicker?: React.ReactNode;
  groupsNotOpened?: boolean;
  collaborationEnabled?: boolean;
};

export function AssignmentDetailHeaderActions({
  assignmentId,
  canEdit,
  collaboration,
  classAssignmentId,
  onDuplicate,
  onEdit,
  duplicateDisabled,
  duplicateDisabledNote,
  classPicker,
  groupsNotOpened,
  collaborationEnabled,
}: AssignmentDetailHeaderActionsProps) {
  const shareUrl = useMemo(
    () =>
      typeof window !== 'undefined'
        ? assignmentStudentLink(window.location.origin, assignmentId)
        : '',
    [assignmentId]
  );
  const { copied, copy, showFallbackLink, fallbackInputRef } =
    useAssignmentLinkCopy(shareUrl);
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === 'base' || breakpoint === 'sm';

  const groupsLabel =
    collaboration && !collaboration.groupsOpened
      ? collaboration.groupCount > 0
        ? 'Finish setting up groups'
        : 'Set up groups'
      : collaboration && groupsNotOpened
        ? 'Groups · not opened'
        : 'Groups';

  const collabTooltip =
    collaborationEnabled && groupsNotOpened
      ? 'Students can open it after groups are opened'
      : undefined;

  const copyControl = (
    <AssignmentCopyLinkButton
      copied={copied}
      onCopy={copy}
      collabGroupsPendingTooltip={collabTooltip}
    />
  );

  const desktopActions = (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2"
      data-testid="assignment-detail-actions"
    >
      {classPicker}
      {collaboration ? (
        <Button asChild variant="outline">
          <Link
            to={`/app/class-assignments/${classAssignmentId}/groups`}
            data-testid="assignment-detail-groups-link"
          >
            <UsersIcon className="mr-2 h-4 w-4" />
            {groupsLabel}
          </Link>
        </Button>
      ) : null}
      {canEdit ? (
        <>
          {copyControl}
          <Button
            type="button"
            variant="ghost"
            onClick={onDuplicate}
            disabled={duplicateDisabled}
            data-testid="assignment-detail-duplicate"
          >
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </Button>
          {duplicateDisabledNote}
          <Button
            type="button"
            variant="outline"
            onClick={onEdit}
            data-testid="assignment-detail-edit"
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </>
      ) : null}
    </div>
  );

  const mobileActions = (
    <div
      className="flex shrink-0 items-center gap-2"
      data-testid="assignment-detail-actions"
    >
      {classPicker}
      {copyControl}
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="More actions"
              data-testid="assignment-detail-actions-menu"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {collaboration ? (
              <DropdownMenuItem asChild>
                <Link
                  to={`/app/class-assignments/${classAssignmentId}/groups`}
                  data-testid="assignment-detail-groups-link"
                >
                  <UsersIcon className="mr-2 h-4 w-4" />
                  {groupsLabel}
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onSelect={onDuplicate}
              disabled={duplicateDisabled}
              data-testid="assignment-detail-duplicate"
            >
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onEdit}
              data-testid="assignment-detail-edit"
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-2">
      {isMobile ? mobileActions : desktopActions}
      {showFallbackLink ? (
        <div className="space-y-1" data-testid="assignment-copy-link-fallback">
          <label className="text-xs font-medium text-muted-foreground">
            Assignment link
          </label>
          <Input
            ref={fallbackInputRef}
            readOnly
            value={shareUrl}
            className="font-mono text-sm"
            onFocus={(e) => e.target.select()}
          />
        </div>
      ) : null}
    </div>
  );
}
