import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import {
  Link,
  data as dataResponse,
  useLoaderData,
  redirect,
} from 'react-router';
import { TrashIcon, ImageIcon } from 'lucide-react';
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
  const [isCourseSheetOpen, setIsCourseSheetOpen] = React.useState(false);
  const [isModuleSheetOpen, setIsModuleSheetOpen] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [hasRemovedImage, setHasRemovedImage] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
