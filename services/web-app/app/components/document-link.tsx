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

type Props = {
  exitTo: string;
  doc: Document & {
    studentCourseModuleSessions: { studentCourseModule: { title: string } }[];
    submittedSnapshot?: {
      grades: {
        score: string | null;
        overallScore: number | null;
        releasedAt: Date | string | null;
      }[];
    } | null;
  };
  isArchived?: boolean;
};

export const DocumentLink = ({ doc, exitTo, isArchived = false }: Props) => {
  const archiveFetcher = useFetcher();
  const grade = doc.submittedSnapshot?.grades?.[0];
  const isGradeReleased = grade?.releasedAt !== null && grade?.releasedAt !== undefined;
  const gradeDisplay = grade?.score || (grade?.overallScore ? `${grade.overallScore}/5` : null);

  return (
    <Link
      key={doc.id}
      to={`/app/documents/${doc.id}?ssv=1&exitTo=${exitTo}`}
      className="relative flex h-48 flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-all hover:border-primary/50"
    >
      <span className="absolute right-0 top-0 z-20 rounded-bl-lg rounded-tr-lg border border-primary px-2 py-0.5 text-xs text-primary">
        {doc.studentCourseModuleSessions[0]?.studentCourseModule.title}
      </span>
      {isGradeReleased && gradeDisplay && (
        <span className="absolute left-0 top-0 z-20 rounded-br-lg rounded-tl-lg border border-green-600 bg-green-50 px-2 py-0.5 text-xs text-green-900 dark:bg-green-950/80 dark:text-green-100">
          Grade: {gradeDisplay}
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
