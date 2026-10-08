import { type Document } from '@app/prisma';
import { Link, useFetcher } from 'react-router';
import { EllipsisVertical, Users } from 'lucide-react';
import { timeAgo } from '../utils/timeAgo';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/dropdown-menu';
import { Tooltip } from './ui/tooltip';
import {
  resolveDocumentLinkTarget,
  type DocumentLinkSubmission,
} from '../utils/document-link-target';
import { latestVisibleStudentSubmission } from '../utils/student-document-status';

type Props = {
  exitTo: string;
  doc: Document & {
    assignmentModuleSessions: { assignmentModule: { title: string } }[];
    submissions?: DocumentLinkSubmission[];
    assignment?: { title?: string | null } | null;
    group?: { id: string; label: string } | null;
  };
  isArchived?: boolean;
  isStudentView?: boolean;
};

export const DocumentLink = ({
  doc,
  exitTo,
  isArchived = false,
  isStudentView = false,
}: Props) => {
  const archiveFetcher = useFetcher();
  const submissions = doc.submissions ?? [];
  const visibleSubmissions = submissions.filter(
    (s) => !s.archivedAt && !s.unsubmittedAt
  );
  const latestSubmission = latestVisibleStudentSubmission(visibleSubmissions);
  const isSubmitted = visibleSubmissions.length > 0;
  const gradedSubmissions = visibleSubmissions.filter(
    (s) => s.releasedAt !== null && s.releasedAt !== undefined
  );
  const showGradedBadge = isStudentView && latestSubmission?.releasedAt != null;
  const showRevisionSubmittedBadge =
    isStudentView &&
    latestSubmission != null &&
    latestSubmission.releasedAt == null &&
    gradedSubmissions.length > 0;
  const showSubmittedBadge = isStudentView && isSubmitted && !showGradedBadge;
  const targetPath = doc.group
    ? `/app/collab-documents/${doc.id}?exitTo=${encodeURIComponent(exitTo)}`
    : resolveDocumentLinkTarget({
        documentId: doc.id,
        exitTo,
        isStudentView,
        submissions,
      });

  // The actions menu sits beside the link rather than inside it: a button
  // inside a link is invalid markup, and React then re-renders the whole page
  // on the client.
  return (
    <div
      key={doc.id}
      className="relative h-48 overflow-hidden rounded-lg border bg-white shadow-sm transition-all hover:border-primary/50"
    >
      <Link to={targetPath} className="flex h-full flex-col">
        {doc.group ? (
          <span className="absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded-full border bg-background/95 px-2 py-0.5 text-xs font-medium text-foreground shadow-sm">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Shared
          </span>
        ) : null}
        <div className="absolute right-0 top-0 z-20 flex flex-col items-end gap-1">
          {showGradedBadge ? (
            <span className="rounded-bl-lg rounded-tr-lg border border-green-600 bg-green-50 px-2 py-0.5 text-xs text-green-900 dark:bg-green-950/80 dark:text-green-100">
              {gradedSubmissions.length} graded
            </span>
          ) : showSubmittedBadge ? (
            <>
              <span className="rounded-bl-lg rounded-tr-lg border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-950">
                {showRevisionSubmittedBadge
                  ? 'Revision submitted'
                  : 'Submitted'}
              </span>
              {showRevisionSubmittedBadge ? (
                <span className="mr-1 rounded-full border border-green-600/40 bg-white/95 px-2 py-0.5 text-[10px] font-medium text-green-900 shadow-xs">
                  {gradedSubmissions.length}{' '}
                  {gradedSubmissions.length === 1
                    ? 'previous grade'
                    : 'previous grades'}
                </span>
              ) : null}
            </>
          ) : (
            <span className="rounded-bl-lg rounded-tr-lg border border-primary px-2 py-0.5 text-xs text-primary">
              {doc.assignmentModuleSessions[0]?.assignmentModule.title}
            </span>
          )}
        </div>
        {doc.html ? (
          <div
            dangerouslySetInnerHTML={{ __html: doc.html }}
            className="z-10 flex-1 scale-90 overflow-hidden p-3 font-times text-sm"
          />
        ) : (
          <p className="flex w-full flex-1 items-center justify-center bg-white p-3 text-lg text-muted-foreground/60">
            No preview.
          </p>
        )}
        <div
          className={`flex items-center justify-between border-t bg-muted p-2 text-sm${doc.group ? '' : ' pr-12'}`}
        >
          <div className="flex flex-col">
            <h4>{doc.title || doc.assignment?.title || 'Untitled document'}</h4>
            <Tooltip
              delayDuration={200}
              text={new Date(doc.updatedAt).toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            >
              <p className="mt-1 text-xs text-muted-foreground">
                Updated{' '}
                <span className="underline">{timeAgo(doc.updatedAt)}</span>
              </p>
            </Tooltip>
          </div>
        </div>
      </Link>
      {!doc.group ? (
        <div className="absolute bottom-2 right-2 z-30">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Document actions"
              >
                <EllipsisVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <archiveFetcher.Form
                method="POST"
                action={`/api/model/document/${doc.id}`}
              >
                <input
                  type="hidden"
                  name="action"
                  value={isArchived ? 'unarchive' : 'archive'}
                />
                <DropdownMenuItem asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isArchived ? 'Unarchive' : 'Archive'}
                  </Button>
                </DropdownMenuItem>
              </archiveFetcher.Form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );
};
