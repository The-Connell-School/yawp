/**
 * The library home (Oct 24 handoff, Part 2, L1): one course at a time, its
 * units as tiles in the order they are taught, in groups or on their own,
 * and the lessons not in any unit below. Lessons go in units, units go in
 * groups. Every move shows Undo.
 */
import { useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  BookOpen,
  Feather,
  FileText,
  GripVertical,
  Languages,
  MoreHorizontal,
  PenLine,
  Plus,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { LessonRename } from '~/components/lesson-planner/lesson-rename';
import { UndoBar, useLibraryAction } from '~/components/lesson-planner/library-actions';
import { PlanLessonDialog, type PlanUnit } from '~/components/lesson-planner/plan-lesson-dialog';
import { UNIT_KIND_LABELS, UNIT_KINDS, type UnitKind } from '~/domain/lesson-planner/library-v2';
import type { LibraryBlock, LibraryHome as LibraryHomeData, LooseLesson, UnitTile } from '~/domain/lesson-planner/load-library-v2.server';
import { cn } from '~/utils/misc';

export const KIND_ICONS: Record<UnitKind, LucideIcon> = {
  book: BookOpen,
  texts: FileText,
  poetry: Feather,
  writing: PenLine,
  language: Languages,
  skills: Target,
};

const UNIT_DRAG = 'application/x-yawp-units';
const LESSON_DRAG = 'application/x-yawp-lesson';

// Near-white on the cream page, so a tile stands out (Brian's round 4, item 8;
// the library mockup's values). `bg-popover` is hsl(48 100% 99%), with a dark value.
export const TILE =
  'relative rounded-[10px] border border-border bg-popover shadow-[0_1px_2px_rgba(28,26,23,.06),0_4px_12px_-4px_rgba(28,26,23,.10)] transition-[transform,box-shadow,border-color] duration-[160ms] ease-out hover:-translate-y-0.5 hover:border-[hsl(51_8%_68%)] hover:shadow-[0_2px_4px_rgba(28,26,23,.06),0_14px_28px_-8px_rgba(28,26,23,.20)] focus-within:-translate-y-0.5 focus-within:border-[hsl(51_8%_68%)] focus-within:shadow-[0_2px_4px_rgba(28,26,23,.06),0_14px_28px_-8px_rgba(28,26,23,.20)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:focus-within:translate-y-0';
const GRID = 'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]';

export function unitHref(unitId: string) {
  return `/app/lesson-planner/library/unit/${unitId}`;
}

export function WritingMeter({ percent }: { percent: number }) {
  return (
    <div className="mt-3">
      <div className="h-1 overflow-hidden rounded-full bg-[#EDE6F5]">
        <div className="h-full rounded-full bg-[#7B4FB0]" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <p className="mt-1 text-xs font-semibold text-[#7B4FB0]">{percent}% writing</p>
    </div>
  );
}

export function KindLabel({ kind, label }: { kind: UnitKind; label: string }) {
  const Icon = KIND_ICONS[kind];
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#F1EBE2] text-[#5B5248]">
        <Icon size={16} strokeWidth={1.75} />
      </span>
      {label}
    </span>
  );
}

function hasDrag(event: DragEvent, type: string) {
  return event.dataTransfer.types.includes(type);
}

