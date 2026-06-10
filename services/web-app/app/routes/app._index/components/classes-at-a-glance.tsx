import { Link } from 'react-router';
import { Badge } from '~/components/ui/badge';
import {
  TeacherClassCard,
  type TeacherClassCardData,
} from '~/components/teacher-class-card';

export function ClassesAtAGlance({
  classes,
}: {
  classes: TeacherClassCardData[];
}) {
  return (
    <div data-testid="teacher-classes-grid">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">My Classes</h2>
        <div className="flex items-center gap-2">
          {classes.length > 0 ? (
            <Badge variant="secondary" size="sm">
              {classes.length}
            </Badge>
          ) : null}
          <Link
            to="/app/my-classes"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View all
          </Link>
        </div>
      </div>

      {classes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No classes yet. Create one from My Classes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((klass) => (
            <TeacherClassCard key={klass.id} klass={klass} />
          ))}
        </div>
      )}
    </div>
  );
}
