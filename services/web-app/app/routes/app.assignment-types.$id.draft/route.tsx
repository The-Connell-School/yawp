// Preview-only student drafting surface. Two-mode layout for DBQ (reading +
// writing), simpler editor + planning sidebar for LEQ. Per the v1 spec.
// Mock content only; no persistence, no tutor calls, no saves.

import { useState } from 'react';
import {
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Link, useLoaderData, useSearchParams } from 'react-router';
import {
  BookOpenIcon,
  ClockIcon,
  MessageCircleIcon,
  PencilIcon,
  PinIcon,
  XIcon,
} from 'lucide-react';
import { CaretLeftIcon } from '~/components/icons';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Textarea } from '~/components/ui/textarea';
import { requireProfile, requireUserId } from '~/utils/auth.server';

const PREVIEW_ID = 'preview-ap-history-essay';

type EssayType = 'dbq' | 'leq';
type Mode = 'reading' | 'writing';

type DocEntry = {
  num: number;
  shortLabel: string;
  title: string;
  attribution: string;
  body: string;
  annotationCount: number;
};

const DOCS: DocEntry[] = [
  {
    num: 1,
    shortLabel: 'D1',
    title: 'Petition from a Freedmen’s Convention',
    attribution: 'Black Virginia delegates, June 1865',
    body:
      'We the colored people of Virginia… demand that we be permitted the rights of citizens, the protection of the laws, and the use of the ballot. We have shown ourselves loyal to the Union; we have shed our blood; we now ask only that the law treat us as it treats other men…',
    annotationCount: 3,
  },
  {
    num: 2,
    shortLabel: 'D2',
    title: 'Black Codes, State of Mississippi',
    attribution: 'Mississippi state legislature, 1865',
    body:
      'Every freedman, free negro, and mulatto shall, on the second Monday of January, 1866, and annually thereafter, have a lawful home or employment, and shall produce a written contract showing the same to any officer who shall demand it…',
    annotationCount: 1,
  },
  {
    num: 3,
    shortLabel: 'D3',
    title: 'Letter from a Freedmen’s Bureau Agent',
    attribution: 'Capt. R. S. Donaldson to Gen. O. O. Howard, 1866',
    body:
      'The freedmen are eager for schools and for the means of self-improvement, but the planters in this region resist their efforts at every turn. Wages are withheld, contracts are torn up, and violence is used freely against any who attempt to leave their former masters…',
    annotationCount: 2,
  },
  {
    num: 4,
    shortLabel: 'D4',
    title: 'Sharecropping Contract',
    attribution: 'Greene County, Georgia, 1872',
    body:
      'The said laborer shall furnish his own labor and tools… the proprietor shall furnish the land and one-half of the seed… The crop shall be divided as follows: one-half to the proprietor, one-half to the laborer, less any advances or supplies…',
    annotationCount: 0,
  },
  {
    num: 5,
    shortLabel: 'D5',
    title: 'Editorial on the Compromise of 1877',
    attribution: 'Atlanta Constitution, March 1877',
    body:
      'The withdrawal of federal troops from Louisiana and South Carolina marks an end to bayonet rule and a new dawn for self-government. The southern states will now resume their rightful place in the Union, governed by their own people without northern interference…',
    annotationCount: 1,
  },
  {
    num: 6,
    shortLabel: 'D6',
    title: 'Speech on the 15th Amendment',
    attribution: 'Frederick Douglass, 1870',
    body:
      'Slavery is not abolished until the black man has the ballot. The right to vote is the most important political right; it is the right which secures all other rights…',
    annotationCount: 0,
  },
  {
    num: 7,
    shortLabel: 'D7',
    title: 'Photograph: Freedmen’s school, Beaufort, SC',
    attribution: 'Library of Congress, c. 1866',
    body:
      '[Image-only source. Caption: rows of formerly enslaved children at a Freedmen’s Bureau school, with two Black teachers at the front.]',
    annotationCount: 2,
  },
];

const DBQ_PROMPT =
  'Evaluate the extent to which the Reconstruction era (1865–1877) marked a turning point in the lives of formerly enslaved people.';

const LEQ_PROMPT =
  'Evaluate the relative importance of causes of the American Civil War.';

const MOCK_DBQ_ESSAY_TOKENS: Array<
  { kind: 'text'; text: string } | { kind: 'chip'; doc: number }
