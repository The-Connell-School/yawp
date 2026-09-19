import { useEffect, useRef, useState } from 'react';
import {
  type LoaderFunctionArgs,
  data as dataResponse,
  type ActionFunctionArgs,
  Form,
} from 'react-router';
import {
  Link,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from 'react-router';
import { ChevronDownIcon } from 'lucide-react';
import { DocumentLink } from '~/components/document-link.js';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { CaretLeftIcon } from '~/components/icons';
import { NoDataPlaceholder } from '~/components/no-data-placeholder.js';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { useUser } from '~/hooks/useUser.js';
import {
  createDocumentForAssignmentType,
  DocumentCreationError,
} from '~/domain/documents.server';
import { listApHistoryLibraryEntries } from '~/domain/ap-history/library.server';
import { listSavedThesisPrompts } from '~/domain/thesis-prompts/saved-prompts.server';
import { listSavedDailyPagesPrompts } from '~/domain/daily-pages-prompts/saved-prompts.server';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import {
  getAvailableAssignmentTypesForScopes,
  isAssignmentTypeAvailableForAnyScope,
  type AssignmentTypeAccessScope,
} from '~/utils/assignment-type-access.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { ApHistoryLibrary } from './ap-history-library';
import { CreateAssignmentSheet } from './create-assignment-sheet';
import { DailyPagesPromptGenerator } from './prompts-library/daily-pages-prompt-generator';
import { PromptsLibrary } from './prompts-library/prompts-library';
import { TeacherDirections } from './prompts-library/teacher-directions';
import {
  type CognitiveMove,
  COLLECTION_ORDER,
  FACET_KEYS,
  type FacetValues,
  type GradeBand,
  type LibraryEntry,
  type LibraryPrompt,
  type OptionCounts,
  type PromptSeriousness,
  type PromptType,
  savedPromptToLibraryEntry,
  toLibraryEntries,
} from './prompts-library/data';
import promptsRaw from './prompts-library/prompts.json';
import { isDailyPagesTitle } from '~/domain/lesson-planner/yawp-catalog';
import { FROM_LESSON_PARAM } from '~/domain/lesson-planner/daily-pages-block';
import { ThesisPromptsLibrary } from './thesis-prompts-library/thesis-prompts-library';
import { ThesisPromptGenerator } from './thesis-prompts-library/thesis-prompt-generator';
import { ThesisTeacherDirections } from './thesis-prompts-library/thesis-teacher-directions';
import {
  applyFilters as applyThesisFilters,
  buildFacets as buildThesisFacets,
  buildOptionCounts as buildThesisOptionCounts,
  readFilters as readThesisFilters,
  savedPromptToLibraryEntry as savedThesisPromptToLibraryEntry,
  toLibraryEntries as toThesisLibraryEntries,
  type ThesisPrompt,
} from './thesis-prompts-library/data';
import thesisPromptsRaw from './thesis-prompts-library/prompts.json';

/** How the Lesson Planner hands a written warm-up to this page. */
const NEW_PROMPT_PARAM = 'newPrompt';
const THESIS_ESSAY_TITLE = 'the thesis-driven essay';
const ALL_PROMPTS = toLibraryEntries(promptsRaw as LibraryPrompt[]);
const ALL_THESIS_PROMPTS = toThesisLibraryEntries(
  thesisPromptsRaw as ThesisPrompt[]
);
const SERIOUSNESS_ORDER: PromptSeriousness[] = [
  'playful',
  'light',
  'moderate',
  'serious',
  'heavy',
];
const GRADE_ORDER: GradeBand[] = ['9', '10', '11', '12'];

type AssignmentTypeDetailRow = {
  id: string;
  title: string;
  description: string | null;
  systemKey: string | null;
  collaborationSupported: boolean;
  image: { id: string } | null;
  assignmentModules: Array<{
    id: string;
    title: string;
    description: string | null;
    position: number;
  }>;
};

type TeacherClassScopeRow = {
  id: string;
  school: { id: string; organizationId: string };
};

function buildAssignmentTypeScopes({
  organizationId,
  teacherProfileId,
  teacherClasses,
}: {
  organizationId: string;
  teacherProfileId?: string | null;
  teacherClasses: TeacherClassScopeRow[];
}): AssignmentTypeAccessScope[] {
  if (!teacherProfileId || teacherClasses.length === 0) {
    return [{ organizationId, teacherProfileId }];
  }

  return teacherClasses.map((klass) => ({
    organizationId: klass.school.organizationId,
    schoolId: klass.school.id,
    teacherProfileId,
  }));
}

function buildFacets(prompts: LibraryEntry[]): FacetValues {
  const themes = new Set<string>();
  const textsOrUnits = new Set<string>();
  const cognitiveMoves = new Set<CognitiveMove>();
  const types = new Set<PromptType>();
  const seriousness = new Set<PromptSeriousness>();
  const gradeBands = new Set<GradeBand>();

  for (const prompt of prompts) {
    prompt.themes.forEach((theme) => themes.add(theme));
    prompt.textsOrUnits.forEach((textOrUnit) => textsOrUnits.add(textOrUnit));
    prompt.cognitiveMoves.forEach((move) => cognitiveMoves.add(move));
    if (prompt.type) types.add(prompt.type);
    if (prompt.seriousness) seriousness.add(prompt.seriousness);
    prompt.gradeBands.forEach((gradeBand) => gradeBands.add(gradeBand));
  }

  return {
    // Both collections are always offered, even when the teacher has saved
    // nothing yet — "My prompts" has to be visible to be discovered.
    collections: [...COLLECTION_ORDER],
    themes: [...themes].sort(),
    textsOrUnits: [...textsOrUnits].sort(),
    cognitiveMoves: [...cognitiveMoves].sort(),
    types: [...types].sort(),
    seriousness: SERIOUSNESS_ORDER.filter((value) => seriousness.has(value)),
    gradeBands: GRADE_ORDER.filter((value) => gradeBands.has(value)),
  };
}

function buildOptionCounts(prompts: LibraryEntry[]): OptionCounts {
  const counts: OptionCounts = {
    // Seeded so an empty collection still reports a count of 0.
    collections: Object.fromEntries(
      COLLECTION_ORDER.map((collection) => [collection, 0])
    ),
    themes: {},
    textsOrUnits: {},
    cognitiveMoves: {},
    types: {},
    seriousness: {},
    gradeBands: {},
  };
  const bump = (bucket: Record<string, number>, key: string) => {
    bucket[key] = (bucket[key] ?? 0) + 1;
  };

  for (const prompt of prompts) {
    bump(counts.collections, prompt.collection);
    prompt.themes.forEach((theme) => bump(counts.themes, theme));
    prompt.textsOrUnits.forEach((textOrUnit) =>
      bump(counts.textsOrUnits, textOrUnit)
    );
    prompt.cognitiveMoves.forEach((move) => bump(counts.cognitiveMoves, move));
    if (prompt.type) bump(counts.types, prompt.type);
    if (prompt.seriousness) bump(counts.seriousness, prompt.seriousness);
    prompt.gradeBands.forEach((gradeBand) =>
      bump(counts.gradeBands, gradeBand)
    );
  }

  return counts;
}

type LibraryFilters = {
  q: string;
  collections: Set<string>;
  themes: Set<string>;
  textsOrUnits: Set<string>;
  cognitiveMoves: Set<string>;
  types: Set<string>;
  seriousness: Set<string>;
  gradeBands: Set<string>;
};

function readFilters(url: URL): LibraryFilters {
  const readSet = (key: string) =>
    new Set(url.searchParams.get(key)?.split(',').filter(Boolean) ?? []);

  return {
    q: (url.searchParams.get(FACET_KEYS.search) ?? '').trim().toLowerCase(),
    collections: readSet(FACET_KEYS.collections),
    themes: readSet(FACET_KEYS.themes),
    textsOrUnits: readSet(FACET_KEYS.textsOrUnits),
    cognitiveMoves: readSet(FACET_KEYS.cognitiveMoves),
    types: readSet(FACET_KEYS.types),
    seriousness: readSet(FACET_KEYS.seriousness),
    gradeBands: readSet(FACET_KEYS.gradeBands),
  };
}

function applyFilters(
  prompts: LibraryEntry[],
  filters: LibraryFilters
): LibraryEntry[] {
  return prompts.filter((prompt) => {
    if (
      filters.collections.size &&
      !filters.collections.has(prompt.collection)
    ) {
      return false;
    }
    if (
      filters.themes.size &&
      !prompt.themes.some((theme) => filters.themes.has(theme))
    ) {
      return false;
    }
    if (
      filters.textsOrUnits.size &&
      !prompt.textsOrUnits.some((textOrUnit) =>
        filters.textsOrUnits.has(textOrUnit)
      )
    ) {
      return false;
    }
    if (
      filters.cognitiveMoves.size &&
      !prompt.cognitiveMoves.some((move) => filters.cognitiveMoves.has(move))
    ) {
      return false;
    }
    // A saved prompt only carries the tags the generator gave it, so an untagged
    // facet filters it out rather than matching a missing value.
    if (
      filters.types.size &&
      (!prompt.type || !filters.types.has(prompt.type))
    ) {
      return false;
    }
    if (
      filters.seriousness.size &&
      (!prompt.seriousness || !filters.seriousness.has(prompt.seriousness))
    ) {
      return false;
    }
    if (
      filters.gradeBands.size &&
      !prompt.gradeBands.some((gradeBand) => filters.gradeBands.has(gradeBand))
    ) {
      return false;
    }
    if (filters.q && !prompt.prompt.toLowerCase().includes(filters.q)) {
      return false;
    }
    return true;
  });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  const [documents, archivedDocuments, teacherClasses] = await Promise.all([
    prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        membershipId: profile.id,
        deletedAt: null,
        archivedAt: null,
        assignmentModuleSessions: {
          some: { assignmentModule: { assignmentTypeId: params.id } },
        },
      },
      include: {
        assignmentModuleSessions: {
          take: 1,
          orderBy: { assignmentModule: { position: 'desc' } },
          include: { assignmentModule: true },
        },
        submissions: {
          where: { archivedAt: null, unsubmittedAt: null },
          orderBy: { submittedAt: 'desc' },
          select: {
            id: true,
            score: true,
            overallScore: true,
            numericPercentage: true,
            letterGrade: true,
            releasedAt: true,
            submittedAt: true,
          },
        },
      },
    }),
    prisma.document.findMany({
      orderBy: { archivedAt: 'desc' },
      where: {
        membershipId: profile.id,
        deletedAt: null,
        archivedAt: { not: null },
        assignmentModuleSessions: {
          some: { assignmentModule: { assignmentTypeId: params.id } },
        },
      },
      include: {
        assignmentModuleSessions: {
          take: 1,
          orderBy: { assignmentModule: { position: 'desc' } },
          include: { assignmentModule: true },
        },
        submissions: {
          where: { archivedAt: null, unsubmittedAt: null },
          orderBy: { submittedAt: 'desc' },
          select: {
            id: true,
            score: true,
            overallScore: true,
            numericPercentage: true,
            letterGrade: true,
            releasedAt: true,
            submittedAt: true,
          },
        },
      },
    }),
    profile.role === 'TEACHER'
      ? prisma.class.findMany({
          where: {
            teachers: { some: { id: profile.id } },
            isArchived: false,
          },
          select: {
            id: true,
            grade: true,
            period: true,
            title: true,
            school: { select: { id: true, organizationId: true } },
            teachers: { select: { id: true } },
          },
          orderBy: [{ grade: 'asc' }, { period: 'asc' }],
        })
      : [],
  ]);

  const assignmentTypes =
    await getAvailableAssignmentTypesForScopes<AssignmentTypeDetailRow>({
      scopes: buildAssignmentTypeScopes({
        organizationId: profile.organization.id,
        teacherProfileId: profile.id,
        teacherClasses,
      }),
      select: {
        id: true,
        title: true,
        description: true,
        systemKey: true,
        collaborationSupported: true,
        image: { select: { id: true } },
        assignmentModules: {
          where: { deletedAt: null },
          select: {
            id: true,
            title: true,
            description: true,
            position: true,
          },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { position: 'asc' },
    });
  const assignmentType = assignmentTypes.find((type) => type.id === params.id);

  if (!assignmentType) {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'Assignment type not found',
    });
  }

  const normalizedTitle = assignmentType.title.trim().toLowerCase();
  const isDailyPages = isDailyPagesTitle(assignmentType.title);
  const isThesisEssay = normalizedTitle === THESIS_ESSAY_TITLE;
  const isApHistory =
    assignmentType.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY;
  // "My prompts": prompts this teacher generated and kept, shown in the same
  // library alongside the fixed corpus and filterable on their own.
  const savedPrompts =
    profile.role === "TEACHER" && isDailyPages
      ? await listSavedDailyPagesPrompts({
          membershipId: profile.id,
          assignmentTypeId: assignmentType.id,
        })
      : [];
  const libraryEntries =
    profile.role === "TEACHER" && isDailyPages
      ? [...savedPrompts.map(savedPromptToLibraryEntry), ...ALL_PROMPTS]
      : [];
  const promptLibrary =
    profile.role === 'TEACHER' && isDailyPages
      ? {
          prompts: applyFilters(
            libraryEntries,
            readFilters(new URL(request.url))
          ),
          facets: buildFacets(libraryEntries),
          optionCounts: buildOptionCounts(libraryEntries),
          totalCount: libraryEntries.length,
        }
      : null;
  // "My prompts": prompts this teacher generated and kept, shown in the same
  // library alongside the fixed corpus and filterable on their own.
  const savedThesisPrompts =
    profile.role === "TEACHER" && isThesisEssay
      ? await listSavedThesisPrompts({
          membershipId: profile.id,
          assignmentTypeId: assignmentType.id,
        })
      : [];
  const thesisLibraryEntries =
    profile.role === "TEACHER" && isThesisEssay
      ? [
          ...savedThesisPrompts.map(savedThesisPromptToLibraryEntry),
          ...ALL_THESIS_PROMPTS,
        ]
      : [];
  const thesisPromptLibrary =
    profile.role === "TEACHER" && isThesisEssay
      ? {
          prompts: applyThesisFilters(
            thesisLibraryEntries,
            readThesisFilters(new URL(request.url))
          ),
          facets: buildThesisFacets(thesisLibraryEntries),
          optionCounts: buildThesisOptionCounts(thesisLibraryEntries),
          totalCount: thesisLibraryEntries.length,
        }
      : null;
  const enabledTeacherClassIds =
    profile.role === 'TEACHER'
      ? new Set(teacherClasses.map((klass) => klass.id))
      : new Set<string>();
  const assignmentEnabledTeacherClasses =
    profile.role === 'TEACHER' ? teacherClasses : [];
  let apHistoryLibrary = null;
  if (profile.role === 'TEACHER' && isApHistory) {
    if (assignmentEnabledTeacherClasses.length > 0) {
      apHistoryLibrary = {
        entries: await listApHistoryLibraryEntries(assignmentType.id),
        teacherClasses: assignmentEnabledTeacherClasses,
      };
    }
  }

  return dataResponse({
    assignmentType,
    documents,
    archivedDocuments,
    teacherClasses: assignmentEnabledTeacherClasses,
    promptLibrary,
    thesisPromptLibrary,
    apHistoryLibrary,
  });
}
export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const teacherClasses =
    profile.role === 'TEACHER'
      ? await prisma.class.findMany({
          where: {
            teachers: { some: { id: profile.id } },
            isArchived: false,
          },
          select: {
            id: true,
            school: { select: { id: true, organizationId: true } },
          },
        })
      : [];
  const assignmentTypeAvailable = params.id
    ? await isAssignmentTypeAvailableForAnyScope({
        assignmentTypeId: params.id,
        scopes: buildAssignmentTypeScopes({
          organizationId: profile.organization.id,
          teacherProfileId: profile.id,
          teacherClasses,
        }),
      })
    : false;
  const assignmentType = assignmentTypeAvailable
    ? await prisma.assignmentType.findFirst({
        where: {
          id: params.id,
          archivedAt: null,
        },
        select: { id: true, systemKey: true },
      })
    : null;

  if (!assignmentType) {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'Assignment type not found',
    });
  }

  if (profile.role !== 'TEACHER') {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'Start writing from an assignment in one of your classes.',
    });
  }

  if (assignmentType.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY) {
    return redirectWithToast(`/app/assignment-types/${params.id}`, {
      type: 'error',
      description: 'Choose an APUSH prompt from the library first.',
    });
  }

  let documentId = '';
  try {
    const created = await createDocumentForAssignmentType({
      membershipId: profile.id,
      assignmentTypeId: assignmentType.id,
    });
    documentId = created.documentId;
  } catch (creationError) {
    if (creationError instanceof DocumentCreationError) {
      return redirectWithToast(`/app/assignment-types/${params.id}`, {
        type: 'error',
        description: creationError.message,
      });
    }
    throw creationError;
  }

  const requestUrl = new URL(request.url);
  const currentPath = `${requestUrl.pathname}${requestUrl.search}`;
  const redirectParams = new URLSearchParams({
    exitTo: currentPath,
  });

  return redirectWithToast(
    `/app/documents/${documentId}?${redirectParams.toString()}`,
    {
      type: 'success',
      description: 'Document created successfully.',
    }
  );
}

