import {
  Form,
  type LoaderFunctionArgs,
  redirect,
  useLoaderData,
} from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import {
  recordShareLinkLaunch,
  resolveShareLinkByToken,
} from '~/integrations/google-classroom/share-link.server';
import { Button } from '~/components/ui/button';

/**
 * Where a Google Classroom link lands.
 *
 * This route is public in the sense that anyone may request it; it is not
 * public in what it shows. The token identifies an assignment, `requireUserId`
 * makes the visitor sign in (returning them here afterwards), and the roster
 * check below decides where — or whether — they go next. The token alone
 * never grants access to student work.
 *
 * Deliberately not gated on Organization.googleClassroomEnabled. Turning the
 * flag off should stop new links being minted, not break the ones a teacher
 * already posted into Classroom mid-unit; revoking the individual link is the
 * switch that closes an existing door.
 */

type NotEnrolledData = {
  status: 'not-enrolled';
  className: string;
  assignmentTitle: string;
};

function notFound(): never {
  throw new Response('Not Found', { status: 404 });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = params.token;
  if (!token) notFound();

  const link = await resolveShareLinkByToken(token);
  // A revoked token and a guessed one look identical from out here on purpose.
  if (!link) notFound();

  // Sign-in happens after the token is resolved so a bad link never sends
  // someone through a login round trip only to 404 on the far side.
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);

  const { classAssignment } = link;
  const klass = classAssignment.class;

  // One query answers both questions. Prisma filters each relation down to this
  // membership, so a non-empty array means "yes, this person, in this class".
  const roster = await prisma.class.findFirst({
    where: { id: klass.id },
    select: {
      id: true,
      students: { where: { id: membership.id }, select: { id: true } },
      teachers: { where: { id: membership.id }, select: { id: true } },
    },
  });

  const isTeacherOfClass = Boolean(roster?.teachers.length);
  const isStudentInClass = Boolean(roster?.students.length);

  if (!isTeacherOfClass && !isStudentInClass) {
    return {
      status: 'not-enrolled',
      className: klass.title || 'this class',
      assignmentTitle: classAssignment.assignment.title || 'this assignment',
    } satisfies NotEnrolledData;
  }

  await recordShareLinkLaunch(link.id);

  if (isTeacherOfClass) {
    return redirect(
      `/app/my-classes/${klass.id}/assignments/${classAssignment.assignmentId}`
    );
  }

  // Scheduled but not yet posted. The student followed a real link to a real
  // assignment, so say so rather than dropping them somewhere silently.
  const postAt = classAssignment.postAt;
  if (postAt && new Date(postAt).getTime() > Date.now()) {
    return redirectWithToast('/app?tab=assignments', {
      type: 'message',
      description: 'That assignment is not open yet. Check back soon.',
    });
  }

  return redirectWithToast('/app?tab=assignments', {
    type: 'success',
    description: 'Here is your assignment from Google Classroom.',
  });
}

export default function ClassroomLaunchRoute() {
  const data = useLoaderData<typeof loader>() as NotEnrolledData;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">You are not in {data.className}</h1>
      <p className="text-muted-foreground">
        This Google Classroom link points to {data.assignmentTitle}, but the
        YAWP account you are signed in to is not on that class roster. If you
        have more than one YAWP account, sign in with the one your school gave
        you.
      </p>
      <div className="flex flex-col gap-2">
        <Button asChild>
          <a href="/app">Go to YAWP</a>
        </Button>
        <Form method="post" action="/auth/logout">
          <Button type="submit" variant="outline" className="w-full">
            Sign in as someone else
          </Button>
        </Form>
      </div>
    </main>
  );
}