export function LibraryHome({ data }: { data: LibraryHomeData }) {
  const [courseId, setCourseId] = useState(data.courses[0]?.id ?? '');
  const course = data.courses.find((candidate) => candidate.id === courseId) ?? data.courses[0];
  const [kind, setKind] = useState<UnitKind | 'all'>('all');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [naming, setNaming] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [newUnit, setNewUnit] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [dragging, setDragging] = useState<{ units: string[]; fromGroup: boolean } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const actions = useLibraryAction();

  if (!course) return null;
  const units = course.blocks.flatMap((block) => (block.kind === 'group' ? block.units : [block.unit]));
  const kinds = UNIT_KINDS.filter((candidate) => units.some((unit) => unit.kind === candidate));
  const shown = (unit: UnitTile) => kind === 'all' || unit.kind === kind;

  function chooseCourse(id: string) {
    setCourseId(id);
    setKind('all');
    setSelected([]);
    setSelecting(false);
    setNaming(false);
  }

  function toggle(unitId: string) {
    setSelecting(true);
    setSelected((now) => (now.includes(unitId) ? now.filter((id) => id !== unitId) : [...now, unitId]));
  }

  function finishSelecting() {
    setSelecting(false);
    setSelected([]);
    setNaming(false);
    setGroupName('');
  }

  function startDrag(event: DragEvent, unit: UnitTile) {
    const ids = selected.includes(unit.id) ? selected : [unit.id];
    event.dataTransfer.setData(UNIT_DRAG, ids.join(','));
    event.dataTransfer.effectAllowed = 'move';
    setDragging({ units: ids, fromGroup: ids.some((id) => units.find((candidate) => candidate.id === id)?.groupId) });
  }

  function dropUnits(event: DragEvent, groupId: string | null) {
    const ids = event.dataTransfer.getData(UNIT_DRAG);
    setDropOn(null);
    setDragging(null);
    if (!ids) return;
    event.preventDefault();
    actions.run({ intent: 'move-units', unitIds: ids, groupId: groupId ?? '' });
    finishSelecting();
  }

  const planUnits: PlanUnit[] = data.courses.flatMap((candidate) =>
    candidate.blocks
      .flatMap((block) => (block.kind === 'group' ? block.units : [block.unit]))
      .map((unit) => ({ id: unit.id, title: unit.title, course: candidate.name, dayCount: unit.dayCount, lastTitle: unit.lastTitle }))
  );

  const tileProps = {
    groups: course.groups,
    selecting,
    selected,
    onToggle: toggle,
    onGroupWith: (unitId: string) => {
      setSelecting(true);
      setSelected([unitId]);
    },
    onDragStart: startDrag,
    onDragEnd: () => {
      setDragging(null);
      setDropOn(null);
    },
    run: actions.run,
  };

  // Units on their own, side by side, until the next group.
  const runs: Array<{ key: string; group: Extract<LibraryBlock, { kind: 'group' }> | null; units: UnitTile[] }> = [];
  for (const block of course.blocks) {
    if (block.kind === 'group') runs.push({ key: block.id, group: block, units: block.units });
    else if (runs.at(-1) && !runs.at(-1)!.group) runs.at(-1)!.units.push(block.unit);
    else runs.push({ key: `own-${block.unit.id}`, group: null, units: [block.unit] });
  }

  return (
    <div data-testid="library-v2" className="mx-auto max-w-6xl px-4 pb-40 pt-8 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your library</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every unit you teach, in order. Open one to see its days.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" data-testid="new-unit" onClick={() => setNewUnit(true)}>
            <Plus size={16} /> New unit
          </Button>
          <Button data-testid="plan-a-lesson" onClick={() => setPlanning(true)}>
            Plan a lesson
          </Button>
        </div>
      </header>

      <Tabs value={course.id} onValueChange={chooseCourse} className="mt-6">
        <TabsList data-testid="course-tabs" className="max-w-full justify-start overflow-x-auto">
          {data.courses.map((candidate) => (
            <TabsTrigger key={candidate.id} value={candidate.id} data-testid="course-tab">
              {candidate.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="kind-filter">
        {(['all', ...kinds] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={kind === candidate}
            data-testid={`kind-${candidate}`}
            onClick={() => setKind(candidate)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm font-medium transition',
              kind === candidate ? 'border-foreground bg-foreground text-background' : 'border-[#E4DCCF] hover:bg-foreground/5'
            )}
          >
            {candidate === 'all' ? 'All kinds' : UNIT_KIND_LABELS[candidate]}
          </button>
        ))}
        <span className="flex-1" />
        <Button
          variant={selecting ? 'secondary' : 'ghost'}
          size="sm"
          data-testid="select-units"
          aria-pressed={selecting}
          onClick={() => (selecting ? finishSelecting() : setSelecting(true))}
        >
          Select units
        </Button>
      </div>

      <section aria-label={`${course.name} units`} className="mt-6 space-y-8">
        {newUnit ? (
          <NewUnitCard
            groups={course.groups}
            onCancel={() => setNewUnit(false)}
            onCreate={(fields) => {
              actions.run({ intent: 'create-unit', courseId: course.id, ...fields });
              setNewUnit(false);
            }}
          />
        ) : null}

        {runs.map((run) => {
          if (!run.group) {
            const visible = run.units.filter(shown);
            return visible.length ? (
              <div key={run.key} className={GRID}>
                {visible.map((unit) => (
                  <UnitCard key={unit.id} unit={unit} {...tileProps} />
                ))}
              </div>
            ) : null;
          }
          const group = run.group;
          const visible = group.units.filter(shown);
          if (kind !== 'all' && !visible.length) return null;
          return (
            <GroupSection
              key={group.id}
              group={group}
              hovered={dropOn === group.id}
              onDragOver={(event) => {
                if (!hasDrag(event, UNIT_DRAG)) return;
                event.preventDefault();
                setDropOn(group.id);
              }}
              onDragLeave={() => setDropOn((now) => (now === group.id ? null : now))}
              onDrop={(event) => dropUnits(event, group.id)}
              run={actions.run}
              first={runs[0]?.key === group.id}
              last={runs.at(-1)?.key === group.id}
            >
              {visible.length ? (
                <div className={GRID}>
                  {visible.map((unit) => (
                    <UnitCard key={unit.id} unit={unit} {...tileProps} />
                  ))}
                </div>
              ) : (
                <p data-testid="group-empty" className="rounded-xl border-2 border-dashed border-[#E4DCCF] p-6 text-center text-sm text-muted-foreground">
                  Drag units here, or use a unit’s ⋯ menu › Move to group
                </p>
              )}
            </GroupSection>
          );
        })}

        {!units.length && !newUnit ? (
          <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No units in {course.name} yet. Make one with New unit, or plan a lesson.
          </p>
        ) : null}

        {dragging?.fromGroup ? (
          <div
            data-testid="drop-out-of-group"
            onDragOver={(event) => {
              if (!hasDrag(event, UNIT_DRAG)) return;
              event.preventDefault();
              setDropOn('out');
            }}
            onDragLeave={() => setDropOn((now) => (now === 'out' ? null : now))}
            onDrop={(event) => dropUnits(event, null)}
            className={cn(
              'rounded-xl border-2 border-dashed p-5 text-center text-sm font-medium text-muted-foreground',
              dropOn === 'out' ? 'border-[#D9714F] bg-[#D9714F]/5' : 'border-[#E4DCCF]'
            )}
          >
            Drop here to take it out of its group
          </div>
        ) : null}

        <Button variant="outline" data-testid="add-group" onClick={() => actions.run({ intent: 'create-group', courseId: course.id })}>
          <Plus size={16} /> Add a group
        </Button>
      </section>

      <section aria-labelledby="loose-heading" className="mt-12">
        <h2 id="loose-heading" className="text-lg font-semibold">
          Lessons on their own
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Lessons and drafts not in a unit. Drag one onto a unit, or use Move to a unit…</p>
        {data.loose.length ? (
          <ul className="mt-4 space-y-3">
            {data.loose.map((lesson) => (
              <LooseLessonCard key={lesson.id} lesson={lesson} unitOptions={data.unitOptions} run={actions.run} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Every lesson is in a unit.</p>
        )}
      </section>

      {selecting ? (
        <div
          data-testid="select-bar"
          className="fixed bottom-6 left-1/2 z-40 flex max-w-[calc(100vw-32px)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl bg-[#1C1A17] px-4 py-3 text-sm text-white shadow-xl"
        >
          <span data-testid="select-count" className="font-semibold">
            {selected.length} unit{selected.length === 1 ? '' : 's'} selected
          </span>
          {naming ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                actions.run({ intent: 'group-units', unitIds: selected.join(','), title: groupName });
                finishSelecting();
              }}
            >
              <Input
                autoFocus
                aria-label="Group name"
                data-testid="group-name"
                placeholder="Group name"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                className="h-8 w-48 bg-white text-foreground"
              />
              <Button type="submit" size="sm" data-testid="group-create" disabled={!groupName.trim()}>
                Group
              </Button>
            </form>
          ) : (
            <Button size="sm" variant="secondary" data-testid="group-these" disabled={!selected.length} onClick={() => setNaming(true)}>
              Group these
            </Button>
          )}
          <select
            aria-label="Move to group"
            data-testid="select-move-to-group"
            disabled={!selected.length}
            value=""
            onChange={(event) => {
              actions.run({ intent: 'move-units', unitIds: selected.join(','), groupId: event.target.value === 'none' ? '' : event.target.value });
              finishSelecting();
            }}
            className="rounded-md bg-white/10 px-2 py-1.5 text-sm text-white"
          >
            <option value="" disabled>
              Move to group
            </option>
            {course.groups.map((group) => (
              <option key={group.id} value={group.id} className="text-foreground">
                {group.title}
              </option>
            ))}
            <option value="none" className="text-foreground">
              Not in a group
            </option>
          </select>
          <Button size="sm" variant="ghost" data-testid="select-done" onClick={finishSelecting} className="text-white hover:bg-white/10 hover:text-white">
            Done
          </Button>
        </div>
      ) : null}

      <UndoBar status={actions.status} onUndo={actions.undo} onDismiss={actions.dismiss} raised={selecting} />

      <PlanLessonDialog
        open={planning}
        onOpenChange={setPlanning}
        units={planUnits}
        busy={actions.busy}
        onStart={({ unitId, newUnitTitle }) =>
          actions.run(
            { intent: 'plan-lesson', unitId: unitId ?? '', ...(newUnitTitle ? { courseId: course.id, title: newUnitTitle } : {}) },
            { open: true }
          )
        }
      />
    </div>
  );
}

type Run = ReturnType<typeof useLibraryAction>['run'];

function NewUnitCard({
  groups,
  onCreate,
  onCancel,
}: {
  groups: Array<{ id: string; title: string }>;
  onCreate: (fields: { title: string; kind: string; groupId: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<UnitKind>('texts');
  const [groupId, setGroupId] = useState('');
  return (
    <form
      data-testid="new-unit-card"
      onSubmit={(event) => {
        event.preventDefault();
        onCreate({ title, kind, groupId });
      }}
      className={cn(TILE, 'grid gap-4 p-5 hover:translate-y-0 sm:grid-cols-3')}
    >
      <div className="space-y-1.5">
        <Label htmlFor="new-unit-name">Unit name</Label>
        <Input id="new-unit-name" data-testid="new-unit-name" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-unit-kind">Kind</Label>
        <select
          id="new-unit-kind"
          data-testid="new-unit-kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as UnitKind)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          {UNIT_KINDS.map((candidate) => (
            <option key={candidate} value={candidate}>
              {UNIT_KIND_LABELS[candidate]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-unit-group">Put it in</Label>
        <select
          id="new-unit-group"
          data-testid="new-unit-group"
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.title}
            </option>
          ))}
          <option value="">Not in a group, at the end</option>
        </select>
      </div>
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" data-testid="new-unit-create" disabled={!title.trim()}>
          Create unit
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function GroupSection({
  group,
  hovered,
  onDragOver,
  onDragLeave,
  onDrop,
  run,
  first,
  last,
  children,
}: {
  group: Extract<LibraryBlock, { kind: 'group' }>;
  hovered: boolean;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent) => void;
  run: Run;
  first: boolean;
  last: boolean;
  children: ReactNode;
}) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [subtitle, setSubtitle] = useState(group.subtitle ?? '');
  return (
    <section
      data-testid="unit-group"
      data-group={group.title}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn('-m-3 rounded-2xl p-3 transition', hovered && 'outline-dashed outline-2 outline-[#D9714F]')}
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {renaming ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              run({ intent: 'rename-group', groupId: group.id, title, subtitle });
              setRenaming(false);
            }}
          >
            <Input autoFocus aria-label="Group name" data-testid="group-rename-input" value={title} onChange={(event) => setTitle(event.target.value)} className="h-8 w-56" />
            <Input aria-label="Subtitle" placeholder="Subtitle (optional)" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} className="h-8 w-56" />
            <Button type="submit" size="sm">
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <>
            <h2 className="text-lg font-semibold">{group.title}</h2>
            {group.subtitle ? <span className="text-sm text-muted-foreground">{group.subtitle}</span> : null}
            <span className="text-sm text-muted-foreground">
              {group.units.length} unit{group.units.length === 1 ? '' : 's'}
            </span>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="edit-group">
                  Edit group
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
                <DropdownMenuItem disabled={first} onSelect={() => run({ intent: 'move-group', groupId: group.id, direction: 'up' })}>
                  Move up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={last} onSelect={() => run({ intent: 'move-group', groupId: group.id, direction: 'down' })}>
                  Move down
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-testid="ungroup" onSelect={() => run({ intent: 'ungroup', groupId: group.id })}>
                  Ungroup
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
      {children}
    </section>
  );
}

