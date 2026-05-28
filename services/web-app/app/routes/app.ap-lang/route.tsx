import { useState } from 'react';
import {
  type LoaderFunctionArgs,
  data as dataResponse,
} from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { BookOpen, FileText, MessageSquare } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { AP_LANG_ASSIGNMENT_TYPE_ID } from '~/utils/ap-assignment-types';
import { CreateAssignmentSheet } from '../app.assignment-types.$id/create-assignment-sheet';

const ESSAY_TYPES = [
  {
    key: 'synthesis',
    label: 'Synthesis',
    description:
      'Students read 6–7 sources and write an argument that synthesizes at least 3 of them.',
    icon: BookOpen,
    time: '15 min reading + 40 min writing',
    sources: '6–7 provided sources',
    builderPath: '/app/ap-lang/builder/synthesis',
  },
  {
    key: 'rhetorical-analysis',
    label: 'Rhetorical Analysis',
    description:
      'Students read one passage and analyze how the author uses rhetorical strategies to achieve their purpose.',
    icon: MessageSquare,
    time: '40 min writing',
    sources: '1 provided passage',
    builderPath: '/app/ap-lang/builder/rhetorical-analysis',
  },
  {
    key: 'argument',
    label: 'Argument',
    description:
      'Students take a position on a given claim and support it with evidence from their own knowledge and experience.',
    icon: FileText,
    time: '40 min writing',
    sources: 'No provided sources',
    builderPath: '/app/ap-lang/builder/argument',
  },
] as const;

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const assignmentType = await prisma.assignmentType.findFirst({
    where: {
      id: AP_LANG_ASSIGNMENT_TYPE_ID,
      archivedAt: null,
    },
    select: { id: true, title: true, description: true, kind: true },
  });

  if (!assignmentType) {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'AP English Language & Composition is not available.',
    });
  }

  const teacherClasses = profile.teacherProfile
    ? await prisma.class.findMany({
        where: {
          teachers: { some: { id: profile.teacherProfile.id } },
          isArchived: false,
        },
        select: { id: true, grade: true, period: true, title: true },
        orderBy: [{ grade: 'asc' }, { period: 'asc' }],
      })
    : [];

  const promptCounts = await prisma.promptLibraryEntry.groupBy({
    by: ['essayType'],
    where: { assignmentTypeKind: 'ap-lang' },
    _count: true,
  });

  const recentAssignments = profile.teacherProfile
    ? await prisma.assignment.findMany({
        where: {
          assignmentTypeId: AP_LANG_ASSIGNMENT_TYPE_ID,
          class: {
            teachers: { some: { id: profile.teacherProfile.id } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          prompt: true,
          createdAt: true,
          dueDate: true,
          class: {
            select: { grade: true, period: true, title: true },
          },
        },
      })
    : [];

  return dataResponse({
    assignmentType,
    teacherClasses,
    promptCounts: Object.fromEntries(
      promptCounts.map((pc) => [pc.essayType, pc._count])
    ),
    recentAssignments,
    isTeacher: !!profile.teacherProfile,
  });
}

export default function ApLangPage() {
  const {
    assignmentType,
    teacherClasses,
    promptCounts,
    recentAssignments,
    isTeacher,
  } = useLoaderData<typeof loader>();

  const [assignmentSheetOpen, setAssignmentSheetOpen] = useState(false);

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <Link
          to="/app"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Dashboard
        </Link>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{assignmentType.title}</h1>
          <Badge variant="secondary">AP</Badge>
        </div>
        <p className="text-muted-foreground">
          Three essay types from the AP English Language & Composition exam:
          Synthesis, Rhetorical Analysis, and Argument. Each uses the College
          Board's 6-point rubric (Thesis, Evidence & Commentary,
          Sophistication).
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

      <CreateAssignmentSheet
        assignmentTypeId={assignmentType.id}
        teacherClasses={teacherClasses}
        open={assignmentSheetOpen}
        onOpenChange={setAssignmentSheetOpen}
      />
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
