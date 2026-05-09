// Preview-only teacher grading view. Single-essay mode (default) shows the
// student submission with the College Board rubric panel populated by mock
// GA output. Column-wise mode and the calibration drawer are sketched as
// open/closed states. Blind toggle hides student names. Mock data only.

import { useMemo, useState } from 'react';
import {
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Link, useLoaderData, useSearchParams } from 'react-router';
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EyeOffIcon,
  XIcon,
} from 'lucide-react';
import { CaretLeftIcon } from '~/components/icons';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Switch } from '~/components/ui/switch';
import { requireProfile, requireUserId } from '~/utils/auth.server';

const PREVIEW_ID = 'preview-ap-history-essay';

type EssayType = 'dbq' | 'leq';
type Mode = 'single' | 'column';
type GaState = 'earned' | 'not-earned' | 'borderline';
type TeacherState = 'pending' | 'confirmed' | 'overridden';

type RubricRow = {
  id: string;
  category: string;
  points: 1;
  ga: GaState;
  gaJustification: string;
  evidenceQuote?: string;
  failureModes?: string[];
  snippets: string[];
};

const DBQ_RUBRIC_ROWS: RubricRow[] = [
  {
    id: 'thesis',
    category: 'Thesis / Claim',
    points: 1,
    ga: 'earned',
    gaJustification:
      'Defensible claim with line of reasoning. Qualification ("Although Reconstruction nominally extended citizenship…, the period was characterized primarily by a retreat") signals analytic categories.',
    evidenceQuote:
      '…the period from 1865 to 1877 was characterized primarily by a retreat from full equality, driven by violent southern resistance, the entrenchment of new labor systems…',
    snippets: [
      'Strong qualification — line of reasoning is clear.',
      'Thesis names the analytic categories the body addresses.',
    ],
  },
  {
    id: 'context',
    category: 'Contextualization',
    points: 1,
    ga: 'not-earned',
    gaJustification:
      'No standalone contextualization paragraph. Essay opens directly with thesis. The historical setup needed to "see how it sets up the prompt" is missing.',
    failureModes: ['generic-context'],
    snippets: [
      'Essay opens with thesis — try a 2–3 sentence context paragraph naming what came before 1865.',
      'Specific arc, not a phrase. "It was a turbulent time" earns nothing.',
    ],
  },
  {
    id: 'doc-use-i',
    category: 'Evidence — Document Use I',
    points: 1,
    ga: 'earned',
    gaJustification:
      'Describes content of 6 of 7 documents (D1, D2, D3, D4, D5, D6). Threshold is 3.',
    snippets: ['Strong document description across the essay.'],
  },
  {
    id: 'doc-use-ii',
    category: 'Evidence — Document Use II',
    points: 1,
    ga: 'earned',
    gaJustification:
      'Uses D2, D3, D4 as a labor-coercion cluster and D1, D6 as a pro-inclusion cluster — documents support a thesis-aligned argument, not a walk-through.',
    evidenceQuote:
      '…Read alongside the Bureau agent\'s testimony in [D3], the documents collectively show that white planters used both legal and extralegal violence…',
    snippets: [
      'Thematic clustering — documents support sub-arguments.',
      'No walking-through-documents pattern detected.',
    ],
  },
  {
    id: 'outside',
    category: 'Evidence — Outside Evidence',
    points: 1,
    ga: 'earned',
    gaJustification:
      'Names Slaughterhouse Cases (1873), Compromise of 1877, and Ku Klux Klan as outside evidence. All inside the prompt\'s 1865–1877 window.',
    evidenceQuote:
      '…the Compromise of 1877 itself, the Reconstruction Amendments\' erosion in cases such as the Slaughterhouse Cases (1873), and the rise of the Ku Klux Klan…',
    snippets: [
      'Three named anchors, period-correct.',
      'Specificity meets the bar — no generic-outside-evidence flag.',
    ],
  },
  {
    id: 'sourcing',
    category: 'Analysis & Reasoning — Sourcing (HIPP)',
    points: 1,
    ga: 'borderline',
    gaJustification:
      'Sourcing-with-relevance for D3 is explicit ("internal Bureau correspondence — not public advocacy — and so reflects what officials were actually seeing"). The threshold is 2 documents. D5 is gestured at ("read against the rest of the documents, a euphemism") but the HIPP element is implicit, not named. Borderline — recommend reviewing.',
    evidenceQuote:
      '(Donaldson\'s letter, addressed to Gen. Howard, is significant precisely because it is internal Bureau correspondence — not public advocacy…)',
    failureModes: ['HIPP-without-relevance'],
    snippets: [
      'One full sourcing move (D3). Need a second to clear the bar.',
      'D5 has an implicit POV move — try naming it explicitly.',
    ],
  },
  {
    id: 'complexity',
    category: 'Analysis & Reasoning — Complexity',
    points: 1,
    ga: 'earned',
    gaJustification:
      'Qualification structure runs through the essay: opening "Although…", closing "marked a profound turning point in legal status — but a far smaller one in lived experience." Sustained, not a token sentence.',
    evidenceQuote:
      'Reconstruction, then, marked a profound turning point in legal status — but a far smaller one in lived experience.',
    snippets: [
      'Sustained qualification — not a length-not-sophistication flag.',
      'Closing sentence locks in the complexity move.',
    ],
  },
];

