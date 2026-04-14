import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import {
  Link,
  data as dataResponse,
  useLoaderData,
  redirect,
} from 'react-router';
import { TrashIcon, VideoIcon, FileIcon, Plus, Upload } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { prisma } from '~/utils/db.server';
import { useFetcher } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { getUserId } from '~/utils/auth.server';
import { ChevronLeft, Settings } from 'lucide-react';
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
import { ConfirmationDialog } from '~/components/confirmation-dialog';
import { requireAdmin } from '~/utils/auth.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const [teacherTrainingModule, teacherTraining] = await Promise.all([
    prisma.teacherTrainingModule.findUnique({
      where: { id: params.moduleId },
      include: {
        resources: {
          select: {
            id: true,
            name: true,
            contentType: true,
            blob: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        teacherTraining: {
          select: { id: true, title: true },
        },
      },
    }),
    prisma.teacherTraining.findUnique({
      where: { id: params.id },
      select: { id: true, title: true },
    }),
  ]);

  if (!teacherTrainingModule || !teacherTraining) {
    throw new Response('Not Found', { status: 404 });
  }

  // Transform resources to include byteLength instead of blob
  const transformedModule = {
    ...teacherTrainingModule,
    resources: teacherTrainingModule.resources.map((resource) => ({
      id: resource.id,
      name: resource.name,
      contentType: resource.contentType,
      byteLength: resource.blob?.byteLength || 0,
    })),
  };

  return dataResponse({
    teacherTrainingModule: transformedModule,
    teacherTraining,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireAdmin(request);
  const userId = await getUserId(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'deleteModule') {
    await prisma.teacherTrainingModule.delete({
      where: { id: params.moduleId },
    });

    return redirect(`/app/admin/teacher-trainings/${params.id}`);
  }

  if (intent === 'updateModule') {
    const title = formData.get('title')?.toString();
    const description = formData.get('description')?.toString();
    const videoDurationStr = formData.get('videoDuration')?.toString();

    if (!title) {
      throw new Response('Title is required', { status: 400 });
    }

    let videoDuration = undefined;

    // Expect `videoS3Key` if replacing video
    const videoS3Key = formData.get('videoS3Key')?.toString();
    if (!videoS3Key) {
      return new Response('Missing videoS3Key', { status: 400 });
    }
    videoDuration = videoDurationStr
      ? Math.floor(Number(videoDurationStr))
      : null;

    await prisma.teacherTrainingModule.update({
      where: { id: params.moduleId },
      data: {
        title,
        description: description || null,
        ...(videoS3Key ? { videoS3Key } : {}),
        ...(videoDuration !== undefined && { videoDuration }),
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'uploadResources') {
    const files = formData.getAll('resources') as File[];

    if (files.length === 0) {
      throw new Response('No files provided', { status: 400 });
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
              teacherTrainingModuleId: params.moduleId!,
            },
          });
        }
      })
    );

    return dataResponse({ status: 'success' });
  }

  if (intent === 'deleteResource') {
    const resourceId = formData.get('resourceId')?.toString();

    if (!resourceId) {
      throw new Response('Resource ID is required', { status: 400 });
    }

    await prisma.teacherTrainingModuleResource.delete({
      where: { id: resourceId },
    });

    return dataResponse({ status: 'success' });
  }

  return dataResponse({ status: 'error' });
}

