import { data, redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import {
  openClassAssignmentForStudent,
  openExistingClassAssignmentForStudent,
} from '~/domain/assignments/open-class-assignment.server';
import { AssignmentOpenLandingPage } from '~/components/assignments/assignment-open-landing-page';
import { setMembershipId } from '~/cookies/membership-id.server';
import {
  getImpersonationState,
  requireMembership,
  requireUserId,
} from '~/utils/auth.server';
import { formatClassLabel } from '~/utils/class-display';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

export type AssignmentOpenLoaderState =
  | { state: 'not-in-class'; classLabel?: string | null }
  | { state: 'not-posted'; opensAt: string; assignmentTitle: string }
  | { state: 'groups-not-open'; assignmentTitle: string }
  | { state: 'unavailable' };

function isPosted(postAt: Date | null, now: Date) {
  return postAt === null || postAt <= now;
}

async function studentHasArchivedOnlyEnrollment(
  assignmentId: string,
  membershipId: string
) {
  const active = await prisma.classAssignment.findFirst({
    where: {
      assignmentId,
      class: {
        isArchived: false,
        students: { some: { id: membershipId } },
      },
    },
    select: { id: true },
  });
  if (active) return false;

  const archived = await prisma.classAssignment.findFirst({
    where: {
      assignmentId,
      class: {
        isArchived: true,
        students: { some: { id: membershipId } },
      },
    },
    select: { id: true },
  });
  return Boolean(archived);
}

async function sampleClassLabelForAssignment(assignmentId: string) {
  const row = await prisma.classAssignment.findFirst({
    where: {
      assignmentId,
      class: { isArchived: false },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      class: {
        select: { grade: true, period: true, title: true, school: { select: { name: true } } },
      },
    },
  });
  return row ? formatClassLabel(row.class) : null;
}

async function assignmentTitleForOpen(assignmentId: string) {
  const row = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { title: true },
  });
  const title = row?.title?.trim();
  return title || 'This assignment';
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const assignmentId = params.assignmentId;
  if (!assignmentId) {
    return data(
      { state: 'unavailable' } satisfies AssignmentOpenLoaderState,
      { headers: NO_STORE }
    );
  }

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const now = new Date();

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true },
  });

  if (!assignment) {
    return data(
      { state: 'unavailable' } satisfies AssignmentOpenLoaderState,
      { headers: NO_STORE }
    );
  }

  if (profile.role === 'TEACHER') {
    const teaches = await prisma.classAssignment.findFirst({
      where: {
        assignmentId,
        class: {
          teachers: { some: { id: profile.id } },
          isArchived: false,
        },
      },
      select: { id: true },
    });
    if (teaches) {
      throw redirect(`/app/assignments/${assignmentId}`);
    }
    return redirectWithToast('/app', {
      type: 'error',
      description: 'You do not have access to this assignment.',
    });
  }

  if (profile.role !== 'STUDENT') {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'Only students can open assignments from this link.',
    });
  }

  const assignmentTitle = await assignmentTitleForOpen(assignmentId);

  const resolveForMembership = async (membershipId: string) => {
    const deployments = await prisma.classAssignment.findMany({
      where: {
        assignmentId,
        class: {
          isArchived: false,
          students: { some: { id: membershipId } },
        },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        postAt: true,
      },
    });

    const posted = deployments.find((row) => isPosted(row.postAt, now));
    if (posted) {
      return { kind: 'posted' as const, classAssignmentId: posted.id };
    }

    const scheduled = deployments
      .filter((row) => row.postAt && row.postAt > now)
      .sort(
        (a, b) => (a.postAt?.getTime() ?? 0) - (b.postAt?.getTime() ?? 0)
      )[0];
    if (scheduled?.postAt) {
      return {
        kind: 'not-posted' as const,
        opensAt: scheduled.postAt.toISOString(),
      };
    }

    return { kind: 'none' as const };
  };

  const resolution = await resolveForMembership(profile.id);

  if (resolution.kind === 'none') {
    const alternateMembership = await prisma.orgMembership.findFirst({
      where: {
        userId,
        isActive: true,
        id: { not: profile.id },
        classesAsStudent: {
          some: {
            isArchived: false,
            classAssignments: { some: { assignmentId } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (alternateMembership) {
      const url = new URL(request.url);
      throw redirect(`${url.pathname}${url.search}`, {
        headers: { 'set-cookie': await setMembershipId(alternateMembership.id) },
      });
    }

    if (await studentHasArchivedOnlyEnrollment(assignmentId, profile.id)) {
      return data(
        { state: 'unavailable' } satisfies AssignmentOpenLoaderState,
        { headers: NO_STORE }
      );
    }

    return data(
      {
        state: 'not-in-class',
        classLabel: await sampleClassLabelForAssignment(assignmentId),
      } satisfies AssignmentOpenLoaderState,
      { headers: NO_STORE }
    );
  }

  if (resolution.kind === 'not-posted') {
    return data(
      {
        state: 'not-posted',
        opensAt: resolution.opensAt,
        assignmentTitle,
      } satisfies AssignmentOpenLoaderState,
      { headers: NO_STORE }
    );
  }

  const impersonation = await getImpersonationState(request);
  const opened = impersonation.isReadOnly
    ? await openExistingClassAssignmentForStudent({
        classAssignmentId: resolution.classAssignmentId,
        membershipId: profile.id,
      })
    : await openClassAssignmentForStudent({
        classAssignmentId: resolution.classAssignmentId,
        membershipId: profile.id,
      });

  if (opened.ok) {
    throw redirect(opened.url);
  }

  if (opened.reason === 'groups-not-open') {
    return data(
      {
        state: 'groups-not-open',
        assignmentTitle,
      } satisfies AssignmentOpenLoaderState,
      { headers: NO_STORE }
    );
  }

  return data(
    { state: 'unavailable' } satisfies AssignmentOpenLoaderState,
    { headers: NO_STORE }
  );
}

export default function AssignmentOpenRoute() {
  const loaderData = useLoaderData<AssignmentOpenLoaderState>();
  return <AssignmentOpenLandingPage data={loaderData} />;
}
