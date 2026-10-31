/**
 * Every lesson this teacher has planned, in one list.
 *
 * Previously this page showed a filtered subset — lessons that happened to
 * have something kept — while the planner's rail showed everything under the
 * heading "Saved lessons". Two lists, both claiming to be the saved ones, and
 * no way to put a lesson in either on purpose. Now there are two again, but
 * the difference between them is a decision the teacher makes: drafts they are
 * still working on, and the lessons they published to their library.
 */
import {
  Link,
  redirect,
  useFetcher,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';
import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookMarked,
  ChevronLeft,
  FileText,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Lightbulb,
  Pencil,
  PenLine,
  Trash2,
} from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';
import { prisma } from '~/utils/db.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import {
  buildLessonLibrary,
  lessonHref,
  splitDraftsAndLibrary,
  groupUnits,
  type UnitFolder,
  type LibraryLesson,
} from '~/domain/lesson-planner/lesson-library';
import { timeAgo } from '~/utils/timeAgo';
import { DeckArtImage } from '~/components/lesson-planner/deck-art-image';

export async function loader({ request }: LoaderFunctionArgs) {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) throw redirect('/app');

  const lessons = await prisma.lessonPlanConversation.findMany({
    where: { membershipId: access.membership.id, deletedAt: null },
    // Published first, then by recency, so a lesson taught every year does not
    // sink under this week's drafts.
    orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      title: true,
      packetTitle: true,
      updatedAt: true,
      publishedAt: true,
      lessonClassLabel: true,
      unitDay: true,
      unit: { select: { id: true, title: true, deletedAt: true } },
      messages: {
        where: { keptAt: { not: null } },
        select: { keptAudience: true },
      },
      // The stack's pieces (Brian's run 4: every lesson read "Empty").
      materials: { select: { kind: true, audience: true, content: true } },
      originClassAssignment: {
        select: {
          class: { select: { title: true, grade: true, period: true } },
          assignment: { select: { title: true } },
        },
      },
    },
  });

  const { stackV3 } = await getLessonPlannerReviewFlags(access.membership.organization.id);
  // Every folder, an empty one included, newest first (Kevin, Oct 23).
  const allFolders = stackV3
    ? await prisma.lessonPlanUnit.findMany({
        where: { membershipId: access.membership.id, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        select: { id: true, title: true },
      })
    : [];
  return {
    lessons: buildLessonLibrary(
      lessons.map((lesson) => ({
        ...lesson,
        // A deleted unit leaves its lessons standing on their own.
        unit: lesson.unit && !lesson.unit.deletedAt ? { id: lesson.unit.id, title: lesson.unit.title } : null,
      }))
    ),
    // Brian's run 5: units as folders, behind the run-of-show flag.
    folders: stackV3,
    allFolders,
  };
}

const FOLDERS_API = '/api/domain/lesson-planner/folders';
/** What a dragged lesson row carries (Kevin, Oct 23: drag lessons into folders). */
const LESSON_DRAG_TYPE = 'application/x-yawp-lesson';

type FolderOption = { id: string; title: string };

