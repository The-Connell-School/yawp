import {
  type ActionFunctionArgs,
  data as dataResponse,
  Link,
  type LoaderFunctionArgs,
} from 'react-router';
import { useLoaderData, useFetcher } from 'react-router';
import { useForm } from '@rvf/react-router';
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
import { Switch } from '~/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import React from 'react';

const moduleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  isSelfGuided: z.boolean(),
  tutorInstructions: z.string().optional(),
});

const instructionSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  interactiveType: z.string().min(1, 'Interactive type is required'),
  answerType: z.string().optional(),
  answerKey: z.string().optional(),
  tutorInstructions: z.string().optional(),
  canAskQuestion: z.boolean().optional(),
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
    const title = formData.get('title')?.toString();
    const description = formData.get('description')?.toString();
    const isSelfGuided = formData.get('isSelfGuided') === 'true';
    const tutorInstructions = formData.get('tutorInstructions')?.toString();

    if (!title) {
      throw new Response('Title is required', { status: 400 });
    }

    await prisma.courseModule.update({
      where: { id: params.moduleId },
      data: {
        title,
        description: description || null,
        isSelfGuided,
        tutorInstructions: tutorInstructions || null,
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
      throw new Response('Title, prompt, and interactive type are required', { status: 400 });
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
    const instructionIds = JSON.parse(formData.get('instructionIds')?.toString() || '[]');
    
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
  const fetcher = useFetcher();
  const [isModuleSheetOpen, setIsModuleSheetOpen] = React.useState(false);
  const [isInstructionSheetOpen, setIsInstructionSheetOpen] = React.useState(false);
  const [editingInstruction, setEditingInstruction] = React.useState<any>(null);

  const moduleForm = useForm({
    schema: moduleSchema,
    defaultValues: {
      title: module.title,
      description: module.description || '',
      isSelfGuided: module.isSelfGuided,
      tutorInstructions: module.tutorInstructions || '',
    },
  });

  const instructionForm = useForm({
    schema: instructionSchema,
    defaultValues: {
      title: '',
      prompt: '',
      interactiveType: 'answer',
      answerType: 'textarea',
      answerKey: '',
      tutorInstructions: '',
      canAskQuestion: false,
    },
  });

  React.useEffect(() => {
    if (fetcher.data?.status === 'success') {
      setIsModuleSheetOpen(false);
      setIsInstructionSheetOpen(false);
      setEditingInstruction(null);
      instructionForm.resetForm();
    }
  }, [fetcher.data, instructionForm]);

  React.useEffect(() => {
    if (editingInstruction) {
      instructionForm.setValues({
        title: editingInstruction.title,
        prompt: editingInstruction.prompt,
        interactiveType: editingInstruction.interactiveType,
        answerType: editingInstruction.answerType || 'textarea',
        answerKey: editingInstruction.answerKey || '',
        tutorInstructions: editingInstruction.tutorInstructions || '',
        canAskQuestion: editingInstruction.canAskQuestion || false,
      });
    }
  }, [editingInstruction, instructionForm]);

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex justify-between">
        <Button variant="ghost" asChild>
          <Link to={`/app/admin/courses/${course.id}`}>
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
            <fetcher.Form method="post" className="mt-4 space-y-4">
              <input type="hidden" name="intent" value="updateModule" />
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  {...moduleForm.getInputProps('title')}
                  id="title"
                  name="title"
                  required
                />
                {moduleForm.error('title') && (
                  <div className="text-sm text-destructive">
                    {moduleForm.error('title')}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  {...moduleForm.getInputProps('description')}
                  id="description"
                  name="description"
                  rows={3}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="isSelfGuided"
                  name="isSelfGuided"
                  checked={moduleForm.value('isSelfGuided')}
                  onCheckedChange={(checked) =>
                    moduleForm.setValue('isSelfGuided', checked)
                  }
                />
                <Label htmlFor="isSelfGuided">Self-guided module</Label>
              </div>
              {!moduleForm.value('isSelfGuided') && (
                <div className="space-y-2">
                  <Label htmlFor="tutorInstructions">Tutor Instructions</Label>
                  <Textarea
                    {...moduleForm.getInputProps('tutorInstructions')}
                    id="tutorInstructions"
                    name="tutorInstructions"
                    placeholder="Instructions for the tutor..."
                    rows={4}
                  />
                </div>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={fetcher.state !== 'idle'}
              >
                {fetcher.state !== 'idle' ? 'Saving...' : 'Save Changes'}
              </Button>
            </fetcher.Form>
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-muted">
          <CardHeader>
            <CardTitle>Module Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4">
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
            </dl>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{module.instructions.length}</div>
            <p className="text-sm text-muted-foreground">Module instructions</p>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardHeader>
            <CardTitle>Position</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{module.position + 1}</div>
            <p className="text-sm text-muted-foreground">In course sequence</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Module Instructions</CardTitle>
          {!module.isSelfGuided && (
            <Sheet 
              open={isInstructionSheetOpen} 
              onOpenChange={(open) => {
                setIsInstructionSheetOpen(open);
                if (!open) {
                  setEditingInstruction(null);
                  instructionForm.resetForm();
                }
              }}
            >
              <SheetTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Instruction
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>
                    {editingInstruction ? 'Edit Instruction' : 'Create Instruction'}
                  </SheetTitle>
                </SheetHeader>
                <fetcher.Form method="post" className="mt-4 space-y-4">
                  <input 
                    type="hidden" 
                    name="intent" 
                    value={editingInstruction ? 'updateInstruction' : 'createInstruction'} 
                  />
                  {editingInstruction && (
                    <input type="hidden" name="instructionId" value={editingInstruction.id} />
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
                  <div className="space-y-2">
                    <Label htmlFor="interactiveType">Interactive Type</Label>
                    <Select 
                      value={instructionForm.value('interactiveType')} 
                      onValueChange={(value) => instructionForm.setValue('interactiveType', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="answer">Answer</SelectItem>
                        <SelectItem value="read">Read</SelectItem>
                        <SelectItem value="write">Write</SelectItem>
                      </SelectContent>
                    </Select>
                    <input type="hidden" name="interactiveType" value={instructionForm.value('interactiveType')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="answerType">Answer Type</Label>
                    <Select 
                      value={instructionForm.value('answerType')} 
                      onValueChange={(value) => instructionForm.setValue('answerType', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="textarea">Text Area</SelectItem>
                        <SelectItem value="select">Select</SelectItem>
                      </SelectContent>
                    </Select>
                    <input type="hidden" name="answerType" value={instructionForm.value('answerType')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="answerKey">Answer Key</Label>
                    <Textarea
                      {...instructionForm.getInputProps('answerKey')}
                      id="answerKey"
                      name="answerKey"
                      placeholder="Expected answer or guidance..."
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="instructionTutorInstructions">Tutor Instructions</Label>
                    <Textarea
                      {...instructionForm.getInputProps('tutorInstructions')}
                      id="instructionTutorInstructions"
                      name="tutorInstructions"
                      placeholder="Special instructions for the tutor..."
                      rows={2}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="canAskQuestion"
                      name="canAskQuestion"
                      checked={instructionForm.value('canAskQuestion')}
                      onCheckedChange={(checked) =>
                        instructionForm.setValue('canAskQuestion', checked)
                      }
                    />
                    <Label htmlFor="canAskQuestion">Allow students to ask questions</Label>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={fetcher.state !== 'idle'}
                  >
                    {fetcher.state !== 'idle' 
                      ? (editingInstruction ? 'Updating...' : 'Creating...') 
                      : (editingInstruction ? 'Update Instruction' : 'Create Instruction')
                    }
                  </Button>
                </fetcher.Form>
              </SheetContent>
            </Sheet>
          )}
        </CardHeader>
        <CardContent>
          {module.isSelfGuided ? (
            <div className="text-center text-muted-foreground py-8">
              Self-guided modules don't have instructions.
            </div>
          ) : module.instructions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No instructions yet. Create your first instruction to get started.
            </div>
          ) : (
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
                {module.instructions.map((instruction) => (
                  <TableRow key={instruction.id}>
                    <TableCell>
                      <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                    </TableCell>
                    <TableCell className="font-medium">
                      {instruction.title}
                    </TableCell>
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}