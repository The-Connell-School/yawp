import {
  type ActionFunctionArgs,
  data as dataResponse,
  Link,
  type LoaderFunctionArgs,
} from 'react-router';
import { useLoaderData, useFetcher } from 'react-router';
import { parseFormData, validationError, useForm } from '@rvf/react-router';
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
import { requireAdmin } from '~/utils/permissions';
import { ChevronLeft, Settings, Plus, GripVertical } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import React from 'react';
import { FormInput } from '~/components/forms/form-input-2';
import { FormTextarea } from '~/components/forms/form-textarea-2';
import { FormSwitch } from '~/components/forms/form-switch-2';
import { useSortableList } from '~/hooks/useSortableList';
import { DndContext } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const moduleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  isSelfGuided: z.union([z.literal('on'), z.literal(undefined)]),
  tutorInstructions: z.string().optional(),
});

const instructionSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  interactiveType: z.string().min(1, 'Interactive type is required'),
  answerType: z.string().optional(),
  answerKey: z.string().optional(),
  tutorInstructions: z.string().optional(),
  canAskQuestion: z.union([z.literal('on'), z.literal(undefined)]).optional(),
  nextInstructionBtnLabel: z.string().optional(),
  answerTypeOptions: z.string().optional(),
});

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const [course, module] = await Promise.all([
    prisma.course.findUnique({
      where: { id: params.id },
      select: { id: true, title: true },
    }),
    prisma.courseModule.findUnique({
      where: { id: params.moduleId },
      include: {
        instructions: {
          orderBy: { position: 'asc' },
        },
      },
    }),
  ]);

  if (!course || !module) {
    throw new Response('Not Found', { status: 404 });
  }

  return dataResponse({ course, module });
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'updateModule') {
    const { error, data } = await parseFormData(formData, moduleSchema);
    if (error) return validationError(error);

    await prisma.courseModule.update({
      where: { id: params.moduleId },
      data: {
        title: data.title,
        description: data.description || null,
        isSelfGuided: data.isSelfGuided === 'on',
        tutorInstructions: data.tutorInstructions || null,
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'createInstruction') {
    const title = formData.get('title')?.toString();
    const prompt = formData.get('prompt')?.toString();
    const interactiveType = formData.get('interactiveType')?.toString();
    const answerType = formData.get('answerType')?.toString();
    const answerKey = formData.get('answerKey')?.toString();
    const tutorInstructions = formData.get('tutorInstructions')?.toString();
    const canAskQuestion = formData.get('canAskQuestion') === 'true';

    if (!title || !prompt || !interactiveType) {
      throw new Response('Title, prompt, and interactive type are required', {
        status: 400,
      });
    }

    const instructionCount = await prisma.courseModuleInstruction.count({
      where: { courseModuleId: params.moduleId },
    });

    await prisma.courseModuleInstruction.create({
      data: {
        title,
        prompt,
        interactiveType,
        answerType: answerType || null,
        answerKey: answerKey || null,
        tutorInstructions: tutorInstructions || null,
        canAskQuestion,
        position: instructionCount,
        courseModuleId: params.moduleId!,
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'updateInstruction') {
    const instructionId = formData.get('instructionId')?.toString();
    const title = formData.get('title')?.toString();
    const prompt = formData.get('prompt')?.toString();
    const interactiveType = formData.get('interactiveType')?.toString();
    const answerType = formData.get('answerType')?.toString();
    const answerKey = formData.get('answerKey')?.toString();
    const tutorInstructions = formData.get('tutorInstructions')?.toString();
    const canAskQuestion = formData.get('canAskQuestion') === 'true';

    if (!instructionId || !title || !prompt || !interactiveType) {
      throw new Response('Required fields missing', { status: 400 });
    }

    await prisma.courseModuleInstruction.update({
      where: { id: instructionId },
      data: {
        title,
        prompt,
        interactiveType,
        answerType: answerType || null,
        answerKey: answerKey || null,
        tutorInstructions: tutorInstructions || null,
        canAskQuestion,
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'reorderInstructions') {
    const instructionIds = JSON.parse(
      formData.get('instructionIds')?.toString() || '[]'
    );

    await Promise.all(
      instructionIds.map((instructionId: string, index: number) =>
        prisma.courseModuleInstruction.update({
          where: { id: instructionId },
          data: { position: index },
        })
      )
    );

    return dataResponse({ status: 'success' });
  }

  return dataResponse({ status: 'error' });
}

export default function ModuleRoute() {
  const { course, module } = useLoaderData<typeof loader>();
  const moduleFetcher = useFetcher();
  const instructionFetcher = useFetcher();
  const [isModuleSheetOpen, setIsModuleSheetOpen] = React.useState(false);
  const [isInstructionSheetOpen, setIsInstructionSheetOpen] =
    React.useState(false);
  const [editingInstruction, setEditingInstruction] = React.useState<any>(null);
  const [instructions, setInstructions] = React.useState(module.instructions);

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
        action: `/app/admin/student-courses/${course.id}/modules/${module.id}`,
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
      interactiveType: editingInstruction?.interactiveType || '',
      answerType: editingInstruction?.answerType || 'textarea',
      answerKey: editingInstruction?.answerKey || '',
      tutorInstructions: editingInstruction?.tutorInstructions || '',
      canAskQuestion: editingInstruction?.canAskQuestion || false,
      nextInstructionBtnLabel:
        editingInstruction?.nextInstructionBtnLabel || '',
      answerTypeOptions: editingInstruction?.answerTypeOptions || '',
    },
    handleSubmit: (_data, formData) => {
      instructionFetcher.submit(formData, {
        method: 'post',
        action: `/app/admin/student-courses/${course.id}/modules/${module.id}`,
      });
    },
  });

  // Reset form when opening or editingInstruction changes
  React.useEffect(() => {
    if (isInstructionSheetOpen) {
      instructionForm.resetForm({
        title: editingInstruction?.title || '',
        prompt: editingInstruction?.prompt || '',
        interactiveType: editingInstruction?.interactiveType || '',
        answerType: editingInstruction?.answerType || 'textarea',
        answerKey: editingInstruction?.answerKey || '',
        tutorInstructions: editingInstruction?.tutorInstructions || '',
        canAskQuestion: editingInstruction?.canAskQuestion || false,
        nextInstructionBtnLabel:
          editingInstruction?.nextInstructionBtnLabel || '',
        answerTypeOptions: editingInstruction?.answerTypeOptions || '',
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

  React.useEffect(() => {
    if (isInstructionSheetOpen) {
      instructionForm.resetForm();
    }
  }, [isInstructionSheetOpen]);

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
        <TableCell className="font-medium">{instruction.title}</TableCell>
        <TableCell>{instruction.interactiveType}</TableCell>
        <TableCell>{instruction.answerType || 'N/A'}</TableCell>
        <TableCell>
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
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex justify-between">
        <Button variant="ghost" asChild>
          <Link to={`/app/admin/student-courses/${course.id}`}>
            <ChevronLeft size={18} />
            Back to {course.title}
          </Link>
        </Button>
        <Sheet open={isModuleSheetOpen} onOpenChange={setIsModuleSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              Edit Module
            </Button>
          </SheetTrigger>
          <SheetContent>
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
              <Button
                type="submit"
                className="w-full"
                disabled={moduleFetcher.state !== 'idle'}
              >
                {moduleFetcher.state !== 'idle' ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
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
                <SheetContent>
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
                    className="mt-4 space-y-4"
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
                    <div className="space-y-2">
                      <Label htmlFor="instructionTitle">Title</Label>
                      <Input
                        {...instructionForm.getInputProps('title')}
                        id="instructionTitle"
                        name="title"
                        required
                      />
                      {instructionForm.error('title') && (
                        <div className="text-sm text-destructive">
                          {instructionForm.error('title')}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prompt">Prompt</Label>
                      <Textarea
                        {...instructionForm.getInputProps('prompt')}
                        id="prompt"
                        name="prompt"
                        placeholder="What should the student do?"
                        rows={3}
                        required
                      />
                      {instructionForm.error('prompt') && (
                        <div className="text-sm text-destructive">
                          {instructionForm.error('prompt')}
                        </div>
                      )}
                    </div>
                    {/* Response Type */}
                    <div className="space-y-2">
                      <Label htmlFor="answerType">Response Type</Label>
                      <Select
                        value={instructionForm.value('answerType') as string}
                        onValueChange={(value) =>
                          instructionForm.setValue('answerType', value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select response type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="textarea">Text Area</SelectItem>
                          <SelectItem value="buttons">Buttons</SelectItem>
                        </SelectContent>
                      </Select>
                      <input
                        type="hidden"
                        name="answerType"
                        value={instructionForm.value('answerType') as string}
                      />
                    </div>
                    {/* Response Options (only for buttons) */}
                    {instructionForm.value('answerType') === 'buttons' && (
                      <div className="space-y-2">
                        <Label htmlFor="answerTypeOptions">
                          Response Options (comma separated)
                        </Label>
                        <Input
                          {...instructionForm.getInputProps(
                            'answerTypeOptions'
                          )}
                          id="answerTypeOptions"
                          name="answerTypeOptions"
                          placeholder="e.g. Yes,No,Maybe"
                        />
                      </div>
                    )}
                    {/* Allow students to ask questions */}
                    <div className="flex items-center space-x-2">
                      <FormSwitch
                        scope={instructionForm.scope('canAskQuestion')}
                        label="Allow students to ask questions"
                      />
                    </div>
                    {/* Interactive Type */}
                    <div className="space-y-2">
                      <Label htmlFor="interactiveType">Interactive Type</Label>
                      <Select
                        value={
                          instructionForm.value('interactiveType') as string
                        }
                        onValueChange={(value) =>
                          instructionForm.setValue('interactiveType', value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="answer">Answer</SelectItem>
                          <SelectItem value="dialogue">Dialogue</SelectItem>
                        </SelectContent>
                      </Select>
                      <input
                        type="hidden"
                        name="interactiveType"
                        value={
                          instructionForm.value('interactiveType') as string
                        }
                      />
                    </div>
                    {instructionForm.value('interactiveType') === 'answer' && (
                      <div className="space-y-2">
                        <Label htmlFor="answerKey">Answer</Label>
                        <Textarea
                          {...instructionForm.getInputProps('answerKey')}
                          id="answerKey"
                          name="answerKey"
                          placeholder="Expected answer or guidance..."
                          rows={2}
                        />
                      </div>
                    )}
                    {instructionForm.value('interactiveType') ===
                      'dialogue' && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="instructionTutorInstructions">
                            Tutor Instructions
                          </Label>
                          <Textarea
                            {...instructionForm.getInputProps(
                              'tutorInstructions'
                            )}
                            id="instructionTutorInstructions"
                            name="tutorInstructions"
                            placeholder="Special instructions for the tutor..."
                            rows={2}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nextInstructionBtnLabel">
                            Next Instruction Button Label
                          </Label>
                          <Input
                            {...instructionForm.getInputProps(
                              'nextInstructionBtnLabel'
                            )}
                            id="nextInstructionBtnLabel"
                            name="nextInstructionBtnLabel"
                            placeholder="e.g. Next, Continue, etc."
                          />
                        </div>
                      </>
                    )}
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
          ) : (
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
                      <TableHead>Type</TableHead>
                      <TableHead>Answer Type</TableHead>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
