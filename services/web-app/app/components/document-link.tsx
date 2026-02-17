import { type Document } from '@app/prisma';
import { Link, useFetcher } from 'react-router';
import { EllipsisVertical } from 'lucide-react';
import { timeAgo } from '../utils/timeAgo';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/dropdown-menu';
import { Tooltip } from './ui/tooltip';
import { formatGrade } from '~/domain/grading/gradeMath';

type Props = {
  exitTo: string;
  doc: Document & {
    studentCourseModuleSessions: { studentCourseModule: { title: string } }[];
    submittedAt?: Date | string | null;
    submittedSnapshot?: {
      grades: {
        score: string | null;
        overallScore: number | null;
        numericPercentage?: number | null;
        letterGrade?: string | null;
        releasedAt: Date | string | null;
      }[];
    } | null;
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
  const encodedExitTo = encodeURIComponent(exitTo);
  const grade = doc.submittedSnapshot?.grades?.[0];
  const isSubmitted = !!doc.submittedAt;
  const isGradeReleased =
    grade?.releasedAt !== null && grade?.releasedAt !== undefined;
  const gradeDisplay =
    formatGrade(grade?.numericPercentage ?? null, grade?.letterGrade ?? null) ||
    grade?.score ||
    (grade?.overallScore ? `${grade.overallScore}/5` : null);
  const showReleasedGradeBadge = isGradeReleased && gradeDisplay;
  const showSubmittedBadge =
    isStudentView && isSubmitted && !showReleasedGradeBadge;

  return (
    <Link
      key={doc.id}
      to={`/app/documents/${doc.id}?ssv=1&exitTo=${encodedExitTo}`}
      className="relative flex h-48 flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-all hover:border-primary/50"
    >
      {showReleasedGradeBadge ? (
        <span className="absolute right-0 top-0 z-20 rounded-bl-lg rounded-tr-lg border border-purple-600 bg-purple-50 px-2 py-0.5 text-xs text-purple-900 dark:bg-purple-950/80 dark:text-purple-100">
          Grade {gradeDisplay}
        </span>
      ) : showSubmittedBadge ? (
        <span className="absolute right-0 top-0 z-20 rounded-bl-lg rounded-tr-lg border border-muted-foreground/30 bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          Submitted
        </span>
      ) : (
        <span className="absolute right-0 top-0 z-20 rounded-bl-lg rounded-tr-lg border border-primary px-2 py-0.5 text-xs text-primary">
          {doc.studentCourseModuleSessions[0]?.studentCourseModule.title}
        </span>
      )}
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
      <div className="flex items-center justify-between border-t bg-muted p-2 text-sm">
        <div className="flex flex-col">
          <h4>{doc.title || 'Untitled document'}</h4>
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
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={(e) => e.stopPropagation()}
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
    </Link>
  );
};
