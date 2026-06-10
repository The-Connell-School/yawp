import { ClipboardCheck, Pencil, Send, Users } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ClassArt } from '~/components/class-art';
import { Tooltip } from '~/components/ui/tooltip';

export type TeacherClassCardData = {
  id: string;
  grade: string;
  period: string;
  title: string | null;
  school: { id: string; name: string } | null;
  _count: { students: number; assignments: number };
  stats?: {
    ungradedCount: number;
    gradedUnreleasedCount: number;
  };
};

export function formatTeacherClassLabel(klass: {
  grade: string;
  period: string;
  title?: string | null;
}) {
  const base = `Grade ${klass.grade} • Period ${klass.period}`;
  return klass.title ? `${base} — ${klass.title}` : base;
}

export function TeacherClassCard({
  klass,
  showManageActions = false,
  onEdit,
}: {
  klass: TeacherClassCardData;
  showManageActions?: boolean;
  onEdit?: () => void;
}) {
  const ungradedCount = klass.stats?.ungradedCount ?? 0;
  const gradedUnreleasedCount = klass.stats?.gradedUnreleasedCount ?? 0;

  return (
    <div className="group flex min-h-full flex-col overflow-hidden rounded-lg border bg-background transition-shadow hover:shadow">
      <Link
        to={`/app/my-classes/${klass.id}`}
        className="flex min-h-full flex-1 flex-col"
      >
        <div className="h-32 w-full border-b">
          <ClassArt seed={klass.id} />
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div>
            {klass.school?.name ? (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {klass.school.name}
              </p>
            ) : null}
            <h4 className="mt-0.5 text-base font-semibold text-foreground">
              {formatTeacherClassLabel(klass)}
            </h4>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2">
            <Badge variant="secondary" size="sm" className="gap-1">
              <Users className="h-3 w-3" />
              {klass._count.students}
            </Badge>
            <Badge variant="outline" size="sm">
              {klass._count.assignments} assignments
            </Badge>
            {ungradedCount > 0 ? (
              <Tooltip
                text={`${ungradedCount} submission${ungradedCount === 1 ? '' : 's'} to grade`}
              >
                <Badge className="gap-1 border-orange-200 bg-orange-100 text-orange-700">
                  <ClipboardCheck className="h-3 w-3" />
                  {ungradedCount}
                </Badge>
              </Tooltip>
            ) : null}
            {gradedUnreleasedCount > 0 ? (
              <Tooltip text={`${gradedUnreleasedCount} ready to release`}>
                <Badge className="gap-1 border-blue-200 bg-blue-100 text-blue-700">
                  <Send className="h-3 w-3" />
                  {gradedUnreleasedCount}
                </Badge>
              </Tooltip>
            ) : null}
          </div>
        </div>
      </Link>

      {showManageActions ? (
        <div className="flex items-center gap-2 border-t px-3 py-2.5">
          <Button asChild size="sm" className="flex-1">
            <Link to={`/app/my-classes/${klass.id}`}>Open</Link>
          </Button>
          <Button size="sm" variant="outline" type="button" onClick={onEdit}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
      ) : null}
    </div>
  );
}
