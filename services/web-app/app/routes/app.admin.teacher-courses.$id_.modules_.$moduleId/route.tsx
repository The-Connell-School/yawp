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
import { prisma } from '~/app/utils/db.server';
import { useFetcher } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { requireAdmin } from '~/app/utils/permissions';
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
import { ConfirmationDialog } from '~/components/confirmation-dialog';

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const [teacherCourseModule, teacherCourse] = await Promise.all([
    prisma.teacherCourseModule.findUnique({
      where: { id: params.moduleId },
      include: {
        resources: {
          orderBy: { createdAt: 'desc' },
        },
        teacherCourse: {
          select: { id: true, title: true },
        },
      },
    }),
    prisma.teacherCourse.findUnique({
      where: { id: params.id },
      select: { id: true, title: true },
    }),
  ]);

  if (!teacherCourseModule || !teacherCourse) {
    throw new Response('Not Found', { status: 404 });
  }

  return dataResponse({ teacherCourseModule, teacherCourse });
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'deleteModule') {
    await prisma.teacherCourseModule.delete({
      where: { id: params.moduleId },
    });

    return redirect(`/app/admin/teacher-courses/${params.id}`);
  }

  if (intent === 'updateModule') {
    const title = formData.get('title')?.toString();
    const description = formData.get('description')?.toString();
    const videoFile = formData.get('video') as File | null;
    const videoLink = formData.get('videoLink')?.toString();

    if (!title) {
      throw new Response('Title is required', { status: 400 });
    }

    let finalVideoLink = undefined;

    if (videoFile && videoFile.size > 0) {
      // For simplicity, we'll store the video as a blob and create a link to it
      const arrayBuffer = await videoFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      const upload = await prisma.upload.create({
        data: {
          name: videoFile.name,
          contentType: videoFile.type,
          blob: buffer,
          userId: 'admin', // You might want to get the actual user ID
        },
      });
      
      finalVideoLink = `/api/upload/${upload.id}`;
    } else if (videoLink) {
      finalVideoLink = videoLink;
    }

    await prisma.teacherCourseModule.update({
      where: { id: params.moduleId },
      data: {
        title,
        description: description || null,
        ...(finalVideoLink !== undefined && { videoLink: finalVideoLink }),
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

          await prisma.teacherCourseModuleResource.create({
            data: {
              name: file.name,
              contentType: file.type,
              blob: buffer,
              teacherCourseModuleId: params.moduleId!,
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

    await prisma.teacherCourseModuleResource.delete({
      where: { id: resourceId },
    });

    return dataResponse({ status: 'success' });
  }

  return dataResponse({ status: 'error' });
}

export default function TeacherCourseModuleRoute() {
  const { teacherCourseModule, teacherCourse } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [isModuleSheetOpen, setIsModuleSheetOpen] = React.useState(false);
  const [isResourceSheetOpen, setIsResourceSheetOpen] = React.useState(false);

  React.useEffect(() => {
    if (fetcher.data?.status === 'success' && fetcher.state === 'idle') {
      setIsModuleSheetOpen(false);
      setIsResourceSheetOpen(false);
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
          <Link to={`/app/admin/teacher-courses/${teacherCourse.id}`}>
            <ChevronLeft size={18} />
            Back to {teacherCourse.title}
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
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Edit Teacher Course Module</SheetTitle>
              </SheetHeader>
              <fetcher.Form
                method="post"
                className="mt-4 space-y-4"
                encType="multipart/form-data"
              >
                <input type="hidden" name="intent" value="updateModule" />
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    name="title"
                    defaultValue={teacherCourseModule.title}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    defaultValue={teacherCourseModule.description || ''}
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="videoLink">Or Update Video Link</Label>
                  <Input
                    id="videoLink"
                    name="videoLink"
                    defaultValue={teacherCourseModule.videoLink || ''}
                    placeholder="https://example.com/video.mp4"
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
            title="Delete Module"
            description={`Are you sure you want to delete "${teacherCourseModule.title}"? This action cannot be undone and will permanently remove the module and all its resources.`}
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
              <dd className="text-base font-medium">{teacherCourseModule.title}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Created At
              </dt>
              <dd className="text-base">
                {new Date(teacherCourseModule.createdAt).toLocaleDateString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Description
              </dt>
              <dd className="text-base">
                {teacherCourseModule.description || 'No description'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {teacherCourseModule.videoLink && (
        <Card className="bg-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <VideoIcon className="h-5 w-5" />
              Module Video
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <video 
                controls 
                className="w-full max-h-96 rounded-lg"
                src={teacherCourseModule.videoLink}
              >
                Your browser does not support the video tag.
              </video>
              <p className="text-sm text-muted-foreground">
                Video URL: <code className="bg-muted px-1 py-0.5 rounded text-xs">{teacherCourseModule.videoLink}</code>
              </p>
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
          <Sheet open={isResourceSheetOpen} onOpenChange={setIsResourceSheetOpen}>
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
                  {fetcher.state !== 'idle' ? 'Uploading...' : 'Upload Resources'}
                </Button>
              </fetcher.Form>
            </SheetContent>
          </Sheet>
        </CardHeader>
        <CardContent>
          {teacherCourseModule.resources.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No resources yet. Upload files to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {teacherCourseModule.resources.map((resource) => (
                <div 
                  key={resource.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-background"
                >
                  <div className="flex items-center gap-3">
                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{resource.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {resource.contentType} • {formatFileSize(Buffer.byteLength(resource.blob))}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/api/teacher-course-module-resource/${resource.id}`} download>
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