import {
  type LoaderFunctionArgs,
  data as dataResponse,
  type ActionFunctionArgs,
} from 'react-router';
import { Link, useLoaderData, useNavigation } from 'react-router';
import { PlusIcon } from 'lucide-react';
import {
  parseFormData,
  ValidatedForm,
  validationError,
} from '@rvf/react-router';
import { useLocalStorage } from 'usehooks-ts';
import { z } from 'zod';
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
import { useUser } from '~/hooks/useUser.js';
import { getBase64Audio } from '~/services/openai.js';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const [course, documents] = await Promise.all([
    prisma.studentCourse.findUnique({
      where: { id: params.id },
      include: {
        image: true,
        studentCourseModules: { orderBy: { position: 'asc' } },
      },
    }),
    prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        profileId: profile.id,
        deletedAt: null,
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
      },
    }),
  ]);

  if (!course) {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'Course not found',
    });
  }

  return dataResponse({ course, documents });
}

const validator = z.object({
  audioEnabled: z.union([z.literal('true'), z.literal('false')]),
});

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const { error, data } = await parseFormData(request, validator);
  if (error) return validationError(error);

  const firstCourseModule = await prisma.studentCourseModule.findFirst({
    where: { studentCourseId: params.id },
    orderBy: { position: 'asc' },
    include: {
      instructions: {
        orderBy: { position: 'asc' },
        include: { buttons: { orderBy: { position: 'asc' } } },
      },
    },
  });

  if (!firstCourseModule) {
    return redirectWithToast(`/app/courses/${params.id}`, {
      type: 'error',
      description: 'No course modules for this course.',
    });
  }

  const firstInstruction = firstCourseModule.instructions[0];
  const shouldFetchAudio =
    data.audioEnabled &&
    firstInstruction?.prompt &&
    !(await prisma.instructionAudio.findUnique({
      where: { studentCourseModuleInstructionId: firstInstruction.id },
    }));

  const audio = shouldFetchAudio
    ? await getBase64Audio(firstInstruction.prompt, '1.5')
    : null;

  const studentProfile = await prisma.studentProfile.findUniqueOrThrow({
    where: { profileId: profile.id },
  });

  const [doc] = await Promise.all([
    prisma.document.create({
      data: {
        profileId: profile.id,
        text: '',
        html: '',
        title: '',
        studentCourseModuleSessions: {
          create: {
            studentProfileId: studentProfile.id,
            instructionsCompleted: 0,
            studentCourseModuleId: firstCourseModule.id,
            ...(firstInstruction && {
              messages: {
                create: [
                  {
                    content: firstInstruction.prompt,
                    agent: 'assistant',
                    instructionId: firstInstruction.id,
                  },
                ],
              },
            }),
          },
        },
      },
    }),
    ...(audio
      ? [
          prisma.instructionAudio.create({
            data: {
              studentCourseModuleInstructionId: firstInstruction.id,
              blob: Buffer.from(audio, 'base64'),
            },
          }),
        ]
      : []),
  ]);

  return redirectWithToast(`/app/documents/${doc.id}?spa=1`, {
    type: 'success',
    description: 'Document created successfully.',
  });
}

export default function AppCoursesIdRoute() {
  const user = useUser();
  const data = useLoaderData<typeof loader>();
  const isTeacher = !!user.selectedProfile?.teacherProfile;
  const hasModules = data.course.studentCourseModules.length > 0;
  const [speechEnabled] = useLocalStorage('speechEnabled', false);
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';

  return (
    <div className="no-scrollbar h-full w-full overflow-y-scroll">
      <div className="mx-auto flex h-full w-full max-w-screen-md flex-col p-3 sm:p-5">
        <div className="mb-4 flex justify-between gap-2">
          <Button asChild variant="outline">
            <Link to="/app" className="w-fit">
              <CaretLeftIcon className="mr-1 h-5 w-5" /> Back to dashboard
            </Link>
          </Button>
          <ValidatedForm
            method="post"
            schema={validator}
            defaultValues={{ audioEnabled: speechEnabled ? 'true' : 'false' }}
          >
            <input
              type="hidden"
              value={speechEnabled ? 'true' : 'false'}
              name="audioEnabled"
            />
            <Button
              type="submit"
              className="w-fit"
              disabled={!hasModules || isLoading}
              isLoading={isLoading}
            >
              New <PlusIcon className="ml-1 h-5 w-5" />
            </Button>
          </ValidatedForm>
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
        {hasModules ? (
          <>
            <h3 className="mb-2 text-foreground/75">Modules</h3>
            <div className="border-b" />
            <Accordion type="multiple" className="pb-6">
              {data.course.studentCourseModules.map((cm) => (
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
          <div className="grid grid-cols-2 gap-3 pb-10 pt-6 sm:grid-cols-2 md:grid-cols-3">
            {data.documents.map((doc) => (
              <DocumentLink
                key={doc.id}
                doc={doc}
                exitTo={`/app/courses/${data.course.id}`}
              />
            ))}
          </div>
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
