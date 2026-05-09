// Preview-only AssignmentType detail page for the AP History essay v1 spec.
// All data is mock; no persistence, no AI, no grading. The route renders the
// AssignmentType view described in the v1 spec
// (docs/plans/2026-05-09-ap-history-essay-spec-v1.md):
//
//   1. Header — back-to-dashboard, "AP History Essay" title, "New" entry-picker
//   2. Teacher directions + inspirational examples
//   3. Submissions accordion (empty mock)
//   4. Prompt Library — filter chips + sample-prompt table
//
// Entry-picker library/PDF/scratch paths and prompt-row clicks navigate to
// the builder wireframe at /app/assignment-types/:id/builder. The builder
// in turn cross-links to the student drafting and teacher grading
// wireframes.

import { useMemo, useState } from 'react';
import {
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Link, useLoaderData, useNavigate } from 'react-router';
import { ChevronDownIcon, FileUpIcon, LibraryIcon, PencilIcon } from 'lucide-react';
import { CaretLeftIcon } from '~/components/icons';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Separator } from '~/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { requireProfile, requireUserId } from '~/utils/auth.server';

const PREVIEW_ID = 'preview-ap-history-essay';

type EssayType = 'DBQ' | 'LEQ';
type Period = 'AP USH' | 'AP Euro' | 'AP World';
type Reasoning =
  | 'causation'
  | 'comparison'
  | 'continuity-and-change'
  | 'periodization';
type Difficulty = 'intro' | 'mid-year' | 'exam-ready';

type LibraryPrompt = {
  id: string;
  type: EssayType;
  period: Period;
  prompt: string;
  era: string;
  sourceCount: number | null;
  reasoning: Reasoning;
  skillEmphasis: string[];
  difficulty: Difficulty;
};

const SAMPLE_PROMPTS: LibraryPrompt[] = [
  {
    id: 'DBQ-USH-001',
    type: 'DBQ',
    period: 'AP USH',
    prompt:
      'Evaluate the extent to which the Reconstruction era (1865–1877) marked a turning point in the lives of formerly enslaved people.',
    era: 'Reconstruction',
    sourceCount: 7,
    reasoning: 'continuity-and-change',
    skillEmphasis: ['sourcing-heavy', 'complexity-heavy'],
    difficulty: 'mid-year',
  },
  {
    id: 'DBQ-USH-002',
    type: 'DBQ',
    period: 'AP USH',
    prompt:
      'Evaluate the extent to which the Progressive Era reforms (1890–1920) addressed the problems of industrialization.',
    era: 'Progressive Era',
    sourceCount: 7,
    reasoning: 'continuity-and-change',
    skillEmphasis: ['balanced'],
    difficulty: 'mid-year',
  },
  {
    id: 'DBQ-USH-003',
    type: 'DBQ',
    period: 'AP USH',
    prompt:
      'Evaluate the extent to which the Cold War shaped American domestic policy from 1945 to 1975.',
    era: 'Cold War',
    sourceCount: 6,
    reasoning: 'causation',
    skillEmphasis: ['contextualization-heavy'],
    difficulty: 'exam-ready',
  },
  {
    id: 'LEQ-USH-001',
    type: 'LEQ',
    period: 'AP USH',
    prompt:
      'Evaluate the relative importance of causes of the American Civil War.',
    era: 'Antebellum',
    sourceCount: null,
    reasoning: 'causation',
    skillEmphasis: ['outside-evidence-heavy'],
    difficulty: 'mid-year',
  },
  {
    id: 'LEQ-USH-002',
    type: 'LEQ',
    period: 'AP USH',
    prompt:
      'Compare the goals and outcomes of Reconstruction policies in the 1860s and 1870s.',
    era: 'Reconstruction',
    sourceCount: null,
    reasoning: 'comparison',
    skillEmphasis: ['balanced'],
    difficulty: 'mid-year',
  },
  {
    id: 'LEQ-USH-003',
    type: 'LEQ',
    period: 'AP USH',
    prompt:
      'Evaluate the extent to which the period from 1945 to 1980 represents a continuation of New Deal liberalism.',
    era: 'Postwar & Civil Rights',
    sourceCount: null,
    reasoning: 'continuity-and-change',
    skillEmphasis: ['complexity-heavy'],
    difficulty: 'exam-ready',
  },
  {
    id: 'DBQ-EUR-001',
    type: 'DBQ',
    period: 'AP Euro',
    prompt:
      'Evaluate the extent to which the Reformation transformed European political authority in the 16th century.',
    era: 'Reformation',
    sourceCount: 7,
    reasoning: 'continuity-and-change',
    skillEmphasis: ['complexity-heavy'],
    difficulty: 'mid-year',
  },
  {
    id: 'LEQ-EUR-001',
    type: 'LEQ',
    period: 'AP Euro',
    prompt: 'Compare the responses of European states to the French Revolution.',
    era: 'French Revolution',
    sourceCount: null,
    reasoning: 'comparison',
    skillEmphasis: ['balanced'],
    difficulty: 'mid-year',
  },
  {
    id: 'DBQ-WLD-001',
    type: 'DBQ',
    period: 'AP World',
    prompt:
      'Evaluate the extent to which trans-Saharan trade networks transformed West African societies between 1000 and 1450.',
    era: 'Post-Classical',
    sourceCount: 5,
    reasoning: 'continuity-and-change',
    skillEmphasis: ['contextualization-heavy'],
    difficulty: 'intro',
  },
  {
    id: 'LEQ-WLD-001',
    type: 'LEQ',
    period: 'AP World',
    prompt:
      'Evaluate the relative importance of factors that drove industrialization between 1750 and 1900.',
    era: 'Industrial',
    sourceCount: null,
    reasoning: 'causation',
    skillEmphasis: ['outside-evidence-heavy'],
    difficulty: 'exam-ready',
  },
];

