// Preview-only Create Assignment sheet for the AP History Essay
// AssignmentType. Pre-populates from a LibraryPrompt selected in the
// PromptsLibrary. Mock data only — submitting closes the sheet without
// persisting. Mirrors the shape of CreateAssignmentSheet under
// app.courses.$id but adds AP-history-specific fields (essay type, period,
// time mode, source-count summary for DBQs).

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
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
  type LibraryPrompt,
  MOCK_TEACHER_CLASSES,
  suggestedAssignmentTitle,
} from './library-data';

type Props = {
  prompt: LibraryPrompt | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  builderHref: (opts: {
    promptId: string;
    type: 'DBQ' | 'LEQ';
  }) => string;
};

export function CreateAssignmentSheet({
  prompt,
  open,
  onOpenChange,
  builderHref,
}: Props) {
  const [classId, setClassId] = useState(MOCK_TEACHER_CLASSES[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [timeMode, setTimeMode] = useState<'untimed' | 'timed'>('untimed');
  const [dueDate, setDueDate] = useState('');

  // Re-populate every time the sheet is opened with a new prompt.
  useEffect(() => {
    if (!open || !prompt) return;
    setClassId(MOCK_TEACHER_CLASSES[0]?.id ?? '');
    setTitle(suggestedAssignmentTitle(prompt));
    setBody(prompt.prompt);
    setTimeMode('untimed');
    setDueDate('');
  }, [open, prompt]);

  const totalMinutes = useMemo(() => {
    if (!prompt) return 60;
    return prompt.type === 'DBQ' ? 60 : 40;
  }, [prompt]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Preview only — pretend it saved and close the sheet.
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            New {prompt?.type ?? 'AP History'} assignment
            {prompt ? (
              <Badge variant="outline" size="sm">
                from library · {prompt.id}
              </Badge>
            ) : null}
          </SheetTitle>
          <SheetDescription>
            Pre-filled from the prompt library. Edit anything before assigning.
          </SheetDescription>
        </SheetHeader>

        {prompt ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Read-only chips summarizing the prompt origin */}
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <Badge
                variant={prompt.type === 'DBQ' ? 'default' : 'secondary'}
                size="sm"
              >
                {prompt.type}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {prompt.period}
              </span>
              <span className="text-xs text-muted-foreground" aria-hidden>
                ·
              </span>
              <span className="text-xs text-muted-foreground">
                {prompt.era}
              </span>
              {prompt.sourceCount != null ? (
                <>
                  <span className="text-xs text-muted-foreground" aria-hidden>
                    ·
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {prompt.sourceCount} sources
                  </span>
                </>
              ) : null}
            </div>

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
                Mock class list for the preview. The real flow will pull the
                teacher's APUSH sections.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ap-title">Title (optional)</Label>
              <Input
                id="ap-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Reconstruction DBQ"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ap-prompt">Prompt</Label>
              <Textarea
                id="ap-prompt"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                required
              />
            </div>

            {prompt.type === 'DBQ' ? (
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <p className="mb-1 font-semibold">
                  Sources ({prompt.sourceCount} pre-filled)
                </p>
                <p className="text-muted-foreground">
                  The library entry includes the full source set with
                  attributions. Edit or reorder them in the builder; this sheet
                  just confirms they're attached.
                </p>
                <Button
                  asChild
                  variant="link"
                  size="sm"
                  className="-ml-2 mt-1 h-auto p-0"
                >
                  <Link
                    to={builderHref({ promptId: prompt.id, type: prompt.type })}
                  >
                    Open in builder →
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <p className="mb-1 font-semibold">No documents (LEQ)</p>
                <p className="text-muted-foreground">
                  LEQs rely on outside evidence alone. The tutor surfaces the
                  period context bank during drafting.
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
              {timeMode === 'timed' && prompt.type === 'DBQ' ? (
                <p className="text-xs text-muted-foreground">
                  15 min reading (editor locked) + 45 min writing.
                </p>
              ) : null}
              {timeMode === 'timed' && prompt.type === 'LEQ' ? (
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

            <div className="flex items-center justify-between gap-2 pt-4">
              <Button
                asChild
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                <Link
                  to={builderHref({ promptId: prompt.id, type: prompt.type })}
                >
                  Open in builder
                </Link>
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Create Assignment</Button>
              </div>
            </div>

            <p className="pt-2 text-xs text-muted-foreground">
              Preview only — submitting closes the sheet without persisting.
            </p>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