function LessonRow({
  lesson,
  folders = null,
  inFolder = null,
}: {
  lesson: LibraryLesson;
  /** Folders to move it to; null when folders are off. */
  folders?: FolderOption[] | null;
  /** In a folder: its place, and how to move it there. */
  inFolder?: { first: boolean; last: boolean; onMove: (direction: -1 | 1) => void } | null;
}) {
  const fetcher = useFetcher();
  const mover = useFetcher();
  // Answer the click immediately rather than after the round trip: a button that
  // lags feels broken even when it works.
  const published = fetcher.formData
    ? fetcher.formData.get('intent') === 'publish'
    : lesson.published;
  const deleting = fetcher.formData?.get('intent') === 'delete';

  if (deleting) return null;

  function send(intent: 'publish' | 'unpublish' | 'delete') {
    fetcher.submit(
      { intent, conversationId: lesson.id },
      { method: 'post', action: '/api/domain/lesson-planner/packet' }
    );
  }

  function moveTo(folderId: string) {
    mover.submit({ intent: 'move', conversationId: lesson.id, folderId }, { method: 'post', action: FOLDERS_API });
  }

  return (
    <li>
      <div
        data-testid="history-lesson"
        draggable={Boolean(folders)}
        onDragStart={(event) => {
          event.dataTransfer.setData(LESSON_DRAG_TYPE, lesson.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card p-4',
          folders && 'cursor-grab active:cursor-grabbing'
        )}
      >
        {folders ? <GripVertical size={14} className="shrink-0 text-muted-foreground/50" aria-hidden /> : null}
        <button
          type="button"
          onClick={() => send(published ? 'unpublish' : 'publish')}
          aria-pressed={published}
          aria-label={
            published
              ? `Move ${lesson.title} back to drafts`
              : `Publish ${lesson.title} to my library`
          }
          data-testid="history-publish"
          className={cn(
            'shrink-0 rounded-md p-1.5 transition',
            published
              ? 'text-primary hover:bg-primary/10'
              : 'text-muted-foreground/50 hover:bg-foreground/5 hover:text-foreground'
          )}
        >
          {published ? <BookMarked size={16} /> : <PenLine size={16} />}
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          {lesson.deckArtSwatch ? (
            <DeckArtImage
              src={lesson.deckArtSwatch}
              alt=""
              aria-hidden
              className="h-10 w-10 shrink-0 rounded-md border bg-muted"
            />
          ) : null}
          <div className="min-w-0 flex-1">
          <Link
            to={lessonHref(lesson)}
            className="font-medium hover:text-primary hover:underline"
          >
            {lesson.title}
          </Link>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[
              lesson.className,
              lesson.assignmentTitle,
              `Updated ${timeAgo(new Date(lesson.updatedAt))}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {lesson.sectionCount > 0 ? (
            <Badge variant="outline" size="sm">
              <FileText size={12} className="mr-1" />
              {lesson.sectionCount}{' '}
              {lesson.sectionCount === 1 ? 'piece' : 'pieces'}
            </Badge>
          ) : (
            // "Empty", not "Draft": this badge counts what is in the stack, and
            // a published lesson with nothing kept was being labelled a draft
            // while sitting under the library heading.
            <Badge variant="outline" size="sm">
              Empty
            </Badge>
          )}
          {lesson.handoutCount > 0 ? (
            <Badge variant="outline" size="sm">
              {lesson.handoutCount}{' '}
              {lesson.handoutCount === 1 ? 'handout' : 'handouts'}
            </Badge>
          ) : null}
          {/* The other half of the row's destination. A published lesson's
              name already opens the stack, so what it needs beside it is the
              way back into planning; a draft is the reverse. */}
          {published && lesson.sectionCount > 0 ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/app/lesson-planner?c=${lesson.id}`}>
                Keep planning
              </Link>
            </Button>
          ) : lesson.sectionCount > 0 ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/app/lesson-planner/${lesson.id}/packet`}>Stack</Link>
            </Button>
          ) : null}
          {inFolder ? (
            <span className="flex items-center">
              <button
                type="button"
                aria-label={`Move ${lesson.title} up`}
                disabled={inFolder.first}
                onClick={() => inFolder.onMove(-1)}
                className="rounded p-1 text-muted-foreground transition hover:bg-foreground/5 disabled:opacity-30"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                aria-label={`Move ${lesson.title} down`}
                disabled={inFolder.last}
                onClick={() => inFolder.onMove(1)}
                className="rounded p-1 text-muted-foreground transition hover:bg-foreground/5 disabled:opacity-30"
              >
                <ArrowDown size={14} />
              </button>
            </span>
          ) : null}
          {folders ? (
            // The way to file a lesson without dragging: keyboard and phone.
            <select
              data-testid="history-move"
              aria-label={`Move ${lesson.title} to a folder`}
              value=""
              onChange={(event) => {
                if (event.target.value) moveTo(event.target.value === NO_FOLDER ? '' : event.target.value);
              }}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="">Move to…</option>
              {folders
                .filter((folder) => folder.id !== lesson.unit?.id)
                .map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.title}
                  </option>
                ))}
              {lesson.unit ? <option value={NO_FOLDER}>Take out of folder</option> : null}
            </select>
          ) : null}
          <button
            type="button"
            onClick={() => send('delete')}
            aria-label={`Delete ${lesson.title}`}
            data-testid="history-delete"
            className="rounded-md p-1.5 text-muted-foreground/60 transition hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </li>
  );
}

const NO_FOLDER = '__none__';

function UnitFolderRow({ folder, folders }: { folder: UnitFolder; folders: FolderOption[] }) {
  const fetcher = useFetcher();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder.title);
  const [over, setOver] = useState(false);
  const deleting = fetcher.formData?.get('intent') === 'delete';
  if (deleting) return null;
  const title = fetcher.formData?.get('intent') === 'rename' ? String(fetcher.formData.get('title')) : folder.title;
  const post = (fields: Record<string, string>) =>
    fetcher.submit({ folderId: folder.id, ...fields }, { method: 'post', action: FOLDERS_API });
  const move = (index: number, direction: -1 | 1) => {
    const order = folder.days.map((day) => day.id);
    const to = index + direction;
    [order[index], order[to]] = [order[to]!, order[index]!];
    post({ intent: 'reorder', order: order.join(',') });
  };

  return (
    <li>
      <details
        data-testid="unit-folder"
        open
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(LESSON_DRAG_TYPE)) return;
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          setOver(false);
          const id = event.dataTransfer.getData(LESSON_DRAG_TYPE);
          if (!id) return;
          event.preventDefault();
          post({ intent: 'move', conversationId: id });
        }}
        className={cn('rounded-xl border bg-card p-4 transition', over && 'border-primary bg-primary/5')}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2">
          <FolderOpen size={16} className="shrink-0 text-primary" />
          <span data-testid="unit-folder-title" className="min-w-0 flex-1 truncate font-medium">
            {title}
          </span>
          <Badge variant="outline" size="sm">
            {folder.days.length} {folder.days.length === 1 ? 'lesson' : 'lessons'}
          </Badge>
          {renaming ? null : (
            <button
              type="button"
              aria-label={`Rename ${title}`}
              data-testid="unit-folder-rename"
              onClick={(event) => {
                event.preventDefault();
                setName(title);
                setRenaming(true);
              }}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-foreground/5"
            >
              <Pencil size={14} />
            </button>
          )}
          <button
            type="button"
            aria-label={`Delete the folder ${title}`}
            data-testid="unit-folder-delete"
            onClick={(event) => {
              event.preventDefault();
              if (window.confirm(`Delete the folder “${title}”? Its lessons stay in your library.`)) post({ intent: 'delete' });
            }}
            className="rounded-md p-1.5 text-muted-foreground/60 transition hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 size={14} />
          </button>
        </summary>
        {renaming ? (
          // Outside the summary: typing a space there would fold the folder.
          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setRenaming(false);
              if (name.trim() && name.trim() !== folder.title) post({ intent: 'rename', title: name.trim() });
            }}
          >
            <input
              autoFocus
              aria-label="Folder name"
              data-testid="unit-folder-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm"
            />
            <Button type="submit" size="sm" variant="outline" data-testid="unit-folder-save">
              Save
            </Button>
          </form>
        ) : null}
        {folder.days.length ? (
          <ol className="mt-3 flex flex-col gap-2">
            {folder.days.map((day, index) => (
              <LessonRow
                key={day.id}
                lesson={day}
                folders={folders}
                inFolder={{
                  first: index === 0,
                  last: index === folder.days.length - 1,
                  onMove: (direction) => move(index, direction),
                }}
              />
            ))}
          </ol>
        ) : (
          <p data-testid="unit-folder-empty" className="mt-3 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Drag a lesson here, or use Move to… on any lesson.
          </p>
        )}
        {folder.planning ? (
          <Link
            to={`/app/lesson-planner?c=${folder.planning.id}`}
            data-testid="unit-folder-planning"
            className="mt-3 inline-block text-xs font-semibold text-primary underline"
          >
            The chat that planned it
          </Link>
        ) : null}
      </details>
    </li>
  );
}

function NewFolder() {
  const fetcher = useFetcher();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (!open) {
    return (
      <Button variant="outline" size="sm" data-testid="new-folder" onClick={() => setOpen(true)}>
        <FolderPlus size={14} className="mr-1" /> New folder
      </Button>
    );
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        fetcher.submit({ intent: 'create', title: name.trim() }, { method: 'post', action: FOLDERS_API });
        setName('');
        setOpen(false);
      }}
    >
      <input
        autoFocus
        aria-label="New folder name"
        data-testid="new-folder-name"
        placeholder="e.g. Lord of the Flies"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="rounded-md border bg-background px-2 py-1 text-sm"
      />
      <Button type="submit" size="sm" data-testid="new-folder-create">
        Create
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}

export default function LessonHistoryRoute() {
  const { lessons: all, folders, allFolders } = useLoaderData<typeof loader>();
  const { units, lessons } = folders ? groupUnits(all, allFolders) : { units: [], lessons: all };
  const { drafts, library } = splitDraftsAndLibrary(lessons);
  const folderOptions = folders ? units.map((unit) => ({ id: unit.id, title: unit.title })) : null;

  return (
    // Own the scroll: the app shell is a fixed-height, overflow-hidden frame.
    <section className="h-full w-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/lesson-planner">
              <ChevronLeft size={16} className="mr-1" />
              Back to planning
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold leading-none">Your lessons</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Drafts you are still working on, and the lessons you have
              published to your library.
            </p>
          </div>
          {folders ? <NewFolder /> : null}
        </div>

        {all.length === 0 && units.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <div className="mx-auto mb-3 w-fit rounded-2xl bg-primary/10 p-3 text-primary">
              <Lightbulb size={24} />
            </div>
            <h2 className="text-base font-semibold">No lessons yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Plan a lesson and it shows up here — named after the lesson, not
              after what you typed to start it.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {units.length ? (
              <div>
                <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <FolderOpen size={12} className="text-primary" />
                  Folders
                </h2>
                <ul className="flex flex-col gap-2">
                  {units.map((folder) => (
                    <UnitFolderRow key={folder.id} folder={folder} folders={folderOptions ?? []} />
                  ))}
                </ul>
              </div>
            ) : null}
            {library.length ? (
              <div>
                <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <BookMarked size={12} className="text-primary" />
                  My lesson library
                </h2>
                <ul className="flex flex-col gap-2">
                  {library.map((lesson) => (
                    <LessonRow key={lesson.id} lesson={lesson} folders={folderOptions} />
                  ))}
                </ul>
              </div>
            ) : null}

            {drafts.length ? (
              <div>
                <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <PenLine size={12} />
                  Drafts
                </h2>
                <ul className="flex flex-col gap-2">
                  {drafts.map((lesson) => (
                    <LessonRow key={lesson.id} lesson={lesson} folders={folderOptions} />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
