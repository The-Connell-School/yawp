// Preview-only AssignmentType detail page for the AP History essay v1 spec.
// All data is mock; no persistence, no AI, no grading. The route renders the
// AssignmentType view described in the v1 spec
// (docs/plans/2026-05-09-ap-history-essay-spec-v1.md):
//
//   1. Header — back-to-dashboard, "AP History Essay" title, New ▾ dropdown
//      matching the existing AssignmentType pattern (Document / Assignment),
//      each branching to a DBQ / LEQ submenu.
//   2. Hero banner + title + description
//   3. Teacher directions
//   4. Prompt Library — sidebar (stacked filter accordions) + vertical list
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
        "Writing, as you know, isn't exclusive to English class. In this assignment type, your AP US, European, and World History students draft full DBQs and LEQs on a real prompt — coached by a tutor that knows the genre and graded against the College Board rubric. One workflow covers both essay formats; the tutor and grading assistant branch on essay type so the coaching matches the moves each one rewards.",
    },
    libraryPrompts: SAMPLE_PROMPTS,
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

        {/* Teacher directions */}
        <div className="mb-6 rounded-lg border bg-muted/40 p-5">
          <h3 className="mb-3 text-base font-semibold">
            How AP History essays work in Yawp
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Each assignment is one prompt graded against the College Board
            rubric. Hit <code className="px-1">New</code> above to start a
            Document or Assignment from scratch, or pick a prompt from the
            library below to pre-fill the assignment form.
          </p>

          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-1 text-sm font-semibold">DBQ — 7 points</h4>
              <p className="mb-2 text-sm text-muted-foreground">
                Students build an argument from a packet of 4–7 primary sources.
                The tutor coaches in five phases:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Source analysis — read the docs, surface HIPP elements</li>
                <li>Thesis — defensible claim with a line of reasoning</li>
                <li>Contextualization — situate the prompt in the broader era</li>
                <li>Drafting — weave 4+ documents with outside evidence</li>
                <li>Revision — sharpen sourcing, complexity, tie-back</li>
              </ul>
            </div>
            <div>
              <h4 className="mb-1 text-sm font-semibold">LEQ — 6 points</h4>
              <p className="mb-2 text-sm text-muted-foreground">
                No documents — students argue entirely from outside evidence.
                The tutor collapses to four phases:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Thesis</li>
                <li>Context + evidence brainstorm</li>
                <li>Drafting</li>
                <li>Revision</li>
              </ul>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            The grading assistant scores additively against the rubric, anchored
            on calibration samples, and surfaces named failure-mode flags
            (walking-through-documents, HIPP-without-relevance, generic-context,
            period-bleed).
          </p>
        </div>

        <Separator className="my-2" />

        {/* Prompt Library */}
        <PromptsLibrary
          prompts={data.libraryPrompts}
          onSelectPrompt={openSheetFromLibrary}
        />
      </div>

      <CreateAssignmentSheet
        mode={assignmentMode}
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
      />
    </div>
  );
}
