import {
  type LoaderFunctionArgs,
  data as dataResponse,
} from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { Feather, BookOpen, Library } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { AP_LIT_ASSIGNMENT_TYPE_ID } from '~/utils/ap-assignment-types';

const ESSAY_TYPES = [
  {
    key: 'poetry-analysis',
    label: 'Poetry Analysis',
    description:
      'Students read a poem and analyze how the poet uses literary elements and techniques to develop meaning.',
    icon: Feather,
    time: '40 min writing',
    sources: '1 provided poem',
    builderPath: '/app/ap-lit/builder/poetry-analysis',
  },
  {
    key: 'prose-fiction-analysis',
    label: 'Prose Fiction Analysis',
    description:
      'Students read a prose passage and analyze how the author uses literary techniques to develop character, theme, or an idea.',
    icon: BookOpen,
    time: '40 min writing',
    sources: '1 provided passage',
    builderPath: '/app/ap-lit/builder/prose-fiction-analysis',
  },
  {
    key: 'literary-argument',
    label: 'Literary Argument',
    description:
      'Students make an argument about a full work of literature they have read, using specific textual evidence.',
    icon: Library,
    time: '40 min writing',
    sources: 'Student-selected work',
    builderPath: '/app/ap-lit/builder/literary-argument',
  },
] as const;

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const assignmentType = await prisma.assignmentType.findFirst({
    where: { id: AP_LIT_ASSIGNMENT_TYPE_ID, archivedAt: null },
    select: { id: true, title: true, description: true, kind: true },
  });

  if (!assignmentType) {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'AP English Literature & Composition is not available.',
    });
  }

  const promptCounts = await prisma.promptLibraryEntry.groupBy({
    by: ['essayType'],
    where: { assignmentTypeKind: 'ap-lit' },
    _count: true,
  });

  const recentAssignments = profile.teacherProfile
    ? await prisma.assignment.findMany({
        where: {
          assignmentTypeId: AP_LIT_ASSIGNMENT_TYPE_ID,
          class: { teachers: { some: { id: profile.teacherProfile.id } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          prompt: true,
          dueDate: true,
          class: { select: { grade: true, period: true, title: true } },
        },
      })
    : [];

  return dataResponse({
    assignmentType,
    promptCounts: Object.fromEntries(
      promptCounts.map((pc) => [pc.essayType, pc._count])
    ),
    recentAssignments,
    isTeacher: !!profile.teacherProfile,
  });
}

export default function ApLitPage() {
  const { assignmentType, promptCounts, recentAssignments, isTeacher } =
    useLoaderData<typeof loader>();

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <Link to="/app" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Dashboard
        </Link>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{assignmentType.title}</h1>
          <Badge variant="secondary">AP</Badge>
        </div>
        <p className="text-muted-foreground">
          Three essay types from the AP English Literature & Composition exam:
          Poetry Analysis, Prose Fiction Analysis, and Literary Argument. Each
          uses the College Board's 6-point rubric (Thesis, Evidence &
          Commentary, Sophistication).
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {ESSAY_TYPES.map((type) => (
          <Card key={type.key}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <type.icon className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">{type.label}</CardTitle>
              </div>
              <CardDescription className="text-xs">
                {type.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>{type.time}</p>
                <p>{type.sources}</p>
                {promptCounts[type.key] ? (
                  <p>
                    {promptCounts[type.key]} prompt
                    {promptCounts[type.key] === 1 ? '' : 's'} in library
                  </p>
                ) : null}
              </div>
              {isTeacher && (
                <Link to={type.builderPath}>
                  <Button size="sm" className="w-full">
                    Create Assignment
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {isTeacher && recentAssignments.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Recent Assignments</h2>
          <div className="space-y-2">
            {recentAssignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-center justify-between rounded-md border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {assignment.title || assignment.prompt.slice(0, 80) + '…'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {assignment.class.title ||
                      `Grade ${assignment.class.grade} • Period ${assignment.class.period}`}
                    {assignment.dueDate &&
                      ` • Due ${new Date(assignment.dueDate).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
