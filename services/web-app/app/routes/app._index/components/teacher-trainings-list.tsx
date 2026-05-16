import { Link } from 'react-router';
import { Badge } from '~/components/ui/badge';

type TeacherTrainingRow = {
  id: string;
  title: string;
  description: string | null;
  image?: { id: string } | null;
  teacherTrainingModules: { id: string }[];
};

export function TeacherTrainingsList({
  teacherTrainings,
}: {
  teacherTrainings: TeacherTrainingRow[];
}) {
  return (
    <div data-testid="teacher-trainings-list">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Teacher&apos;s Lounge</h2>
        {teacherTrainings.length > 0 ? (
          <Badge variant="secondary" size="sm">
            {teacherTrainings.length}
          </Badge>
        ) : null}
      </div>

      {teacherTrainings.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No teacher trainings yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teacherTrainings.map((training) => (
            <Link
              key={training.id}
              to={`/app/teacher-trainings/${training.id}`}
              className="flex min-h-full flex-col overflow-hidden rounded-lg border bg-muted transition-shadow hover:shadow"
            >
              {training.image ? (
                <img
                  src={`/api/image/teacher-training/${training.image.id}`}
                  alt=""
                  className="h-32 w-full object-cover"
                />
              ) : (
                <div className="h-32 w-full bg-gradient-to-br from-foreground/5 to-foreground/20" />
              )}
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-foreground/90">{training.title}</h4>
                  <Badge variant="secondary" size="sm">
                    {training.teacherTrainingModules.length}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {training.description || 'No description'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