export default function AppAssignmentTypesIdRoute() {
  const user = useUser();
  const data = useLoaderData<typeof loader>();
  const isTeacher = user.selectedMembership?.role === 'TEACHER';
  const hasModules = data.assignmentType.assignmentModules.length > 0;
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';
  const docFormRef = useRef<HTMLFormElement>(null);
  const [isAssignmentSheetOpen, setIsAssignmentSheetOpen] = useState(false);
  const [isPromptGeneratorOpen, setIsPromptGeneratorOpen] = useState(false);
  const [libraryPrompt, setLibraryPrompt] = useState('');
  const [apHistoryEntry, setApHistoryEntry] = useState<{
    externalKey: string;
    title: string;
    prompt: string;
    essayType: string;
  } | null>(null);
  const showPromptsLibrary = data.promptLibrary != null;

  // The Lesson Planner sends a teacher here with a warm-up it wrote, to be
  // assigned rather than retyped. Open the sheet on it once, then drop the
  // param so a refresh (or the back button) does not reopen it.
  const [searchParams, setSearchParams] = useSearchParams();
  const incomingPrompt = searchParams.get(NEW_PROMPT_PARAM);
  // Kept in the URL after the prompt is consumed: a teacher who followed a
  // button out of a half-finished lesson needs the way back to still be there
  // once the sheet has done its job.
  const fromLesson = searchParams.get(FROM_LESSON_PARAM);
  useEffect(() => {
    if (!incomingPrompt) return;
    setLibraryPrompt(incomingPrompt);
    setApHistoryEntry(null);
    setIsAssignmentSheetOpen(true);
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(NEW_PROMPT_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true }
    );
  }, [incomingPrompt, setSearchParams]);

  const showThesisLibrary = data.thesisPromptLibrary != null;
  const isApHistoryAssignmentType =
    data.assignmentType.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY;
  const canCreateDirectDocument = !isApHistoryAssignmentType;
  const assignmentSheetClasses = isApHistoryAssignmentType
    ? (data.apHistoryLibrary?.teacherClasses ?? [])
    : data.teacherClasses;

  return (
    <div className="no-scrollbar h-full w-full overflow-y-scroll">
      <div className="mx-auto flex h-full w-full max-w-screen-md flex-col p-3 sm:p-5">
        <div className="mb-4 flex justify-between gap-2">
          {/* Arriving from a lesson, the way back is to that lesson. The
              planner embeds this page's creator inside a plan, so a teacher
              gets here mid-lesson and "Back to dashboard" strands them. */}
          <Button asChild variant="outline">
            {fromLesson ? (
              <Link
                to={`/app/lesson-planner?c=${fromLesson}`}
                className="w-fit"
                data-testid="back-to-lesson"
              >
                <CaretLeftIcon className="mr-1 h-5 w-5" /> Back to your lesson
              </Link>
            ) : (
              <Link to="/app" className="w-fit">
                <CaretLeftIcon className="mr-1 h-5 w-5" /> Back to dashboard
              </Link>
            )}
          </Button>

          {isTeacher ? (
            <>
              {canCreateDirectDocument ? (
                <>
                  <Form method="post" ref={docFormRef} className="hidden" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" className="w-fit">
                        New <ChevronDownIcon className="ml-1 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={!hasModules || isLoading}
                        onSelect={() => docFormRef.current?.requestSubmit()}
                      >
                        Document
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={data.teacherClasses.length === 0}
                        onSelect={() => {
                          setLibraryPrompt('');
                          setApHistoryEntry(null);
                          setIsAssignmentSheetOpen(true);
                        }}
                      >
                        Assignment
                      </DropdownMenuItem>
                      {showThesisLibrary || showPromptsLibrary ? (
                        <DropdownMenuItem
                          disabled={data.teacherClasses.length === 0}
                          onSelect={() => setIsPromptGeneratorOpen(true)}
                        >
                          Generate a prompt
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : null}
              <CreateAssignmentSheet
                assignmentTypeId={data.assignmentType.id}
                assignmentTypeTitle={data.assignmentType.title}
                assignmentTypeCollaborationSupported={
                  data.assignmentType.collaborationSupported
                }
                teacherClasses={assignmentSheetClasses}
                open={isAssignmentSheetOpen}
                onOpenChange={setIsAssignmentSheetOpen}
                initialPrompt={libraryPrompt}
                titleRequired={showThesisLibrary}
                apHistoryEntry={apHistoryEntry}
              />
              {showThesisLibrary ? (
                <ThesisPromptGenerator
                  open={isPromptGeneratorOpen}
                  onOpenChange={setIsPromptGeneratorOpen}
                  assignmentTypeId={data.assignmentType.id}
                  onUsePrompt={(promptBody) => {
                    setApHistoryEntry(null);
                    setLibraryPrompt(promptBody);
                    setIsPromptGeneratorOpen(false);
                    setIsAssignmentSheetOpen(true);
                  }}
                />
              ) : showPromptsLibrary ? (
                <DailyPagesPromptGenerator
                  open={isPromptGeneratorOpen}
                  onOpenChange={setIsPromptGeneratorOpen}
                  assignmentTypeId={data.assignmentType.id}
                  onUsePrompt={(prompt) => {
                    setApHistoryEntry(null);
                    setLibraryPrompt(prompt);
                    setIsPromptGeneratorOpen(false);
                    setIsAssignmentSheetOpen(true);
                  }}
                />
              ) : null}
            </>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-6 pb-6 sm:flex-row">
          {data.assignmentType.image ? (
            <img
              src={`/api/image/course/${data.assignmentType.image.id}`}
              alt={data.assignmentType.title}
              className="h-auto w-screen min-w-[170px] max-w-[250px] rounded-lg object-cover"
            />
          ) : null}
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-bold">{data.assignmentType.title}</h1>
            <p className="text-sm sm:text-base">
              {data.assignmentType.description}
            </p>
          </div>
        </div>
        {showPromptsLibrary ? <TeacherDirections /> : null}
        {showThesisLibrary ? <ThesisTeacherDirections /> : null}
        {hasModules ? (
          <Accordion type="single" collapsible>
            <AccordionItem value="modules">
              <AccordionTrigger className="py-2 text-base">
                Modules
              </AccordionTrigger>
              <AccordionContent>
                {showThesisLibrary ? (
                  <p className="mb-3 text-sm text-muted-foreground">
                    Click on the modules to see the overview of the writing
                    process that you&rsquo;ll teach your students. Training
                    videos and lesson materials are available in the
                    Teachers&rsquo; Lounge.
                  </p>
                ) : null}
                <Accordion type="multiple">
                  {data.assignmentType.assignmentModules.map((cm) => (
                    <AccordionItem
                      key={cm.id}
                      value={cm.id}
                      className="border-b border-border/40"
                    >
                      <AccordionTrigger className="py-2 text-sm">
                        {cm.title}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        {cm.description || 'No description.'}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}
        {data.promptLibrary ? (
          <div className="pb-6">
            <PromptsLibrary
              prompts={data.promptLibrary.prompts}
              facets={data.promptLibrary.facets}
              optionCounts={data.promptLibrary.optionCounts}
              totalCount={data.promptLibrary.totalCount}
              onSelectPrompt={(prompt) => {
                setApHistoryEntry(null);
                setLibraryPrompt(prompt);
                setIsAssignmentSheetOpen(true);
              }}
            />
          </div>
        ) : null}
        {data.thesisPromptLibrary ? (
          <div className="pb-6">
            <ThesisPromptsLibrary
              prompts={data.thesisPromptLibrary.prompts}
              facets={data.thesisPromptLibrary.facets}
              optionCounts={data.thesisPromptLibrary.optionCounts}
              totalCount={data.thesisPromptLibrary.totalCount}
              onSelectPrompt={(prompt) => {
                setApHistoryEntry(null);
                setLibraryPrompt(prompt);
                setIsAssignmentSheetOpen(true);
              }}
            />
          </div>
        ) : null}
        {data.apHistoryLibrary ? (
          <div className="pb-6">
            <ApHistoryLibrary
              entries={data.apHistoryLibrary.entries}
              onSelectEntry={(entry) => {
                setApHistoryEntry(entry);
                setLibraryPrompt('');
                setIsAssignmentSheetOpen(true);
              }}
            />
          </div>
        ) : null}
        {data.documents.length ? (
          <>
            <div className="grid grid-cols-2 gap-3 pb-10 pt-6 sm:grid-cols-2 md:grid-cols-3">
              {data.documents.map((doc) => (
                <DocumentLink
                  key={doc.id}
                  doc={doc}
                  exitTo={`/app/assignment-types/${data.assignmentType.id}`}
                  isStudentView
                />
              ))}
            </div>
            {data.archivedDocuments.length > 0 && (
              <div className="pb-10">
                <Accordion type="single" collapsible>
                  <AccordionItem value="archived" className="border-none">
                    <AccordionTrigger className="text-sm text-muted-foreground hover:no-underline py-2">
                      View archived documents ({data.archivedDocuments.length})
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-2 md:grid-cols-3">
                        {data.archivedDocuments.map((doc) => (
                          <DocumentLink
                            key={doc.id}
                            doc={doc}
                            exitTo={`/app/assignment-types/${data.assignmentType.id}`}
                            isArchived
                            isStudentView
                          />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            )}
          </>
        ) : !hasModules ? (
          <NoDataPlaceholder
            title="No modules"
            subtitle="Come back later to check for modules to work through."
          />
        ) : (
          <NoDataPlaceholder
            title="No documents"
            subtitle={
              isTeacher && canCreateDirectDocument ? (
                <>
                  Hit the <code className="px-1">New +</code> button above to
                  create your first document.
                </>
              ) : isTeacher ? (
                'Choose a prompt from the APUSH library to create an assignment.'
              ) : (
                'Open an assignment from one of your classes to start writing.'
              )
            }
          />
        )}
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