> = [
  {
    kind: 'text',
    text:
      'Although Reconstruction nominally extended citizenship and the franchise to formerly enslaved people, the period from 1865 to 1877 was characterized primarily by a retreat from full equality, driven by violent southern resistance, the entrenchment of new labor systems that approximated slavery, and the federal government’s eventual withdrawal of protection.\n\nIn the immediate aftermath of emancipation, freedpeople made bold claims for political inclusion. ',
  },
  { kind: 'chip', doc: 1 },
  {
    kind: 'text',
    text:
      ' shows Black Virginians demanding the ballot in the language of citizenship, framing political rights as the natural extension of their wartime loyalty. Frederick Douglass made the same argument nationally, insisting in ',
  },
  { kind: 'chip', doc: 6 },
  {
    kind: 'text',
    text:
      ' that suffrage was the precondition for any meaningful freedom. Together these documents establish that the demand for full citizenship came from the freedpeople themselves, not as a gift from above.\n\nYet the structural response was retrenchment. ',
  },
  { kind: 'chip', doc: 2 },
  {
    kind: 'text',
    text:
      ' codified Mississippi’s Black Codes, which compelled freedpeople into year-long labor contracts under threat of vagrancy charges — a regime designed to reproduce the substance of slavery within the form of free labor. The sharecropping contract in ',
  },
  { kind: 'chip', doc: 4 },
  {
    kind: 'text',
    text:
      ' shows how this logic outlasted the Codes themselves. Read alongside the Bureau agent’s testimony in ',
  },
  { kind: 'chip', doc: 3 },
  {
    kind: 'text',
    text:
      ', the documents collectively show that white planters used both legal and extralegal violence to constrain the labor and movement of freedpeople. (Donaldson’s letter, addressed to Gen. Howard, is significant precisely because it is internal Bureau correspondence — not public advocacy — and so reflects what officials were actually seeing on the ground.)\n\n',
  },
  { kind: 'chip', doc: 5 },
  {
    kind: 'text',
    text:
      ' marks the political endpoint: the editorial’s celebration of "self-government" is, read against the rest of the documents, a euphemism for the abandonment of federal protection. Outside the documents, the Compromise of 1877 itself, the Reconstruction Amendments’ erosion in cases such as the Slaughterhouse Cases (1873), and the rise of the Ku Klux Klan all reinforce the same trajectory.\n\nReconstruction, then, marked a profound turning point in legal status — but a far smaller one in lived experience. By 1877 the formal scaffolding of citizenship existed; the substantive freedom it was meant to secure did not.',
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

export default function AssignmentTypeApHistoryDraftRoute() {
  const [searchParams] = useSearchParams();
  useLoaderData<typeof loader>();

  const essayType = (searchParams.get('type') === 'leq' ? 'leq' : 'dbq') as EssayType;

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
            Preview · student drafting surface
          </Badge>
        </div>
        <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
          <ClockIcon className="h-4 w-4" />
          {essayType === 'dbq' ? 'Untimed practice · 60 min when timed' : 'Untimed practice · 40 min when timed'}
        </div>
      </div>

      {essayType === 'dbq' ? <DbqSurface /> : <LeqSurface />}
    </div>
  );
}

function DbqSurface() {
  const [mode, setMode] = useState<Mode>('reading');
  const [activeDoc, setActiveDoc] = useState<number>(1);
  const [pinnedDoc, setPinnedDoc] = useState<number | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(true);

  return (
    <>
      {/* Prompt banner */}
      <div className="border-b bg-muted/40 px-3 py-2 text-sm sm:px-5">
        <span className="font-semibold">Prompt: </span>
        {DBQ_PROMPT}
      </div>

      {/* Mode toggle */}
      <div className="flex items-center justify-between border-b bg-background px-3 py-2 sm:px-5">
        <div className="inline-flex overflow-hidden rounded-lg border">
          <button
            type="button"
            onClick={() => setMode('reading')}
            className={
              'flex items-center gap-1 px-3 py-1 text-sm transition-colors ' +
              (mode === 'reading'
                ? 'bg-foreground text-background'
                : 'bg-background text-foreground/80 hover:bg-muted')
            }
          >
            <BookOpenIcon className="h-4 w-4" /> Reading
          </button>
          <button
            type="button"
            onClick={() => setMode('writing')}
            className={
              'flex items-center gap-1 px-3 py-1 text-sm transition-colors ' +
              (mode === 'writing'
                ? 'bg-foreground text-background'
                : 'bg-background text-foreground/80 hover:bg-muted')
            }
          >
            <PencilIcon className="h-4 w-4" /> Writing
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPlanningOpen((v) => !v)}
          >
            {planningOpen ? 'Hide planning' : 'Show planning'}
          </Button>
          <Button
            size="sm"
            variant={coachOpen ? 'default' : 'ghost'}
            onClick={() => setCoachOpen((v) => !v)}
          >
            <MessageCircleIcon className="mr-1 h-4 w-4" />
            Coach
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Doc rail */}
        <DocRail
          mode={mode}
          activeDoc={activeDoc}
          pinnedDoc={pinnedDoc}
          onSelect={setActiveDoc}
          onPin={setPinnedDoc}
        />

        {/* Center pane */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {mode === 'reading' ? (
            <ReadingPane
              activeDoc={activeDoc}
              pinnedDoc={pinnedDoc}
              onUnpin={() => setPinnedDoc(null)}
            />
          ) : (
            <WritingPane
              activeDoc={activeDoc}
              pinnedDoc={pinnedDoc}
              onSelectDoc={setActiveDoc}
              onUnpin={() => setPinnedDoc(null)}
            />
          )}
        </div>

        {/* Planning sidebar */}
        {planningOpen ? <PlanningSidebar /> : null}

        {/* Coach panel */}
        {coachOpen ? <CoachPanel onClose={() => setCoachOpen(false)} /> : null}
      </div>
    </>
  );
}

