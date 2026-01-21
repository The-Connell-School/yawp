import {
  data as dataResponse,
  useLoaderData,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useSearchParams,
  useNavigate,
} from 'react-router';
import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { Checkbox } from '~/components/ui/checkbox';
import { requireProfile, requireOwner } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { useState, useEffect } from 'react';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Plus, Pencil, Trash2, FileText, Download } from 'lucide-react';
import { SearchInput } from '~/components/search-input';
import { useTable } from '~/hooks/useTable';
import { cn } from '~/utils/misc';
import { Badge } from '~/components/ui/badge';
import type { RubricType, GradeLevel, FeedbackTone } from '@app/prisma';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const url = new URL(request.url);
  const q = url.searchParams.get('q');

  const where = {
    organizationId: profile.organization.id,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { description: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  } as const;

  const rubrics = await prisma.rubric.findMany({
    where,
    include: {
      _count: {
        select: {
          classes: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return dataResponse({ rubrics, q });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'create-rubric') {
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const rubricType = formData.get('rubricType') as RubricType;
    const gradeLevel = formData.get('gradeLevel') as GradeLevel;
    const feedbackTone = formData.get('feedbackTone') as FeedbackTone;
    const pdfFile = formData.get('pdfFile') as File | null;

    if (!name || !rubricType || !gradeLevel || !feedbackTone) {
      return dataResponse(
        { error: 'Name, rubric type, grade level, and feedback tone are required' },
        { status: 400 }
      );
    }

    // Validate PDF upload for school_upload and custom_pdf types
    if ((rubricType === 'school_upload' || rubricType === 'custom_pdf') && !pdfFile) {
      return dataResponse(
        { error: 'PDF file is required for this rubric type' },
        { status: 400 }
      );
    }

    let pdfBlob: Buffer | null = null;
    let pdfFileName: string | null = null;
    let pdfContentType: string | null = null;

    if (pdfFile && pdfFile.size > 0) {
      const arrayBuffer = await pdfFile.arrayBuffer();
      pdfBlob = Buffer.from(arrayBuffer);
      pdfFileName = pdfFile.name;
      pdfContentType = pdfFile.type;
    }

    try {
      await prisma.rubric.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          rubricType,
          gradeLevel,
          feedbackTone,
          pdfBlob,
          pdfFileName,
          pdfContentType,
          organizationId: profile.organization.id,
        },
      });

      return dataResponse({ success: true });
    } catch (error: any) {
      return dataResponse(
        { error: 'Failed to create rubric' },
        { status: 500 }
      );
    }
  }

  if (intent === 'edit-rubric') {
    const rubricId = formData.get('rubricId') as string;
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const rubricType = formData.get('rubricType') as RubricType;
    const gradeLevel = formData.get('gradeLevel') as GradeLevel;
    const feedbackTone = formData.get('feedbackTone') as FeedbackTone;
    const pdfFile = formData.get('pdfFile') as File | null;

    if (!rubricId || !name || !rubricType || !gradeLevel || !feedbackTone) {
      return dataResponse(
        { error: 'All required fields must be provided' },
        { status: 400 }
      );
    }

    const rubric = await prisma.rubric.findFirst({
      where: { id: rubricId, organizationId: profile.organization.id },
    });

    if (!rubric) {
      return dataResponse({ error: 'Rubric not found' }, { status: 404 });
    }

    let pdfBlob: Buffer | null | undefined = undefined;
    let pdfFileName: string | null | undefined = undefined;
    let pdfContentType: string | null | undefined = undefined;

    // Only update PDF if a new file is provided
    if (pdfFile && pdfFile.size > 0) {
      const arrayBuffer = await pdfFile.arrayBuffer();
      pdfBlob = Buffer.from(arrayBuffer);
      pdfFileName = pdfFile.name;
      pdfContentType = pdfFile.type;
    }

    try {
      await prisma.rubric.update({
        where: { id: rubricId },
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          rubricType,
          gradeLevel,
          feedbackTone,
          ...(pdfBlob !== undefined && { pdfBlob }),
          ...(pdfFileName !== undefined && { pdfFileName }),
          ...(pdfContentType !== undefined && { pdfContentType }),
        },
      });

      return dataResponse({ success: true });
    } catch (error: any) {
      return dataResponse(
        { error: 'Failed to update rubric' },
        { status: 500 }
      );
    }
  }

  if (intent === 'delete-rubrics') {
    const rubricIds = formData.getAll('rubricIds') as string[];

    if (!rubricIds.length) {
      return dataResponse({ error: 'No rubrics selected' }, { status: 400 });
    }

    await prisma.rubric.deleteMany({
      where: {
        id: { in: rubricIds },
        organizationId: profile.organization.id,
      },
    });

    return dataResponse({ success: true });
  }

  return dataResponse({ error: 'Invalid intent' }, { status: 400 });
}