const INSPIRATIONAL_EXAMPLES = [
  {
    type: 'DBQ' as EssayType,
    title: 'Reconstruction as a turning point',
    blurb:
      '7-source DBQ pushing students to argue continuity vs. change in the lives of formerly enslaved people, 1865–1877.',
  },
  {
    type: 'LEQ' as EssayType,
    title: 'Causes of the Civil War',
    blurb:
      'Causation LEQ — students rely entirely on outside evidence to weigh the relative importance of antebellum causes.',
  },
  {
    type: 'DBQ' as EssayType,
    title: 'Cold War & domestic policy',
    blurb:
      '6-source DBQ tuned for contextualization. Strong fit for late-year exam-prep practice.',
  },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  await requireProfile(request, userId);

  if (params.id !== PREVIEW_ID) {
    // Real AssignmentType routing isn't built yet. Bounce non-preview IDs
    // back to the dashboard so we don't render a half-broken page.
    return redirect('/app');
  }

  return dataResponse({
    assignmentType: {
      id: PREVIEW_ID,
      title: 'AP History Essay',
      description:
        'One AssignmentType for both DBQ and LEQ across AP US, European, and World History. Tutor and grading branch on essay type; same prompt library, same drill scopes, same calibration samples.',
    },
    submissions: {
      total: 0,
      inProgress: 0,
      submitted: 0,
      graded: 0,
      released: 0,
    },
    libraryPrompts: SAMPLE_PROMPTS,
    inspirationalExamples: INSPIRATIONAL_EXAMPLES,
  });
}

type EssayTypeFilter = EssayType | 'all';
type PeriodFilter = Period | 'all';
type ReasoningFilter = Reasoning | 'all';
type DifficultyFilter = Difficulty | 'all';

function builderHref(opts: {
  type: EssayType;
  from: 'library' | 'pdf' | 'scratch';
  promptId?: string;
}): string {
  const params = new URLSearchParams({
    type: opts.type.toLowerCase(),
    from: opts.from,
  });
  if (opts.promptId) params.set('promptId', opts.promptId);
  return `/app/assignment-types/${PREVIEW_ID}/builder?${params.toString()}`;
}

