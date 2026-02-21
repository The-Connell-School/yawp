import { Link } from 'react-router';
import { AlertCircle, Calendar } from 'lucide-react';
import { WritingLessonTopic } from '@app/prisma';
import { WRITING_LESSON_TOPICS } from '~/utils/writing-lessons/topics';

interface Assignment {
  lessonId: string;
  topic: WritingLessonTopic;
  dueAt: Date | null;
  teacherName: string;
}

interface AssignmentAlertProps {
  assignments: Assignment[];
}

export function AssignmentAlert({ assignments }: AssignmentAlertProps) {
  if (assignments.length === 0) return null;

  return (
    <div className="rounded-lg border border-primary/50 bg-primary/5 p-4 mb-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm mb-2">
            {assignments.length === 1
              ? 'You have a new writing lesson assigned'
              : `You have ${assignments.length} writing lessons assigned`}
          </h3>
          <div className="space-y-2">
            {assignments.map((assignment) => {
              const topicInfo = WRITING_LESSON_TOPICS[assignment.topic];
              return (
                <Link
                  key={assignment.lessonId}
                  to={`/app/writing-lessons/${assignment.topic.toLowerCase()}`}
                  className="flex items-center justify-between p-2 rounded bg-card hover:bg-accent transition-colors"
                >
                  <div>
                    <div className="font-medium text-sm">{topicInfo.name}</div>
                    <div className="text-xs text-muted-foreground">
                      From {assignment.teacherName}
                    </div>
                  </div>
                  {assignment.dueAt && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>
                        Due{' '}
                        {new Date(assignment.dueAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
