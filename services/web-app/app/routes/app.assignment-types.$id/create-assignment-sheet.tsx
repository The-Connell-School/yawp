// Preview-only Create Assignment sheet for the AP History Essay
// AssignmentType. Opens in two modes:
//
//   { kind: 'library', prompt }   — user clicked a row in the Prompt Library;
//                                    title/body/sources pre-fill from it.
//   { kind: 'scratch', essayType } — user clicked New ▾ → Assignment → DBQ/LEQ;
//                                    sheet opens blank with the chosen type.
//
// Mock data only — submitting closes the sheet without persisting. For DBQ
// from-library, the sources panel surfaces two affordances:
//   - Preview — inline expand of each source (title / attribution / body)
//   - Download PDF — opens the printable sources route in a new tab; the
//     teacher uses the browser's Print → Save as PDF to capture it.
//
// For DBQ from-scratch, the sources panel is a placeholder pointing at the
// builder for full source authoring.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { DownloadIcon, EyeIcon, EyeOffIcon } from 'lucide-react';
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

export function CreateAssignmentSheet({ mode, open, onOpenChange }: Props) {
  const [classId, setClassId] = useState(MOCK_TEACHER_CLASSES[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [timeMode, setTimeMode] = useState<'untimed' | 'timed'>('untimed');
  const [dueDate, setDueDate] = useState('');
  const [sourcesOpen, setSourcesOpen] = useState(false);

  useEffect(() => {
    if (!open || !mode) return;
    setClassId(MOCK_TEACHER_CLASSES[0]?.id ?? '');
    setTimeMode('untimed');
    setDueDate('');
    setSourcesOpen(false);
    if (mode.kind === 'library') {
      setTitle(suggestedAssignmentTitle(mode.prompt));
      setBody(mode.prompt.prompt);
    } else {
      setTitle('');
      setBody('');
    }
  }, [open, mode]);

  const essayType = mode ? modeEssayType(mode) : null;
  const totalMinutes = essayType === 'LEQ' ? 40 : 60;

  const sources = useMemo<SourceCard[]>(
    () =>
      mode?.kind === 'library' ? getSourcesForPrompt(mode.prompt.id) : [],
    [mode]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Preview only — pretend it saved and close the sheet.
    onOpenChange(false);
  }

  const printHref =
    mode?.kind === 'library'
      ? `/app/assignment-types/${PREVIEW_ID}/sources/print?promptId=${mode.prompt.id}`
      : '';

  const builderScratchHref = essayType
    ? `/app/assignment-types/${PREVIEW_ID}/builder?type=${essayType.toLowerCase()}&from=scratch`
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
                        ? "Sources can be added in the builder after you've drafted the prompt."
                        : 'LEQs don\'t carry documents.'
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
                mode.kind === 'library' ? (
                  <div className="rounded-md border bg-muted/30">
                    <div className="flex items-start justify-between gap-3 p-3">
                      <div className="flex-1">
                        <p className="text-sm font-semibold">
                          Sources ({sources.length})
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Pre-filled from the library entry. Preview each
                          source or download a printable PDF copy.
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
                      </div>
                    </div>
                    {sourcesOpen ? (
                      <div className="space-y-3 border-t bg-background/40 p-3">
                        {sources.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Source set seeding pending for this prompt.
                          </p>
                        ) : (
                          sources.map((src, idx) => (
                            <SourcePreviewCard
                              key={src.id}
                              index={idx}
                              source={src}
                            />
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-md border bg-muted/30 p-3 text-xs">
                    <p className="mb-1 font-semibold">Sources</p>
                    <p className="text-muted-foreground">
                      DBQ assignments need 5–7 primary sources. Save this
                      assignment and add the source set in the builder, or
                      jump straight there now.
                    </p>
                    <Button
                      asChild
                      variant="link"
                      size="sm"
                      className="-ml-2 mt-1 h-auto p-0"
                    >
                      <Link to={builderScratchHref}>
                        Open builder for source editing →
                      </Link>
                    </Button>
                  </div>
                )
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

function SourcePreviewCard({
  index,
  source,
}: {
  index: number;
  source: SourceCard;
}) {
  return (
    <div className="rounded border bg-background p-3 text-xs">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="font-semibold">{source.title}</p>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
          {index + 1}
        </span>
      </div>
      <p className="mb-1 italic text-muted-foreground">{source.attribution}</p>
      <p className="whitespace-pre-line leading-relaxed">{source.body}</p>
    </div>
  );
}