export default function TeacherTrainingModuleRoute() {
  const { teacherTrainingModule, teacherTraining } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [isModuleSheetOpen, setIsModuleSheetOpen] = React.useState(false);
  const [isResourceSheetOpen, setIsResourceSheetOpen] = React.useState(false);
  const [videoDuration, setVideoDuration] = React.useState<number | null>(null);
  const [isVideoLoading, setIsVideoLoading] = React.useState(false);
  const {
    uploadFile,
    progress: uploadProgress,
    isUploading,
  } = useMultipartUpload();

  const handleVideoFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsVideoLoading(true);
      try {
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
          moduleId: teacherTrainingModule.id,
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

  // Helper function for displaying duration in module details
  const formatDurationForDisplay = (seconds: number): string => {
    return formatDuration(seconds);
  };

  React.useEffect(() => {
    if (fetcher.data?.status === 'success' && fetcher.state === 'idle') {
      setIsModuleSheetOpen(false);
      setIsResourceSheetOpen(false);
      setVideoDuration(null);
      setIsVideoLoading(false);
    }
  }, [fetcher.data, fetcher.state]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex justify-between">
        <Button variant="ghost" asChild>
          <Link to={`/app/admin/teacher-trainings/${teacherTraining.id}`}>
            <ChevronLeft size={18} />
            Back to {teacherTraining.title}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Sheet
            open={isModuleSheetOpen}
            onOpenChange={(open) => {
              if (isUploading || fetcher.state !== 'idle') return;
              setIsModuleSheetOpen(open);
            }}
          >
            <SheetTrigger asChild>
              <Button
                variant="outline"
                disabled={isUploading || fetcher.state !== 'idle'}
              >
                <Settings className="mr-2 h-4 w-4" />
                Edit Module
              </Button>
            </SheetTrigger>
            <SheetContent
              onPointerDownOutside={(e) => {
                if (isUploading || fetcher.state !== 'idle') e.preventDefault();
              }}
              onEscapeKeyDown={(e) => {
                if (isUploading || fetcher.state !== 'idle') e.preventDefault();
              }}
            >
              <SheetHeader>
                <SheetTitle>Edit Teacher Training Module</SheetTitle>
              </SheetHeader>
              <fetcher.Form method="post" className="mt-4 space-y-4">
                <input type="hidden" name="intent" value="updateModule" />
                <input type="hidden" name="videoS3Key" id="videoS3Key" />
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    name="title"
                    defaultValue={teacherTrainingModule.title}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    defaultValue={teacherTrainingModule.description || ''}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="video">Replace Video</Label>
                  <Input
                    id="video"
                    name="video"
                    type="file"
                    accept="video/*"
                    onChange={handleVideoFileChange}
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
                      New duration: {formatDuration(videoDuration)}
                    </p>
                  )}
                  <input
                    type="hidden"
                    name="videoDuration"
                    value={videoDuration || ''}
                  />
                  <p className="text-sm text-muted-foreground">
                    Leave empty to keep current video.
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isUploading || fetcher.state !== 'idle'}
                >
                  {isUploading
                    ? `Uploading Video… ${uploadProgress}%`
                    : fetcher.state !== 'idle'
                      ? 'Saving...'
                      : 'Save Changes'}
                </Button>
              </fetcher.Form>
            </SheetContent>
          </Sheet>
          <ConfirmationDialog
            variant="destructive"
            title="Delete Module"
            description={`Are you sure you want to delete "${teacherTrainingModule.title}"? This action cannot be undone and will permanently remove the module and all its resources.`}
            confirmText="Delete Module"
            cancelText="Cancel"
            onConfirm={() => {
              fetcher.submit({ intent: 'deleteModule' }, { method: 'post' });
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
          <CardTitle>Module Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Title
              </dt>
              <dd className="text-base font-medium">
                {teacherTrainingModule.title}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Created At
              </dt>
              <dd className="text-base">
                {new Date(teacherTrainingModule.createdAt).toLocaleDateString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Description
              </dt>
              <dd className="text-base">
                {teacherTrainingModule.description || 'No description'}
              </dd>
            </div>
            {teacherTrainingModule.videoDuration && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Video Duration
                </dt>
                <dd className="text-base">
                  {formatDuration(teacherTrainingModule.videoDuration)}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {teacherTrainingModule.videoS3Key && (
        <Card className="bg-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <VideoIcon className="h-5 w-5" />
              Module Video
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Video format: {teacherTrainingModule.videoS3Key || 'Unknown'}
                </span>
                {teacherTrainingModule.videoDuration && (
                  <span>
                    Duration:{' '}
                    {formatDuration(teacherTrainingModule.videoDuration)}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileIcon className="h-5 w-5" />
            Module Resources
          </CardTitle>
          <Sheet
            open={isResourceSheetOpen}
            onOpenChange={setIsResourceSheetOpen}
          >
            <SheetTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Resources
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Upload Resources</SheetTitle>
              </SheetHeader>
              <fetcher.Form
                method="post"
                className="mt-4 space-y-4"
                encType="multipart/form-data"
              >
                <input type="hidden" name="intent" value="uploadResources" />
                <div className="space-y-2">
                  <Label htmlFor="resources">Select Files</Label>
                  <Input
                    id="resources"
                    name="resources"
                    type="file"
                    multiple
                    accept="*/*"
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    You can select multiple files to upload at once.
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={fetcher.state !== 'idle'}
                >
                  {fetcher.state !== 'idle'
                    ? 'Uploading...'
                    : 'Upload Resources'}
                </Button>
              </fetcher.Form>
            </SheetContent>
          </Sheet>
        </CardHeader>
        <CardContent>
          {teacherTrainingModule.resources.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No resources yet. Upload files to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {teacherTrainingModule.resources.map((resource) => (
                <div
                  key={resource.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-background"
                >
                  <div className="flex items-center gap-3">
                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{resource.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {resource.contentType} •{' '}
                        {formatFileSize(resource.byteLength)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={`/api/teacher-training-module-resource/${resource.id}`}
                        download
                      >
                        Download
                      </a>
                    </Button>
                    <ConfirmationDialog
                      variant="destructive"
                      title="Delete Resource"
                      description={`Are you sure you want to delete "${resource.name}"? This action cannot be undone.`}
                      confirmText="Delete"
                      cancelText="Cancel"
                      onConfirm={() => {
                        fetcher.submit(
                          { intent: 'deleteResource', resourceId: resource.id },
                          { method: 'post' }
                        );
                      }}
                      onCancel={() => {
                        // Dialog will close automatically
                      }}
                    >
                      <Button variant="destructive-outline" size="sm">
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </ConfirmationDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
