import {
  data as dataResponse,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useSearchParams,
  Outlet,
  useLoaderData,
  useFetcher,
} from 'react-router';
import {
  ArrowUpDown,
  MoreHorizontal,
  PencilIcon,
  PlusIcon,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from '@rvf/react-router';
import { z } from 'zod';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { SearchInput } from '~/components/search-input';
import { Pagination } from '~/components/table/pagination.tsx';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Table as TableComponent,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '~/components/ui/table';
import { Switch } from '~/components/ui/switch';
import { type BreadcrumbHandle } from '~/utils/breadcrumb';
import { prisma } from '~/utils/db.server';
import { createToastHeaders } from '~/utils/toast.server';
import { parseFormData, validationError } from '@rvf/react-router';
import { requireAdmin } from '~/utils/permissions';

export const handle: BreadcrumbHandle = { breadcrumb: 'Organizations' };

const organizationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  isActive: z.coerce.boolean().optional(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get('q') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const sortBy = url.searchParams.get('sortBy') || 'name';
  const sortOrder = url.searchParams.get('sortOrder') || 'asc';

  const where = searchQuery
    ? { name: { contains: searchQuery, mode: 'insensitive' as const } }
    : {};

  const [organizations, totalCount] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.organization.count({ where }),
  ]);

  return dataResponse({
    organizations,
    totalCount,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'create' || intent === 'update') {
    const result = await parseFormData(formData, organizationSchema);

    if (result.error) {
      return validationError(result.error, result.submittedData);
    }

    const data = {
      name: result.data.name,
      isActive: result.data.isActive ?? true,
    };

    if (intent === 'create') {
      await prisma.organization.create({ data });

      return dataResponse(
        { success: true },
        {
          headers: await createToastHeaders({
            title: 'Organization created',
            description: 'The organization has been successfully created.',
          }),
        }
      );
    } else {
      const id = formData.get('id') as string;
      await prisma.organization.update({
        where: { id },
        data,
      });

      return dataResponse(
        { success: true },
        {
          headers: await createToastHeaders({
            title: 'Organization updated',
            description: 'The organization has been successfully updated.',
          }),
        }
      );
    }
  }

  if (intent === 'delete') {
    const id = formData.get('id') as string;
    await prisma.organization.delete({ where: { id } });

    return dataResponse(
      { success: true },
      {
        headers: await createToastHeaders({
          title: 'Organization deleted',
          description: 'The organization has been successfully deleted.',
        }),
      }
    );
  }

  if (intent === 'toggleActive') {
    const id = formData.get('id') as string;
    const organization = await prisma.organization.findUnique({
      where: { id },
    });

    if (organization) {
      await prisma.organization.update({
        where: { id },
        data: { isActive: !organization.isActive },
      });
    }

    return dataResponse({ success: true });
  }

  return dataResponse(
    { success: false, message: 'Unknown action intent' },
    { status: 400 }
  );
}

