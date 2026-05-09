// Preview-only DBQ/LEQ Builder wireframe. The three authoring entry paths
// (library / PDF / from scratch) all converge here per the v1 spec. Mock
// data only; nothing persists. Switches between DBQ and LEQ shape based on
// ?type=dbq|leq.

import { useMemo, useState } from 'react';
import {
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Link, useLoaderData, useSearchParams } from 'react-router';
import { GripVerticalIcon, PencilIcon, PlusIcon, XIcon } from 'lucide-react';
import { CaretLeftIcon } from '~/components/icons';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import { Separator } from '~/components/ui/separator';
import { Textarea } from '~/components/ui/textarea';
import { requireProfile, requireUserId } from '~/utils/auth.server';

const PREVIEW_ID = 'preview-ap-history-essay';

type EssayType = 'dbq' | 'leq';
type Period = 'ap-ush' | 'ap-euro' | 'ap-world';
type TimeMode = 'untimed' | 'timed';

type SourceCard = {
  id: string;
  title: string;
  attribution: string;
  body: string;
};

const SAMPLE_DBQ_PROMPT =
  'Evaluate the extent to which the Reconstruction era (1865–1877) marked a turning point in the lives of formerly enslaved people.';

const SAMPLE_LEQ_PROMPT =
  'Evaluate the relative importance of causes of the American Civil War.';

const SAMPLE_SOURCES: SourceCard[] = [
  {
    id: 'src-1',
    title: 'Doc 1 — Petition from a Freedmen’s Convention',
    attribution: 'Black Virginia delegates, June 1865',
    body:
      'We the colored people of Virginia… demand that we be permitted the rights of citizens, the protection of the laws, and the use of the ballot…',
  },
  {
    id: 'src-2',
    title: 'Doc 2 — Black Codes, State of Mississippi',
    attribution: 'Mississippi state legislature, 1865',
    body:
      'Every freedman, free negro, and mulatto shall, on the second Monday of January, 1866, and annually thereafter, have a lawful home or employment…',
  },
  {
    id: 'src-3',
    title: 'Doc 3 — Letter from a Freedmen’s Bureau Agent',
    attribution: 'Capt. R. S. Donaldson to Gen. O. O. Howard, 1866',
    body:
      'The freedmen are eager for schools and for the means of self-improvement, but the planters in this region resist their efforts at every turn…',
  },
  {
    id: 'src-4',
    title: 'Doc 4 — Sharecropping Contract',
    attribution: 'Greene County, Georgia, 1872',
    body:
      'The said laborer shall furnish his own labor and tools… the proprietor shall furnish the land and one-half of the seed…',
  },
  {
    id: 'src-5',
    title: 'Doc 5 — Editorial on the Compromise of 1877',
    attribution: 'Atlanta Constitution, March 1877',
    body:
      'The withdrawal of federal troops from Louisiana and South Carolina marks an end to bayonet rule and a new dawn for self-government…',
  },
  {
    id: 'src-6',
    title: 'Doc 6 — Speech on the 15th Amendment',
    attribution: 'Frederick Douglass, 1870',
    body:
      'Slavery is not abolished until the black man has the ballot. The right to vote is the most important political right…',
  },
  {
    id: 'src-7',
    title: 'Doc 7 — Photograph: Freedmen’s school, Beaufort, SC',
    attribution: 'Library of Congress, c. 1866 (image-only — caption preserved)',
    body:
      '[Image-only source. Parser flagged: image extraction pending. Teacher to decide whether to include or replace with text proxy.]',
  },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  await requireProfile(request, userId);

  if (params.id !== PREVIEW_ID) {
    return redirect('/app');
  }

  return dataResponse({});
}

