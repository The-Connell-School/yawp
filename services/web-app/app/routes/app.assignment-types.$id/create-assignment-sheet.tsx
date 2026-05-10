// Preview-only Create Assignment sheet for the AP History Essay
// AssignmentType. Opens in two modes:
//
//   { kind: 'library', prompt }   — user clicked a row in the Prompt Library;
//                                    title/body/sources pre-fill from it.
//   { kind: 'scratch', essayType } — user clicked New ▾ → Assignment → DBQ/LEQ;
//                                    sheet opens blank with the chosen type.
//
// Mock data only — submitting closes the sheet without persisting.
//
// For DBQ assignments (either mode), the Sources panel is a horizontal
// carousel: click Preview to expand, swipe through one source at a time
// with prev/next arrows or dot navigation. Editable inline (Title /
// Attribution / Body) so the teacher can compose or tweak the source set
// without leaving the sheet. From-library adds a Download PDF button that
// opens a printable source-set view in a new tab.

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Textarea } from '~/components/ui/textarea';
import {
  type EssayType,
  getSourcesForPrompt,
  type LibraryPrompt,
  MOCK_TEACHER_CLASSES,
  PREVIEW_ID,
  type SourceCard,
  suggestedAssignmentTitle,
} from './library-data';

export type CreateAssignmentMode =
  | { kind: 'library'; prompt: LibraryPrompt }
  | { kind: 'scratch'; essayType: EssayType };

