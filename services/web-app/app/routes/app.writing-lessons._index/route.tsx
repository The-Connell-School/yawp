import { BookOpen, ChevronRight } from 'lucide-react';
import {
  Link,
  data as dataResponse,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';

import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { isWritingLessonsEnabledForOrganization } from '~/utils/feature-flags.server';
import { getQuickWritingLessonGroups } from '~/utils/writing-lessons/static-lessons.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const enabled = await isWritingLessonsEnabledForOrganization(
    profile.organization.id
  );

  if (!enabled) {
    return redirect('/app');
  }

  return dataResponse({
    groups: getQuickWritingLessonGroups(),
  });
}

export default function WritingLessonsIndexRoute() {
  const { groups } = useLoaderData<typeof loader>();
  const lessonCount = groups.reduce(
    (count, group) => count + group.lessons.length,
    0
  );

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>Quick Writing Lessons</h2>
            <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[560px]">
              The recovered mini-lesson library for focused grammar, sentence,
              and revision practice.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-8 px-3 py-6 pb-24 sm:px-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4" />
          <span>{lessonCount} saved lessons</span>
        </div>

        {groups.map((group) => (
          <section key={group.category} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{group.category}</h3>
              <Badge variant="secondary" size="sm">
                {group.lessons.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.lessons.map((lesson) => (
                <Link
                  key={lesson.slug}
                  to={`/app/writing-lessons/${lesson.slug}`}
                  className="block h-full"
                >
                  <Card className="flex h-full flex-col transition-shadow hover:shadow-md">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base leading-snug">
                        {lesson.title}
                      </CardTitle>
                      <CardDescription>{lesson.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto flex items-center justify-between text-sm text-muted-foreground">
                      <span>Read lesson</span>
                      <ChevronRight className="h-4 w-4" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