function UnitCard({
  unit,
  groups,
  selecting,
  selected,
  onToggle,
  onGroupWith,
  onDragStart,
  onDragEnd,
  run,
}: {
  unit: UnitTile;
  groups: Array<{ id: string; title: string }>;
  selecting: boolean;
  selected: string[];
  onToggle: (unitId: string) => void;
  onGroupWith: (unitId: string) => void;
  onDragStart: (event: DragEvent, unit: UnitTile) => void;
  onDragEnd: () => void;
  run: Run;
}) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(unit.title);
  const [lessonOver, setLessonOver] = useState(false);
  const isSelected = selected.includes(unit.id);

  function click(event: MouseEvent) {
    if (selecting || event.shiftKey || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      onToggle(unit.id);
    }
  }

  return (
    <article
      data-testid="unit-tile"
      data-unit={unit.title}
      draggable={!renaming}
      onDragStart={(event) => onDragStart(event, unit)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!hasDrag(event, LESSON_DRAG)) return;
        event.preventDefault();
        event.stopPropagation();
        setLessonOver(true);
      }}
      onDragLeave={() => setLessonOver(false)}
      onDrop={(event) => {
        const lessonId = event.dataTransfer.getData(LESSON_DRAG);
        setLessonOver(false);
        if (!lessonId) return;
        event.preventDefault();
        event.stopPropagation();
        run({ intent: 'move-lesson', conversationId: lessonId, unitId: unit.id });
      }}
      className={cn(
        TILE,
        'flex min-h-[168px] flex-col p-4',
        isSelected && 'outline-dashed outline-2 outline-offset-2 outline-[#D9714F]',
        lessonOver && 'border-[#D9714F] bg-[#D9714F]/5'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <KindLabel kind={unit.kind} label={unit.kindLabel} />
        <div className="relative z-10 flex items-center gap-1">
          {selecting ? (
            <Checkbox
              aria-label={`Select ${unit.title}`}
              data-testid="unit-select"
              checked={isSelected}
              onCheckedChange={() => onToggle(unit.id)}
            />
          ) : null}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`More for ${unit.title}`} data-testid="unit-menu" className="rounded-md p-1 text-muted-foreground hover:bg-foreground/5">
                <MoreHorizontal size={18} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-testid="unit-move-to-group">Move to group</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {groups
                    .filter((group) => group.id !== unit.groupId)
                    .map((group) => (
                      <DropdownMenuItem key={group.id} data-testid="unit-move-group-option" onSelect={() => run({ intent: 'move-units', unitIds: unit.id, groupId: group.id })}>
                        {group.title}
                      </DropdownMenuItem>
                    ))}
                  {unit.groupId ? (
                    <DropdownMenuItem data-testid="unit-move-out" onSelect={() => run({ intent: 'move-units', unitIds: unit.id, groupId: '' })}>
                      Not in a group
                    </DropdownMenuItem>
                  ) : null}
                  {!groups.length ? <DropdownMenuItem disabled>No groups yet</DropdownMenuItem> : null}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem data-testid="unit-group-with" onSelect={() => onGroupWith(unit.id)}>
                Group with other units…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem data-testid="unit-rename" onSelect={() => setRenaming(true)}>
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="unit-duplicate" onSelect={() => run({ intent: 'duplicate-unit', unitId: unit.id })}>
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="unit-delete" className="text-red-700" onSelect={() => run({ intent: 'delete-unit', unitId: unit.id })}>
                Delete unit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {renaming ? (
        <form
          className="relative z-10 mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run({ intent: 'rename-unit', unitId: unit.id, title });
            setRenaming(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setRenaming(false);
          }}
        >
          <Input autoFocus aria-label="Unit name" data-testid="unit-rename-input" value={title} onChange={(event) => setTitle(event.target.value)} className="h-9" />
          <Button type="submit" size="sm" data-testid="unit-rename-save">
            Save
          </Button>
        </form>
      ) : (
        <Link
          to={unitHref(unit.id)}
          onClick={click}
          draggable={false}
          data-testid="unit-open"
          className="mt-3 text-[19px] font-bold leading-snug after:absolute after:inset-0 after:rounded-2xl focus:outline-none"
        >
          {unit.title}
        </Link>
      )}
      <p data-testid="unit-lessons" className="mt-1 text-sm text-muted-foreground">
        {unit.lessonLine}
      </p>
      <div className="mt-auto">
        <WritingMeter percent={unit.writingPercent} />
      </div>
    </article>
  );
}

