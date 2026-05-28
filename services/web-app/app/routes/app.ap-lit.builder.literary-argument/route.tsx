import { useEffect, useState } from 'react';
import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import { Link, useLoaderData, useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Checkbox } from '~/components/ui/checkbox';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { AP_LIT_ASSIGNMENT_TYPE_ID } from '~/utils/ap-assignment-types';
import { ArgumentEditor, SuggestedWorksList, type SuggestedWork } from '~/components/ap-builder';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.teacherProfile) {
    return dataResponse({ teacherClasses: [], libraryPrompts: [] });
  }

  const [teacherClasses, libraryPrompts] = await Promise.all([
    prisma.class.findMany({
      where: {
        teachers: { some: { id: profile.teacherProfile.id } },
        isArchived: false,
      },
      select: { id: true, grade: true, period: true, title: true },
      orderBy: [{ grade: 'asc' }, { period: 'asc' }],
    }),
    prisma.promptLibraryEntry.findMany({
      where: { assignmentTypeKind: 'ap-lit', essayType: 'literary-argument' },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, title: true, promptBody: true, tags: true, year: true },
    }),
  ]);

  return dataResponse({ teacherClasses, libraryPrompts });
}

function classLabel(klass: { grade: string; period: string; title: string | null }) {
  return klass.title || `Grade ${klass.grade} • Period ${klass.period}`;
}

export default function LiteraryArgumentBuilderPage() {
  const { teacherClasses, libraryPrompts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();

  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [works, setWorks] = useState<SuggestedWork[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState('');
  const [selectAll, setSelectAll] = useState(false);

  const isSaving = fetcher.state !== 'idle';

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      window.location.href = '/app/ap-lit';
    }
  }, [fetcher.state, fetcher.data]);

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    setSelectedClassIds(checked ? new Set(teacherClasses.map((c) => c.id)) : new Set());
  };

  const handleClassToggle = (classId: string, checked: boolean) => {
    const updated = new Set(selectedClassIds);
    if (checked) updated.add(classId);
    else updated.delete(classId);
    setSelectedClassIds(updated);
    setSelectAll(updated.size === teacherClasses.length);
  };

  const handleLibrarySelect = (lp: typeof libraryPrompts[number]) => {
    setTitle(lp.title);
    setPrompt(lp.promptBody);
  };

  const handleSubmit = () => {
    // Suggested works are appended to the prompt so students see them.
    const worksText =
      works.filter((w) => w.title.trim()).length > 0
        ? `\n\nYou may choose from the following works or another work of literary merit:\n${works
            .filter((w) => w.title.trim())
            .map((w) => `• ${w.title}${w.author ? ` — ${w.author}` : ''}`)
            .join('\n')}`
        : '';

    const formData = new FormData();
    formData.set('intent', 'create-assignment');
    formData.set('assignmentTypeId', AP_LIT_ASSIGNMENT_TYPE_ID);
    formData.set('essayType', 'literary-argument');
    formData.set('title', title);
    formData.set('prompt', `${prompt}${worksText}`);
    formData.set('dueDate', dueDate);
    for (const classId of selectedClassIds) formData.append('classIds', classId);
    fetcher.submit(formData, { method: 'post', action: '/api/assignments.create' });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <Link to="/app/ap-lit" className="text-sm text-muted-foreground hover:text-foreground">
          ← AP English Literature & Composition
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-bold">New Literary Argument Assignment</h1>
        <p className="text-sm text-muted-foreground">
          Students make an argument about a full work of literature they have read, using
          specific textual evidence. No provided passage. 40-minute writing period.
        </p>
      </div>

      {libraryPrompts.length > 0 && (
        <div className="space-y-2">
          <Label>Start from Prompt Library</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {libraryPrompts.map((lp) => (
              <button key={lp.id} type="button" onClick={() => handleLibrarySelect(lp)}
                className="rounded-md border p-3 text-left text-sm hover:bg-accent">
                <p className="font-medium">{lp.title}</p>
                {lp.year && <p className="text-xs text-muted-foreground">{lp.year}</p>}
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{lp.promptBody}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Assignment Title (optional)</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Literary Argument: The Role of Memory" disabled={isSaving} />
      </div>

      <ArgumentEditor prompt={prompt} onPromptChange={setPrompt} />

      <SuggestedWorksList works={works} onWorksChange={setWorks} />

      <div className="space-y-3 rounded-md border p-4">
        <Label>Assign to Classes</Label>
        {teacherClasses.length === 0 ? (
          <p className="text-sm text-muted-foreground">You don't have any classes yet.</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Checkbox id="select-all" checked={selectAll} onCheckedChange={handleSelectAll} />
              <label htmlFor="select-all" className="text-sm">Select all</label>
            </div>
            <div className="space-y-1">
              {teacherClasses.map((klass) => (
                <div key={klass.id} className="flex items-center gap-2">
                  <Checkbox id={`class-${klass.id}`} checked={selectedClassIds.has(klass.id)}
                    onCheckedChange={(checked) => handleClassToggle(klass.id, !!checked)} />
                  <label htmlFor={`class-${klass.id}`} className="text-sm">{classLabel(klass)}</label>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="due-date">Due Date (optional)</Label>
        <Input id="due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={isSaving} />
      </div>

      {fetcher.data && !fetcher.data.success && (
        <p className="text-sm text-destructive">{fetcher.data.message || 'Unable to create assignment.'}</p>
      )}

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Link to="/app/ap-lit"><Button variant="outline" disabled={isSaving}>Cancel</Button></Link>
        <Button onClick={handleSubmit} disabled={isSaving || !prompt.trim() || selectedClassIds.size === 0}>
          {isSaving ? 'Creating…' : 'Create Assignment'}
        </Button>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
