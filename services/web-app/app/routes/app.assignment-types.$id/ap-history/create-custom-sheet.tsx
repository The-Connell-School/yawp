import { useEffect, useMemo, useState } from 'react';
import { useFetcher } from 'react-router';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
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
import { APUSH_PERIOD_LABEL } from './types';

export type CustomEssayType = 'dbq' | 'leq';

type TeacherClass = {
  id: string;
  grade: string;
  period: string;
  title: string | null;
};

const PERIOD_OPTIONS = Object.entries(APUSH_PERIOD_LABEL).map(
  ([number, label]) => ({ number: Number(number), label })
);

const REASONING_SKILLS = [
  { value: 'causation', label: 'Causation' },
  { value: 'comparison', label: 'Comparison' },
  { value: 'continuity-and-change', label: 'Continuity & Change' },
  { value: 'periodization', label: 'Periodization' },
];

type SourceDraft = {
  id: string;
  title: string;
  attribution: string;
  body: string;
};

function classLabel(klass: TeacherClass) {
  return klass.title || `Grade ${klass.grade} • Period ${klass.period}`;
}

function emptySource(index: number): SourceDraft {
  return {
    id: `src-${index}-${Math.random().toString(36).slice(2, 8)}`,
    title: `Document ${index}`,
    attribution: '',
    body: '',
  };
}

