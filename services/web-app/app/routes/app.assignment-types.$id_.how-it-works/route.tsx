/**
 * "See how it works" for The Thesis-Driven Essay, and for Prewriting, Thesis
 * Statement, Class Starter and Exit Ticket (their own shorter guides): the
 * access check and what each page needs. The pages are thesis-essay-guide.tsx,
 * writing-step-guide.tsx, class-starter-guide.tsx and exit-ticket-guide.tsx.
 *
 * With Brian's landing pages on (`assignment-type-landing-v2`) the four
 * shorter guides open with their overview video and How to Teach It, and
 * Exit Ticket has a guide at all (Kevin, Nov 10). Off: as before.
 */
import { redirect, type LoaderFunctionArgs } from 'react-router';
import { useLoaderData } from 'react-router';
import { assignmentTypeAvailableForTeacher } from '~/domain/assignment-types/available-for-teacher.server';
import { howItWorksGuideFor } from '~/domain/assignment-types/how-it-works-guide';
import { EXIT_TICKET_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/exit-ticket';
import { getAssignmentTypeLandingFlags } from '~/domain/assignment-types/landing-page-gate.server';
import { isThesisDrivenEssayTitle } from '~/domain/assignment-types/thesis-driven-essay';
import {
  findThesisEssayCourse,
  tutorialHrefs,
} from '~/domain/teacher-trainings/thesis-essay-course.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { getLessonMaterialsForAssignmentType } from '~/domain/assignment-types/lesson-materials.server';
import {
  isWritingStepKind,
  WRITING_STEP_COPY,
} from '../app.assignment-types.$id/about-writing-step/content';
import { ClassStarterGuide } from './class-starter-guide';
import { ExitTicketGuide } from './exit-ticket-guide';
import { ThesisEssayGuide } from './thesis-essay-guide';
import { WritingStepGuide } from './writing-step-guide';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') throw redirect('/app');

  const assignmentTypeId = params.id ?? '';
  const pagePath = `/app/assignment-types/${assignmentTypeId}`;

  // The same access check as the assignment type page.
  const available = await assignmentTypeAvailableForTeacher({
    assignmentTypeId,
    membershipId: profile.id,
    organizationId: profile.organization.id,
  });
  if (!available) throw redirect('/app');

  const assignmentType = await prisma.assignmentType.findFirst({
    where: { id: assignmentTypeId, archivedAt: null },
    select: { id: true, title: true, kind: true },
  });
  const { v2 } = await getAssignmentTypeLandingFlags(profile.organization.id);
  // Prewriting and Thesis Statement, single steps of the essay, have their own
  // shorter guide.
  if (assignmentType && isWritingStepKind(assignmentType.kind)) {
    return {
      guide: 'writing-step' as const,
      kind: assignmentType.kind,
      pagePath,
      v2,
      lesson: await getLessonMaterialsForAssignmentType(
        assignmentType.kind,
        profile.id
      ),
      // How to Teach It's "Watch tutorial": the lesson's Lounge video, played
      // on this type's own tutorial page, as on the landing page.
      lessonVideos: v2
        ? tutorialHrefs(assignmentTypeId, await findThesisEssayCourse(profile.id))
        : {},
    };
  }
  if (assignmentType?.kind === EXIT_TICKET_ASSIGNMENT_TYPE_KIND) {
    if (!v2) throw redirect(pagePath);
    return { guide: 'exit-ticket' as const, pagePath };
  }
  const titleGuide = assignmentType
    ? howItWorksGuideFor(assignmentType.title)
    : null;
  if (titleGuide === 'class-starter') {
    return { guide: 'class-starter' as const, pagePath, v2 };
  }
  // Otherwise only The Thesis-Driven Essay has a guide so far.
  if (!assignmentType || !isThesisDrivenEssayTitle(assignmentType.title)) {
    throw redirect(pagePath);
  }

  // The course that teaches teachers the process, linked only when this
  // teacher can open it, by the same rule as the Teacher Training page.
  const course = await findThesisEssayCourse(profile.id);

  return {
    guide: 'thesis-essay' as const,
    pagePath,
    coursePath: course?.coursePath ?? null,
  };
}

export default function HowItWorksRoute() {
  const data = useLoaderData<typeof loader>();
  if (data.guide === 'writing-step') {
    return (
      <WritingStepGuide
        kind={data.kind}
        copy={WRITING_STEP_COPY[data.kind]}
        pagePath={data.pagePath}
        lesson={data.lesson}
        v2={data.v2}
        lessonVideos={data.lessonVideos}
      />
    );
  }
  if (data.guide === 'class-starter') {
    return <ClassStarterGuide pagePath={data.pagePath} v2={data.v2} />;
  }
  if (data.guide === 'exit-ticket') {
    return <ExitTicketGuide pagePath={data.pagePath} />;
  }
  return (
    <ThesisEssayGuide pagePath={data.pagePath} coursePath={data.coursePath} />
  );
}