export default function OrganizationsRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { organizations, totalCount, page, limit, totalPages } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState<any>(null);

  const createForm = useForm({
    schema: organizationSchema,
    defaultValues: { name: '', isActive: true },
    id: 'create-organization-form',
  });

  const editForm = useForm({
    schema: organizationSchema,
    defaultValues: selectedOrganization || { name: '', isActive: true },
    id: 'edit-organization-form',
  });

  useEffect(() => {
    if (selectedOrganization) {
      editForm.setValue('name', selectedOrganization.name || '');
      editForm.setValue('isActive', selectedOrganization.isActive ?? true);
    }
  }, [selectedOrganization, editForm]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && 'success' in fetcher.data) {
      setIsCreateModalOpen(false);
      setIsEditModalOpen(false);
      setIsDeleteModalOpen(false);
      setSelectedOrganization(null);
      createForm.resetForm();
      editForm.resetForm();
    }
  }, [fetcher.state, fetcher.data, createForm, editForm]);

  const handleSort = (field: string) => {
    const currentSort = searchParams.get('sortBy');
    const currentOrder = searchParams.get('sortOrder');

    setSearchParams((prev: URLSearchParams) => {
      if (currentSort === field) {
        prev.set('sortOrder', currentOrder === 'asc' ? 'desc' : 'asc');
      } else {
        prev.set('sortBy', field);
        prev.set('sortOrder', 'asc');
      }
      return prev;
    });
  };

  const handleEdit = (organization: any) => {
    setSelectedOrganization(organization);
    setIsEditModalOpen(true);
  };

  const handleDelete = (organization: any) => {
    setSelectedOrganization(organization);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    if (selectedOrganization) {
      fetcher.submit(
        { intent: 'delete', id: selectedOrganization.id },
        { method: 'POST' }
      );
    }
  };

  const toggleActive = (organization: any) => {
    fetcher.submit(
      { intent: 'toggleActive', id: organization.id },
      { method: 'POST' }
    );
  };

  return (
    <main className="flex h-screen overflow-hidden">
      <div className="flex flex-1 flex-col">
        <div className="mb-4 flex items-center justify-between px-4 pt-4">
          <h1 className="text-2xl font-bold">Organizations</h1>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Add Organization
          </Button>
        </div>

        <div className="mb-4 px-4">
          <SearchInput placeholder="Search organizations..." />
        </div>

        <div className="flex-1 overflow-auto px-4">
          <TableComponent>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer"
                  onClick={() => handleSort('name')}
                >
                  Name
                  <ArrowUpDown className="ml-2 inline h-4 w-4" />
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((organization) => (
                <TableRow key={organization.id}>
                  <TableCell className="font-medium">
                    {organization.name}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={organization.isActive}
                      onCheckedChange={() => toggleActive(organization)}
                      className="data-[state=checked]:bg-green-600"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleEdit(organization)}
                        >
                          <PencilIcon className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(organization)}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableComponent>
        </div>

        <div className="mt-4 px-4 pb-4">
          <Pagination
            totalCount={totalCount}
            skip={(page - 1) * limit}
            take={limit}
            setSkip={(skip) => {
              setSearchParams((prev) => {
                prev.set('page', (skip / limit + 1).toString());
                return prev;
              });
            }}
            setTake={(take) => {
              setSearchParams((prev) => {
                prev.set('limit', take.toString());
                return prev;
              });
            }}
          />
        </div>

        {/* Create Modal */}
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Organization</DialogTitle>
              <DialogDescription>
                Add a new organization to the system.
              </DialogDescription>
            </DialogHeader>
            <fetcher.Form
              {...createForm.getFormProps()}
              method="post"
              className="space-y-4"
            >
              <input type="hidden" name="intent" value="create" />
              {createForm.renderFormIdInput()}

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  {...createForm.getInputProps('name')}
                  id="name"
                  aria-describedby="name-error"
                />
                {createForm.error('name') && (
                  <div id="name-error" className="text-sm text-red-500">
                    {createForm.error('name')}
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  {...createForm.getInputProps('isActive', {
                    type: 'button',
                  })}
                  id="isActive"
                  defaultChecked
                />
                <Label htmlFor="isActive">Active</Label>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Create Organization</Button>
              </DialogFooter>
            </fetcher.Form>
          </DialogContent>
        </Dialog>

        {/* Edit Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Organization</DialogTitle>
              <DialogDescription>
                Update the organization details.
              </DialogDescription>
            </DialogHeader>
            {selectedOrganization && (
              <fetcher.Form
                {...editForm.getFormProps()}
                method="post"
                className="space-y-4"
              >
                <input type="hidden" name="intent" value="update" />
                <input
                  type="hidden"
                  name="id"
                  value={selectedOrganization.id}
                />
                {editForm.renderFormIdInput()}

                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name *</Label>
                  <Input
                    {...editForm.getInputProps('name')}
                    id="edit-name"
                    aria-describedby="edit-name-error"
                  />
                  {editForm.error('name') && (
                    <div id="edit-name-error" className="text-sm text-red-500">
                      {editForm.error('name')}
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    {...editForm.getInputProps('isActive', {
                      type: 'button',
                    })}
                    id="edit-isActive"
                  />
                  <Label htmlFor="edit-isActive">Active</Label>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Update Organization</Button>
                </DialogFooter>
              </fetcher.Form>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Modal */}
        <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Organization</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {selectedOrganization?.name}?
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDeleteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Outlet />
    </main>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
