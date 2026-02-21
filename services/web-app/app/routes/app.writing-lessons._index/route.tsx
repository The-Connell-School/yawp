import {
  type LoaderFunctionArgs,
  data as dataResponse,
} from 'react-router';
import { useLoaderData } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { WritingLessonTopic } from '@app/prisma';
import { TopicGrid } from '~/components/writing-lessons/topic-grid';
import { AssignmentAlert } from '~/components/writing-lessons/assignment-alert';
import { BookOpen, Search } from 'lucide-react';
import { Input } from '~/components/ui/input';
import { useState } from 'react';
import { WRITING_LESSON_TOPICS } from '~/utils/writing-lessons/topics';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.studentProfile) {
    throw new Response('Student profile required', { status: 403 });
  }

  // Fetch student's sessions to show progress
  const sessions = await prisma.writingLessonSession.findMany({
    where: {
      studentProfileId: profile.studentProfile.id,
    },
    select: {
      lessonId: true,
      lesson: {
        select: {
          topic: true,
        },
      },
      completedAt: true,
    },
  });

  // Fetch assigned lessons
  const assignments = await prisma.writingLessonAssignment.findMany({
    where: {
      OR: [
        { studentProfileId: profile.studentProfile.id },
        {
          classId: {
            in: profile.studentProfile.classes.map((c) => c.id),
          },
        },
      ],
    },
    include: {
      lesson: {
        select: {
          id: true,
          topic: true,
        },
      },
      teacherProfile: {
        include: {
          profile: {
            include: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return dataResponse({
    sessions: sessions.map((s) => s.lesson.topic),
    assignments: assignments.map((a) => ({
      lessonId: a.lesson.id,
      topic: a.lesson.topic,
      dueAt: a.dueAt,
      teacherName: a.teacherProfile.profile.user.name || 'Your teacher',
    })),
  });
}

export default function WritingLessonsIndex() {
  const { sessions, assignments } = useLoaderData<typeof loader>();
  const [searchQuery, setSearchQuery] = useState('');

  const sessionSet = new Set(sessions);
  const assignmentSet = new Set(assignments.map((a) => a.topic));

  // Filter topics based on search
  const filteredTopics = searchQuery
    ? (Object.keys(WRITING_LESSON_TOPICS) as WritingLessonTopic[]).filter(
        (topic) => {
          const topicInfo = WRITING_LESSON_TOPICS[topic];
          const query = searchQuery.toLowerCase();
          return (
            topicInfo.name.toLowerCase().includes(query) ||
            topicInfo.description.toLowerCase().includes(query)
          );
        }
      )
    : null;

  return (
    <div className="h-full w-full overflow-y-auto">
      {/* Header */}
      <div className="border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-5">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-primary/10 p-3">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold mb-2">Writing Lessons</h1>
              <p className="text-muted-foreground">
                Quick mini-lessons on core writing skills. Pick a topic or complete
                assigned lessons.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-screen-lg p-5 pb-24">
        {/* Assignments Alert */}
        {assignments.length > 0 && (
          <AssignmentAlert assignments={assignments} />
        )}

        {/* Search */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search for a topic or ask: What do you need help with?"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Topics Grid */}
        {filteredTopics ? (
          filteredTopics.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTopics.map((topic) => (
                <div key={topic}>
                  {/* Would use TopicCard but need to create custom filtered version */}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No topics found matching "{searchQuery}"</p>
              <p className="text-sm mt-2">Try a different search term</p>
            </div>
          )
        ) : (
          <TopicGrid sessions={sessionSet} assignments={assignmentSet} />
        )}
      </div>
    </div>
  );
}