const LEQ_RUBRIC_ROWS: RubricRow[] = [
  {
    id: 'thesis',
    category: 'Thesis / Claim',
    points: 1,
    ga: 'earned',
    gaJustification: 'Defensible claim with line of reasoning.',
    snippets: ['Strong thesis.'],
  },
  {
    id: 'context',
    category: 'Contextualization',
    points: 1,
    ga: 'borderline',
    gaJustification:
      'Brief setup of antebellum tensions; could push for more specificity.',
    snippets: ['Try a more specific arc.'],
  },
  {
    id: 'evidence-i',
    category: 'Evidence I',
    points: 1,
    ga: 'earned',
    gaJustification: 'Names 4+ specific examples.',
    snippets: ['Solid evidence breadth.'],
  },
  {
    id: 'evidence-ii',
    category: 'Evidence II',
    points: 1,
    ga: 'earned',
    gaJustification: 'Evidence used as argument, not list.',
    snippets: [],
  },
  {
    id: 'reasoning',
    category: 'Analysis & Reasoning — Historical reasoning',
    points: 1,
    ga: 'earned',
    gaJustification: 'Causation structure reflected in argument.',
    snippets: [],
  },
  {
    id: 'complexity',
    category: 'Analysis & Reasoning — Complexity',
    points: 1,
    ga: 'not-earned',
    gaJustification: 'No qualification or multi-causal move present.',
    failureModes: ['length-not-sophistication'],
    snippets: ['Try one while/although sentence in the conclusion.'],
  },
];

