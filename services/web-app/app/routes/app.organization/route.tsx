import {
  data as dataResponse,
  type LoaderFunctionArgs,
  redirect,
  useLoaderData,
} from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { type BreadcrumbHandle } from '~/utils/breadcrumb';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Button } from '~/components/ui/button';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { NoDataPlaceholder } from '~/components/no-data-placeholder';

export const handle: BreadcrumbHandle = { breadcrumb: 'Organization' };

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  
  // Get user with isOwner status
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isOwner: true,
      organizationId: true,
    },
  });
  
  // Check if user is an owner
  if (!user?.isOwner) {
    throw redirect('/app');
  }
  
  if (!user.organizationId) {
    throw redirect('/app');
  }

  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    include: {
      users: {
        include: {
          teacherProfile: true,
          studentProfile: true,
        },
      },
    },
  });

  if (!organization) {
    throw redirect('/app');
  }

  const teachers = organization.users.filter(u => u.teacherProfile);
  const students = organization.users.filter(u => u.studentProfile);

  return dataResponse({
    organization,
    teachers,
    students,
    teacherSeatUsage: teachers.length,
    studentSeatUsage: students.length,
  });
}

export default function OrganizationRoute() {
  const data = useLoaderData<typeof loader>();
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b bg-muted p-6">
        <div className="mx-auto max-w-screen-xl">
          <h1 className="text-2xl font-bold">{data.organization.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Manage your organization's teachers and students
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-screen-xl space-y-6">
          {/* Status and Seats Overview */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Organization Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge
                  variant={data.organization.isActive ? 'default' : 'secondary'}
                  className="text-lg"
                >
                  {data.organization.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Teacher Seats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.teacherSeatUsage} / {data.organization.teacherSeats}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.organization.teacherSeats - data.teacherSeatUsage} seats available
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Student Seats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.studentSeatUsage} / {data.organization.studentSeats}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.organization.studentSeats - data.studentSeatUsage} seats available
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Teachers and Students Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="teachers">
                Teachers ({data.teachers.length})
              </TabsTrigger>
              <TabsTrigger value="students">
                Students ({data.students.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="teachers" className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Teachers</h2>
                <Button 
                  disabled={data.teacherSeatUsage >= data.organization.teacherSeats}
                >
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Add Teacher
                </Button>
              </div>
              
              {data.teachers.length > 0 ? (
                <div className="rounded-md border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-4 text-left font-medium">Name</th>
                        <th className="p-4 text-left font-medium">Email</th>
                        <th className="p-4 text-left font-medium">Status</th>
                        <th className="p-4 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.teachers.map((teacher) => (
                        <tr key={teacher.id} className="border-b">
                          <td className="p-4">{teacher.name || 'N/A'}</td>
                          <td className="p-4">{teacher.email}</td>
                          <td className="p-4">
                            <Badge variant={teacher.teacherProfile?.isActive ? 'default' : 'secondary'}>
                              {teacher.teacherProfile?.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <Button variant="ghost" size="sm">
                              Manage
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <NoDataPlaceholder
                  title="No teachers yet"
                  subtitle="Add teachers to your organization to get started"
                />
              )}
            </TabsContent>

            <TabsContent value="students" className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Students</h2>
                <Button 
                  disabled={data.studentSeatUsage >= data.organization.studentSeats}
                >
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Add Student
                </Button>
              </div>
              
              {data.students.length > 0 ? (
                <div className="rounded-md border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-4 text-left font-medium">Name</th>
                        <th className="p-4 text-left font-medium">Email</th>
                        <th className="p-4 text-left font-medium">School</th>
                        <th className="p-4 text-left font-medium">Grade</th>
                        <th className="p-4 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.students.map((student) => (
                        <tr key={student.id} className="border-b">
                          <td className="p-4">{student.name || 'N/A'}</td>
                          <td className="p-4">{student.email}</td>
                          <td className="p-4">{student.studentProfile?.school || 'N/A'}</td>
                          <td className="p-4">{student.studentProfile?.grade || 'N/A'}</td>
                          <td className="p-4">
                            <Button variant="ghost" size="sm">
                              Manage
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <NoDataPlaceholder
                  title="No students yet"
                  subtitle="Add students to your organization to get started"
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}