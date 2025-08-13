import * as React from 'react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import { Plus } from 'lucide-react';
import { useFetcher } from 'react-router';
import { useForm } from '@rvf/react-router';
import z from 'zod';

export type School = {
  id: string;
  name: string;
  code: string;
  _count: { classes: number; teachers: number };
};

type SchoolEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSchool: School | null;
  setEditingSchool: (school: School | null) => void;
};

function SchoolEditor({
  open,
  onOpenChange,
  editingSchool,
  setEditingSchool,
}: SchoolEditorProps) {
  const fetcher = useFetcher();
  const form = useForm({
    schema: z.object({ name: z.string().min(1), code: z.string().min(1) }),
    method: 'POST',
    defaultValues: { name: '', code: '' },
    onSubmitSuccess: () => {
      onOpenChange(false);
      form.resetForm();
    },
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setEditingSchool(null);
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {editingSchool ? 'Edit School' : 'Create School'}
          </SheetTitle>
        </SheetHeader>
        <fetcher.Form
          method="post"
          className="mt-4 space-y-4"
          {...form.getFormProps()}
        >
          <input
            type="hidden"
            name="intent"
            value={editingSchool ? 'update-school' : 'create-school'}
          />
          {editingSchool ? (
            <input type="hidden" name="schoolId" value={editingSchool.id} />
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={editingSchool?.name ?? ''}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              name="code"
              defaultValue={editingSchool?.code ?? ''}
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={fetcher.state !== 'idle'}
          >
            {fetcher.state !== 'idle'
              ? 'Saving...'
              : editingSchool
                ? 'Save Changes'
                : 'Create School'}
          </Button>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  );
}

export type SchoolsCardProps = {
  schools: School[];
};

export function SchoolsCard({ schools }: SchoolsCardProps) {
  const fetcher = useFetcher();
  const [open, setOpen] = React.useState(false);
  const [editingSchool, setEditingSchool] = React.useState<School | null>(null);

  return (
    <Card className="bg-muted flex-1">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Schools ({schools.length})</CardTitle>
        <Sheet
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditingSchool(null);
          }}
        >
          <SheetTrigger asChild>
            <Button
              onClick={() => {
                setEditingSchool(null);
                setOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create School
            </Button>
          </SheetTrigger>
          <SchoolEditor
            open={open}
            onOpenChange={setOpen}
            editingSchool={editingSchool}
            setEditingSchool={setEditingSchool}
          />
        </Sheet>
      </CardHeader>
      <CardContent>
        <div className="flex-1 overflow-y-auto">
          {schools.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted">
              <span className="text-lg font-bold">No schools found</span>
              <span className="text-sm text-muted-foreground">
                Create your first school to get started
              </span>
            </div>
          ) : (
            <Table className="rounded-lg">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Classes</TableHead>
                  <TableHead>Teachers</TableHead>
                  <TableHead className="pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schools.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>{s.code}</TableCell>
                    <TableCell>{s._count.classes}</TableCell>
                    <TableCell>{s._count.teachers}</TableCell>
                    <TableCell className="pr-4 space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingSchool(s);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <fetcher.Form method="post" className="inline">
                        <input
                          type="hidden"
                          name="intent"
                          value="delete-school"
                        />
                        <input type="hidden" name="schoolId" value={s.id} />
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={fetcher.state !== 'idle'}
                          onClick={(e) => {
                            if (!confirm('Delete this school?')) {
                              e.preventDefault();
                              return;
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </fetcher.Form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