export function CreateCustomApHistorySheet({
  assignmentTypeId,
  teacherClasses,
  open,
  onOpenChange,
  essayType,
}: {
  assignmentTypeId: string;
  teacherClasses: TeacherClass[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  essayType: CustomEssayType;
}) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  const isSaving = fetcher.state !== 'idle';
  const isDbq = essayType === 'dbq';

  const [selectedClassId, setSelectedClassId] = useState('');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [periodNumber, setPeriodNumber] = useState('');
  const [reasoningSkill, setReasoningSkill] = useState('causation');
  const [timeMode, setTimeMode] = useState<'untimed' | 'timed'>('untimed');
  const [durationMinutes, setDurationMinutes] = useState(isDbq ? '60' : '40');
  const [sources, setSources] = useState<SourceDraft[]>([]);

  // Reset the form whenever the sheet opens or the essay type changes.
  useEffect(() => {
    if (!open) return;
    setSelectedClassId(teacherClasses[0]?.id ?? '');
    setTitle('');
    setPrompt('');
    setPeriodNumber('');
    setReasoningSkill('causation');
    setTimeMode('untimed');
    setDurationMinutes(isDbq ? '60' : '40');
    setSources(isDbq ? [emptySource(1)] : []);
  }, [open, essayType, isDbq, teacherClasses]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      onOpenChange(false);
    }
  }, [fetcher.state, fetcher.data, onOpenChange]);

  const sourcesJson = useMemo(
    () =>
      JSON.stringify(
        sources.map((source, index) => ({
          position: index + 1,
          title: source.title.trim(),
          attribution: source.attribution.trim(),
          body: source.body.trim(),
          mediaType: 'text',
        }))
      ),
    [sources]
  );

  const periodLabel = periodNumber
    ? (APUSH_PERIOD_LABEL[Number(periodNumber)] ?? `Period ${periodNumber}`)
    : '';

  const dbqSourcesReady =
    !isDbq ||
    sources.some(
      (s) => s.title.trim() && s.attribution.trim() && s.body.trim()
    );
  const canSubmit =
    !isSaving &&
    Boolean(selectedClassId) &&
    prompt.trim().length > 0 &&
    Boolean(periodNumber) &&
    dbqSourcesReady;

  function updateSource(id: string, patch: Partial<SourceDraft>) {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Create your own {isDbq ? 'DBQ' : 'LEQ'}</SheetTitle>
          <SheetDescription>
            {isDbq
              ? 'Write your prompt and add the documents students will analyze. Students get the same AP tutor and rubric grading as curated prompts.'
              : 'Write your prompt. Students argue from their own outside knowledge, with the same AP tutor and rubric grading as curated prompts.'}
          </SheetDescription>
        </SheetHeader>

        <fetcher.Form
          method="post"
          action="/api/assignments/create"
          className="mt-6 space-y-4"
        >
          <input type="hidden" name="intent" value="create-assignment" />
          <input type="hidden" name="apHistoryMode" value="custom" />
          <input
            type="hidden"
            name="assignmentTypeId"
            value={assignmentTypeId}
          />
          <input type="hidden" name="classIds" value={selectedClassId} />
          <input type="hidden" name="essayType" value={essayType} />
          <input type="hidden" name="period" value={periodLabel} />
          <input
            type="hidden"
            name="apHistorySourcesJson"
            value={sourcesJson}
          />

          <div className="space-y-2">
            <Label>Class</Label>
            <Select
              value={selectedClassId}
              onValueChange={setSelectedClassId}
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {teacherClasses.map((klass) => (
                  <SelectItem key={klass.id} value={klass.id}>
                    {classLabel(klass)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cc-title">Title (optional)</Label>
            <Input
              id="cc-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                isDbq ? 'e.g., Reconstruction DBQ' : 'e.g., Gilded Age LEQ'
              }
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cc-prompt">Prompt</Label>
            <Textarea
              id="cc-prompt"
              name="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Evaluate the extent to which…"
              rows={3}
              disabled={isSaving}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>APUSH period</Label>
              <Select
                value={periodNumber}
                onValueChange={setPeriodNumber}
                disabled={isSaving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a period" />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.number}
                      value={String(option.number)}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="periodNumber" value={periodNumber} />
            </div>

            <div className="space-y-2">
              <Label>Reasoning skill</Label>
              <Select
                value={reasoningSkill}
                onValueChange={setReasoningSkill}
                disabled={isSaving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASONING_SKILLS.map((skill) => (
                    <SelectItem key={skill.value} value={skill.value}>
                      {skill.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="hidden"
                name="reasoningSkill"
                value={reasoningSkill}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Timing</Label>
              <Select
                value={timeMode}
                onValueChange={(v) => setTimeMode(v as 'untimed' | 'timed')}
                disabled={isSaving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="untimed">Untimed</SelectItem>
                  <SelectItem value="timed">Timed</SelectItem>
                </SelectContent>
              </Select>
              <input type="hidden" name="timeMode" value={timeMode} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-duration">Suggested minutes</Label>
              <Input
                id="cc-duration"
                name="durationMinutes"
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>

          {isDbq ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Documents</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                  onClick={() =>
                    setSources((prev) => [
                      ...prev,
                      emptySource(prev.length + 1),
                    ])
                  }
                >
                  <PlusIcon className="mr-1 h-4 w-4" />
                  Add document
                </Button>
              </div>

              {sources.map((source, index) => (
                <div
                  key={source.id}
                  className="space-y-2 rounded-md border bg-background p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Document {index + 1}
                    </span>
                    {sources.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSources((prev) =>
                            prev.filter((s) => s.id !== source.id)
                          )
                        }
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove document ${index + 1}`}
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <Input
                    value={source.title}
                    onChange={(e) =>
                      updateSource(source.id, { title: e.target.value })
                    }
                    placeholder="Document title"
                    disabled={isSaving}
                  />
                  <Input
                    value={source.attribution}
                    onChange={(e) =>
                      updateSource(source.id, { attribution: e.target.value })
                    }
                    placeholder="Attribution (author, source, date)"
                    disabled={isSaving}
                  />
                  <Textarea
                    value={source.body}
                    onChange={(e) =>
                      updateSource(source.id, { body: e.target.value })
                    }
                    placeholder="Paste the document text students will analyze…"
                    rows={4}
                    disabled={isSaving}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Paste each document&rsquo;s text here. Uploading files is coming
                soon.
              </p>
            </div>
          ) : null}

          {fetcher.data && !fetcher.data.success ? (
            <p className="text-sm text-destructive">
              {fetcher.data.message || 'Unable to create assignment.'}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSaving ? 'Creating…' : 'Create assignment'}
            </Button>
          </div>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  );
}
