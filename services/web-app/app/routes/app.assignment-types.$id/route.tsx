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
  createDocumentForAssignmentType,
  DocumentCreationError,
} from '~/domain/documents.server';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { CreateAssignmentSheet } from './create-assignment-sheet';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const [assignmentType, documents, archivedDocuments, teacherClasses] =
    await Promise.all([
      prisma.assignmentType.findFirst({
        where: {
          id: params.id,
          organizationAssignments: {
            some: { organizationId: profile.organization.id },
          },
        },
        include: {
          image: true,
          assignmentModules: {
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

  if (!assignmentType) {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'Assignment type not found',
    });
  }

  return dataResponse({
    assignmentType,
    documents,
    archivedDocuments,
    teacherClasses,
  });
}
export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const assignmentType = await prisma.assignmentType.findFirst({
    where: {
      id: params.id,
      organizationAssignments: {
        some: { organizationId: profile.organization.id },
      },
    },
    select: { id: true },
  });

  if (!assignmentType) {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'Assignment type not found',
    });
  }

  let documentId = '';
  try {
    const created = await createDocumentForAssignmentType({
      profileId: profile.id,
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
  const isTeacher = !!user.selectedProfile?.teacherProfile;
  const hasModules = data.assignmentType.assignmentModules.length > 0;
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';
  const docFormRef = useRef<HTMLFormElement>(null);
  const [isAssignmentSheetOpen, setIsAssignmentSheetOpen] = useState(false);

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
                    onSelect={() => setIsAssignmentSheetOpen(true)}
                  >
                    Assignment
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <CreateAssignmentSheet
                assignmentTypeId={data.assignmentType.id}
                teacherClasses={data.teacherClasses}
                open={isAssignmentSheetOpen}
                onOpenChange={setIsAssignmentSheetOpen}
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
        {hasModules ? (
          <>
            <h3 className="mb-2 text-foreground/75">Modules</h3>
            <div className="border-b" />
            <Accordion type="multiple" className="pb-6">
              {data.assignmentType.assignmentModules.map((cm) => (
                <AccordionItem key={cm.id} value={cm.id}>
                  <AccordionTrigger className="py-2 text-base">
                    {cm.title}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {cm.description || 'No description.'}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </>
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
              <>
                Hit the <code className="px-1">New +</code> button above to
                create your first document.
              </>
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