function DocRail({
  mode,
  activeDoc,
  pinnedDoc,
  onSelect,
  onPin,
}: {
  mode: Mode;
  activeDoc: number;
  pinnedDoc: number | null;
  onSelect: (n: number) => void;
  onPin: (n: number | null) => void;
}) {
  const wide = mode === 'reading';
  return (
    <div
      className={
        'flex flex-col overflow-y-auto border-r bg-muted/20 ' +
        (wide ? 'w-32' : 'w-12')
      }
    >
      {DOCS.map((d) => {
        const isActive = d.num === activeDoc;
        const isPinned = d.num === pinnedDoc;
        return (
          <button
            key={d.num}
            type="button"
            onClick={() => onSelect(d.num)}
            className={
              'flex items-center gap-2 border-b px-2 py-2 text-left transition-colors ' +
              (isActive
                ? 'bg-background text-foreground'
                : 'text-foreground/70 hover:bg-background/60')
            }
          >
            <span className="font-mono text-xs font-semibold">{d.shortLabel}</span>
            {wide ? (
              <span className="line-clamp-1 flex-1 text-xs">{d.title}</span>
            ) : null}
            {wide ? (
              <span className="flex items-center gap-0.5">
                {Array.from({ length: Math.min(d.annotationCount, 3) }).map(
                  (_, i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-amber-500"
                    />
                  )
                )}
              </span>
            ) : null}
            {wide ? (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onPin(isPinned ? null : d.num);
                }}
                className={
                  'rounded p-0.5 ' +
                  (isPinned
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-background')
                }
              >
                <PinIcon className="h-3 w-3" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function DocBody({ doc }: { doc: DocEntry }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">
          {doc.shortLabel} — {doc.title}
        </h3>
        <span className="text-xs text-muted-foreground">
          {doc.annotationCount} note{doc.annotationCount === 1 ? '' : 's'}
        </span>
      </div>
      <p className="mb-2 text-xs italic text-muted-foreground">
        {doc.attribution}
      </p>
      <p className="whitespace-pre-line text-sm leading-relaxed">{doc.body}</p>
      {doc.annotationCount > 0 ? (
        <div className="mt-3 rounded border bg-muted/30 p-2 text-xs text-muted-foreground">
          Mock margin notes: {doc.annotationCount} highlight
          {doc.annotationCount === 1 ? '' : 's'} carried over from prior reading.
        </div>
      ) : null}
    </div>
  );
}

function ReadingPane({
  activeDoc,
  pinnedDoc,
  onUnpin,
}: {
  activeDoc: number;
  pinnedDoc: number | null;
  onUnpin: () => void;
}) {
  const active = DOCS.find((d) => d.num === activeDoc)!;
  const pinned = pinnedDoc != null ? DOCS.find((d) => d.num === pinnedDoc) : null;

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden border-r">
        <DocBody doc={active} />
      </div>
      {pinned ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-1">
            <span className="text-xs font-semibold">
              Pinned: {pinned.shortLabel}
            </span>
            <Button variant="ghost" size="sm" onClick={onUnpin}>
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
          <DocBody doc={pinned} />
        </div>
      ) : null}
    </div>
  );
}

function WritingPane({
  activeDoc,
  pinnedDoc,
  onSelectDoc,
  onUnpin,
}: {
  activeDoc: number;
  pinnedDoc: number | null;
  onSelectDoc: (n: number) => void;
  onUnpin: () => void;
}) {
  const [showEditor] = useState(true);

  // Active doc surfaces only when student clicks a chip / rail number; not
  // shown by default in writing mode.
  const popoverDoc =
    pinnedDoc != null ? DOCS.find((d) => d.num === pinnedDoc) : null;

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-y-auto px-6 py-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          Essay editor
        </p>
        {showEditor ? (
          <div className="prose prose-sm max-w-none rounded border bg-background p-4 text-sm leading-relaxed">
            {MOCK_DBQ_ESSAY_TOKENS.map((tok, i) =>
              tok.kind === 'text' ? (
                <span key={i} className="whitespace-pre-wrap">
                  {tok.text}
                </span>
              ) : (
                <CitationChip
                  key={i}
                  docNum={tok.doc}
                  onClick={() => onSelectDoc(tok.doc)}
                />
              )
            )}
          </div>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          Mock essay shown in read-only form. Citation chips like{' '}
          <CitationChip docNum={3} /> hover to expand the doc; click to open it
          in the source panel. The chip count surfaces "n of 7 docs cited"
          passively without showing the rubric.
        </p>
      </div>
      {popoverDoc ? (
        <div className="flex w-[380px] flex-col overflow-hidden border-l bg-background">
          <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-1">
            <span className="text-xs font-semibold">
              Source · {popoverDoc.shortLabel}
            </span>
            <Button variant="ghost" size="sm" onClick={onUnpin}>
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
          <DocBody doc={popoverDoc} />
        </div>
      ) : null}
    </div>
  );
}

function CitationChip({
  docNum,
  onClick,
}: {
  docNum: number;
  onClick?: () => void;
}) {
  const doc = DOCS.find((d) => d.num === docNum);
  if (!doc) return null;
  return (
    <span
      role={onClick ? 'button' : undefined}
      onClick={onClick}
      title={`${doc.title} — ${doc.attribution}`}
      className={
        'mx-0.5 inline-flex items-center rounded-md border bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] text-amber-900 hover:bg-amber-100 ' +
        (onClick ? 'cursor-pointer' : '')
      }
    >
      [{doc.shortLabel}]
    </span>
  );
}

function PlanningSidebar() {
  return (
    <div className="hidden w-[260px] shrink-0 flex-col gap-3 overflow-y-auto border-l bg-muted/20 p-3 lg:flex">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Planning
      </p>
      <PlanningField
        label="Thesis"
        defaultValue="Although Reconstruction extended formal citizenship, the period was primarily a retreat — driven by white violence, sharecropping, and federal withdrawal."
        rows={3}
      />
      <PlanningField
        label="Outline"
        defaultValue={'¶1: Demands for inclusion (D1, D6)\n¶2: Black Codes + sharecropping (D2, D3, D4)\n¶3: Compromise of 1877 (D5)\n¶4: Outside evidence — Slaughterhouse, KKK, 14A erosion'}
        rows={5}
      />
      <PlanningField
        label="Doc groupings"
        defaultValue={'Pro-inclusion: D1, D6\nLabor coercion: D2, D3, D4\nWithdrawal: D5\nImage: D7'}
        rows={4}
      />
      <PlanningField
        label="Outside evidence"
        defaultValue={'Compromise of 1877; Slaughterhouse Cases (1873); Ku Klux Klan; 14A erosion'}
        rows={3}
      />
    </div>
  );
}

function PlanningField({
  label,
  defaultValue,
  rows,
}: {
  label: string;
  defaultValue: string;
  rows: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <Textarea
        defaultValue={defaultValue}
        rows={rows}
        className="text-xs"
      />
    </div>
  );
}

function CoachPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="hidden w-[320px] shrink-0 flex-col overflow-y-auto border-l bg-background lg:flex">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-semibold">Coach</span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <XIcon className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-3 p-3 text-sm">
        <CoachTurn
          author="Coach"
          body={
            'You decoded the prompt as continuity-and-change — that fits. Try the while/although template: "Although [position 1], the period was characterized primarily by [main argument]…"'
          }
        />
        <CoachTurn
          author="You"
          self
          body={
            'Although Reconstruction nominally extended citizenship and the franchise to formerly enslaved people, the period from 1865 to 1877 was characterized primarily by a retreat from full equality.'
          }
        />
        <CoachTurn
          author="Coach"
          body={
            'Strong qualification — that locks in your line of reasoning. Push for one more move: name the three drivers in the thesis itself, so each body paragraph has a category to map to.'
          }
        />
        <CoachTurn
          author="Coach"
          body={
            'You\'re using D2 and D4 well as labor-coercion evidence. Have you sourced any of the documents yet? HIPP-with-relevance is two documents minimum for the sourcing point.'
          }
        />
        <Separator />
        <p className="text-xs text-muted-foreground">
          Coach turns are mock — no AI calls. The real tutor speaks in rubric
          vocabulary without naming categories.
        </p>
      </div>
    </div>
  );
}

function CoachTurn({
  author,
  body,
  self,
}: {
  author: string;
  body: string;
  self?: boolean;
}) {
  return (
    <div className={self ? 'pl-6' : ''}>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {author}
      </p>
      <p
        className={
          'rounded-md p-2 text-xs ' +
          (self ? 'bg-amber-50' : 'bg-muted')
        }
      >
        {body}
      </p>
    </div>
  );
}

function LeqSurface() {
  const [coachOpen, setCoachOpen] = useState(false);
  const [contextBankOpen, setContextBankOpen] = useState(true);

  return (
    <>
      <div className="border-b bg-muted/40 px-3 py-2 text-sm sm:px-5">
        <span className="font-semibold">Prompt: </span>
        {LEQ_PROMPT}
      </div>

      <div className="flex items-center justify-end border-b bg-background px-3 py-2 sm:px-5">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={contextBankOpen ? 'default' : 'ghost'}
            onClick={() => setContextBankOpen((v) => !v)}
          >
            Context bank
          </Button>
          <Button
            size="sm"
            variant={coachOpen ? 'default' : 'ghost'}
            onClick={() => setCoachOpen((v) => !v)}
          >
            <MessageCircleIcon className="mr-1 h-4 w-4" /> Coach
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-y-auto px-6 py-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Essay editor
          </p>
          <Textarea
            rows={20}
            defaultValue={
              'Although tensions over slavery and states\' rights had simmered for decades, the period from 1820 to 1861 was characterized primarily by an irrepressible conflict over the expansion of slavery into new territories — driven by the Missouri Compromise\'s collapse, the Kansas-Nebraska Act, and the Dred Scott decision…\n\n[Continue drafting. Coach is silent unless you ask. The context bank panel on the right surfaces named anchors from the period — laws, court cases, people, events — to pull from as outside evidence.]'
            }
            className="text-sm"
          />
        </div>

        {contextBankOpen ? (
          <div className="hidden w-[300px] shrink-0 flex-col gap-2 overflow-y-auto border-l bg-muted/20 p-3 lg:flex">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Context bank · Antebellum (1820–1861)
            </p>
            <p className="text-xs text-muted-foreground">
              Pinnable anchors. Tutor surfaces relevant ones in coaching turns.
              Closed during timed practice.
            </p>
            <ContextChip name="Missouri Compromise (1820)" tag="law" />
            <ContextChip name="Compromise of 1850" tag="law" />
            <ContextChip name="Fugitive Slave Act (1850)" tag="law" />
            <ContextChip name="Kansas-Nebraska Act (1854)" tag="law" />
            <ContextChip name="Dred Scott v. Sandford (1857)" tag="court-case" />
            <ContextChip name="Bleeding Kansas (1854–1859)" tag="event" />
            <ContextChip name="John Brown’s raid (1859)" tag="event" />
            <ContextChip name="Lincoln-Douglas debates (1858)" tag="event" />
            <ContextChip name="Stephen Douglas" tag="person" />
            <ContextChip name="Roger Taney" tag="person" />
            <ContextChip name="Republican Party (founded 1854)" tag="movement" />
          </div>
        ) : null}

        {coachOpen ? <CoachPanel onClose={() => setCoachOpen(false)} /> : null}
      </div>
    </>
  );
}

function ContextChip({ name, tag }: { name: string; tag: string }) {
  return (
    <div className="flex items-center justify-between rounded border bg-background px-2 py-1 text-xs">
      <span>{name}</span>
      <Badge variant="outline" size="sm" className="text-[10px]">
        {tag}
      </Badge>
    </div>
  );
}
