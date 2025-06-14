import { invariant } from '@epic-web/invariant';
import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import {
  Link,
  data as dataResponse,
  redirect,
  useLoaderData,
} from 'react-router';
import omit from 'lodash/omit';
import { TrashIcon } from 'lucide-react';
import {
  ValidatedForm,
  validationError,
  parseFormData,
} from '@rvf/react-router';
import { z } from 'zod';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { prisma } from '~/utils/db.server';
import { useDoubleCheck, useIsPending } from '~/utils/misc';
import { redirectWithToast } from '~/utils/toast.server';
import { CourseForm } from '../app.admin.courses/form';
import { validator } from '../app.admin.courses/form/schema';
import { useFetcher } from 'react-router';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
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
import React from 'react';

const deleteValidator = z.object({ id: z.string() });

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const course = await prisma.course.findUnique({
    where: { id: params.id },
    include: {
      courseModules: {
        include: {
          instructions: {
            orderBy: { position: 'asc' },
          },
        },
        orderBy: { position: 'asc' },
      },
      resources: {
        orderBy: { createdAt: 'desc' },
      },
      image: true,
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

  if (intent === 'updateCourse') {
    const title = formData.get('title')?.toString();
    const description = formData.get('description')?.toString();

    if (!title) {
      throw new Response('Title is required', { status: 400 });
    }

    await prisma.course.update({
      where: { id: params.id },
      data: {
        title,
        description: description || null,
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'createModule') {
    const title = formData.get('title')?.toString();
    const description = formData.get('description')?.toString();
    const isSelfGuided = formData.get('isSelfGuided') === 'true';

    if (!title) {
      throw new Response('Title is required', { status: 400 });
    }

    const moduleCount = await prisma.courseModule.count({
      where: { courseId: params.id },
    });

    await prisma.courseModule.create({
      data: {
        title,
        description: description || null,
        isSelfGuided,
        position: moduleCount,
        courseId: params.id!,
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'createResource') {
    const title = formData.get('title')?.toString();
    const description = formData.get('description')?.toString();
    const url = formData.get('url')?.toString();

    if (!title) {
      throw new Response('Title is required', { status: 400 });
    }

    await prisma.courseResource.create({
      data: {
        title,
        description: description || null,
        url: url || null,
        courseId: params.id!,
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'reorderModules') {
    const moduleIds = JSON.parse(formData.get('moduleIds')?.toString() || '[]');
    
    await Promise.all(
      moduleIds.map((moduleId: string, index: number) =>
        prisma.courseModule.update({
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
  const [isResourceSheetOpen, setIsResourceSheetOpen] = React.useState(false);

  React.useEffect(() => {
    if (fetcher.data?.status === 'success') {
      setIsCourseSheetOpen(false);
      setIsModuleSheetOpen(false);
      setIsResourceSheetOpen(false);
    }
  }, [fetcher.data]);

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex justify-between">
        <Button variant="ghost" asChild>
          <Link to="/app/admin/courses">
            <ChevronLeft size={18} />
            All courses
          </Link>
        </Button>
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
            <fetcher.Form method="post" className="mt-4 space-y-4">
              <input type="hidden" name="intent" value="updateCourse" />
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
      </div>

      <div className="grid gap-4 md:grid-cols-3">
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
                  Description
                </dt>
                <dd className="text-base">
                  {course.description || 'No description'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Created At
                </dt>
                <dd className="text-base">
                  {new Date(course.createdAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardHeader>
            <CardTitle>Modules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{course.courseModules.length}</div>
            <p className="text-sm text-muted-foreground">Course modules</p>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardHeader>
            <CardTitle>Resources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{course.resources.length}</div>
            <p className="text-sm text-muted-foreground">Learning resources</p>
          </CardContent>
        </Card>
      </div>

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
                  <Textarea id="moduleDescription" name="description" rows={3} />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="isSelfGuided" name="isSelfGuided" />
                  <Label htmlFor="isSelfGuided">Self-guided module</Label>
                </div>
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
          {course.courseModules.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No modules yet. Create your first module to get started.
            </div>
          ) : (
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
              <TableBody>
                {course.courseModules.map((module) => (
                  <TableRow key={module.id}>
                    <TableCell>
                      <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                    </TableCell>
                    <TableCell className="font-medium">
                      {module.title}
                    </TableCell>
                    <TableCell>
                      {module.isSelfGuided ? 'Self-guided' : 'Tutor-guided'}
                    </TableCell>
                    <TableCell>{module.instructions.length}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`modules/${module.id}`}>
                          Edit
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Course Resources</CardTitle>
          <Sheet open={isResourceSheetOpen} onOpenChange={setIsResourceSheetOpen}>
            <SheetTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Resource
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Create Resource</SheetTitle>
              </SheetHeader>
              <fetcher.Form method="post" className="mt-4 space-y-4">
                <input type="hidden" name="intent" value="createResource" />
                <div className="space-y-2">
                  <Label htmlFor="resourceTitle">Title</Label>
                  <Input id="resourceTitle" name="title" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resourceDescription">Description</Label>
                  <Textarea id="resourceDescription" name="description" rows={3} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resourceUrl">URL</Label>
                  <Input
                    id="resourceUrl"
                    name="url"
                    type="url"
                    placeholder="https://..."
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={fetcher.state !== 'idle'}
                >
                  {fetcher.state !== 'idle' ? 'Creating...' : 'Create Resource'}
                </Button>
              </fetcher.Form>
            </SheetContent>
          </Sheet>
        </CardHeader>
        <CardContent>
          {course.resources.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No resources yet. Add your first resource to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {course.resources.map((resource) => (
                  <TableRow key={resource.id}>
                    <TableCell className="font-medium">
                      {resource.title}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {resource.description || 'No description'}
                    </TableCell>
                    <TableCell>
                      {resource.url ? (
                        <a
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Open
                        </a>
                      ) : (
                        'No URL'
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm">
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
