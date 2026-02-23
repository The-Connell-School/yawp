import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import {
  Link,
  data as dataResponse,
  useLoaderData,
  redirect,
} from 'react-router';
import { TrashIcon, ImageIcon, FileText, Upload, Loader2, X } from 'lucide-react';
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
import { Badge } from '~/components/ui/badge';

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const course = await prisma.studentCourse.findUnique({
    where: { id: params.id },
    include: {
      studentCourseModules: {
        where: { deletedAt: null },
        include: {
          instructions: {
            orderBy: { position: 'asc' },
          },
        },
        orderBy: { position: 'asc' },
      },
      image: { select: { id: true } },
      writingPrompt: { select: { id: true, fileName: true } },
      rubric: { select: { id: true, fileName: true } },
      writingPromptSections: { orderBy: { position: 'asc' } },
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

  if (intent === 'deleteCourse') {
    await prisma.studentCourse.delete({
      where: { id: params.id },
    });

    return redirect('/app/admin/student-courses');
  }

  if (intent === 'updateCourse') {
    const title = formData.get('title')?.toString();
    const description = formData.get('description')?.toString();
    const imageFile = formData.get('image') as File | null;
    const deleteImage = formData.get('deleteImage') === 'true';

    if (!title) {
      throw new Response('Title is required', { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      if (deleteImage) {
        await tx.studentCourseImage.deleteMany({
          where: { studentCourseId: params.id },
        });
      } else if (imageFile && imageFile.size > 0) {
        const arrayBuffer = await imageFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await tx.studentCourseImage.deleteMany({
          where: { studentCourseId: params.id },
        });
        await tx.studentCourseImage.create({
          data: {
            contentType: imageFile.type,
            blob: buffer,
            studentCourseId: params.id!,
          },
        });
      }

      await tx.studentCourse.update({
        where: { id: params.id },
        data: {
          title,
          description: description || null,
        },
      });
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'toggleWritingPrompt') {
    const hasWritingPrompt = formData.get('hasWritingPrompt') === 'true';
    await prisma.studentCourse.update({
      where: { id: params.id },
      data: { hasWritingPrompt },
    });
    return dataResponse({ status: 'success' });
  }

  if (intent === 'uploadWritingPrompt') {
    const pdfFile = formData.get('pdf') as File | null;
    if (!pdfFile || pdfFile.size === 0) {
      throw new Response('PDF file is required', { status: 400 });
    }

    const arrayBuffer = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.$transaction(async (tx) => {
      await tx.studentCourseWritingPrompt.deleteMany({
        where: { studentCourseId: params.id },
      });
      await tx.studentCourseWritingPrompt.create({
        data: {
          contentType: 'application/pdf',
          blob: buffer,
          fileName: pdfFile.name,
          studentCourseId: params.id!,
        },
      });
      await tx.studentCourse.update({
        where: { id: params.id },
        data: { hasWritingPrompt: true },
      });
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'deleteWritingPrompt') {
    await prisma.$transaction(async (tx) => {
      await tx.studentCourseWritingPrompt.deleteMany({
        where: { studentCourseId: params.id },
      });
      await tx.studentCourseWritingPromptSection.deleteMany({
        where: { studentCourseId: params.id },
      });
      await tx.studentCourse.update({
        where: { id: params.id },
        data: {
          hasWritingPrompt: false,
          writingPromptResponseType: null,
        },
      });
    });
    return dataResponse({ status: 'success' });
  }

  if (intent === 'saveSections') {
    const sectionsJson = formData.get('sections')?.toString();
    const responseType = formData.get('responseType')?.toString();

    const sections: { label: string; description: string }[] = sectionsJson
      ? JSON.parse(sectionsJson)
      : [];

    await prisma.$transaction(async (tx) => {
      await tx.studentCourseWritingPromptSection.deleteMany({
        where: { studentCourseId: params.id },
      });

      if (sections.length > 0) {
        await tx.studentCourseWritingPromptSection.createMany({
          data: sections.map((s, i) => ({
            position: i,
            label: s.label,
            description: s.description || null,
            studentCourseId: params.id!,
          })),
        });
      }

      await tx.studentCourse.update({
        where: { id: params.id },
        data: {
          writingPromptResponseType: responseType || 'free',
        },
      });
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'uploadRubric') {
    const pdfFile = formData.get('pdf') as File | null;
    if (!pdfFile || pdfFile.size === 0) {
      throw new Response('PDF file is required', { status: 400 });
    }

    const arrayBuffer = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Import anthropic here for rubric extraction
    const { anthropic } = await import('~/services/anthropic');

    await prisma.studentCourseRubric.deleteMany({
      where: { studentCourseId: params.id },
    });

    const base64Pdf = buffer.toString('base64');
    let extractedText: string | null = null;

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Pdf,
                },
              },
              {
                type: 'text',
                text: 'Extract all text content from this rubric document. Preserve the structure, scoring criteria, point values, and descriptions. Return only the extracted text, no additional commentary.',
              },
            ],
          },
        ],
      });
      extractedText =
        message.content[0].type === 'text' ? message.content[0].text : null;
    } catch (e) {
      console.error('Failed to extract rubric text:', e);
    }

    await prisma.studentCourseRubric.create({
      data: {
        contentType: 'application/pdf',
        blob: buffer,
        fileName: pdfFile.name,
        extractedText,
        studentCourseId: params.id!,
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'deleteRubric') {
    await prisma.studentCourseRubric.deleteMany({
      where: { studentCourseId: params.id },
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

    const moduleCount = await prisma.studentCourseModule.count({
      where: { studentCourseId: params.id, deletedAt: null },
    });

    await prisma.studentCourseModule.create({
      data: {
        title,
        description: description || null,
        isSelfGuided,
        tutorInstructions: tutorInstructions || null,
        position: moduleCount,
        studentCourseId: params.id!,
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'reorderModules') {
    const moduleIds = JSON.parse(formData.get('moduleIds')?.toString() || '[]');

    await Promise.all(
      moduleIds.map((moduleId: string, index: number) =>
        prisma.studentCourseModule.update({
          where: { id: moduleId },
          data: { position: index },
        })
      )
    );

    return dataResponse({ status: 'success' });
  }

  return dataResponse({ status: 'error' });
}

export default function CourseRoute() {
  const { course } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const detectFetcher = useFetcher();
  const [isCourseSheetOpen, setIsCourseSheetOpen] = React.useState(false);
  const [isModuleSheetOpen, setIsModuleSheetOpen] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [hasRemovedImage, setHasRemovedImage] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const promptFileInputRef = React.useRef<HTMLInputElement>(null);
  const rubricFileInputRef = React.useRef<HTMLInputElement>(null);

  // Writing prompt section editing state
  const [sections, setSections] = React.useState(
    course.writingPromptSections.map((s) => ({
      label: s.label,
      description: s.description || '',
    }))
  );
  const [responseType, setResponseType] = React.useState<string>(
    course.writingPromptResponseType || 'free'
  );

  React.useEffect(() => {
    setSections(
      course.writingPromptSections.map((s) => ({
        label: s.label,
        description: s.description || '',
      }))
    );
    setResponseType(course.writingPromptResponseType || 'free');
  }, [course.writingPromptSections, course.writingPromptResponseType]);

  // When detect sections returns, update local state
  React.useEffect(() => {
    if (detectFetcher.data?.sections && detectFetcher.state === 'idle') {
      setSections(
        detectFetcher.data.sections.map((s: any) => ({
          label: s.label,
          description: s.description || '',
        }))
      );
      if (detectFetcher.data.sections.length > 0) {
        setResponseType('structured');
      }
    }
  }, [detectFetcher.data, detectFetcher.state]);

  // --- Drag and drop state for modules ---
  const [modules, setModules] = React.useState(course.studentCourseModules);
  React.useEffect(() => {
    setModules(course.studentCourseModules);
  }, [course.studentCourseModules]);

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
      setIsCourseSheetOpen(false);
      setIsModuleSheetOpen(false);
      setPreviewUrl(null);
      setHasRemovedImage(false);
    }
  }, [fetcher.data, fetcher.state]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleRemoveImage = () => {
    setHasRemovedImage(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setPreviewUrl(null);
  };

  const handlePromptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const formData = new FormData();
      formData.append('intent', 'uploadWritingPrompt');
      formData.append('pdf', file);
      fetcher.submit(formData, { method: 'post', encType: 'multipart/form-data' });
    }
  };

  const handleRubricUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const formData = new FormData();
      formData.append('intent', 'uploadRubric');
      formData.append('pdf', file);
      fetcher.submit(formData, { method: 'post', encType: 'multipart/form-data' });
    }
  };

  const handleDetectSections = () => {
    detectFetcher.submit(
      { studentCourseId: course.id },
      { method: 'post', action: '/api/domain/detect-prompt-sections' }
    );
  };

  const handleSaveSections = () => {
    fetcher.submit(
      {
        intent: 'saveSections',
        sections: JSON.stringify(sections),
        responseType,
      },
      { method: 'post' }
    );
  };

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      { label: `Part ${String.fromCharCode(65 + prev.length)}`, description: '' },
    ]);
  };

  const removeSection = (index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSection = (
    index: number,
    field: 'label' | 'description',
    value: string
  ) => {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const isDetecting = detectFetcher.state !== 'idle';

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex justify-between">
        <Button variant="ghost" asChild>
          <Link to="/app/admin/student-courses">
            <ChevronLeft size={18} />
            All courses
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Sheet open={isCourseSheetOpen} onOpenChange={setIsCourseSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline">
                <Settings className="mr-2 h-4 w-4" />
                Edit Course
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Edit Course</SheetTitle>
              </SheetHeader>
              <fetcher.Form
                method="post"
                className="mt-4 space-y-4"
                encType="multipart/form-data"
              >
                <input type="hidden" name="intent" value="updateCourse" />
                <div className="space-y-2">
                  <Label>Course Image</Label>
                  <div className="flex flex-col items-center gap-4">
                    {previewUrl || (course.image && !hasRemovedImage) ? (
                      <div className="relative w-full">
                        <img
                          src={
                            previewUrl ||
                            `/api/image/course/${course.image?.id}`
                          }
                          alt=""
                          className="h-48 w-full rounded-lg object-cover"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="absolute right-2 top-2"
                          onClick={handleRemoveImage}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                        {course.image && !previewUrl && (
                          <input
                            type="hidden"
                            name="deleteImage"
                            value="true"
                          />
                        )}
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="flex h-48 w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 hover:bg-muted"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            Click to upload image
                          </span>
                        </div>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      name="image"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageChange}
                    />
                    {!previewUrl && !course.image && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Upload Image
                      </Button>
                    )}
                  </div>
                </div>
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
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    defaultValue={course.description || ''}
                    rows={3}
                  />
                </div>
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
          <ConfirmationDialog
            variant="destructive"
            title="Delete Course"
            description={`Are you sure you want to delete "${course.title}"? This action cannot be undone and will permanently remove the course and all its modules.`}
            confirmText="Delete Course"
            cancelText="Cancel"
            onConfirm={() => {
              fetcher.submit({ intent: 'deleteCourse' }, { method: 'post' });
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

      <Card className="bg-muted">
        <CardHeader>
          <CardTitle>Course Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Title
              </dt>
              <dd className="text-base font-medium">{course.title}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Created At
              </dt>
              <dd className="text-base">
                {new Date(course.createdAt).toLocaleDateString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Description
              </dt>
              <dd className="text-base">
                {course.description || 'No description'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Writing Prompt Card */}
      <Card className="bg-muted">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Writing Prompt</CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="hasWritingPrompt" className="text-sm">
              Include writing prompt
            </Label>
            <Switch
              id="hasWritingPrompt"
              checked={course.hasWritingPrompt}
              onCheckedChange={(checked) => {
                fetcher.submit(
                  {
                    intent: 'toggleWritingPrompt',
                    hasWritingPrompt: String(checked),
                  },
                  { method: 'post' }
                );
              }}
            />
          </div>
        </CardHeader>
        {course.hasWritingPrompt && (
          <CardContent className="space-y-6">
            {/* Prompt PDF Upload */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Prompt PDF</Label>
              {course.writingPrompt ? (
                <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="flex-1 text-sm">
                    {course.writingPrompt.fileName || 'Writing prompt PDF'}
                  </span>
                  <ConfirmationDialog
                    variant="destructive"
                    title="Delete Writing Prompt"
                    description="Are you sure you want to delete this writing prompt? All detected sections will also be removed."
                    confirmText="Delete"
                    cancelText="Cancel"
                    onConfirm={() => {
                      fetcher.submit(
                        { intent: 'deleteWritingPrompt' },
                        { method: 'post' }
                      );
                    }}
                    onCancel={() => {}}
                  >
                    <Button variant="destructive" size="sm">
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </ConfirmationDialog>
                </div>
              ) : (
                <div
                  onClick={() => promptFileInputRef.current?.click()}
                  className="flex h-24 w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-background hover:bg-muted/50"
                >
                  <div className="flex flex-col items-center gap-1">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Upload PDF
                    </span>
                  </div>
                </div>
              )}
              <input
                ref={promptFileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handlePromptUpload}
              />
            </div>

            {/* Detect Sections + Configuration (only when prompt exists) */}
            {course.writingPrompt && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Label className="text-sm font-medium">Response Format</Label>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="responseType"
                          value="free"
                          checked={responseType === 'free'}
                          onChange={() => setResponseType('free')}
                          className="accent-primary"
                        />
                        Free writing
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="responseType"
                          value="structured"
                          checked={responseType === 'structured'}
                          onChange={() => setResponseType('structured')}
                          className="accent-primary"
                        />
                        Structured sections
                      </label>
                    </div>
                  </div>
                </div>

                {responseType === 'structured' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Sections</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleDetectSections}
                          disabled={isDetecting}
                        >
                          {isDetecting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Detecting...
                            </>
                          ) : (
                            'Detect Sections'
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addSection}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add
                        </Button>
                      </div>
                    </div>
                    {sections.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No sections configured. Click "Detect Sections" to
                        auto-detect from the PDF, or add sections manually.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {sections.map((section, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-2 rounded-lg border bg-background p-3"
                          >
                            <div className="flex-1 space-y-2">
                              <Input
                                value={section.label}
                                onChange={(e) =>
                                  updateSection(index, 'label', e.target.value)
                                }
                                placeholder="Label (e.g., Part A)"
                                className="h-8 text-sm"
                              />
                              <Input
                                value={section.description}
                                onChange={(e) =>
                                  updateSection(
                                    index,
                                    'description',
                                    e.target.value
                                  )
                                }
                                placeholder="Description (optional)"
                                className="h-8 text-sm"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeSection(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Rubric PDF Upload */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    Upload Scoring Rubric (optional)
                  </Label>
                  {course.rubric ? (
                    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <span className="flex-1 text-sm">
                        {course.rubric.fileName || 'Rubric PDF'}
                      </span>
                      <ConfirmationDialog
                        variant="destructive"
                        title="Delete Rubric"
                        description="Are you sure you want to delete this rubric?"
                        confirmText="Delete"
                        cancelText="Cancel"
                        onConfirm={() => {
                          fetcher.submit(
                            { intent: 'deleteRubric' },
                            { method: 'post' }
                          );
                        }}
                        onCancel={() => {}}
                      >
                        <Button variant="destructive" size="sm">
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </ConfirmationDialog>
                    </div>
                  ) : (
                    <div
                      onClick={() => rubricFileInputRef.current?.click()}
                      className="flex h-24 w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-background hover:bg-muted/50"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Upload Rubric PDF
                        </span>
                      </div>
                    </div>
                  )}
                  <input
                    ref={rubricFileInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleRubricUpload}
                  />
                </div>

                {/* Save Configuration */}
                <Button
                  onClick={handleSaveSections}
                  disabled={fetcher.state !== 'idle'}
                  className="w-full"
                >
                  {fetcher.state !== 'idle'
                    ? 'Saving...'
                    : 'Save Writing Prompt Configuration'}
                </Button>
              </>
            )}
          </CardContent>
        )}
      </Card>

      <Card className="bg-muted">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Course Modules</CardTitle>
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
