import { useRef, useState } from 'react';
import {
  type LoaderFunctionArgs,
  data as dataResponse,
  type ActionFunctionArgs,
  Form,
} from 'react-router';
import { Link, useLoaderData, useNavigation } from 'react-router';
import { ChevronDownIcon, PlusIcon } from 'lucide-react';
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
  createStudentDocumentForCourse,
  StudentDocumentCreationError,
} from '~/domain/student-documents.server';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { CreateAssignmentSheet } from './create-assignment-sheet';
import { PromptsLibrary } from './prompts-library/prompts-library';
import { TeacherDirections } from './prompts-library/teacher-directions';
import {
  type CognitiveMove,
  FACET_KEYS,
  type FacetValues,
  type GradeBand,
  type LibraryPrompt,
  type OptionCounts,
  type PromptSeriousness,
  type PromptType,
} from './prompts-library/data';
import promptsRaw from './prompts-library/prompts.json';

const DAILY_PAGES_TITLE = 'daily pages';
const ALL_PROMPTS = promptsRaw as LibraryPrompt[];

const SERIOUSNESS_ORDER: PromptSeriousness[] = [
  'playful',
  'light',
  'moderate',
  'serious',
  'heavy',
];
const GRADE_ORDER: GradeBand[] = ['9', '10', '11', '12'];

function buildFacets(prompts: LibraryPrompt[]): FacetValues {
  const themes = new Set<string>();
  const textsOrUnits = new Set<string>();
  const moves = new Set<CognitiveMove>();
  const types = new Set<PromptType>();
  const seriousness = new Set<PromptSeriousness>();
  const grades = new Set<GradeBand>();
  for (const p of prompts) {
    p.themes.forEach((t) => themes.add(t));
    p.textsOrUnits.forEach((t) => textsOrUnits.add(t));
    p.cognitiveMoves.forEach((m) => moves.add(m));
    types.add(p.type);
    seriousness.add(p.seriousness);
    p.gradeBands.forEach((g) => grades.add(g));
  }
  return {
    themes: [...themes].sort(),
    textsOrUnits: [...textsOrUnits].sort(),
    cognitiveMoves: [...moves].sort(),
    types: [...types].sort(),
    seriousness: SERIOUSNESS_ORDER.filter((s) => seriousness.has(s)),
    gradeBands: GRADE_ORDER.filter((g) => grades.has(g)),
  };
}

