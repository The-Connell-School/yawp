import { FileText, ShieldCheck, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
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
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  gradingAssistantStrictnessOptions,
} from '~/domain/grading/grading-assistant-strictness';

type TeacherClass = {
  id: string;
  grade: string;
  period: string;
  title: string | null;
};

type ExtractedSource = {
  position: number;
  title: string;
  attribution: string;
  body: string;
  isVisual?: boolean;
};

type ExtractionData = {
  success?: boolean;
  message?: string;
  importDigest?: string;
  title?: string;
  essayType?: 'dbq' | 'leq';
  prompt?: string;
  periodNumber?: number | null;
  reasoningSkill?:
    | 'causation'
    | 'comparison'
    | 'continuity-and-change'
    | 'periodization'
    | null;
  sources?: ExtractedSource[];
};

function classLabel(klass: TeacherClass) {
  return klass.title || `Grade ${klass.grade} • Period ${klass.period}`;
}

export function ApHistoryPdfImportSheet({
  assignmentTypeId,
  teacherClasses,
  open,
  onOpenChange,
}: {
  assignmentTypeId: string;
  teacherClasses: TeacherClass[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const defaultClassId = teacherClasses[0]?.id ?? '';
  const extractFetcher = useFetcher<ExtractionData>();
  const createFetcher = useFetcher<{ success?: boolean; message?: string }>();
  const [selectedClassId, setSelectedClassId] = useState(defaultClassId);
  const [extracted, setExtracted] = useState<ExtractionData | null>(null);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [period, setPeriod] = useState('');
  const [periodNumber, setPeriodNumber] = useState('');
  const [reasoningSkill, setReasoningSkill] = useState('causation');
  const [timeMode, setTimeMode] = useState<'timed' | 'untimed'>('timed');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [provenanceUrl, setProvenanceUrl] = useState('');
  const [tutorEnabled, setTutorEnabled] = useState(true);
  const [submitForGrade, setSubmitForGrade] = useState(true);
  const [pointValue, setPointValue] = useState('100');
  const [strictness, setStrictness] = useState(
    DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL
  );
  const [publicDomainAttested, setPublicDomainAttested] = useState(false);

  const isExtracting = extractFetcher.state !== 'idle';
  const isCreating = createFetcher.state !== 'idle';

  useEffect(() => {
    if (!open) return;
    setSelectedClassId(defaultClassId);
    setExtracted(null);
    setTitle('');
    setPrompt('');
    setPeriod('');
    setPeriodNumber('');
    setReasoningSkill('causation');
    setTimeMode('timed');
    setDurationMinutes('60');
    setProvenanceUrl('');
    setTutorEnabled(true);
    setSubmitForGrade(true);
    setPointValue('100');
    setStrictness(DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL);
    setPublicDomainAttested(false);
  }, [defaultClassId, open]);

  useEffect(() => {
    const data = extractFetcher.data;
    if (
      !data?.success ||
      !data.importDigest ||
      !data.essayType ||
      !data.prompt
    ) {
      return;
    }
    setExtracted(data);
    setTitle(data.title ?? '');
    setPrompt(data.prompt);
    setPeriodNumber(data.periodNumber ? String(data.periodNumber) : '');
    setPeriod(
      data.periodNumber ? `APUSH Period ${data.periodNumber}` : 'APUSH period'
    );
    setReasoningSkill(data.reasoningSkill ?? 'causation');
    const isDbq = data.essayType === 'dbq';
    setTimeMode(isDbq ? 'timed' : 'untimed');
    setDurationMinutes(isDbq ? '60' : '40');
  }, [extractFetcher.data]);

  useEffect(() => {
    if (createFetcher.state === 'idle' && createFetcher.data?.success) {
      onOpenChange(false);
    }
  }, [createFetcher.data, createFetcher.state, onOpenChange]);

  const sources = extracted?.sources ?? [];
  const canCreate = Boolean(
    extracted?.importDigest &&
    extracted.essayType &&
    selectedClassId &&
    prompt.trim() &&
    period.trim() &&
    periodNumber &&
    provenanceUrl.startsWith('https://') &&
    publicDomainAttested
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Import a public-domain APUSH PDF</SheetTitle>
          <SheetDescription>
            Yawp extracts the assignment for review. The PDF itself is not
            stored; creating the assignment saves a validated source snapshot.
          </SheetDescription>
        </SheetHeader>

        {!extracted ? (
          <extractFetcher.Form
            method="post"
            action="/api/ap-history/extract-document"
            encType="multipart/form-data"
            className="mt-6 space-y-5"
          >
            <input
              type="hidden"
              name="assignmentTypeId"
              value={assignmentTypeId}
            />
            <input type="hidden" name="classId" value={selectedClassId} />
            <div className="space-y-2">
              <Label>Class</Label>
              <Select
                value={selectedClassId}
                onValueChange={setSelectedClassId}
                disabled={isExtracting}
              >
                <SelectTrigger aria-label="Class for AP History import">
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
            <div className="space-y-2 rounded-lg border border-dashed bg-muted/30 p-5">
              <Label
                htmlFor="ap-history-pdf"
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" /> PDF file
              </Label>
              <Input
                id="ap-history-pdf"
                name="file"
                type="file"
                accept="application/pdf,.pdf"
                required
                disabled={isExtracting}
              />
              <p className="text-xs text-muted-foreground">
                PDF only, up to 10 MB. Do not upload student work or copyrighted
                commercial materials.
              </p>
            </div>
            {extractFetcher.data && !extractFetcher.data.success ? (
              <p role="alert" className="text-sm text-destructive">
                {extractFetcher.data.message ?? 'Unable to read that PDF.'}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isExtracting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!selectedClassId || isExtracting}>
                <Upload className="h-4 w-4" />
                {isExtracting ? 'Reading PDF…' : 'Extract for review'}
              </Button>
            </div>
          </extractFetcher.Form>
        ) : (
          <createFetcher.Form
            method="post"
            action="/api/assignments/create"
            className="mt-6 space-y-5"
          >
            <input type="hidden" name="intent" value="create-assignment" />
            <input type="hidden" name="apHistoryMode" value="pdf-import" />
            <input type="hidden" name="classIds" value={selectedClassId} />
            <input
              type="hidden"
              name="assignmentTypeId"
              value={assignmentTypeId}
            />
            <input
              type="hidden"
              name="apHistoryImportDigest"
              value={extracted.importDigest}
            />
            <input
              type="hidden"
              name="essayType"
              value={extracted.essayType ?? 'dbq'}
            />
            <input
              type="hidden"
              name="apHistorySourcesJson"
              value={JSON.stringify(
                sources.map(({ position, title, attribution, body }) => ({
                  position,
                  title,
                  attribution,
                  body,
                }))
              )}
            />
            <input
              type="hidden"
              name="tutorEnabled"
              value={String(tutorEnabled)}
            />
            <input
              type="hidden"
              name="submitForGrade"
              value={String(submitForGrade)}
            />
            <input
              type="hidden"
              name="publicDomainAttested"
              value={String(publicDomainAttested)}
            />

            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
              <Badge variant="secondary">
                {(extracted.essayType ?? 'dbq').toUpperCase()}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {sources.length} {sources.length === 1 ? 'source' : 'sources'}
                extracted
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => setExtracted(null)}
              >
                Choose another PDF
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ap-import-title">Assignment title</Label>
              <Input
                id="ap-import-title"
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ap-import-prompt">Prompt</Label>
              <Textarea
                id="ap-import-prompt"
                name="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={5}
                required
                disabled={isCreating}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ap-import-period">Period label</Label>
                <Input
                  id="ap-import-period"
                  name="period"
                  value={period}
                  onChange={(event) => setPeriod(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ap-import-period-number">Period number</Label>
                <Input
                  id="ap-import-period-number"
                  name="periodNumber"
                  type="number"
                  min={1}
                  max={9}
                  value={periodNumber}
                  onChange={(event) => setPeriodNumber(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Reasoning skill</Label>
                <Select
                  value={reasoningSkill}
                  onValueChange={setReasoningSkill}
                >
                  <SelectTrigger aria-label="AP History reasoning skill">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="causation">Causation</SelectItem>
                    <SelectItem value="comparison">Comparison</SelectItem>
                    <SelectItem value="continuity-and-change">
                      Continuity and change
                    </SelectItem>
                    <SelectItem value="periodization">Periodization</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  type="hidden"
                  name="reasoningSkill"
                  value={reasoningSkill}
                />
              </div>
              <div className="space-y-2">
                <Label>Timing</Label>
                <div className="flex gap-2">
                  <Select
                    value={timeMode}
                    onValueChange={(value: 'timed' | 'untimed') =>
                      setTimeMode(value)
                    }
                  >
                    <SelectTrigger aria-label="AP History timing mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="timed">Timed</SelectItem>
                      <SelectItem value="untimed">Untimed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    name="durationMinutes"
                    aria-label="Duration in minutes"
                    type="number"
                    min={1}
                    max={240}
                    value={durationMinutes}
                    onChange={(event) => setDurationMinutes(event.target.value)}
                    className="w-24"
                  />
                </div>
                <input type="hidden" name="timeMode" value={timeMode} />
              </div>
            </div>

            {sources.length > 0 ? (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Review {sources.length} extracted source
                  {sources.length === 1 ? '' : 's'}
                </summary>
                <div className="mt-3 max-h-72 space-y-3 overflow-y-auto">
                  {sources.map((source) => (
                    <article
                      key={source.position}
                      className="rounded-md bg-muted/40 p-3"
                    >
                      <p className="text-sm font-semibold">
                        Document {source.position}: {source.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {source.attribution}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-5">
                        {source.body}
                      </p>
                    </article>
                  ))}
                </div>
              </details>
            ) : null}

            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <Label htmlFor="ap-import-provenance">
                Public provenance URL
              </Label>
              <Input
                id="ap-import-provenance"
                name="provenanceUrl"
                type="url"
                placeholder="https://www.archives.gov/..."
                value={provenanceUrl}
                onChange={(event) => setProvenanceUrl(event.target.value)}
                required
              />
              <div className="flex items-start gap-2 pt-2">
                <Checkbox
                  id="ap-import-public-domain"
                  checked={publicDomainAttested}
                  onCheckedChange={(checked) =>
                    setPublicDomainAttested(checked === true)
                  }
                />
                <Label
                  htmlFor="ap-import-public-domain"
                  className="cursor-pointer text-sm font-normal leading-5"
                >
                  I verified that this assignment and its sources are in the
                  public domain and that the URL above documents their origin.
                </Label>
              </div>
            </div>

            <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="ap-import-tutor"
                  checked={tutorEnabled}
                  onCheckedChange={(checked) =>
                    setTutorEnabled(checked === true)
                  }
                />
                <Label htmlFor="ap-import-tutor" className="font-normal">
                  Enable AP History tutor
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="ap-import-graded"
                  checked={submitForGrade}
                  onCheckedChange={(checked) =>
                    setSubmitForGrade(checked === true)
                  }
                />
                <Label htmlFor="ap-import-graded" className="font-normal">
                  Submit for a grade
                </Label>
              </div>
              {submitForGrade ? (
                <div className="space-y-2">
                  <Label htmlFor="ap-import-points">Point value</Label>
                  <Input
                    id="ap-import-points"
                    name="pointValue"
                    type="number"
                    min={1}
                    max={1000}
                    value={pointValue}
                    onChange={(event) => setPointValue(event.target.value)}
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Grading strictness</Label>
                <Select
                  value={strictness}
                  onValueChange={(value) =>
                    setStrictness(value as typeof strictness)
                  }
                >
                  <SelectTrigger aria-label="Grading assistant strictness">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {gradingAssistantStrictnessOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="hidden"
                  name="gradingAssistantStrictnessLevel"
                  value={strictness}
                />
              </div>
            </div>

            {createFetcher.data && !createFetcher.data.success ? (
              <p role="alert" className="text-sm text-destructive">
                {createFetcher.data.message ?? 'Unable to create assignment.'}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pb-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canCreate || isCreating}>
                <ShieldCheck className="h-4 w-4" />
                {isCreating ? 'Creating…' : 'Create APUSH assignment'}
              </Button>
            </div>
          </createFetcher.Form>
        )}
      </SheetContent>
    </Sheet>
  );
}