const STUDENT_ESSAY_BODY = `Although Reconstruction nominally extended citizenship and the franchise to formerly enslaved people, the period from 1865 to 1877 was characterized primarily by a retreat from full equality, driven by violent southern resistance, the entrenchment of new labor systems that approximated slavery, and the federal government's eventual withdrawal of protection.

In the immediate aftermath of emancipation, freedpeople made bold claims for political inclusion. [D1] shows Black Virginians demanding the ballot in the language of citizenship, framing political rights as the natural extension of their wartime loyalty. Frederick Douglass made the same argument nationally, insisting in [D6] that suffrage was the precondition for any meaningful freedom.

Yet the structural response was retrenchment. [D2] codified Mississippi's Black Codes, which compelled freedpeople into year-long labor contracts under threat of vagrancy charges. The sharecropping contract in [D4] shows how this logic outlasted the Codes themselves. Read alongside the Bureau agent's testimony in [D3], the documents collectively show that white planters used both legal and extralegal violence to constrain the labor and movement of freedpeople. (Donaldson's letter, addressed to Gen. Howard, is significant precisely because it is internal Bureau correspondence — not public advocacy — and so reflects what officials were actually seeing on the ground.)

[D5] marks the political endpoint: the editorial's celebration of "self-government" is, read against the rest of the documents, a euphemism for the abandonment of federal protection. Outside the documents, the Compromise of 1877 itself, the Reconstruction Amendments' erosion in cases such as the Slaughterhouse Cases (1873), and the rise of the Ku Klux Klan all reinforce the same trajectory.

Reconstruction, then, marked a profound turning point in legal status — but a far smaller one in lived experience. By 1877 the formal scaffolding of citizenship existed; the substantive freedom it was meant to secure did not.`;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  await requireProfile(request, userId);

  if (params.id !== PREVIEW_ID) {
    return redirect('/app');
  }

  return dataResponse({});
}

type RowState = Record<string, { state: TeacherState; finalEarned: boolean }>;

