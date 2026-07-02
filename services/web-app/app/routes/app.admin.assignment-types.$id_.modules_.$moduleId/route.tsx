import {
  type ActionFunctionArgs,
  data as dataResponse,
  Link,
  type LoaderFunctionArgs,
  redirect,
} from 'react-router';
import { useLoaderData, useFetcher } from 'react-router';
import {
  parseFormData,
  validationError,
  useForm,
  useFieldArray,
} from '@rvf/react-router';
import { z } from 'zod';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { prisma } from '~/utils/db.server';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import {
  ChevronLeft,
  Settings,
  Plus,
  GripVertical,
  TrashIcon,
  Trash2,
  MessageCircleIcon,
  ChevronRightIcon,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { Label } from '~/components/ui/label';
import React from 'react';
import { FormInput } from '~/components/rvf-forms/form-input';
import { FormTextarea } from '~/components/rvf-forms/form-textarea';
import { FormSwitch } from '~/components/rvf-forms/form-switch';
import { useSortableList } from '~/hooks/useSortableList';
import { DndContext } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ConfirmationDialog } from '~/components/confirmation-dialog';
import { cn } from '~/utils/misc';
import { requireAdmin } from '~/utils/auth.server';
import { parseAssignmentTypeRubricConfig } from '~/domain/assignment-types/assignment-type-rubric-config';
import {
  MODULE_RUBRIC_RELATIONSHIPS,
  type ModuleRubricRelationship,
} from '~/domain/assignment-types/assignment-type-rubric-config';
import { ModuleRubricAlignmentEditor } from '~/components/admin/module-rubric-alignment-editor';

const moduleRubricRelationshipSet = new Set<string>(
  MODULE_RUBRIC_RELATIONSHIPS
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseRubricAlignmentJson(formData: FormData) {
  const raw = formData.get('rubricAlignmentJson');
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Response('rubricAlignmentJson must be valid JSON', {
      status: 400,
    });
  }
  if (!isRecord(parsed)) return undefined;

  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [
      key,
      typeof value === 'string' && moduleRubricRelationshipSet.has(value)
        ? (value as ModuleRubricRelationship)
        : 'not-applicable',
    ])
  );
}

const moduleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  isSelfGuided: z.union([z.literal('on'), z.literal(undefined)]),
  tutorInstructions: z.string().optional(),
});

const instructionSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  answerKey: z.string().optional(),
  tutorInstructions: z.string().optional(),
  showChatButton: z.union([z.literal('on'), z.literal(undefined)]).optional(),
  showNextButton: z.union([z.literal('on'), z.literal(undefined)]).optional(),
  nextInstructionBtnLabel: z.string().optional(),
  buttons: z
    .array(
      z.object({
        label: z.string().min(1, 'Button label is required'),
        action: z.enum(['advance', 'response']),
      })
    )
    .optional()
    .default([]),
});

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const [courseRecord, module] = await Promise.all([
    prisma.assignmentType.findUnique({
      where: { id: params.id },
    }),
    prisma.assignmentModule.findFirst({
      where: {
        id: params.moduleId,
        assignmentTypeId: params.id,
        deletedAt: null,
      },
      include: {
        instructions: {
          orderBy: { position: 'asc' },
          include: {
            buttons: {
              orderBy: { position: 'asc' },
            },
          },
        },
      },
    }),
  ]);

  if (!courseRecord || !module) {
    throw new Response('Not Found', { status: 404 });
  }

  const course = {
    id: courseRecord.id,
    title: courseRecord.title,
    rubricJson: (courseRecord as { rubricJson?: unknown }).rubricJson ?? null,
  };

  return dataResponse({ course, module });
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'updateModule') {
    const { error, data } = await parseFormData(formData, moduleSchema);
    if (error) return validationError(error);

    await prisma.assignmentModule.update({
      where: { id: params.moduleId },
      data: {
        title: data.title,
        description: data.description || null,
        isSelfGuided: data.isSelfGuided === 'on',
        tutorInstructions: data.tutorInstructions || null,
        rubricAlignmentJson: parseRubricAlignmentJson(formData),
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'deleteModule') {
    await prisma.assignmentModule.update({
      where: { id: params.moduleId },
      data: { deletedAt: new Date() },
    });

    return redirect(`/app/admin/assignment-types/${params.id}`);
  }

  if (intent === 'createInstruction') {
    const { error, data } = await parseFormData(formData, instructionSchema);
    if (error) return validationError(error);

    const instructionCount = await prisma.assignmentModuleInstruction.count({
      where: { assignmentModuleId: params.moduleId },
    });

    await prisma.assignmentModuleInstruction.create({
      data: {
        title: data.title,
        prompt: data.prompt,
        tutorInstructions: data.tutorInstructions || null,
        showChatButton: data.showChatButton === 'on',
        showNextButton: data.showNextButton === 'on',
        position: instructionCount,
        assignmentModuleId: params.moduleId!,
        buttons: {
          create: data.buttons.map((button, index) => ({
            label: button.label,
            action: button.action,
            position: index,
          })),
        },
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'updateInstruction') {
    const instructionId = formData.get('instructionId')?.toString();
    if (!instructionId) {
      throw new Response('Instruction ID is required', { status: 400 });
    }

    const { error, data } = await parseFormData(formData, instructionSchema);
    if (error) return validationError(error);

    await prisma.assignmentModuleInstruction.update({
      where: { id: instructionId },
      data: {
        title: data.title,
        prompt: data.prompt,
        tutorInstructions: data.tutorInstructions || null,
        showChatButton: data.showChatButton === 'on',
        showNextButton: data.showNextButton === 'on',
        buttons: {
          deleteMany: {
            assignmentModuleInstructionId: instructionId,
          },
          create: data.buttons.map((button, index) => ({
            label: button.label,
            action: button.action,
            position: index,
          })),
        },
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'deleteInstruction') {
    const instructionId = formData.get('instructionId')?.toString();

    if (!instructionId) {
      throw new Response('Instruction ID is required', { status: 400 });
    }

    await prisma.assignmentModuleInstruction.delete({
      where: { id: instructionId },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'reorderInstructions') {
    const instructionIds = JSON.parse(
      formData.get('instructionIds')?.toString() || '[]'
    );

    await Promise.all(
      instructionIds.map((instructionId: string, index: number) =>
        prisma.assignmentModuleInstruction.update({
          where: { id: instructionId },
          data: { position: index },
        })
      )
    );

    return dataResponse({ status: 'success' });
  }

  return dataResponse({ status: 'error' });
}

export default function AssignmentModuleRoute() {
  const { course, module } = useLoaderData<typeof loader>();
  const moduleFetcher = useFetcher();
  const instructionFetcher = useFetcher();
  const [isModuleSheetOpen, setIsModuleSheetOpen] = React.useState(false);
  const [isInstructionSheetOpen, setIsInstructionSheetOpen] =
    React.useState(false);
  const [isMounted, setIsMounted] = React.useState(false);
  const [editingInstruction, setEditingInstruction] = React.useState<any>(null);
  const [instructions, setInstructions] = React.useState(module.instructions);
  const rubric = parseAssignmentTypeRubricConfig({
    rubricJson: course.rubricJson,
  }).rubric;

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Module form
  const moduleForm = useForm({
    id: 'edit-module-form',
    schema: moduleSchema,
    defaultValues: {
      title: module.title,
      description: module.description || '',
      isSelfGuided: module.isSelfGuided ? 'on' : undefined,
      tutorInstructions: module.tutorInstructions || '',
    },
    handleSubmit: (_data, formData) => {
      moduleFetcher.submit(formData, {
        method: 'post',
        action: `/app/admin/assignment-types/${course.id}/modules/${module.id}`,
      });
    },
  });

  // Sheet close effect for module
  React.useEffect(() => {
    if (
      moduleFetcher.state === 'idle' &&
      moduleFetcher.data?.status === 'success' &&
      isModuleSheetOpen
    ) {
      setIsModuleSheetOpen(false);
    }
  }, [moduleFetcher.state, moduleFetcher.data, isModuleSheetOpen]);

  // Keep instructions in sync with loader
  React.useEffect(() => {
    setInstructions(module.instructions);
  }, [module.instructions]);

  const instructionForm = useForm({
    schema: instructionSchema,
    defaultValues: {
      title: editingInstruction?.title || '',
      prompt: editingInstruction?.prompt || '',
      tutorInstructions: editingInstruction?.tutorInstructions || '',
      showChatButton: editingInstruction?.showChatButton || false,
      showNextButton: editingInstruction?.showNextButton || false,
      buttons: editingInstruction?.buttons || [
        { label: 'Continue', action: 'advance' },
      ],
    },
    handleSubmit: (_data, formData) => {
      instructionFetcher.submit(formData, {
        method: 'post',
        action: `/app/admin/assignment-types/${course.id}/modules/${module.id}`,
      });
    },
  });

  // Reset form when opening or editingInstruction changes
  React.useEffect(() => {
    if (isInstructionSheetOpen) {
      instructionForm.resetForm({
        title: editingInstruction?.title || '',
        prompt: editingInstruction?.prompt || '',
        tutorInstructions: editingInstruction?.tutorInstructions || '',
        showChatButton: editingInstruction?.showChatButton || false,
        showNextButton: editingInstruction?.showNextButton || false,
        buttons: editingInstruction?.buttons,
      });
    }
    // eslint-disable-next-line
  }, [isInstructionSheetOpen, editingInstruction]);

  // Sheet close effect for instruction
  React.useEffect(() => {
    if (
      instructionFetcher.state === 'idle' &&
      instructionFetcher.data?.status === 'success'
    ) {
      setIsInstructionSheetOpen(false);
      setEditingInstruction(null);
    }
  }, [instructionFetcher.state, instructionFetcher.data?.status]);

  // --- DnD logic ---
  const {
    items: sortedInstructions,
    sensors,
    handleDragEnd,
  } = useSortableList({
    items: instructions,
    onReorder: (newItems) => {
      setInstructions(newItems);
      instructionFetcher.submit(
        {
          intent: 'reorderInstructions',
          instructionIds: JSON.stringify(newItems.map((i) => i.id)),
        },
        { method: 'post' }
      );
    },
    idKey: 'id',
  });

  function InstructionRowCells({ instruction }: { instruction: any }) {
    return (
      <>
        <TableCell className="font-medium">{instruction.title}</TableCell>
        <TableCell>
          {instruction.buttons?.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {instruction.buttons.map((button: any) => (
                <span
                  key={button.id}
                  className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    button.action === 'advance'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-green-100 text-green-800'
                  }`}
                >
                  {button.label} ({button.action})
                </span>
              ))}
            </div>
          ) : (
            'No buttons'
          )}
        </TableCell>
        <TableCell>
          {instruction.showChatButton ? (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Visbile
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              Hidden
            </span>
          )}
        </TableCell>
        <TableCell>
          {instruction.showNextButton ? (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Visible
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              Hidden
            </span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingInstruction(instruction);
                setIsInstructionSheetOpen(true);
              }}
            >
              Edit
            </Button>
            <ConfirmationDialog
              variant="destructive"
              title="Delete Instruction"
              description={`Are you sure you want to delete "${instruction.title}"? This action cannot be undone.`}
              confirmText="Delete Instruction"
              cancelText="Cancel"
              onConfirm={() => {
                instructionFetcher.submit(
                  {
                    intent: 'deleteInstruction',
                    instructionId: instruction.id,
                  },
                  { method: 'post' }
                );
              }}
              onCancel={() => {}}
            >
              <Button variant="destructive-outline" size="icon-sm">
                <TrashIcon className="h-4 w-4" />
              </Button>
            </ConfirmationDialog>
          </div>
        </TableCell>
      </>
    );
  }

  function StaticInstructionRow({ instruction }: { instruction: any }) {
    return (
      <TableRow>
        <TableCell>
          <GripVertical className="h-4 w-4 text-muted-foreground opacity-40" />
        </TableCell>
        <InstructionRowCells instruction={instruction} />
      </TableRow>
    );
  }

  function SortableInstructionRow({ instruction }: { instruction: any }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: instruction.id });
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
        <InstructionRowCells instruction={instruction} />
      </TableRow>
    );
  }

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex justify-between">
        <Button variant="ghost" asChild>
          <Link to={`/app/admin/assignment-types/${course.id}`}>
            <ChevronLeft size={18} />
            Back to {course.title}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Sheet open={isModuleSheetOpen} onOpenChange={setIsModuleSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline">
                <Settings className="mr-2 h-4 w-4" />
                Edit Module
              </Button>
            </SheetTrigger>
            <SheetContent aria-describedby={undefined}>
              <SheetHeader>
                <SheetTitle>Edit Module</SheetTitle>
              </SheetHeader>
              <form
                {...moduleForm.getFormProps()}
                method="post"
                className="mt-4 space-y-4"
              >
                <input type="hidden" name="intent" value="updateModule" />
                <FormInput
                  scope={moduleForm.scope('title')}
                  label="Title"
                  required
                />
                <FormTextarea
                  scope={moduleForm.scope('description')}
                  label="Description"
                  rows={3}
                />
                <FormSwitch
                  scope={moduleForm.scope('isSelfGuided')}
                  label="Self-guided module"
                />
                {!moduleForm.value('isSelfGuided') && (
                  <FormTextarea
                    scope={moduleForm.scope('tutorInstructions')}
                    label="Tutor Instructions"
                    placeholder="Instructions for the tutor..."
                    rows={4}
                  />
                )}
                <div className="space-y-2">
                  <Label>Rubric relationships</Label>
                  <ModuleRubricAlignmentEditor
                    categories={rubric.categories}
                    initialAlignment={module.rubricAlignmentJson}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={moduleFetcher.state !== 'idle'}
                >
                  {moduleFetcher.state !== 'idle'
                    ? 'Saving...'
                    : 'Save Changes'}
                </Button>
              </form>
            </SheetContent>
          </Sheet>
          <ConfirmationDialog
            variant="destructive"
            title="Delete Module"
            description={`Are you sure you want to delete "${module.title}"? This action cannot be undone and will permanently remove the module and all its instructions.`}
            confirmText="Delete Module"
            cancelText="Cancel"
            onConfirm={() => {
              moduleFetcher.submit(
                { intent: 'deleteModule' },
                { method: 'post' }
              );
            }}
            onCancel={() => {
              // Dialog will close automatically
            }}
          >
            <Button variant="destructive-outline" size="icon">
              <TrashIcon className="h-4 w-4" />
            </Button>
          </ConfirmationDialog>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        <Card className="bg-muted w-full">
          <CardHeader>
            <CardTitle>Module Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Title
                </dt>
                <dd className="text-base font-medium">{module.title}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Type
                </dt>
                <dd className="text-base">
                  {module.isSelfGuided ? 'Self-guided' : 'Tutor-guided'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Description
                </dt>
                <dd className="text-base">
                  {module.description || 'No description'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Tutor Instructions
                </dt>
                <dd className="text-base">
                  {module.tutorInstructions &&
                  module.tutorInstructions.length > 200 ? (
                    <>
                      {module.tutorInstructions.slice(0, 200)}...{' '}
                      <button
                        type="button"
                        className="text-blue-600 underline ml-1"
                        onClick={() => setIsModuleSheetOpen(true)}
                      >
                        See more
                      </button>
                    </>
                  ) : (
                    module.tutorInstructions || 'No instructions'
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 w-1/2">
          <Card className="bg-muted">
            <CardHeader>
              <CardTitle>Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {module.instructions.length}
              </div>
              <p className="text-sm text-muted-foreground">Instructions</p>
            </CardContent>
          </Card>

          <Card className="bg-muted">
            <CardHeader>
              <CardTitle>Position</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{module.position + 1}</div>
              <p className="text-sm text-muted-foreground">
                In course sequence
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="bg-muted">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Instructions</CardTitle>
          {!module.isSelfGuided && (
            <>
              <Button
                onClick={() => {
                  setEditingInstruction(null);
                  setIsInstructionSheetOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Instruction
              </Button>
              <Sheet
                open={isInstructionSheetOpen}
                onOpenChange={setIsInstructionSheetOpen}
              >
                <SheetContent aria-describedby={undefined}>
                  <SheetHeader>
                    <SheetTitle>
                      {editingInstruction
                        ? 'Edit Instruction'
                        : 'Create Instruction'}
                    </SheetTitle>
                  </SheetHeader>
                  <form
                    {...instructionForm.getFormProps()}
                    method="post"
                    className="mt-4 space-y-8"
                  >
                    <input
                      type="hidden"
                      name="intent"
                      value={
                        editingInstruction
                          ? 'updateInstruction'
                          : 'createInstruction'
                      }
                    />
                    {editingInstruction && (
                      <input
                        type="hidden"
                        name="instructionId"
                        value={editingInstruction.id}
                      />
                    )}
                    <FormInput
                      scope={instructionForm.scope('title')}
                      label="Title"
                      required
                    />
                    <FormTextarea
                      scope={instructionForm.scope('prompt')}
                      label="Prompt"
                      placeholder="What should the student do?"
                      rows={3}
                      required
                    />
                    <ButtonsFieldArray form={instructionForm} />
                    <div className="flex flex-col border border-border rounded-md">
                      <div className="p-4 flex items-center justify-between border-b">
                        <div>
                          <label className="text-sm">Show chat button</label>
                          <p className="text-xs pr-4 pt-1 text-muted-foreground">
                            Enabling this shows the{' '}
                            <MessageCircleIcon className="inline-block h-4 w-4" />{' '}
                            button in the tutor response bar
                          </p>
                        </div>
                        <FormSwitch
                          hideLabel
                          scope={instructionForm.scope('showChatButton')}
                        />
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <div>
                          <label className="text-sm">Show next button</label>
                          <p className="text-xs pr-4 pt-1 text-muted-foreground">
                            Enabling this hides the{' '}
                            <ChevronRightIcon className="inline-block h-4 w-4" />{' '}
                            button in the tutor response bar
                          </p>
                        </div>
                        <FormSwitch
                          hideLabel
                          scope={instructionForm.scope('showNextButton')}
                        />
                      </div>
                    </div>
                    <FormTextarea
                      scope={instructionForm.scope('tutorInstructions')}
                      label="Tutor Instructions"
                      placeholder="Special instructions for the tutor..."
                      rows={2}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={instructionFetcher.state !== 'idle'}
                    >
                      {instructionFetcher.state !== 'idle'
                        ? editingInstruction
                          ? 'Updating...'
                          : 'Creating...'
                        : editingInstruction
                          ? 'Update Instruction'
                          : 'Create Instruction'}
                    </Button>
                  </form>
                </SheetContent>
              </Sheet>
            </>
          )}
        </CardHeader>
        <CardContent>
          {module.isSelfGuided ? (
            <div className="text-center text-muted-foreground py-8">
              Self-guided modules don't have instructions.
            </div>
          ) : instructions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No instructions yet. Create your first instruction to get started.
            </div>
          ) : isMounted ? (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext
                items={sortedInstructions.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Buttons</TableHead>
                      <TableHead>Chat Btn</TableHead>
                      <TableHead>Next Btn</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedInstructions.map((instruction) => (
                      <SortableInstructionRow
                        key={instruction.id}
                        instruction={instruction}
                      />
                    ))}
                  </TableBody>
                </Table>
              </SortableContext>
            </DndContext>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Buttons</TableHead>
                  <TableHead>Chat Btn</TableHead>
                  <TableHead>Next Btn</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedInstructions.map((instruction) => (
                  <StaticInstructionRow
                    key={instruction.id}
                    instruction={instruction}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ButtonsFieldArray({ form }: { form: any }) {
  const buttonsFieldArray = useFieldArray<{ label: string; action: string }[]>(
    form.scope('buttons')
  );

  return (
    <div className="space-y-2 mb-4">
      <div className="flex items-center justify-between">
        <Label>Buttons</Label>
      </div>
      {buttonsFieldArray.map((key, item, index) => (
        <div key={key} className="flex">
          <input
            {...item.getInputProps('label')}
            required
            placeholder="Label"
            className={cn(
              'w-full rounded-l-md border-l border-y h-10 px-3 py-2 text-sm bg-muted border-border',
              item.error('label') ? 'border-destructive' : ''
            )}
          />
          <select
            {...item.getInputProps('action')}
            required
            className={cn(
              'w-full border-l border-y h-10 px-3 py-2 text-sm bg-muted border-border',
              item.error('action') ? 'border-destructive' : '',
              item.error('label') ? 'border-l-destructive' : ''
            )}
          >
            <option value="response">Should respond</option>
            <option value="advance">Should advance</option>
          </select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              'rounded-l-none px-3 bg-muted border-border rounded-r-md',
              item.error('action') ? 'border-l-destructive' : ''
            )}
            onClick={() => buttonsFieldArray.remove(index)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        type="button"
        variant="outline"
        className="w-full rounded-md"
        onClick={() =>
          buttonsFieldArray.push({ label: '', action: 'response' })
        }
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Button
      </Button>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