export default function Route() {
  const { rubrics, q } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingRubric, setEditingRubric] = useState<(typeof rubrics)[0] | null>(null);

  const table = useTable({
    data: rubrics,
    getRowId: (row) => row.id,
  });

  // Open sheet when URL param is present
  useEffect(() => {
    const openSheet = searchParams.get('open');
    const editId = searchParams.get('edit');

    if (openSheet === 'new') {
      setEditingRubric(null);
      setIsSheetOpen(true);
    } else if (editId) {
      const rubric = rubrics.find((r) => r.id === editId);
      if (rubric) {
        setEditingRubric(rubric);
        setIsSheetOpen(true);
      }
    }
  }, [searchParams, rubrics]);

  const handleCloseSheet = () => {
    setIsSheetOpen(false);
    setEditingRubric(null);
    searchParams.delete('open');
    searchParams.delete('edit');
    setSearchParams(searchParams);
  };

  const handleEdit = (rubric: (typeof rubrics)[0]) => {
    setEditingRubric(rubric);
    searchParams.set('edit', rubric.id);
    setSearchParams(searchParams);
  };

  const handleCreate = () => {
    setEditingRubric(null);
    searchParams.set('open', 'new');
    setSearchParams(searchParams);
  };

  const deleteFetcher = useFetcher();

  const handleDelete = () => {
    if (
      !confirm(
        `Are you sure you want to delete ${table.selected.length} rubric${
          table.selected.length === 1 ? '' : 's'
        }?`
      )
    ) {
      return;
    }

    const formData = new FormData();
    formData.append('intent', 'delete-rubrics');
    table.selected.forEach((id) => formData.append('rubricIds', id));

    deleteFetcher.submit(formData, { method: 'POST' });
  };

  // Clear selection after delete
  useEffect(() => {
    if (deleteFetcher.state === 'idle' && deleteFetcher.data?.success) {
      table.clearSelection();
    }
  }, [deleteFetcher.state, deleteFetcher.data, table]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 md:p-6 border-b flex flex-col md:flex-row gap-3 justify-between items-start md:items-center">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold">Rubrics</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage grading rubrics for your organization
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <SearchInput
            defaultValue={q || ''}
            placeholder="Search rubrics..."
            className="flex-1 md:w-64"
          />
          <Button onClick={handleCreate}>
            <Plus size={16} className="mr-1" />
            New Rubric
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {table.selected.length > 0 && (
          <div className="mb-4 flex items-center justify-between bg-muted p-3 rounded-md">
            <span className="text-sm font-medium">
              {table.selected.length} rubric{table.selected.length === 1 ? '' : 's'} selected
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteFetcher.state !== 'idle'}
            >
              <Trash2 size={14} className="mr-1" />
              Delete
            </Button>
          </div>
        )}

        {rubrics.length === 0 ? (
          <div className="text-center py-12">
            <FileText size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No rubrics yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first rubric to get started with grading customization
            </p>
            <Button onClick={handleCreate}>
              <Plus size={16} className="mr-1" />
              Create Rubric
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={table.allSelected}
                      onCheckedChange={table.toggleAll}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Grade Level</TableHead>
                  <TableHead>Feedback Tone</TableHead>
                  <TableHead>Classes Using</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rubrics.map((rubric) => (
                  <TableRow key={rubric.id}>
                    <TableCell>
                      <Checkbox
                        checked={table.isSelected(rubric.id)}
                        onCheckedChange={() => table.toggleRow(rubric.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{rubric.name}</div>
                        {rubric.description && (
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {rubric.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {rubric.rubricType === 'default_yop' && 'Default YOP'}
                        {rubric.rubricType === 'school_upload' && 'School Upload'}
                        {rubric.rubricType === 'custom_pdf' && 'Custom PDF'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {rubric.gradeLevel === 'regular' && 'Regular'}
                        {rubric.gradeLevel === 'honors' && 'Honors'}
                        {rubric.gradeLevel === 'ap' && 'AP'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          rubric.feedbackTone === 'brutal'
                            ? 'destructive'
                            : rubric.feedbackTone === 'moderate'
                            ? 'default'
                            : 'outline'
                        }
                      >
                        {rubric.feedbackTone === 'gentle' && 'Gentle'}
                        {rubric.feedbackTone === 'moderate' && 'Moderate'}
                        {rubric.feedbackTone === 'brutal' && 'Brutal'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {rubric._count.classes} {rubric._count.classes === 1 ? 'class' : 'classes'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {rubric.pdfFileName && (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <a href={`/api/rubric/${rubric.id}`} download>
                              <Download size={14} />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(rubric)}
                        >
                          <Pencil size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <RubricSheet
        open={isSheetOpen}
        onClose={handleCloseSheet}
        rubric={editingRubric}
      />
    </div>
  );
}

interface RubricSheetProps {
  open: boolean;
  onClose: () => void;
  rubric: any | null;
}

function RubricSheet({ open, onClose, rubric }: RubricSheetProps) {
  const fetcher = useFetcher();
  const [rubricType, setRubricType] = useState<RubricType>(rubric?.rubricType || 'default_yop');

  useEffect(() => {
    if (rubric) {
      setRubricType(rubric.rubricType);
    } else {
      setRubricType('default_yop');
    }
  }, [rubric]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      onClose();
    }
  }, [fetcher.state, fetcher.data, onClose]);

  const isSubmitting = fetcher.state !== 'idle';
  const requiresPdf = rubricType === 'school_upload' || rubricType === 'custom_pdf';

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{rubric ? 'Edit Rubric' : 'Create Rubric'}</SheetTitle>
          <SheetDescription>
            {rubric
              ? 'Update the rubric details below'
              : 'Create a new grading rubric for your organization'}
          </SheetDescription>
        </SheetHeader>

        <fetcher.Form method="POST" className="space-y-4 mt-6" encType="multipart/form-data">
          <input
            type="hidden"
            name="intent"
            value={rubric ? 'edit-rubric' : 'create-rubric'}
          />
          {rubric && <input type="hidden" name="rubricId" value={rubric.id} />}

          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              name="name"
              defaultValue={rubric?.name || ''}
              placeholder="e.g., AP English Literature Rubric"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={rubric?.description || ''}
              placeholder="Optional description of this rubric"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rubricType">Rubric Type *</Label>
            <Select
              name="rubricType"
              defaultValue={rubric?.rubricType || 'default_yop'}
              onValueChange={(value) => setRubricType(value as RubricType)}
              required
            >
              <SelectTrigger id="rubricType">
                <SelectValue placeholder="Select rubric type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default_yop">Default YOP</SelectItem>
                <SelectItem value="school_upload">School Upload</SelectItem>
                <SelectItem value="custom_pdf">Custom PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gradeLevel">Grade Level *</Label>
            <Select
              name="gradeLevel"
              defaultValue={rubric?.gradeLevel || 'regular'}
              required
            >
              <SelectTrigger id="gradeLevel">
                <SelectValue placeholder="Select grade level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="regular">Regular</SelectItem>
                <SelectItem value="honors">Honors</SelectItem>
                <SelectItem value="ap">AP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedbackTone">Feedback Tone *</Label>
            <Select
              name="feedbackTone"
              defaultValue={rubric?.feedbackTone || 'moderate'}
              required
            >
              <SelectTrigger id="feedbackTone">
                <SelectValue placeholder="Select feedback tone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gentle">Gentle</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="brutal">Brutal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {requiresPdf && (
            <div className="space-y-2">
              <Label htmlFor="pdfFile">
                PDF File {!rubric && '*'}
                {rubric && rubric.pdfFileName && (
                  <span className="text-sm text-muted-foreground ml-2">
                    Current: {rubric.pdfFileName}
                  </span>
                )}
              </Label>
              <Input
                id="pdfFile"
                name="pdfFile"
                type="file"
                accept=".pdf"
                required={!rubric && requiresPdf}
              />
              <p className="text-sm text-muted-foreground">
                Upload a PDF rubric document for grading reference
              </p>
            </div>
          )}

          {fetcher.data?.error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {fetcher.data.error}
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? 'Saving...' : rubric ? 'Update Rubric' : 'Create Rubric'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  );
}
