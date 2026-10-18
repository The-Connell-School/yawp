import { prisma } from '~/utils/db.server';
import { getTeacherTrainingMediaAccessibilityResources } from '~/utils/teacher-training-media-accessibility';
import { getTeacherTrainingPlaybackUrl } from '~/utils/teacher-training-video-link.server';
import { matchTrainingVideos } from './assignment-videos';

/** One training video, ready for an assignment page. */
export type AssignmentTrainingVideo = {
  moduleId: string;
  title: string;
  /** The lesson in Trainings, for progress and the transcript. */
  href: string;
  /** Null when the video can't be signed right now; the page links to Trainings instead. */
  playbackUrl: string | null;
  captionSrc: string | null;
  transcriptHref: string | null;
};

/**
 * The training videos for an assignment type's steps, from the courses this
 * teacher sees in Trainings (their assigned courses, or every course when
 * none are assigned, as the Trainings page does).
 */
export async function loadAssignmentTrainingVideos(params: {
  membershipId: string;
  steps: Array<{ id: string; title: string }>;
}): Promise<{ dayOne: AssignmentTrainingVideo | null; byStepId: Record<string, AssignmentTrainingVideo> } | null> {
  const assigned = await prisma.orgMembership.findUnique({
    where: { id: params.membershipId },
    select: { _count: { select: { assignedTeacherTrainings: true } } },
  });
  const hasAssignedCourses = (assigned?._count.assignedTeacherTrainings ?? 0) > 0;
  const modules = await prisma.teacherTrainingModule.findMany({
    where: {
      deletedAt: null,
      videoS3Key: { not: null },
      teacherTraining: hasAssignedCourses ? { assignedTeachers: { some: { id: params.membershipId } } } : { isNot: null },
    },
    orderBy: [{ teacherTraining: { position: 'asc' } }, { position: 'asc' }],
    select: {
      id: true,
      title: true,
      videoS3Key: true,
      teacherTrainingId: true,
      teacherTraining: { select: { title: true } },
      resources: { select: { id: true, name: true, contentType: true } },
    },
  });
  const match = matchTrainingVideos(
    params.steps,
    modules.map((module) => ({
      ...module,
      moduleId: module.id,
      courseId: module.teacherTrainingId ?? '',
      courseTitle: module.teacherTraining?.title ?? '',
      moduleTitle: module.title,
    }))
  );
  if (!match.dayOne && Object.keys(match.byStepId).length === 0) return null;

  const view = async (module: (typeof modules)[number]): Promise<AssignmentTrainingVideo> => {
    const { captionResource, transcriptResource } = getTeacherTrainingMediaAccessibilityResources(module.resources);
    return {
      moduleId: module.id,
      title: module.title,
      href: `/app/teacher-trainings/${module.teacherTrainingId}/modules/${module.id}`,
      playbackUrl: await getTeacherTrainingPlaybackUrl(module.videoS3Key),
      captionSrc: captionResource ? `/api/teacher-training-module-resource/${captionResource.id}` : null,
      transcriptHref: transcriptResource ? `/api/teacher-training-module-resource/${transcriptResource.id}` : null,
    };
  };
  const byStepId: Record<string, AssignmentTrainingVideo> = {};
  for (const [stepId, module] of Object.entries(match.byStepId)) byStepId[stepId] = await view(module);
  return { dayOne: match.dayOne ? await view(match.dayOne) : null, byStepId };
}
