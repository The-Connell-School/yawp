import React from 'react';
import { Link, useFetcher } from 'react-router';
import { GripVertical, Plus } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
import { Textarea } from '~/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';

export type AssignmentTypeModuleRow = {
  id: string;
  title: string;
  isSelfGuided: boolean;
  instructions: { id: string }[];
};

function StaticModuleRow({
  assignmentTypeId,
  module,
}: {
  assignmentTypeId: string;
  module: AssignmentTypeModuleRow;
}) {
  return (
    <TableRow>
      <TableCell>
        <GripVertical className="h-4 w-4 text-muted-foreground opacity-40" />
      </TableCell>
      <TableCell className="font-medium">{module.title}</TableCell>
      <TableCell>
        {module.isSelfGuided ? 'Self-guided' : 'Tutor-guided'}
      </TableCell>
      <TableCell>{module.instructions.length}</TableCell>
      <TableCell>
        <Button variant="outline" size="sm" asChild>
          <Link
            to={`/app/admin/assignment-types/${assignmentTypeId}/modules/${module.id}`}
          >
            View
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

function SortableModuleRow({
  assignmentTypeId,
  module,
}: {
  assignmentTypeId: string;
  module: AssignmentTypeModuleRow;
}) {
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
          <Link
            to={`/app/admin/assignment-types/${assignmentTypeId}/modules/${module.id}`}
          >
            View
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function AssignmentTypeModulesSection({
  assignmentTypeId,
  modules: initialModules,
}: {
  assignmentTypeId: string;
  modules: AssignmentTypeModuleRow[];
}) {
  const fetcher = useFetcher();
  const [isModuleSheetOpen, setIsModuleSheetOpen] = React.useState(false);
  const [isSelfGuided, setIsSelfGuided] = React.useState(false);
  const [isMounted, setIsMounted] = React.useState(false);
  const [modules, setModules] = React.useState(initialModules);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  React.useEffect(() => {
    setModules(initialModules);
  }, [initialModules]);

  React.useEffect(() => {
    if (fetcher.data?.status === 'success' && fetcher.state === 'idle') {
      setIsModuleSheetOpen(false);
      setIsSelfGuided(false);
    }
  }, [fetcher.data, fetcher.state]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setModules((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      const newModules = arrayMove(items, oldIndex, newIndex);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Configure module instructions and rubric relationships for tutor guidance.
        </p>
        <Sheet open={isModuleSheetOpen} onOpenChange={setIsModuleSheetOpen}>
          <SheetTrigger asChild>
            <Button type="button" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add module
            </Button>
          </SheetTrigger>
          <SheetContent aria-describedby={undefined}>
            <SheetHeader>
              <SheetTitle>Create module</SheetTitle>
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
                <input
                  type="hidden"
                  name="isSelfGuided"
                  value={isSelfGuided ? 'on' : ''}
                />
                <Switch
                  id="isSelfGuided"
                  checked={isSelfGuided}
                  onCheckedChange={setIsSelfGuided}
                />
                <Label htmlFor="isSelfGuided">Self-guided module</Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tutorInstructions">Tutor instructions</Label>
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
                {fetcher.state !== 'idle' ? 'Creating...' : 'Create module'}
              </Button>
            </fetcher.Form>
          </SheetContent>
        </Sheet>
      </div>

      {modules.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          No modules yet. Add a module to configure tutor guidance.
        </p>
      ) : isMounted ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
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
                  <SortableModuleRow
                    key={module.id}
                    assignmentTypeId={assignmentTypeId}
                    module={module}
                  />
                ))}
              </TableBody>
            </SortableContext>
          </Table>
        </DndContext>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Instructions</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modules.map((module) => (
              <StaticModuleRow
                key={module.id}
                assignmentTypeId={assignmentTypeId}
                module={module}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
