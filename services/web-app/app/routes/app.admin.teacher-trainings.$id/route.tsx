import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import {
  Link,
  data as dataResponse,
  useLoaderData,
  redirect,
} from 'react-router';
import { TrashIcon, ImageIcon, VideoIcon, FileIcon } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { prisma } from '~/utils/db.server';
import { buildModuleVideoKey, getSignedGetUrl } from '~/services/s3.server';
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
import { requireUserId } from '~/utils/auth.server';
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
import React from 'react';
import { useMultipartUpload } from '~/hooks/useMultipartUpload';
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

  const teacherTraining = await prisma.teacherTraining.findUnique({
    where: { id: params.id },
    include: {
      teacherTrainingModules: {
        include: {
          resources: {
            select: {
              id: true,
              name: true,
              contentType: true,
              blob: true,
            },
          },
        },
        orderBy: { position: 'asc' },
      },
      resources: {
        orderBy: { createdAt: 'desc' },
      },
      image: { select: { id: true } },
    },
  });

  if (!teacherTraining) {
    throw new Response('Not Found', { status: 404 });
  }

  // Transform resources to include byteLength instead of blob
  const transformedCourse = {
    ...teacherTraining,
    teacherTrainingModules: teacherTraining.teacherTrainingModules.map(
      (module) => ({
        ...module,
        resources: module.resources.map((resource) => ({
          id: resource.id,
          name: resource.name,
          contentType: resource.contentType,
          byteLength: resource.blob?.byteLength || 0,
        })),
      })
    ),
  };

  return dataResponse({ teacherTraining: transformedCourse });
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireAdmin(request);
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'deleteCourse') {
    await prisma.teacherTraining.delete({
      where: { id: params.id },
    });

    return redirect('/app/admin/teacher-trainings');
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
        await tx.teacherTrainingImage.deleteMany({
          where: { teacherTrainingId: params.id },
        });
      } else if (imageFile && imageFile.size > 0) {
        const arrayBuffer = await imageFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await tx.teacherTrainingImage.deleteMany({
          where: { teacherTrainingId: params.id },
        });
        await tx.teacherTrainingImage.create({
          data: {
            contentType: imageFile.type,
            blob: buffer,
            teacherTrainingId: params.id!,
          },
        });
      }

      await tx.teacherTraining.update({
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
    const videoFile = formData.get('video') as File | null;
    const videoDurationStr = formData.get('videoDuration')?.toString();

    if (!title) {
      throw new Response('Title is required', { status: 400 });
    }

    if (!videoFile || videoFile.size === 0) {
      throw new Response('Video file is required', { status: 400 });
    }

    const moduleCount = await prisma.teacherTrainingModule.count({
      where: { teacherTrainingId: params.id },
    });

    let finalVideoLink = null;
    let videoDuration = videoDurationStr
      ? Math.floor(Number(videoDurationStr))
      : null;

    // Client performs multipart upload to S3 separately.
    // Here we expect the client to send `videoS3Key` as hidden input after upload completes.
    const videoS3Key = formData.get('videoS3Key')?.toString();
    if (!videoS3Key) {
      throw new Response('Missing videoS3Key', { status: 400 });
    }

    await prisma.teacherTrainingModule.create({
      data: {
        title,
        description: description || null,
        videoS3Key,
        videoDuration,
        position: moduleCount,
        teacherTrainingId: params.id!,
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'reorderModules') {
    const moduleIds = JSON.parse(formData.get('moduleIds')?.toString() || '[]');

    await Promise.all(
      moduleIds.map((moduleId: string, index: number) =>
        prisma.teacherTrainingModule.update({
          where: { id: moduleId },
          data: { position: index },
        })
      )
    );

    return dataResponse({ status: 'success' });
  }

  if (intent === 'uploadResource') {
    const moduleId = formData.get('moduleId')?.toString();
    const files = formData.getAll('resources') as File[];

    if (!moduleId || files.length === 0) {
      throw new Response('Module ID and files are required', { status: 400 });
    }

    await Promise.all(
      files.map(async (file) => {
        if (file.size > 0) {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          await prisma.teacherTrainingModuleResource.create({
            data: {
              name: file.name,
              contentType: file.type,
              blob: buffer,
              teacherTrainingModuleId: moduleId,
            },
          });
        }
      })
    );

    return dataResponse({ status: 'success' });
  }

  return dataResponse({ status: 'error' });
}

export default function TeacherTrainingRoute() {
  const { teacherTraining } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [isCourseSheetOpen, setIsCourseSheetOpen] = React.useState(false);
  const [isModuleSheetOpen, setIsModuleSheetOpen] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [hasRemovedImage, setHasRemovedImage] = React.useState(false);
  const [isImageUploading, setIsImageUploading] = React.useState(false);
  const [imageUploadProgress, setImageUploadProgress] =
    React.useState<number>(0);
  const [videoDuration, setVideoDuration] = React.useState<number | null>(null);
  const [isVideoLoading, setIsVideoLoading] = React.useState(false);
  const {
    uploadFile,
    progress: uploadProgress,
    isUploading,
  } = useMultipartUpload();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // --- Drag and drop state for modules ---
  const [modules, setModules] = React.useState(
    teacherTraining.teacherTrainingModules
  );
  React.useEffect(() => {
    setModules(teacherTraining.teacherTrainingModules);
  }, [teacherTraining.teacherTrainingModules]);

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
  function SortableTableRow({ module }: { module: any; idx: number }) {
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
          {module.videoS3Key ? (
            <div className="flex items-center gap-1">
              <VideoIcon className="h-4 w-4" />
              <span>Video</span>
            </div>
          ) : (
            <span className="text-muted-foreground">No video</span>
          )}
        </TableCell>
        <TableCell>{module.resources.length}</TableCell>
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
      setVideoDuration(null);
      setIsVideoLoading(false);
    }
  }, [fetcher.data, fetcher.state]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      // Simulate/provide local read progress; actual network upload occurs on submit
      setIsImageUploading(true);
      setImageUploadProgress(0);
      const reader = new FileReader();
      reader.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const pct = Math.round((evt.loaded / evt.total) * 100);
          setImageUploadProgress(pct);
        }
      };
      reader.onloadend = () => {
        setImageUploadProgress(100);
        setIsImageUploading(false);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleRemoveImage = () => {
    setHasRemovedImage(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setPreviewUrl(null);
  };

  const handleVideoFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsVideoLoading(true);
      try {
        // Client-side video duration detection
        const duration = await new Promise<number>((resolve, reject) => {
          const video = document.createElement('video');
          video.preload = 'metadata';

          video.onloadedmetadata = function () {
            URL.revokeObjectURL(video.src);
            resolve(video.duration);
          };

          video.onerror = function () {
            URL.revokeObjectURL(video.src);
            reject(new Error('Error loading video metadata'));
          };

          video.src = URL.createObjectURL(file);
        });

        setVideoDuration(duration);
        // Perform multipart upload, then set hidden input value
        const { key } = await uploadFile({
          file,
          teacherTrainingId: teacherTraining.id,
          moduleId: 'new',
        });
        const hidden = document.getElementById(
          'videoS3Key'
        ) as HTMLInputElement | null;
        if (hidden) hidden.value = key;
      } catch (error) {
        console.error('Could not get video duration:', error);
        setVideoDuration(null);
      } finally {
        setIsVideoLoading(false);
      }
    } else {
      setVideoDuration(null);
    }
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '0:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  };

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex justify-between">
        <Button variant="ghost" asChild>
          <Link to="/app/admin/teacher-trainings">
            <ChevronLeft size={18} />
            All teacher trainings
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Sheet
            open={isCourseSheetOpen}
            onOpenChange={(open) => {
              if (isImageUploading || fetcher.state !== 'idle') return;
              setIsCourseSheetOpen(open);
            }}
          >
            <SheetTrigger asChild>
              <Button
                variant="outline"
                disabled={isImageUploading || fetcher.state !== 'idle'}
              >
                <Settings className="mr-2 h-4 w-4" />
                Edit Course
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Edit Teacher Training</SheetTitle>
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
                    {previewUrl ||
                    (teacherTraining.image && !hasRemovedImage) ? (
                      <div className="relative w-full">
                        <img
                          src={
                            previewUrl ||
                            `/api/image/teacher-training/${teacherTraining.image?.id}`
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
                        {teacherTraining.image && !previewUrl && (
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
                    {!previewUrl && !teacherTraining.image && (
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
                    defaultValue={teacherTraining.title}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    defaultValue={teacherTraining.description || ''}
                    rows={3}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isImageUploading || fetcher.state !== 'idle'}
                >
                  {isImageUploading
                    ? `Uploading Image… ${imageUploadProgress}%`
                    : fetcher.state !== 'idle'
                      ? 'Saving...'
                      : 'Save Changes'}
                </Button>
              </fetcher.Form>
            </SheetContent>
          </Sheet>
          <ConfirmationDialog
            variant="destructive"
            title="Delete Teacher Training"
            description={`Are you sure you want to delete "${teacherTraining.title}"? This action cannot be undone and will permanently remove the course and all its modules.`}
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
              <dd className="text-base font-medium">{teacherTraining.title}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Created At
              </dt>
              <dd className="text-base">
                {new Date(teacherTraining.createdAt).toLocaleDateString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Description
              </dt>
              <dd className="text-base">
                {teacherTraining.description || 'No description'}
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
              <fetcher.Form
                method="post"
                className="mt-4 space-y-4"
                encType="multipart/form-data"
              >
                <input type="hidden" name="intent" value="createModule" />
                <input type="hidden" name="videoS3Key" id="videoS3Key" />
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
                <div className="space-y-2">
                  <Label htmlFor="video">Video Upload</Label>
                  <Input
                    id="video"
                    name="video"
                    type="file"
                    accept="video/*"
                    onChange={handleVideoFileChange}
                    required
                  />
                  {isUploading ? (
                    <p className="text-sm text-muted-foreground">
                      Uploading... {uploadProgress}%
                    </p>
                  ) : null}
                  {isVideoLoading && (
                    <p className="text-sm text-muted-foreground">
                      Analyzing video duration...
                    </p>
                  )}
                  {videoDuration && (
                    <p className="text-sm text-green-600">
                      Duration: {formatDuration(videoDuration)}
                    </p>
                  )}
                  <input
                    type="hidden"
                    name="videoDuration"
                    value={videoDuration || ''}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Upload a video file to create this module. You can add
                  resources after creating the module.
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
                    <TableHead>Video</TableHead>
                    <TableHead>Resources</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <SortableContext
                  items={modules.map((m) => m.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <TableBody>
                    {modules.map((module, idx) => (
                      <SortableTableRow
                        key={module.id}
                        module={module}
                        idx={idx}
                      />
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