type Props = {
  mode: CreateAssignmentMode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function modeEssayType(mode: CreateAssignmentMode): EssayType {
  return mode.kind === 'library' ? mode.prompt.type : mode.essayType;
}

function makeEmptySource(index: number): SourceCard {
  return {
    id: `src-${Date.now()}-${index}`,
    title: `Doc ${index + 1} — `,
    attribution: '',
    body: '',
  };
}

export function CreateAssignmentSheet({ mode, open, onOpenChange }: Props) {
  const [classId, setClassId] = useState(MOCK_TEACHER_CLASSES[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [timeMode, setTimeMode] = useState<'untimed' | 'timed'>('untimed');
  const [dueDate, setDueDate] = useState('');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sources, setSources] = useState<SourceCard[]>([]);

  useEffect(() => {
    if (!open || !mode) return;
    setClassId(MOCK_TEACHER_CLASSES[0]?.id ?? '');
    setTimeMode('untimed');
    setDueDate('');
    setSourcesOpen(false);
    if (mode.kind === 'library') {
      setTitle(suggestedAssignmentTitle(mode.prompt));
      setBody(mode.prompt.prompt);
      setSources(getSourcesForPrompt(mode.prompt.id));
    } else {
      setTitle('');
      setBody('');
      setSources([]);
    }
  }, [open, mode]);

  const essayType = mode ? modeEssayType(mode) : null;
  const totalMinutes = essayType === 'LEQ' ? 40 : 60;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Preview only — pretend it saved and close the sheet.
    onOpenChange(false);
  }

  const printHref =
    mode?.kind === 'library'
      ? `/app/assignment-types/${PREVIEW_ID}/sources/print?promptId=${mode.prompt.id}`
      : '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {mode && essayType ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                New {essayType} assignment
                {mode.kind === 'library' ? (
                  <Badge variant="outline" size="sm">
                    from library · {mode.prompt.id}
                  </Badge>
                ) : null}
              </SheetTitle>
              <SheetDescription>
                {mode.kind === 'library'
                  ? 'Pre-filled from the prompt library. Edit anything before assigning.'
                  : `Type your prompt and pick a class. ${
                      essayType === 'DBQ'
                        ? 'Add 5–7 sources in the carousel below.'
                        : "LEQs don't carry documents."
                    }`}
              </SheetDescription>
            </SheetHeader>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {mode.kind === 'library' ? (
                // Read-only origin chips (only when pre-filled from library)
                <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                  <Badge
                    variant={
                      mode.prompt.type === 'DBQ' ? 'default' : 'secondary'
                    }
                    size="sm"
                  >
                    {mode.prompt.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {mode.prompt.period}
                  </span>
                  <span
                    className="text-xs text-muted-foreground"
                    aria-hidden
                  >
                    ·
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {mode.prompt.era}
                  </span>
                  {mode.prompt.sourceCount != null ? (
                    <>
                      <span
                        className="text-xs text-muted-foreground"
                        aria-hidden
                      >
                        ·
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {mode.prompt.sourceCount} sources
                      </span>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge
                    variant={essayType === 'DBQ' ? 'default' : 'secondary'}
                    size="sm"
                  >
                    {essayType}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    APUSH ·{' '}
                    {essayType === 'DBQ'
                      ? '7-point rubric · 60 min when timed'
                      : '6-point rubric · 40 min when timed'}
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOCK_TEACHER_CLASSES.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Mock class list for the preview. The real flow will pull
                  the teacher's APUSH sections.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ap-title">Title (optional)</Label>
                <Input
                  id="ap-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    essayType === 'DBQ'
                      ? 'e.g., Reconstruction DBQ'
                      : 'e.g., Causes of the Civil War LEQ'
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ap-prompt">Prompt</Label>
                <Textarea
                  id="ap-prompt"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  placeholder={
                    mode.kind === 'scratch'
                      ? 'Evaluate the extent to which…'
                      : undefined
                  }
                  required
                />
              </div>

              {/* Sources panel */}
              {essayType === 'DBQ' ? (
                <div className="rounded-md border bg-muted/30">
                  <div className="flex items-start justify-between gap-3 p-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold">
                        Sources ({sources.length}
                        {sources.length < 5 || sources.length > 7
                          ? ' · need 5–7'
                          : ''}
                        )
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {mode.kind === 'library'
                          ? 'Pre-filled from the library. Click Preview to swipe through each source — edit inline if you want to tweak.'
                          : 'Click Preview to author your source set. Swipe between cards with the arrows.'}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSourcesOpen((v) => !v)}
                      >
                        {sourcesOpen ? (
                          <>
                            <EyeOffIcon className="mr-1 h-3 w-3" /> Hide
                          </>
                        ) : (
                          <>
                            <EyeIcon className="mr-1 h-3 w-3" /> Preview
                          </>
                        )}
                      </Button>
                      {mode.kind === 'library' && sources.length > 0 ? (
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={printHref}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <DownloadIcon className="mr-1 h-3 w-3" /> Download
                            PDF
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {sourcesOpen ? (
                    <div className="border-t bg-background/40 p-3">
                      <SourcesCarousel
                        sources={sources}
                        onChange={setSources}
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-md border bg-muted/30 p-3 text-xs">
                  <p className="mb-1 font-semibold">No documents (LEQ)</p>
                  <p className="text-muted-foreground">
                    LEQs rely on outside evidence alone. The tutor surfaces
                    the period context bank during drafting.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Time mode</Label>
                <RadioGroup
                  value={timeMode}
                  onValueChange={(v) => setTimeMode(v as 'untimed' | 'timed')}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="untimed" id="ap-time-untimed" />
                    <Label htmlFor="ap-time-untimed" className="font-normal">
                      Untimed (default)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="timed" id="ap-time-timed" />
                    <Label htmlFor="ap-time-timed" className="font-normal">
                      Timed ({totalMinutes} min)
                    </Label>
                  </div>
                </RadioGroup>
                {timeMode === 'timed' && essayType === 'DBQ' ? (
                  <p className="text-xs text-muted-foreground">
                    15 min reading (editor locked) + 45 min writing.
                  </p>
                ) : null}
                {timeMode === 'timed' && essayType === 'LEQ' ? (
                  <p className="text-xs text-muted-foreground">
                    40 min single window; planning sidebar always available.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ap-due">Due date (optional)</Label>
                <Input
                  id="ap-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Create Assignment</Button>
              </div>

              <p className="pt-2 text-xs text-muted-foreground">
                Preview only — submitting closes the sheet without persisting.
              </p>
            </form>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SourcesCarousel({
  sources,
  onChange,
}: {
  sources: SourceCard[];
  onChange: (next: SourceCard[]) => void;
}) {
  const [active, setActive] = useState(0);

  // If the active index falls outside the current sources length (e.g. after
  // removing a source), clamp it back into range.
  useEffect(() => {
    if (sources.length === 0) {
      setActive(0);
      return;
    }
    if (active >= sources.length) setActive(sources.length - 1);
  }, [sources.length, active]);

  if (sources.length === 0) {
    return (
      <div className="rounded border border-dashed bg-background p-6 text-center">
        <p className="mb-3 text-sm text-muted-foreground">
          No sources yet. DBQs need 5–7 primary documents.
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => onChange([makeEmptySource(0)])}
        >
          <PlusIcon className="mr-1 h-3 w-3" /> Add first source
        </Button>
      </div>
    );
  }

  const current = sources[active];

  function updateCurrent(patch: Partial<SourceCard>) {
    const next = [...sources];
    next[active] = { ...current, ...patch };
    onChange(next);
  }

  function addSource() {
    if (sources.length >= 7) return;
    const next = [...sources, makeEmptySource(sources.length)];
    onChange(next);
    setActive(next.length - 1);
  }

  function removeCurrent() {
    if (sources.length <= 1) return;
    const next = sources.filter((_, i) => i !== active);
    onChange(next);
    if (active >= next.length) setActive(next.length - 1);
  }

  return (
    <div className="space-y-3">
      {/* Carousel header — position + prev/next */}
      <div className="flex items-center justify-between">
        <Badge variant="outline" size="sm">
          Source {active + 1} of {sources.length}
        </Badge>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setActive((a) => Math.max(0, a - 1))}
            disabled={active === 0}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              setActive((a) => Math.min(sources.length - 1, a + 1))
            }
            disabled={active === sources.length - 1}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Dots indicator */}
      <div className="flex justify-center gap-1.5">
        {sources.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Go to source ${i + 1}`}
            className={
              'h-1.5 w-1.5 rounded-full transition-colors ' +
              (i === active
                ? 'bg-foreground'
                : 'bg-foreground/20 hover:bg-foreground/40')
            }
          />
        ))}
      </div>

      {/* Current source card — editable inline */}
      <div className="space-y-2 rounded border bg-background p-3">
        <Input
          value={current.title}
          onChange={(e) => updateCurrent({ title: e.target.value })}
          placeholder="Doc 1 — Title"
          className="text-sm font-semibold"
        />
        <Input
          value={current.attribution}
          onChange={(e) => updateCurrent({ attribution: e.target.value })}
          placeholder="Author, date (e.g. Frederick Douglass, 1870)"
          className="text-xs italic"
        />
        <Textarea
          value={current.body}
          onChange={(e) => updateCurrent({ body: e.target.value })}
          rows={6}
          placeholder="Source body — paste the excerpt students will analyze."
          className="text-sm leading-relaxed"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={removeCurrent}
          disabled={sources.length <= 1}
        >
          <Trash2Icon className="mr-1 h-3 w-3" /> Remove this source
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addSource}
          disabled={sources.length >= 7}
        >
          <PlusIcon className="mr-1 h-3 w-3" /> Add source ({sources.length}/7)
        </Button>
      </div>
    </div>
  );
}
