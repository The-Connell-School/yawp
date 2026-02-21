import { Link } from 'react-router';
import { WritingLessonTopic } from '@app/prisma';
import * as Icons from 'lucide-react';
import { WRITING_LESSON_TOPICS } from '~/utils/writing-lessons/topics';
import { cn } from '~/utils/misc';

interface TopicCardProps {
  topic: WritingLessonTopic;
  hasSession?: boolean;
  isAssigned?: boolean;
  className?: string;
}

export function TopicCard({
  topic,
  hasSession = false,
  isAssigned = false,
  className,
}: TopicCardProps) {
  const topicInfo = WRITING_LESSON_TOPICS[topic];
  const IconComponent = Icons[topicInfo.icon as keyof typeof Icons] as any;

  return (
    <Link
      to={`/app/writing-lessons/${topic.toLowerCase()}`}
      className={cn(
        'group relative flex flex-col rounded-lg border bg-card p-4 transition-all hover:shadow-md hover:border-primary/50',
        hasSession && 'border-primary/20 bg-primary/5',
        isAssigned && 'ring-2 ring-primary ring-offset-2',
        className
      )}
    >
      {isAssigned && (
        <div className="absolute -top-2 -right-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
          Assigned
        </div>
      )}

      <div className="flex items-start gap-3">
        <div
          className={cn(
            'rounded-lg p-2 bg-muted group-hover:bg-primary/10 transition-colors',
            hasSession && 'bg-primary/10'
          )}
        >
          {IconComponent && (
            <IconComponent
              className={cn(
                'h-5 w-5 text-muted-foreground group-hover:text-primary',
                hasSession && 'text-primary'
              )}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm mb-1 group-hover:text-primary transition-colors">
            {topicInfo.name}
          </h3>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {topicInfo.description}
          </p>
        </div>
      </div>

      {hasSession && (
        <div className="mt-3 flex items-center gap-2 text-xs text-primary">
          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
          <span>In Progress</span>
        </div>
      )}
    </Link>
  );
}
