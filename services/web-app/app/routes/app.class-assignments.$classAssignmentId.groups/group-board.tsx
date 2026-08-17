import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { GripVertical, Plus, X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { MAX_COLLABORATION_GROUP_SIZE } from '~/domain/assignments/collaboration';

/**
 * The teacher's seating chart: drag a student from one group to another, or out
 * to the unassigned bucket.
 *
 * The bucket is a permanent drop target rather than something that appears when
 * it has people in it — a target that materializes only once you have somewhere
 * to put someone is a target you cannot aim at.
 *
 * State is local and optimistic so a drop lands instantly, and each drop posts
 * one move. The server is the authority: when it refuses (a full group, or
 * groups opened in another tab) the revalidated loader data replaces the
 * optimistic state and the reason is shown. That is why `groups`/`unassigned`
 * are mirrored into state on every change rather than copied once.
 */

export type BoardStudent = { membershipId: string; name: string };
export type BoardGroup = {
  id: string;
  label: string;
  members: BoardStudent[];
};

const UNASSIGNED = 'unassigned';

/**
 * Where the pointer is, falling back to nearest-corner.
 *
 * `closestCorners` alone gets this wrong: it measures the distance between the
 * dragged item's corners and each droppable's corners, so a full-width container
 * like the unassigned bucket loses to a small group card even when the pointer is
 * squarely inside the bucket. Dragging someone out of a group put them in a
 * different group instead — found by running it, not by reading it.
 *
 * The fallback is what keeps the keyboard sensor working, since it moves the
 * item without a pointer and `pointerWithin` returns nothing.
 */
const boardCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function StudentChip({
  student,
  containerId,
  disabled,
}: {
  student: BoardStudent;
  containerId: string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: student.membershipId,
    data: { containerId },
    disabled,
  });

  return (
    <li
      ref={setNodeRef}
      className={`flex items-center gap-2 rounded border bg-white px-2 py-1.5 text-sm dark:bg-card ${
        isDragging ? 'opacity-40' : ''
      } ${disabled ? '' : 'cursor-grab active:cursor-grabbing'}`}
      {...attributes}
      {...listeners}
      data-testid="group-board-student"
      data-student={student.membershipId}
      aria-label={`${student.name}. Press space to pick up, arrow keys to choose a group, space to drop.`}
    >
      {disabled ? null : (
        <GripVertical
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
      <span className="truncate">{student.name}</span>
    </li>
  );
}

function DropZone({
  id,
  children,
  className = '',
  full,
  testId,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  full?: boolean;
  testId?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: full });

  return (
    <div
      ref={setNodeRef}
      data-testid={testId}
      className={`${className} ${
        isOver
          ? full
            ? 'ring-2 ring-amber-400'
            : 'ring-2 ring-primary'
          : ''
      }`}
    >
      {children}
    </div>
  );
}

export function GroupBoard({
  groups: groupsFromServer,
  unassigned: unassignedFromServer,
  disabled,
}: {
  groups: BoardGroup[];
  unassigned: BoardStudent[];
  /** True once groups are opened: the arrangement is frozen from then on. */
  disabled: boolean;
}) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  const [groups, setGroups] = useState(groupsFromServer);
  const [unassigned, setUnassigned] = useState(unassignedFromServer);
  const [dragging, setDragging] = useState<BoardStudent | null>(null);
  const statusId = useId();

  // dnd-kit measures the DOM, so it cannot run during SSR. Rendering the plain
  // list first also means the arrangement is readable without JavaScript.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The server is the authority. Any loader revalidation — including the one
  // that follows a refused move — replaces the optimistic state.
  useEffect(() => setGroups(groupsFromServer), [groupsFromServer]);
  useEffect(() => setUnassigned(unassignedFromServer), [unassignedFromServer]);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  const studentsById = useMemo(() => {
    const map = new Map<string, BoardStudent>();
    for (const student of unassigned) map.set(student.membershipId, student);
    for (const group of groups) {
      for (const student of group.members) map.set(student.membershipId, student);
    }
    return map;
  }, [groups, unassigned]);

  // Kept in a ref so the announcement survives the revalidation that clears
  // fetcher.data, rather than flashing and vanishing.
  const lastAction = useRef<string>('');

  const error =
    fetcher.data && fetcher.data.success === false ? fetcher.data.message : '';

  function handleDragStart(event: DragStartEvent) {
    const student = studentsById.get(String(event.active.id));
    if (student) setDragging(student);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(null);
    const { active, over } = event;
    if (!over) return;

    const membershipId = String(active.id);
    const from = String(active.data.current?.containerId ?? UNASSIGNED);
    // Dropping on a chip means "into the group that chip is in".
    const overId = String(over.id);
    const to =
      overId === UNASSIGNED || groups.some((group) => group.id === overId)
        ? overId
        : String(over.data.current?.containerId ?? UNASSIGNED);

    if (from === to) return;

    const student = studentsById.get(membershipId);
    if (!student) return;

    const targetGroup = groups.find((group) => group.id === to);
    if (targetGroup && targetGroup.members.length >= MAX_COLLABORATION_GROUP_SIZE) {
      // Refused locally as well as on the server, so the chip does not visibly
      // land in a group it is about to be bounced out of.
      lastAction.current = `${targetGroup.label} is full.`;
      return;
    }

    // Optimistic: take them out of wherever they were, put them where they went.
    setUnassigned((prev) =>
      prev.filter((entry) => entry.membershipId !== membershipId)
    );
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        members: group.members.filter(
          (entry) => entry.membershipId !== membershipId
        ),
      }))
    );
    if (to === UNASSIGNED) {
      setUnassigned((prev) => [...prev, student]);
      lastAction.current = `Moved ${student.name} out of their group.`;
    } else {
      setGroups((prev) =>
        prev.map((group) =>
          group.id === to
            ? { ...group, members: [...group.members, student] }
            : group
        )
      );
      lastAction.current = `Moved ${student.name} to ${targetGroup?.label ?? 'a group'}.`;
    }

    fetcher.submit(
      {
        intent: 'move-student',
        membershipId,
        targetGroupId: to === UNASSIGNED ? '' : to,
      },
      { method: 'post' }
    );
  }

  const board = (
    <>
      <DropZone
        id={UNASSIGNED}
        className="mb-6 rounded border border-dashed p-4"
        testId="group-board-unassigned"
      >
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">
            Not in a group ({unassigned.length})
          </h2>
          {mounted && !disabled ? (
            <span className="text-xs text-muted-foreground">
              Drag anyone here to take them out of a group
            </span>
          ) : null}
        </div>
        {unassigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everyone is in a group.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {unassigned.map((student) => (
              <StudentChip
                key={student.membershipId}
                student={student}
                containerId={UNASSIGNED}
                disabled={disabled || !mounted}
              />
            ))}
          </ul>
        )}
      </DropZone>

      <ul className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => {
          const full = group.members.length >= MAX_COLLABORATION_GROUP_SIZE;
          return (
            <li key={group.id}>
              <DropZone
                id={group.id}
                full={full}
                className="h-full rounded border p-3"
                testId="group-board-group"
              >
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold">{group.label}</h2>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {group.members.length}
                    {group.members.length === 0 && !disabled ? (
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="remove-group" />
                        <input type="hidden" name="groupId" value={group.id} />
                        <button
                          type="submit"
                          className="rounded p-0.5 hover:bg-muted"
                          aria-label={`Remove ${group.label}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </fetcher.Form>
                    ) : null}
                  </span>
                </div>
                {group.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Empty — drag someone in.
                  </p>
                ) : (
                  <ul className="grid gap-1.5">
                    {group.members.map((student) => (
                      <StudentChip
                        key={student.membershipId}
                        student={student}
                        containerId={group.id}
                        disabled={disabled || !mounted}
                      />
                    ))}
                  </ul>
                )}
              </DropZone>
            </li>
          );
        })}
      </ul>
    </>
  );

  return (
    <div>
      {error ? (
        <p
          className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {/* Announces each move for screen readers, which cannot see a chip land. */}
      <p id={statusId} className="sr-only" role="status" aria-live="polite">
        {lastAction.current}
      </p>

      {mounted && !disabled ? (
        <DndContext
          sensors={sensors}
          collisionDetection={boardCollisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          {board}
          <DragOverlay>
            {dragging ? (
              <div className="flex items-center gap-2 rounded border bg-white px-2 py-1.5 text-sm shadow-lg dark:bg-card">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium">
                  {initials(dragging.name)}
                </span>
                {dragging.name}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        board
      )}

      {disabled ? null : (
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="add-group" />
          <Button type="submit" variant="outline" size="sm">
            <Plus className="mr-1 h-4 w-4" /> Add a group
          </Button>
        </fetcher.Form>
      )}
    </div>
  );
}