export default function AssignmentTypeApHistoryGradeRoute() {
  const [searchParams] = useSearchParams();
  useLoaderData<typeof loader>();

  const essayType = (searchParams.get('type') === 'leq' ? 'leq' : 'dbq') as EssayType;
  const rows = essayType === 'dbq' ? DBQ_RUBRIC_ROWS : LEQ_RUBRIC_ROWS;
  const max = rows.length;

  const [mode, setMode] = useState<Mode>('single');
  const [blind, setBlind] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);

  const [rowState, setRowState] = useState<RowState>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.id,
        {
          state: 'pending' as TeacherState,
          finalEarned: r.ga === 'earned',
        },
      ])
    )
  );

  function setRow(id: string, patch: Partial<RowState[string]>) {
    setRowState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  }

  const score = useMemo(
    () => rows.filter((r) => rowState[r.id].finalEarned).length,
    [rows, rowState]
  );

  const allConfirmed = rows.every(
    (r) => rowState[r.id].state !== 'pending'
  );

  return (
    <div className="flex h-full w-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b bg-background px-3 py-2 sm:px-5">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/app/assignment-types/${PREVIEW_ID}`}>
              <CaretLeftIcon className="mr-1 h-4 w-4" /> Exit
            </Link>
          </Button>
          <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-200">
            Preview · teacher grading view
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={
                'px-3 py-1 text-xs transition-colors ' +
                (mode === 'single'
                  ? 'bg-foreground text-background'
                  : 'bg-background text-foreground/80 hover:bg-muted')
              }
            >
              Single essay
            </button>
            <button
              type="button"
              onClick={() => setMode('column')}
              className={
                'px-3 py-1 text-xs transition-colors ' +
                (mode === 'column'
                  ? 'bg-foreground text-background'
                  : 'bg-background text-foreground/80 hover:bg-muted')
              }
            >
              Column-wise
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <EyeOffIcon className="h-3 w-3" />
            <span>Blind</span>
            <Switch checked={blind} onCheckedChange={setBlind} />
          </div>
        </div>
      </div>

      {/* Submission header */}
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-sm sm:px-5">
        <div className="flex items-center gap-3">
          <span className="font-semibold">
            {blind ? 'Student #14' : 'Maya Thompson'}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">
            APUSH · Period 3 · {essayType.toUpperCase()} · Reconstruction era
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCalibrationOpen((v) => !v)}
        >
          {calibrationOpen ? 'Close' : 'Open'} calibration drawer
        </Button>
      </div>

      {/* Calibration drawer */}
      {calibrationOpen ? (
        <div className="border-b bg-amber-50/60 px-3 py-3 sm:px-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Calibration samples (high / mid / low) for this prompt
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCalibrationOpen(false)}
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              {
                label: 'High',
                score: '7/7',
                blurb:
                  'All seven points. Sustained qualification, two HIPP-with-relevance moves, two specific outside-evidence anchors.',
              },
              {
                label: 'Mid',
                score: '4/7',
                blurb:
                  'Thesis ✓, doc use I/II ✓, doc use as argument ✓. Misses contextualization, sourcing, and complexity.',
              },
              {
                label: 'Low',
                score: '2/7',
                blurb:
                  'Thesis ✓, doc use I ✓. Walking-through-documents pattern; no outside evidence; no qualification.',
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded border bg-background p-2 text-xs"
              >
                <div className="mb-1 flex items-center justify-between">
                  <Badge variant="secondary">{s.label}</Badge>
                  <span className="font-mono">{s.score}</span>
                </div>
                <p className="text-muted-foreground">{s.blurb}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Mirrors the College Board 1A/1B/1C release format. The GA also
            uses these as in-context anchors when scoring.
          </p>
        </div>
      ) : null}

      {mode === 'single' ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Essay body */}
          <div className="flex-1 overflow-y-auto border-r bg-background px-6 py-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Submission
            </h2>
            <article className="whitespace-pre-line text-sm leading-relaxed">
              {STUDENT_ESSAY_BODY}
            </article>

            <Separator className="my-6" />

            <div className="rounded border bg-muted/30 p-3 text-xs">
              <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                Errors-don't-subtract advisory
              </p>
              <p className="text-muted-foreground">
                Two minor advisory notes (not part of rubric scoring): one
                comma splice in ¶3; "Donaldson" misspelled once as
                "Donalson". Surfaced for the teacher only — they don't affect
                point coverage and the GA suppresses them from the rubric
                scoring path.
              </p>
            </div>
          </div>

          {/* Rubric panel */}
          <div className="flex w-[440px] shrink-0 flex-col overflow-y-auto bg-muted/20">
            <div className="sticky top-0 z-10 border-b bg-background px-3 py-2">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {essayType === 'dbq' ? '7-point DBQ rubric' : '6-point LEQ rubric'}
                </h2>
                <span className="font-mono text-xl font-semibold">
                  {score}/{max}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                GA draft scores; confirm or override per row. Errors don't
                subtract.
              </p>
            </div>
            <div className="flex flex-col gap-2 p-3">
              {rows.map((r) => (
                <RubricRowCard
                  key={r.id}
                  row={r}
                  state={rowState[r.id]}
                  onConfirm={() =>
                    setRow(r.id, {
                      state: 'confirmed',
                      finalEarned: r.ga === 'earned',
                    })
                  }
                  onOverride={(earned) =>
                    setRow(r.id, {
                      state: 'overridden',
                      finalEarned: earned,
                    })
                  }
                />
              ))}
            </div>
            <div className="sticky bottom-0 border-t bg-background p-3">
              <Button className="w-full" disabled={!allConfirmed}>
                Release grade
              </Button>
              {!allConfirmed ? (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Confirm or override every row before releasing.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <ColumnWiseMode rows={rows} />
      )}
    </div>
  );
}

function StateDot({ state }: { state: GaState }) {
  if (state === 'earned') {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <CheckIcon className="h-3 w-3" />
      </span>
    );
  }
  if (state === 'borderline') {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <AlertTriangleIcon className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700">
      <XIcon className="h-3 w-3" />
    </span>
  );
}

function RubricRowCard({
  row,
  state,
  onConfirm,
  onOverride,
}: {
  row: RubricRow;
  state: RowState[string];
  onConfirm: () => void;
  onOverride: (earned: boolean) => void;
}) {
  const [open, setOpen] = useState(row.ga !== 'earned');
  return (
    <div className="rounded-lg border bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 p-3 text-left"
      >
        <StateDot state={row.ga} />
        <div className="flex-1">
          <p className="text-sm font-semibold">{row.category}</p>
          <p className="text-xs text-muted-foreground">
            {state.state === 'pending'
              ? `GA suggests: ${row.ga === 'earned' ? '1 pt' : row.ga === 'borderline' ? 'borderline' : '0 pt'}`
              : state.state === 'confirmed'
              ? `Confirmed: ${state.finalEarned ? '1 pt' : '0 pt'}`
              : `Overridden: ${state.finalEarned ? '1 pt' : '0 pt'}`}
          </p>
        </div>
        <span className="font-mono text-sm">
          {state.finalEarned ? '1' : '0'}/1
        </span>
        {open ? (
          <ChevronUpIcon className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open ? (
        <div className="space-y-2 border-t p-3 text-xs">
          <div>
            <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
              GA justification
            </p>
            <p className="text-foreground/90">{row.gaJustification}</p>
          </div>
          {row.evidenceQuote ? (
            <div>
              <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                Linked evidence
              </p>
              <blockquote className="border-l-2 border-amber-300 bg-amber-50/60 pl-2 italic text-foreground/80">
                {row.evidenceQuote}
              </blockquote>
            </div>
          ) : null}
          {row.failureModes && row.failureModes.length > 0 ? (
            <div>
              <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                Failure-mode flags
              </p>
              <div className="flex flex-wrap gap-1">
                {row.failureModes.map((f) => (
                  <Badge
                    key={f}
                    variant="outline"
                    className="bg-rose-50 text-rose-900 border-rose-200"
                  >
                    {f}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          {row.snippets.length > 0 ? (
            <div>
              <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                Feedback snippets (click to insert)
              </p>
              <div className="flex flex-col gap-1">
                {row.snippets.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="rounded border bg-muted/40 px-2 py-1 text-left hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={onConfirm}>
              Confirm GA
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOverride(true)}
            >
              Override → 1 pt
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOverride(false)}
            >
              Override → 0 pt
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ColumnWiseMode({ rows }: { rows: RubricRow[] }) {
  // Mock class set: 5 students, scores randomized but stable.
  const students = useMemo(
    () => [
      'Maya T.',
      'James K.',
      'Priya S.',
      'Diego R.',
      'Aisha B.',
    ],
    []
  );
  const [activeRow, setActiveRow] = useState(rows[0].id);
  const active = rows.find((r) => r.id === activeRow)!;

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-56 shrink-0 overflow-y-auto border-r bg-muted/20">
        <p className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Score by category
        </p>
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setActiveRow(r.id)}
            className={
              'block w-full border-b px-3 py-2 text-left text-xs transition-colors ' +
              (r.id === activeRow
                ? 'bg-background text-foreground'
                : 'text-foreground/70 hover:bg-background/60')
            }
          >
            {r.category}
          </button>
        ))}
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto p-4">
        <h2 className="mb-1 text-base font-semibold">{active.category}</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Read every essay's {active.category.toLowerCase()} first; score them
          all before moving to the next row. Practitioner literature treats
          column-wise grading as the gold standard for class-set DBQ
          consistency.
        </p>
        <div className="flex flex-col gap-2">
          {students.map((name, i) => (
            <div
              key={name}
              className="rounded-lg border bg-background p-3 text-sm"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">{name}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline">
                    1 pt
                  </Button>
                  <Button size="sm" variant="ghost">
                    0 pt
                  </Button>
                </div>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {i === 0
                  ? '"Although Reconstruction nominally extended citizenship and the franchise to formerly enslaved people…"'
                  : i === 1
                  ? '"Reconstruction was a turning point because it gave Black people new rights but they were still unequal…"'
                  : i === 2
                  ? '"The period from 1865 to 1877 saw both formal expansion of rights and informal retrenchment, with the documents revealing…"'
                  : i === 3
                  ? '"Reconstruction made things change but also kept some things the same."'
                  : '"By 1877 the legal scaffolding of citizenship was in place, but the substantive freedom it promised was not yet realized."'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