export default function AssignmentTypeApHistoryBuilderRoute() {
  const [searchParams] = useSearchParams();
  useLoaderData<typeof loader>();

  const initialType = (searchParams.get('type') === 'leq' ? 'leq' : 'dbq') as EssayType;
  const fromParam = searchParams.get('from'); // 'library' | 'pdf' | 'scratch'
  const promptIdParam = searchParams.get('promptId');

  const [essayType, setEssayType] = useState<EssayType>(initialType);
  const [prompt, setPrompt] = useState(
    fromParam === 'library'
      ? essayType === 'dbq'
        ? SAMPLE_DBQ_PROMPT
        : SAMPLE_LEQ_PROMPT
      : ''
  );
  const [period, setPeriod] = useState<Period>('ap-ush');
  const [timeMode, setTimeMode] = useState<TimeMode>('untimed');
  const [sources, setSources] = useState<SourceCard[]>(
    essayType === 'dbq' && fromParam === 'library' ? SAMPLE_SOURCES : []
  );

  const totalMinutes = essayType === 'dbq' ? 60 : 40;

  const sourceCount = sources.length;
  const sourceCountValid =
    essayType === 'leq' ? true : sourceCount >= 5 && sourceCount <= 7;

  const headerLabel = useMemo(() => {
    const label = essayType === 'dbq' ? 'DBQ Builder' : 'LEQ Builder';
    if (fromParam === 'library' && promptIdParam) {
      return `${label} · from library (${promptIdParam})`;
    }
    if (fromParam === 'pdf') return `${label} · from PDF upload`;
    if (fromParam === 'scratch') return `${label} · from scratch`;
    return label;
  }, [essayType, fromParam, promptIdParam]);

  function addSource() {
    setSources((s) => [
      ...s,
      {
        id: `src-${Date.now()}`,
        title: `Doc ${s.length + 1} — `,
        attribution: '',
        body: '',
      },
    ]);
  }

  function removeSource(id: string) {
    setSources((s) => s.filter((src) => src.id !== id));
  }

  function moveSource(id: string, dir: -1 | 1) {
    setSources((s) => {
      const idx = s.findIndex((src) => src.id === id);
      if (idx < 0) return s;
      const next = idx + dir;
      if (next < 0 || next >= s.length) return s;
      const copy = [...s];
      const [item] = copy.splice(idx, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  }

  function updateSource(id: string, patch: Partial<SourceCard>) {
    setSources((s) =>
      s.map((src) => (src.id === id ? { ...src, ...patch } : src))
    );
  }

  return (
    <div className="no-scrollbar h-full w-full overflow-y-scroll">
      <div className="mx-auto flex h-full w-full max-w-screen-md flex-col p-3 sm:p-5">
        <div className="mb-4 flex justify-between gap-2">
          <Button asChild variant="outline">
            <Link
              to={`/app/assignment-types/${PREVIEW_ID}`}
              className="w-fit"
            >
              <CaretLeftIcon className="mr-1 h-5 w-5" /> Back to AP History
              Essay
            </Link>
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled>
              Save as draft
            </Button>
            <Button disabled={!sourceCountValid}>Save &amp; assign</Button>
          </div>
        </div>

        <Badge
          variant="outline"
          className="mb-3 w-fit bg-amber-50 text-amber-900 border-amber-200"
        >
          Preview · wireframe — nothing saves
        </Badge>

        <h1 className="mb-1 text-2xl font-bold">{headerLabel}</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {essayType === 'dbq'
            ? 'Document-Based Question — 7-point College Board rubric. Reading 15 min + writing 45 min when timed.'
            : 'Long Essay Question — 6-point College Board rubric. 40 min total when timed; no documents.'}
        </p>

        {/* Essay type toggle */}
        <div className="mb-6 inline-flex w-fit overflow-hidden rounded-lg border">
          <button
            type="button"
            onClick={() => setEssayType('dbq')}
            className={
              'px-4 py-2 text-sm transition-colors ' +
              (essayType === 'dbq'
                ? 'bg-foreground text-background'
                : 'bg-background text-foreground/80 hover:bg-muted')
            }
          >
            DBQ
          </button>
          <button
            type="button"
            onClick={() => {
              setEssayType('leq');
              setSources([]);
            }}
            className={
              'px-4 py-2 text-sm transition-colors ' +
              (essayType === 'leq'
                ? 'bg-foreground text-background'
                : 'bg-background text-foreground/80 hover:bg-muted')
            }
          >
            LEQ
          </button>
        </div>

        {/* Prompt */}
        <div className="mb-6 flex flex-col gap-2">
          <Label htmlFor="prompt-body" className="text-sm font-semibold">
            Prompt
          </Label>
          <Textarea
            id="prompt-body"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Evaluate the extent to which…"
          />
        </div>

        {/* Period + time mode */}
        <div className="mb-6 grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-semibold">Period</Label>
            <RadioGroup
              value={period}
              onValueChange={(v) => setPeriod(v as Period)}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="ap-ush" id="period-ush" />
                <Label htmlFor="period-ush" className="text-sm font-normal">
                  AP US History
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="ap-euro" id="period-euro" disabled />
                <Label
                  htmlFor="period-euro"
                  className="text-sm font-normal text-muted-foreground"
                >
                  AP European History (post-v1)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="ap-world" id="period-world" disabled />
                <Label
                  htmlFor="period-world"
                  className="text-sm font-normal text-muted-foreground"
                >
                  AP World History (post-v1)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm font-semibold">Time mode</Label>
            <RadioGroup
              value={timeMode}
              onValueChange={(v) => setTimeMode(v as TimeMode)}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="untimed" id="time-untimed" />
                <Label htmlFor="time-untimed" className="text-sm font-normal">
                  Untimed (default)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="timed" id="time-timed" />
                <Label htmlFor="time-timed" className="text-sm font-normal">
                  Timed ({totalMinutes} min)
                </Label>
              </div>
            </RadioGroup>
            {timeMode === 'timed' && essayType === 'dbq' ? (
              <p className="text-xs text-muted-foreground">
                15 min reading (editor locked) + 45 min writing.
              </p>
            ) : null}
            {timeMode === 'timed' && essayType === 'leq' ? (
              <p className="text-xs text-muted-foreground">
                40 min single window; planning sidebar always available.
              </p>
            ) : null}
          </div>
        </div>

        {/* Sources (DBQ only) */}
        {essayType === 'dbq' ? (
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-semibold">
                Sources ({sourceCount}/7)
              </Label>
              <Button
                size="sm"
                variant="outline"
                onClick={addSource}
                disabled={sourceCount >= 7}
              >
                <PlusIcon className="mr-1 h-4 w-4" /> Add source
              </Button>
            </div>
            {!sourceCountValid ? (
              <p className="mb-2 text-xs text-amber-700">
                DBQs require 5–7 sources. You currently have {sourceCount}.
              </p>
            ) : null}
            <div className="flex flex-col gap-3">
              {sources.length === 0 ? (
                <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No sources yet. Hit{' '}
                  <code className="px-1">Add source</code> or upload a PDF to
                  parse one in.
                </div>
              ) : (
                sources.map((src, idx) => (
                  <SourceEditor
                    key={src.id}
                    index={idx}
                    source={src}
                    onChange={(patch) => updateSource(src.id, patch)}
                    onRemove={() => removeSource(src.id)}
                    onMoveUp={() => moveSource(src.id, -1)}
                    onMoveDown={() => moveSource(src.id, 1)}
                    canMoveUp={idx > 0}
                    canMoveDown={idx < sources.length - 1}
                  />
                ))
              )}
            </div>
          </div>
        ) : null}

        <Separator className="my-2" />

        {/* Rubric */}
        <div className="mb-6 flex items-center justify-between rounded border bg-muted/30 p-3">
          <div>
            <p className="text-sm font-semibold">
              {essayType === 'dbq'
                ? 'Rubric: College Board 7-point DBQ'
                : 'Rubric: College Board 6-point LEQ'}
            </p>
            <p className="text-xs text-muted-foreground">
              Verbatim at v1. Errors don’t subtract; tutor surfaces failure-mode
              flags inline.
            </p>
          </div>
          <Button variant="ghost" size="sm" disabled>
            Preview rubric
          </Button>
        </div>

        {/* Course / due date */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="course" className="text-sm font-semibold">
              Course / section
            </Label>
            <Input
              id="course"
              placeholder="e.g. APUSH · Period 3"
              disabled
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="due-date" className="text-sm font-semibold">
              Due
            </Label>
            <Input id="due-date" type="date" disabled />
          </div>
        </div>

        <p className="mb-2 text-xs text-muted-foreground">
          Course/section and due-date controls are disabled in the preview —
          they’ll wire up to the existing assignment-create flow when the
          AssignmentType lands.
        </p>

        <div className="mt-4 flex justify-between gap-2">
          <Button variant="ghost" asChild>
            <Link to={`/app/assignment-types/${PREVIEW_ID}`}>Discard</Link>
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled>
              Save as draft
            </Button>
            <Button disabled={!sourceCountValid}>Save &amp; assign</Button>
          </div>
        </div>

        {/* Cross-link to drafting + grading wireframes for the prototype */}
        <div className="mt-10 rounded border bg-muted/30 p-4">
          <p className="mb-2 text-sm font-semibold">
            Continue the prototype loop
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            The builder is the teacher’s entry point. To see how a published
            assignment looks for a student or a grading teacher, jump into the
            other wireframes:
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link
                to={`/app/assignment-types/${PREVIEW_ID}/draft?type=${essayType}`}
              >
                Open student drafting surface
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link
                to={`/app/assignment-types/${PREVIEW_ID}/grade?type=${essayType}`}
              >
                Open teacher grading view
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceEditor({
  index,
  source,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  index: number;
  source: SourceCard;
  onChange: (patch: Partial<SourceCard>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded border bg-background p-3">
      <div className="flex items-start gap-2">
        <GripVerticalIcon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Source {index + 1}
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onMoveUp}
                disabled={!canMoveUp}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onMoveDown}
                disabled={!canMoveDown}
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((v) => !v)}
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onRemove}>
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Input
            value={source.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Title"
            className="mb-2"
          />
          <Input
            value={source.attribution}
            onChange={(e) => onChange({ attribution: e.target.value })}
            placeholder="Attribution"
            className="mb-2"
          />
          {expanded ? (
            <Textarea
              value={source.body}
              onChange={(e) => onChange({ body: e.target.value })}
              rows={4}
              placeholder="Source body…"
            />
          ) : (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {source.body || '(empty body)'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
