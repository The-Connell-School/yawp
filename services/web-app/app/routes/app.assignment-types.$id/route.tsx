// Preview-only AssignmentType detail page for the AP History essay v1 spec.
// All data is mock; no persistence, no AI, no grading. The route renders the
// AssignmentType view described in the v1 spec
// (docs/plans/2026-05-09-ap-history-essay-spec-v1.md):
//
//   1. Header — back-to-dashboard, "AP History Essay" title, New ▾ dropdown
//      matching the existing AssignmentType pattern (Document / Assignment),
//      each branching to a DBQ / LEQ submenu.
//   2. Hero banner + title + description
//   3. Teacher directions + inspirational examples
//   4. Submissions accordion (empty mock)
//   5. Prompt Library — sidebar (stacked filter accordions) + vertical list
//      of prompt rows. Click a row → opens the create-assignment sheet
//      pre-populated from the library entry. Mirrors PR #111 (Daily Pages
//      prompt library).

import { useState } from 'react';
import {
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Link, useLoaderData, useNavigate } from 'react-router';
import { ChevronDownIcon } from 'lucide-react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Separator } from '~/components/ui/separator';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import {
  type CreateAssignmentMode,
  CreateAssignmentSheet,
} from './create-assignment-sheet';
import {
  type EssayType,
  INSPIRATIONAL_EXAMPLES,
  type LibraryPrompt,
  PREVIEW_ID,
  SAMPLE_PROMPTS,
} from './library-data';
import { PromptsLibrary } from './prompts-library';

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

export default function AssignmentTypeApHistoryPreviewRoute() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const [assignmentMode, setAssignmentMode] =
    useState<CreateAssignmentMode | null>(null);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  function openSheetFromLibrary(p: LibraryPrompt) {
    setAssignmentMode({ kind: 'library', prompt: p });
    setCreateSheetOpen(true);
  }

  function openSheetFromScratch(type: EssayType) {
    setAssignmentMode({ kind: 'scratch', essayType: type });
    setCreateSheetOpen(true);
  }

  function draftHref(type: EssayType): string {
    return `/app/assignment-types/${PREVIEW_ID}/draft?type=${type.toLowerCase()}`;
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" className="w-fit">
                New <ChevronDownIcon className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Document</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onSelect={() => navigate(draftHref('DBQ'))}
                  >
                    DBQ
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => navigate(draftHref('LEQ'))}
                  >
                    LEQ
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Assignment</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onSelect={() => openSheetFromScratch('DBQ')}
                  >
                    DBQ
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => openSheetFromScratch('LEQ')}
                  >
                    LEQ
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
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
            above to start a Document or Assignment from scratch, or pick a
            prompt from the library below to pre-fill the assignment form.
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
        <Accordion type="single" collapsible>
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
        <PromptsLibrary
          prompts={data.libraryPrompts}
          onSelectPrompt={openSheetFromLibrary}
        />

        <p className="mt-8 text-xs text-muted-foreground">
          Preview wireframes driven by mock data. PDF parsing, real-time tutor
          coaching, persistence, and AI grading are described in the v1 spec
          but not implemented.
        </p>
      </div>

      <CreateAssignmentSheet
        mode={assignmentMode}
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
      />
    </div>
  );
}
