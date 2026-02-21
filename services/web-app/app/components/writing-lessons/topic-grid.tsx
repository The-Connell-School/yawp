import { WritingLessonTopic } from '@app/prisma';
import { WRITING_LESSON_TOPICS, CATEGORY_LABELS } from '~/utils/writing-lessons/topics';
import { TopicCard } from './topic-card';

interface TopicGridProps {
  sessions?: Set<WritingLessonTopic>;
  assignments?: Set<WritingLessonTopic>;
}

export function TopicGrid({ sessions = new Set(), assignments = new Set() }: TopicGridProps) {
  // Group topics by category
  const topicsByCategory = Object.entries(WRITING_LESSON_TOPICS).reduce(
    (acc, [topic, info]) => {
      if (!acc[info.category]) {
        acc[info.category] = [];
      }
      acc[info.category].push(topic as WritingLessonTopic);
      return acc;
    },
    {} as Record<string, WritingLessonTopic[]>
  );

  return (
    <div className="space-y-8">
      {Object.entries(topicsByCategory).map(([category, topics]) => (
        <div key={category}>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {topics.map((topic) => (
              <TopicCard
                key={topic}
                topic={topic}
                hasSession={sessions.has(topic)}
                isAssigned={assignments.has(topic)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