export default function AssignmentTypeApHistoryPreviewRoute() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [isEntryPickerOpen, setIsEntryPickerOpen] = useState(false);
  const [entryEssayType, setEntryEssayType] = useState<EssayType | null>(null);

  const [typeFilter, setTypeFilter] = useState<EssayTypeFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [reasoningFilter, setReasoningFilter] =
    useState<ReasoningFilter>('all');
  const [difficultyFilter, setDifficultyFilter] =
    useState<DifficultyFilter>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.libraryPrompts.filter((p) => {
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (periodFilter !== 'all' && p.period !== periodFilter) return false;
      if (reasoningFilter !== 'all' && p.reasoning !== reasoningFilter)
        return false;
      if (difficultyFilter !== 'all' && p.difficulty !== difficultyFilter)
        return false;
      if (q && !p.prompt.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [
    data.libraryPrompts,
    typeFilter,
    periodFilter,
    reasoningFilter,
    difficultyFilter,
    search,
  ]);

  function openEntryPicker() {
    setEntryEssayType(null);
    setIsEntryPickerOpen(true);
  }

  function pickPromptFromLibrary(p: LibraryPrompt) {
    navigate(
      builderHref({ type: p.type, from: 'library', promptId: p.id })
    );
  }

  return (
    <div className="no-scrollbar h-full w-full overflow-y-scroll">
      <div className="mx-auto flex h-full w-full max-w-screen-lg flex-col p-3 sm:p-5">
        {/* Header */}
        <div className="mb-4 flex justify-between gap-2">
          <Button asChild variant="outline">
            <Link to="/app" className="w-fit">
              <CaretLeftIcon className="mr-1 h-5 w-5" /> Back to dashboard
            </Link>
          </Button>
          <Button type="button" onClick={openEntryPicker} className="w-fit">
            New <ChevronDownIcon className="ml-1 h-4 w-4" />
          </Button>
        </div>

        <div className="mb-2 flex items-start gap-3">
          <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-200">
            Preview · v1 spec
          </Badge>
        </div>

        {/* Hero banner */}
        <div className="mb-4 overflow-hidden rounded-lg border bg-stone-100">
          <img
            src="/img/AP%20History%20Hero%20Image.png"
            alt="AP History — stick figure with quill, surrounded by AP USH / AP Euro / AP World motifs"
            className="h-48 w-full object-cover sm:h-64"
          />
        </div>
        <div className="mb-6 flex flex-col gap-3">
          <h1 className="text-3xl font-bold">{data.assignmentType.title}</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {data.assignmentType.description}
          </p>
        </div>

        {/* Teacher directions + inspirational examples */}
        <div className="mb-6 rounded-lg border bg-muted/40 p-4">
          <h3 className="mb-2 text-sm font-semibold">How AP History essays work in Yawp</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Each assignment is one prompt graded against the College Board rubric
            (7-pt DBQ or 6-pt LEQ). The tutor coaches in genre-specific phases —
            DBQ runs source analysis → thesis → contextualization → drafting →
            revision; LEQ collapses to thesis → context + evidence brainstorm →
            drafting → revision. The grading assistant scores additively against
            the rubric, anchored on calibration samples, and surfaces named
            failure-mode flags (walking-through-documents, HIPP-without-relevance,
            generic-context, period-bleed). Hit <code className="px-1">New</code>{' '}
            above to start from the prompt library, upload a College Board PDF,
            or build from scratch.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {data.inspirationalExamples.map((ex) => (
              <div
                key={ex.title}
                className="rounded border bg-background p-3 text-sm"
              >
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="secondary" size="sm">
                    {ex.type}
                  </Badge>
                  <span className="font-medium">{ex.title}</span>
                </div>
                <p className="text-xs text-muted-foreground">{ex.blurb}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Submissions */}
        <Accordion type="single" collapsible defaultValue="submissions">
          <AccordionItem value="submissions">
            <AccordionTrigger className="text-base">
              Submissions
              <span className="ml-2 text-sm text-muted-foreground">
                {data.submissions.total} total
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-wrap gap-2 pb-3">
                <Badge variant="outline">DBQ</Badge>
                <Badge variant="outline">LEQ</Badge>
                <Badge variant="outline">All</Badge>
              </div>
              <div className="rounded border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                No submissions yet. Once students start drafting, this section
                will track in-progress, submitted, graded, and released essays —
                filterable by DBQ vs. LEQ.
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Separator className="my-2" />

        {/* Prompt Library */}
        <Accordion type="single" collapsible defaultValue="library">
          <AccordionItem value="library">
            <AccordionTrigger className="text-base">
              Prompt Library
              <span className="ml-2 text-sm text-muted-foreground">
                {filtered.length} of {data.libraryPrompts.length}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {/* Filter chip rows */}
              <div className="mb-3 space-y-2">
                <FilterChipRow
                  label="Essay type"
                  value={typeFilter}
                  onChange={(v) => setTypeFilter(v as EssayTypeFilter)}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'DBQ', label: 'DBQ' },
                    { value: 'LEQ', label: 'LEQ' },
                  ]}
                />
                <FilterChipRow
                  label="Period"
                  value={periodFilter}
                  onChange={(v) => setPeriodFilter(v as PeriodFilter)}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'AP USH', label: 'AP USH' },
                    { value: 'AP Euro', label: 'AP Euro' },
                    { value: 'AP World', label: 'AP World' },
                  ]}
                />
                <FilterChipRow
                  label="Reasoning"
                  value={reasoningFilter}
                  onChange={(v) => setReasoningFilter(v as ReasoningFilter)}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'causation', label: 'Causation' },
                    { value: 'comparison', label: 'Comparison' },
                    {
                      value: 'continuity-and-change',
                      label: 'Continuity & change',
                    },
                    { value: 'periodization', label: 'Periodization' },
                  ]}
                />
                <FilterChipRow
                  label="Difficulty"
                  value={difficultyFilter}
                  onChange={(v) => setDifficultyFilter(v as DifficultyFilter)}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'intro', label: 'Intro' },
                    { value: 'mid-year', label: 'Mid-year' },
                    { value: 'exam-ready', label: 'Exam-ready' },
                  ]}
                />
                <div className="pt-1">
                  <Input
                    placeholder="Search prompt body…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
              </div>

              {/* Prompts table */}
              <div className="overflow-x-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Type</TableHead>
                      <TableHead className="w-[100px]">Period</TableHead>
                      <TableHead>Prompt</TableHead>
                      <TableHead className="w-[120px]">Era</TableHead>
                      <TableHead className="w-[60px] text-right">Docs</TableHead>
                      <TableHead className="w-[140px]">Reasoning</TableHead>
                      <TableHead className="w-[110px]">Difficulty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center text-sm text-muted-foreground py-8"
                        >
                          No prompts match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((p) => (
                        <TableRow
                          key={p.id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => pickPromptFromLibrary(p)}
                        >
                          <TableCell>
                            <Badge
                              variant={p.type === 'DBQ' ? 'default' : 'secondary'}
                              size="sm"
                            >
                              {p.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{p.period}</TableCell>
                          <TableCell className="text-sm">{p.prompt}</TableCell>
                          <TableCell className="text-xs">{p.era}</TableCell>
                          <TableCell className="text-right text-xs">
                            {p.sourceCount ?? '—'}
                          </TableCell>
                          <TableCell className="text-xs">{p.reasoning}</TableCell>
                          <TableCell className="text-xs">{p.difficulty}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Cross-link footer to the rest of the prototype loop */}
        <div className="mt-8 rounded-lg border bg-muted/30 p-4">
          <p className="mb-1 text-sm font-semibold">Wireframe loop</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Click a prompt above to land in the builder, or jump straight to
            the student drafting surface or teacher grading view to feel the
            other ends of the loop.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={builderHref({ type: 'DBQ', from: 'scratch' })}>
                Open builder (DBQ)
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={builderHref({ type: 'LEQ', from: 'scratch' })}>
                Open builder (LEQ)
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link
                to={`/app/assignment-types/${PREVIEW_ID}/draft?type=dbq`}
              >
                Student drafting (DBQ)
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link
                to={`/app/assignment-types/${PREVIEW_ID}/draft?type=leq`}
              >
                Student drafting (LEQ)
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link
                to={`/app/assignment-types/${PREVIEW_ID}/grade?type=dbq`}
              >
                Teacher grading (DBQ)
              </Link>
            </Button>
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Preview wireframes driven by mock data. PDF parsing, real-time tutor
          coaching, persistence, and AI grading are described in the v1 spec
          but not implemented.
        </p>
      </div>

      {/* Entry-picker dialog */}
      <Dialog open={isEntryPickerOpen} onOpenChange={setIsEntryPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {entryEssayType
                ? `New ${entryEssayType} assignment`
                : 'New AP History essay'}
            </DialogTitle>
            <DialogDescription>
              {entryEssayType
                ? 'How do you want to start?'
                : 'Pick the essay type to continue.'}
            </DialogDescription>
          </DialogHeader>

          {entryEssayType === null ? (
            <div className="flex flex-col gap-2 pt-2">
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => setEntryEssayType('DBQ')}
              >
                <span className="font-semibold mr-2">DBQ</span>
                <span className="text-muted-foreground text-xs">
                  Document-Based Question · 7-pt rubric · 60 min
                </span>
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => setEntryEssayType('LEQ')}
              >
                <span className="font-semibold mr-2">LEQ</span>
                <span className="text-muted-foreground text-xs">
                  Long Essay Question · 6-pt rubric · 40 min
                </span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-2">
              <Button asChild variant="outline" className="justify-start h-auto py-3">
                <Link
                  to={builderHref({ type: entryEssayType, from: 'library' })}
                  onClick={() => setIsEntryPickerOpen(false)}
                >
                  <LibraryIcon className="mr-3 h-5 w-5 shrink-0" />
                  <div className="flex flex-col items-start text-left">
                    <span className="font-semibold">Pick from the Prompt Library</span>
                    <span className="text-xs text-muted-foreground">
                      Curated essays across USH, Euro, and World.
                    </span>
                  </div>
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start h-auto py-3">
                <Link
                  to={builderHref({ type: entryEssayType, from: 'pdf' })}
                  onClick={() => setIsEntryPickerOpen(false)}
                >
                  <FileUpIcon className="mr-3 h-5 w-5 shrink-0" />
                  <div className="flex flex-col items-start text-left">
                    <span className="font-semibold">Upload a PDF</span>
                    <span className="text-xs text-muted-foreground">
                      Upload a College Board essay or department PDF — Yawp
                      parses the prompt (and sources, for DBQs). You confirm.
                    </span>
                  </div>
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start h-auto py-3">
                <Link
                  to={builderHref({ type: entryEssayType, from: 'scratch' })}
                  onClick={() => setIsEntryPickerOpen(false)}
                >
                  <PencilIcon className="mr-3 h-5 w-5 shrink-0" />
                  <div className="flex flex-col items-start text-left">
                    <span className="font-semibold">Build from scratch</span>
                    <span className="text-xs text-muted-foreground">
                      Type the prompt, paste sources, set period, save.
                    </span>
                  </div>
                </Link>
              </Button>
              <p className="pt-2 text-xs text-muted-foreground">
                All three paths land on the same builder wireframe; library
                pre-fills the prompt and (DBQ-only) source set, PDF and
                from-scratch arrive empty.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setEntryEssayType(null)}
              >
                ← Back to essay type
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterChipRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={
              'rounded-full border px-3 py-1 text-xs transition-colors ' +
              (active
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background text-foreground/80 hover:bg-muted')
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
