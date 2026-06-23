import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import {
  Link,
  data as dataResponse,
  useLoaderData,
  redirect,
} from 'react-router';
import { ArchiveIcon, RotateCcwIcon } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { prisma } from '~/utils/db.server';
import { useFetcher } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { ChevronLeft, Plus, GripVertical, Save } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { Switch } from '~/components/ui/switch';
import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ConfirmationDialog } from '~/components/confirmation-dialog';
import { requireAdmin } from '~/utils/auth.server';
import {
  DEFAULT_OUTPUT_SCHEMA_JSON,
  parsePromptConfig,
  parseRubric,
  parseScoringScale,
} from '~/utils/grading-assistant-template.shared';
import {
  PromptConfigEditor,
  RubricEditor,
  ScoringScaleEditor,
} from '~/components/admin/grading-assistant-template-form';

function parseJsonFormField(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    throw new Response(`${name} must be valid JSON`, { status: 400 });
  }
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const assignmentTypeId = params.id;
  const course = await prisma.assignmentType.findUnique({
    where: { id: assignmentTypeId },
    include: {
      organizationAssignments: {
        include: { organization: { select: { id: true, name: true } } },
        orderBy: { organization: { name: 'asc' } },
      },
      assignmentModules: {
        where: { deletedAt: null },
        include: {
          instructions: {
            orderBy: { position: 'asc' },
          },
        },
        orderBy: { position: 'asc' },
      },
      image: { select: { id: true } },
    },
  });

  if (!course) {
    throw new Response('Not Found', { status: 404 });
  }

  return dataResponse({ course });
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get('intent');
  const assignmentTypeId = params.id;

  if (intent === 'deleteCourse') {
    await prisma.assignmentType.update({
      where: { id: params.id },
      data: { archivedAt: new Date() },
    });

    return redirect('/app/admin/assignments-grading');
  }

  if (intent === 'unarchiveCourse') {
    await prisma.assignmentType.update({
      where: { id: params.id },
      data: { archivedAt: null },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'updateCourse') {
    const title = formData.get('title')?.toString();
    const description = formData.get('description')?.toString();
    const kind = formData.get('kind')?.toString().trim() || null;
    const imageFile = formData.get('image') as File | null;
    const deleteImage = formData.get('deleteImage') === 'true';
    const hasGradingConfigFields =
      formData.has('scoringScale') ||
      formData.has('rubricJson') ||
      formData.has('promptConfigJson') ||
      formData.has('outputSchemaJson');

    if (!title) {
      throw new Response('Title is required', { status: 400 });
    }

    const gradingConfigData = hasGradingConfigFields
      ? {
          scoringScaleJson: parseJsonFormField(formData, 'scoringScale'),
          rubricJson: parseJsonFormField(formData, 'rubricJson'),
          gradingPromptConfigJson: parseJsonFormField(
            formData,
            'promptConfigJson'
          ),
          gradingOutputSchemaJson:
            parseJsonFormField(formData, 'outputSchemaJson') ??
            DEFAULT_OUTPUT_SCHEMA_JSON,
          gradingAssistantVersion: { increment: 1 },
        }
      : {};

    await prisma.$transaction(async (tx) => {
      if (deleteImage) {
        await tx.assignmentTypeImage.deleteMany({
          where: { assignmentTypeId: params.id },
        });
      } else if (imageFile && imageFile.size > 0) {
        const arrayBuffer = await imageFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await tx.assignmentTypeImage.deleteMany({
          where: { assignmentTypeId: params.id },
        });
        await tx.assignmentTypeImage.create({
          data: {
            contentType: imageFile.type,
            blob: buffer,
            assignmentTypeId: params.id!,
          },
        });
      }

      await tx.assignmentType.update({
        where: { id: params.id },
        data: {
          title,
          kind,
          description: description || null,
          ...gradingConfigData,
        },
      });
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'createModule') {
    const title = formData.get('title')?.toString();
    const description = formData.get('description')?.toString();
    const isSelfGuided = formData.get('isSelfGuided') === 'true';
    const tutorInstructions = formData.get('tutorInstructions')?.toString();

    if (!title) {
      throw new Response('Title is required', { status: 400 });
    }

    const moduleCount = await prisma.assignmentModule.count({
      where: { assignmentTypeId: params.id, deletedAt: null },
    });

    await prisma.assignmentModule.create({
      data: {
        title,
        description: description || null,
        isSelfGuided,
        tutorInstructions: tutorInstructions || null,
        position: moduleCount,
        assignmentTypeId: params.id!,
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'reorderModules') {
    const moduleIds = JSON.parse(formData.get('moduleIds')?.toString() || '[]');

    await Promise.all(
      moduleIds.map((moduleId: string, index: number) =>
        prisma.assignmentModule.update({
          where: { id: moduleId },
          data: { position: index },
        })
      )
    );

    return dataResponse({ status: 'success' });
  }

  return dataResponse({ status: 'error' });
}

export default function AssignmentTypeRoute() {
  const { course } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [isModuleSheetOpen, setIsModuleSheetOpen] = React.useState(false);
  const scoringScale = parseScoringScale(course.scoringScaleJson);
  const rubric = parseRubric(course.rubricJson);
  const promptConfig = parsePromptConfig(course.gradingPromptConfigJson);

  // --- Drag and drop state for modules ---
  const [modules, setModules] = React.useState(course.assignmentModules);
  React.useEffect(() => {
    setModules(course.assignmentModules);
  }, [course.assignmentModules]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setModules((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over?.id);

        const newModules = arrayMove(items, oldIndex, newIndex);

        // Submit the new order to the server
        fetcher.submit(
          {
            intent: 'reorderModules',
            moduleIds: JSON.stringify(newModules.map((m) => m.id)),
          },
          { method: 'post' }
        );

        return newModules;
      });
    }
  };

  // Sortable row component
  function SortableTableRow({ module }: { module: any }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: module.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <TableRow
        ref={setNodeRef}
        style={style}
        className={isDragging ? 'bg-muted/50' : ''}
      >
        <TableCell>
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        </TableCell>
        <TableCell className="font-medium">{module.title}</TableCell>
        <TableCell>
          {module.isSelfGuided ? 'Self-guided' : 'Tutor-guided'}
        </TableCell>
        <TableCell>{module.instructions.length}</TableCell>
        <TableCell>
          <Button variant="outline" size="sm" asChild>
            <Link to={`modules/${module.id}`}>View</Link>
          </Button>
        </TableCell>
      </TableRow>
    );
  }

  React.useEffect(() => {
    if (fetcher.data?.status === 'success' && fetcher.state === 'idle') {
      setIsModuleSheetOpen(false);
    }
  }, [fetcher.data, fetcher.state]);

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex justify-between">
        <Button variant="ghost" asChild>
          <Link to="/app/admin/assignments-grading">
            <ChevronLeft size={18} />
            Assignment types
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {course.archivedAt ? (
            <Button
              variant="outline"
              onClick={() =>
                fetcher.submit(
                  { intent: 'unarchiveCourse' },
                  { method: 'post' }
                )
              }
              disabled={fetcher.state !== 'idle'}
            >
              <RotateCcwIcon className="mr-2 h-4 w-4" />
              Restore
            </Button>
          ) : (
            <ConfirmationDialog
              variant="destructive"
              title="Archive Assignment Type"
              description={`Archive "${course.title}"? Existing assignments and documents will keep this assignment type, but it will no longer appear as an option for dashboards or new assignments.`}
              confirmText="Archive Assignment Type"
              cancelText="Cancel"
              onConfirm={() => {
                fetcher.submit({ intent: 'deleteCourse' }, { method: 'post' });
              }}
              onCancel={() => {
                // Dialog will close automatically
              }}
            >
              <Button
                variant="destructive-outline"
                size="icon"
                aria-label="Archive assignment type"
              >
                <ArchiveIcon className="h-4 w-4" />
              </Button>
            </ConfirmationDialog>
          )}
        </div>
      </div>

      <Card className="bg-muted">
        <CardHeader>
          <CardTitle>Assignment Type Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <fetcher.Form method="post" className="space-y-6">
            <input type="hidden" name="intent" value="updateCourse" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  defaultValue={course.title}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kind">Stable kind</Label>
                <Input
                  id="kind"
                  name="kind"
                  defaultValue={course.kind || ''}
                  placeholder="act_writing"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={course.description || ''}
                rows={3}
              />
            </div>
            <div className="rounded-[8px] border bg-background/70 p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold">Rubric</h3>
                <p className="text-sm text-muted-foreground">
                  This rubric is shared by tutor guidance and final grading.
                </p>
              </div>
              <div className="space-y-5">
                <ScoringScaleEditor initial={scoringScale} namePrefix="detail" />
                <RubricEditor initial={rubric} namePrefix="detail" />
              </div>
            </div>
            <div className="rounded-[8px] border bg-background/70 p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold">Grading assistant</h3>
                <p className="text-sm text-muted-foreground">
                  The grading assistant applies the rubric above during submission review.
                </p>
              </div>
              <PromptConfigEditor initial={promptConfig} namePrefix="detail" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Available to:{' '}
                {course.organizationAssignments.length === 0
                  ? 'No organizations'
                  : course.organizationAssignments
                      .map((assignment) => assignment.organization.name)
                      .join(', ')}
              </p>
              <Button type="submit" disabled={fetcher.state !== 'idle'}>
                <Save className="mr-2 size-4" />
                {fetcher.state !== 'idle' ? 'Saving...' : 'Save assignment type'}
              </Button>
            </div>
          </fetcher.Form>
        </CardContent>
      </Card>

      <Card className="bg-muted">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Assignment Modules</CardTitle>
          <Sheet open={isModuleSheetOpen} onOpenChange={setIsModuleSheetOpen}>
            <SheetTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Module
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Create Module</SheetTitle>
              </SheetHeader>
              <fetcher.Form method="post" className="mt-4 space-y-4">
                <input type="hidden" name="intent" value="createModule" />
                <div className="space-y-2">
                  <Label htmlFor="moduleTitle">Title</Label>
                  <Input id="moduleTitle" name="title" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="moduleDescription">Description</Label>
                  <Textarea
                    id="moduleDescription"
                    name="description"
                    rows={3}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="isSelfGuided" name="isSelfGuided" />
                  <Label htmlFor="isSelfGuided">Self-guided module</Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tutorInstructions">Tutor Instructions</Label>
                  <Textarea
                    id="tutorInstructions"
                    name="tutorInstructions"
                    placeholder="Instructions for the tutor..."
                    rows={4}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  You can add instructions after creating the module.
                </p>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={fetcher.state !== 'idle'}
                >
                  {fetcher.state !== 'idle' ? 'Creating...' : 'Create Module'}
                </Button>
              </fetcher.Form>
            </SheetContent>
          </Sheet>
        </CardHeader>
        <CardContent>
          {modules.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No modules yet. Create your first module to get started.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Instructions</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <SortableContext
                  items={modules.map((m) => m.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <TableBody>
                    {modules.map((module) => (
                      <SortableTableRow key={module.id} module={module} />
                    ))}
                  </TableBody>
                </SortableContext>
              </Table>
            </DndContext>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