function LooseLessonCard({
  lesson,
  unitOptions,
  run,
}: {
  lesson: LooseLesson;
  unitOptions: LibraryHomeData['unitOptions'];
  run: Run;
}) {
  return (
    <li
      data-testid="loose-lesson"
      data-lesson={lesson.title}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(LESSON_DRAG, lesson.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      className={cn(TILE, 'flex cursor-grab flex-wrap items-center gap-x-4 gap-y-2 p-4 active:cursor-grabbing')}
    >
      <GripVertical size={16} className="shrink-0 text-muted-foreground/60" aria-hidden />
      <div className="min-w-0 flex-1">
        <LessonRename conversationId={lesson.id} title={lesson.title} originalTitle={lesson.originalTitle} variant="card">
          <Link to={lesson.href} className="font-semibold hover:text-primary hover:underline">
            {lesson.title}
          </Link>
          <Badge variant={lesson.set ? 'default' : 'outline'} data-testid="lesson-set-badge">
            {lesson.set ? 'Set' : 'Draft'}
          </Badge>
        </LessonRename>
        <p className="mt-0.5 text-sm text-muted-foreground">{lesson.meta}</p>
      </div>
      <select
        aria-label={`Move ${lesson.title} to a unit`}
        data-testid="move-to-unit"
        value=""
        onChange={(event) => run({ intent: 'move-lesson', conversationId: lesson.id, unitId: event.target.value })}
        className="rounded-md border bg-background px-2 py-1.5 text-sm"
      >
        <option value="" disabled>
          Move to a unit…
        </option>
        {unitOptions
          .filter((option) => option.units.length)
          .map((option) => (
            <optgroup key={option.course} label={option.course}>
              {option.units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.title}
                </option>
              ))}
            </optgroup>
          ))}
      </select>
      <Button asChild size="sm" variant={lesson.set ? 'default' : 'outline'}>
        <Link to={lesson.href}>{lesson.set ? 'Open' : 'Keep planning'}</Link>
      </Button>
    </li>
  );
}