function buildOptionCounts(prompts: LibraryPrompt[]): OptionCounts {
  const counts: OptionCounts = {
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
  for (const p of prompts) {
    p.themes.forEach((t) => bump(counts.themes, t));
    p.textsOrUnits.forEach((t) => bump(counts.textsOrUnits, t));
    p.cognitiveMoves.forEach((m) => bump(counts.cognitiveMoves, m));
    bump(counts.types, p.type);
    bump(counts.seriousness, p.seriousness);
    p.gradeBands.forEach((g) => bump(counts.gradeBands, g));
  }
  return counts;
}

const ALL_FACETS = buildFacets(ALL_PROMPTS);
const ALL_OPTION_COUNTS = buildOptionCounts(ALL_PROMPTS);

type LibraryFilters = {
  q: string;
  themes: Set<string>;
  textsOrUnits: Set<string>;
  cognitiveMoves: Set<string>;
  types: Set<string>;
  seriousness: Set<string>;
  gradeBands: Set<string>;
};

function readFilters(url: URL): LibraryFilters {
  const set = (key: string) =>
    new Set(url.searchParams.get(key)?.split(',').filter(Boolean) ?? []);
  return {
    q: (url.searchParams.get(FACET_KEYS.search) ?? '').trim().toLowerCase(),
    themes: set(FACET_KEYS.themes),
    textsOrUnits: set(FACET_KEYS.textsOrUnits),
    cognitiveMoves: set(FACET_KEYS.cognitiveMoves),
    types: set(FACET_KEYS.types),
    seriousness: set(FACET_KEYS.seriousness),
    gradeBands: set(FACET_KEYS.gradeBands),
  };
}

function applyFilters(
  prompts: LibraryPrompt[],
  f: LibraryFilters
): LibraryPrompt[] {
  return prompts.filter((p) => {
    if (f.themes.size && !p.themes.some((t) => f.themes.has(t))) return false;
    if (
      f.textsOrUnits.size &&
      !p.textsOrUnits.some((t) => f.textsOrUnits.has(t))
    ) {
      return false;
    }
    if (
      f.cognitiveMoves.size &&
      !p.cognitiveMoves.some((m) => f.cognitiveMoves.has(m))
    ) {
      return false;
    }
    if (f.types.size && !f.types.has(p.type)) return false;
    if (f.seriousness.size && !f.seriousness.has(p.seriousness)) return false;
    if (
      f.gradeBands.size &&
      !p.gradeBands.some((g) => f.gradeBands.has(g))
    ) {
      return false;
    }
    if (f.q && !p.prompt.toLowerCase().includes(f.q)) return false;
    return true;
  });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const [course, documents, archivedDocuments, teacherClasses] =
    await Promise.all([
      prisma.studentCourse.findUnique({
        where: { id: params.id },
        include: {
          image: true,
          studentCourseModules: {
            where: { deletedAt: null },
            orderBy: { position: 'asc' },
          },
        },
      }),
      prisma.document.findMany({
        orderBy: { createdAt: 'desc' },
        where: {
          profileId: profile.id,
          deletedAt: null,
          archivedAt: null,
          studentCourseModuleSessions: {
            some: { studentCourseModule: { studentCourseId: params.id } },
          },
        },
        include: {
          studentCourseModuleSessions: {
            take: 1,
            orderBy: { studentCourseModule: { position: 'desc' } },
            include: { studentCourseModule: true },
          },
          submissions: {
            where: { archivedAt: null },
            orderBy: { submittedAt: 'desc' },
            take: 1,
            select: {
              id: true,
              score: true,
              overallScore: true,
              numericPercentage: true,
              letterGrade: true,
              releasedAt: true,
            },
          },
        },
      }),
      prisma.document.findMany({
        orderBy: { archivedAt: 'desc' },
        where: {
          profileId: profile.id,
          deletedAt: null,
          archivedAt: { not: null },
          studentCourseModuleSessions: {
            some: { studentCourseModule: { studentCourseId: params.id } },
          },
        },
        include: {
          studentCourseModuleSessions: {
            take: 1,
            orderBy: { studentCourseModule: { position: 'desc' } },
            include: { studentCourseModule: true },
          },
          submissions: {
            where: { archivedAt: null },
            orderBy: { submittedAt: 'desc' },
            take: 1,
            select: {
              id: true,
              score: true,
              overallScore: true,
              numericPercentage: true,
              letterGrade: true,
              releasedAt: true,
            },
          },
        },
      }),
      profile.teacherProfile
        ? prisma.class.findMany({
            where: {
              teachers: { some: { id: profile.teacherProfile.id } },
              isArchived: false,
            },
            select: { id: true, grade: true, period: true, title: true },
            orderBy: [{ grade: 'asc' }, { period: 'asc' }],
          })
        : [],
    ]);

  if (!course) {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'Course not found',
    });
  }

  const isDailyPages =
    course.title.trim().toLowerCase() === DAILY_PAGES_TITLE;
  const promptLibrary =
    profile.teacherProfile && isDailyPages
      ? {
          prompts: applyFilters(
            ALL_PROMPTS,
            readFilters(new URL(request.url))
          ),
          facets: ALL_FACETS,
          optionCounts: ALL_OPTION_COUNTS,
          totalCount: ALL_PROMPTS.length,
        }
      : null;

  return dataResponse({
    course,
    documents,
    archivedDocuments,
    teacherClasses,
    promptLibrary,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  let documentId = '';
  try {
    const created = await createStudentDocumentForCourse({
      profileId: profile.id,
      studentCourseId: params.id!,
    });
    documentId = created.documentId;
  } catch (creationError) {
    if (creationError instanceof StudentDocumentCreationError) {
      return redirectWithToast(`/app/courses/${params.id}`, {
        type: 'error',
        description: creationError.message,
      });
    }
    throw creationError;
  }

  const requestUrl = new URL(request.url);
  const currentPath = `${requestUrl.pathname}${requestUrl.search}`;
  const redirectParams = new URLSearchParams({ exitTo: currentPath });

  return redirectWithToast(
    `/app/documents/${documentId}?${redirectParams.toString()}`,
    { type: 'success', description: 'Document created successfully.' }
  );
}

export default function AppCoursesIdRoute() {
  const user = useUser();
  const data = useLoaderData<typeof loader>();
  const isTeacher = !!user.selectedProfile?.teacherProfile;
  const hasModules = data.course.studentCourseModules.length > 0;
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';
  const docFormRef = useRef<HTMLFormElement>(null);
  const [isAssignmentSheetOpen, setIsAssignmentSheetOpen] = useState(false);
  const [libraryPrompt, setLibraryPrompt] = useState('');

  const showPromptsLibrary = data.promptLibrary != null;

  return (
    <div className="no-scrollbar h-full w-full overflow-y-scroll">
      <div className="mx-auto flex h-full w-full max-w-screen-md flex-col p-3 sm:p-5">
        <div className="mb-4 flex justify-between gap-2">
          <Button asChild variant="outline">
            <Link to="/app" className="w-fit">
              <CaretLeftIcon className="mr-1 h-5 w-5" /> Back to dashboard
            </Link>
          </Button>

          {isTeacher ? (
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
                      setIsAssignmentSheetOpen(true);
                    }}
                  >
                    Assignment
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <CreateAssignmentSheet
                studentCourseId={data.course.id}
                teacherClasses={data.teacherClasses}
                open={isAssignmentSheetOpen}
                onOpenChange={setIsAssignmentSheetOpen}
                initialPrompt={libraryPrompt}
              />
            </>
          ) : (
            <Form method="post">
              <Button
                type="submit"
                className="w-fit"
                disabled={!hasModules || isLoading}
                isLoading={isLoading}
              >
                New <PlusIcon className="ml-1 h-5 w-5" />
              </Button>
            </Form>
          )}
        </div>

        <div className="flex flex-col items-start gap-6 pb-6 sm:flex-row">
          {data.course.image ? (
            <img
              src={`/api/image/course/${data.course.image.id}`}
              alt={data.course.title}
              className="h-auto w-screen min-w-[170px] max-w-[250px] rounded-lg object-cover"
            />
          ) : null}
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-bold">{data.course.title}</h1>
            <p className="text-sm sm:text-base">{data.course.description}</p>
          </div>
        </div>

        {showPromptsLibrary ? <TeacherDirections /> : null}

        {hasModules ? (
          <>
            <h3 className="mb-2 text-foreground/75">Modules</h3>
            <div className="border-b" />
            <Accordion type="multiple">
              {data.course.studentCourseModules.map((cm) => {
                const isDailyPagesTeacherView =
                  showPromptsLibrary &&
                  cm.title.trim().toLowerCase() === 'daily pages';
                if (isDailyPagesTeacherView) {
                  return (
                    <AccordionItem key={cm.id} value={cm.id}>
                      <AccordionTrigger className="py-2 text-base">
                        How Teachers Use Daily Pages
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                          <p>
                            Not every writing assignment has to be long or even
                            particularly academic — sometimes, in fact often,
                            it&apos;s good to get students to write freely
                            about things that interest them. Daily Pages is
                            intended to get students writing. This is where
                            their ideas can first take shape.
                          </p>
                          <p>
                            Some teachers use Daily Pages every day at the
                            beginning of class. Other teachers will use it to
                            have students reflect on a movie, or a poem, or
                            something they might have done in class.
                          </p>
                          <p>
                            I use Daily Pages to get my students thinking about
                            things that interest them in relation to what
                            we&apos;re reading. These are big ideas. If
                            we&apos;re reading <em>Macbeth</em>, I want
                            students thinking about dreams, goals, desires, and
                            how chasing them can get messy; or I want them
                            thinking about how people can influence us to do
                            things we don&apos;t truly want to do —
                            self-betrayal.
                          </p>
                          <p>
                            Use Daily Pages however you want! But lean into the
                            fun of it!
                          </p>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                }
                return (
                  <AccordionItem key={cm.id} value={cm.id}>
                    <AccordionTrigger className="py-2 text-base">
                      {cm.title}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {cm.description || 'No description.'}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </>
        ) : null}

        {data.promptLibrary ? (
          <div className="pb-6">
            <PromptsLibrary
              prompts={data.promptLibrary.prompts}
              facets={data.promptLibrary.facets}
              optionCounts={data.promptLibrary.optionCounts}
              totalCount={data.promptLibrary.totalCount}
              onSelectPrompt={(prompt) => {
                setLibraryPrompt(prompt);
                setIsAssignmentSheetOpen(true);
              }}
            />
          </div>
        ) : null}

        {data.documents.length ? (
          <>
            <Accordion type="single" collapsible>
              <AccordionItem value="your-pages">
                <AccordionTrigger className="py-2 text-base">
                  Your Pages
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-2 gap-3 pb-4 pt-2 sm:grid-cols-2 md:grid-cols-3">
                    {data.documents.map((doc) => (
                      <DocumentLink
                        key={doc.id}
                        doc={doc}
                        exitTo={`/app/courses/${data.course.id}`}
                        isStudentView
                      />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            {data.archivedDocuments.length > 0 && (
              <div className="pb-10">
                <Accordion type="single" collapsible>
                  <AccordionItem value="archived" className="border-none">
                    <AccordionTrigger className="text-sm text-muted-foreground hover:no-underline py-2">
                      View archived documents (
                      {data.archivedDocuments.length})
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-2 md:grid-cols-3">
                        {data.archivedDocuments.map((doc) => (
                          <DocumentLink
                            key={doc.id}
                            doc={doc}
                            exitTo={`/app/courses/${data.course.id}`}
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
        ) : !hasModules && !showPromptsLibrary ? (
          <NoDataPlaceholder
            title="No modules"
            subtitle="Come back later to check for modules to work through."
          />
        ) : !showPromptsLibrary ? (
          <NoDataPlaceholder
            title="No documents"
            subtitle={
              <>
                Hit the <code className="px-1">New</code> button above to
                create your first document.
              </>
            }
          />
        ) : null}
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
