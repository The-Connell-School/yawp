import {
  Link,
  data,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';
import { openClassAssignmentForStudent } from '~/domain/assignments/open-class-assignment.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

export type AssignmentOpenLoaderState =
  | { state: 'not-in-class' }
  | { state: 'not-posted'; opensAt: string }
  | { state: 'groups-not-open' }
  | { state: 'unavailable' }
  | { state: 'creation-failed'; message: string };

function isPosted(postAt: Date | null, now: Date) {
  return postAt === null || postAt <= now;
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

  const resolveForMembership = async (membershipId: string) => {
    const deployments = await prisma.classAssignment.findMany({
      where: {
        assignmentId,
        class: {
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

  let resolution = await resolveForMembership(profile.id);

  if (resolution.kind === 'none') {
    const alternateMembership = await prisma.orgMembership.findFirst({
      where: {
        userId,
        isActive: true,
        id: { not: profile.id },
        classesAsStudent: {
          some: {
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

    return data(
      { state: 'not-in-class' } satisfies AssignmentOpenLoaderState,
      { headers: NO_STORE }
    );
  }

  if (resolution.kind === 'not-posted') {
    return data(
      {
        state: 'not-posted',
        opensAt: resolution.opensAt,
      } satisfies AssignmentOpenLoaderState,
      { headers: NO_STORE }
    );
  }

  const opened = await openClassAssignmentForStudent({
    classAssignmentId: resolution.classAssignmentId,
    membershipId: profile.id,
  });

  if (opened.ok) {
    throw redirect(opened.url);
  }

  if (opened.reason === 'groups-not-open') {
    return data(
      { state: 'groups-not-open' } satisfies AssignmentOpenLoaderState,
      { headers: NO_STORE }
    );
  }

  return data(
    {
      state: 'creation-failed',
      message: opened.message,
    } satisfies AssignmentOpenLoaderState,
    { headers: NO_STORE }
  );
}

export default function AssignmentOpenRoute() {
  const loaderData = useLoaderData<AssignmentOpenLoaderState>();

  if (loaderData.state === 'not-in-class') {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16 text-center">
        <p data-testid="open-not-in-class">
          You&apos;re not in this class yet. Ask your teacher for the class code.
        </p>
        <div className="flex flex-col items-center gap-2">
          <Link to="/join" className="text-primary underline">
            Join a class
          </Link>
          <Link to="/app" className="text-primary underline">
            Back to Yawp!
          </Link>
        </div>
      </main>
    );
  }

  if (loaderData.state === 'not-posted') {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16 text-center">
        <p data-testid="open-not-posted">
          Your teacher hasn&apos;t posted this yet (opens{' '}
          {new Date(loaderData.opensAt).toLocaleString()}).
        </p>
        <Link to="/app" className="text-primary underline">
          Back to Yawp!
        </Link>
      </main>
    );
  }

  if (loaderData.state === 'groups-not-open') {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16 text-center">
        <p data-testid="open-groups-not-open">
          Your teacher hasn&apos;t opened groups yet.
        </p>
        <Link to="/app" className="text-primary underline">
          Back to Yawp!
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16 text-center">
      <p data-testid="open-unavailable">
        {loaderData.state === 'creation-failed'
          ? loaderData.message
          : "This assignment isn't available."}
      </p>
      <Link to="/app" className="text-primary underline">
        Back to Yawp!
      </Link>
    </main>
  );
}
