import {
  Form,
  data as dataResponse,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { Button } from '~/components/ui/button';
import { MAX_COLLABORATION_GROUP_SIZE } from '~/domain/assignments/collaboration';
import {
  createSharedDocument,
  DocumentShareError,
  listShareableClassmates,
  shareDocumentCopy,
} from '~/domain/collaboration/share.server';
import { localRoomClient } from '~/domain/collaboration/room-store.server';
import { seedGroupRoomIfEmpty } from '~/domain/collaboration/seed.server';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { resolveSchoolYearScopeForMembership } from '~/utils/school-year-scope.server';
import { studentAssignmentTypeScopes } from '~/utils/student-assignment-type-scopes.server';
import { redirectWithToast } from '~/utils/toast.server';

/**
 * The student's road to a shared document: start one and invite classmates.
 *
 * The other road is the teacher arranging groups on an assignment. Both converge
 * on the same `DocumentGroup`, so from here on the collaborative editor, the token
 * endpoint, the webhook and the dual-write treat the two identically.
 *
 * Two ways in, because a student may already have started writing:
 *
 * - **Start a shared draft** — new and empty, shared from the moment it exists.
 * - **Share a copy of a draft** — copies an existing draft's content into a new
 *   shared document and seeds the room from it. A copy rather than a conversion,
 *   so their original private draft is untouched and the solo editor never ends up
 *   writing to the same row the CRDT owns.
 *
 * The pilot gate is `AssignmentType.collaborationSupported`, the same one the
 * teacher road and the transport enforce, so a student is only ever offered kinds
 * of writing the collaborative page will actually serve.
 *
 * ⚠️ The loader and action are unit-tested. THE RENDERED UI IS UNVERIFIED.
 */
/**
 * The kinds of writing this student may start a shared draft of.
 *
 * Access is resolved through enrollment — the same rule the dashboard uses to
 * decide what a student may start at all — and then narrowed to the pilot. It is
 * the loader's option list and the action's validation set, so what is offered
 * and what is accepted cannot drift apart.
 */
async function collaborativeAssignmentTypesForStudent(
  request: Request,
  profile: { id: string; role: string }
) {
  const schoolYearScope = await resolveSchoolYearScopeForMembership(
    request,
    profile
  );
  const scopes = await studentAssignmentTypeScopes({
    membershipId: profile.id,
    schoolYearScope,
  });

  const types = await getAvailableAssignmentTypesForScopes<{
    id: string;
    title: string;
    collaborationSupported: boolean;
  }>({
    scopes,
    select: { id: true, title: true, collaborationSupported: true },
    orderBy: { position: 'asc' },
  });

  return types.filter((type) => type.collaborationSupported);
}

async function requireSharingStudent(request: Request) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  const membership = await prisma.orgMembership.findFirst({
    where: { id: profile.id, role: 'STUDENT', isActive: true },
    select: { id: true },
  });

  return { profile, membership };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { profile, membership } = await requireSharingStudent(request);

  if (!membership) {
    // Indistinguishable from nonexistent for a teacher, whose road to a shared
    // document is arranging groups on an assignment.
    throw dataResponse(
      { message: 'Not found.' },
      { status: 404, statusText: 'Not Found' }
    );
  }

  const [classmates, drafts, assignmentTypes] = await Promise.all([
    listShareableClassmates({ membershipId: profile.id }),
    // Their own drafts, offered as a starting point. Only unshared ones, and only
    // kinds of writing in the pilot: a draft that already belongs to a group is
    // not a candidate for sharing again, and one whose type is not collaborative
    // would become a room nothing else would serve.
    prisma.document.findMany({
      where: {
        membershipId: profile.id,
        deletedAt: null,
        archivedAt: null,
        group: null,
        assignmentType: { collaborationSupported: true },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        assignmentTypeId: true,
        assignmentType: { select: { title: true } },
      },
    }),
    collaborativeAssignmentTypesForStudent(request, profile),
  ]);

  // Arriving from a draft's own menu: that draft is what they meant to share, so
  // it is preselected rather than making them find it in the list again.
  const requestedSourceId = new URL(request.url).searchParams.get(
    'sourceDocumentId'
  );
  const preselectedDraftId = drafts.some(
    (draft) => draft.id === requestedSourceId
  )
    ? requestedSourceId
    : null;

  return dataResponse({
    classmates,
    preselectedDraftId,
    maxWriters: MAX_COLLABORATION_GROUP_SIZE,
    // Offered whether or not the student has written anything yet. Deriving the
    // options from their existing drafts, as this page first did, made the
    // "start a new shared draft" road unreachable for exactly the student who
    // has not started one — which is most of them, the first time.
    assignmentTypes: assignmentTypes.map((type) => ({
      id: type.id,
      title: type.title,
    })),
    drafts: drafts.map((draft) => ({
      id: draft.id,
      title: draft.title?.trim() || 'Untitled',
      assignmentTypeId: draft.assignmentTypeId,
      assignmentTypeTitle: draft.assignmentType.title,
      updatedAt: draft.updatedAt.toISOString(),
    })),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { profile, membership } = await requireSharingStudent(request);
  const backTo = '/app/shared-drafts/new';

  if (!membership) {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'Sharing drafts with classmates is not available.',
    });
  }

  const formData = await request.formData();
  const intent = formData.get('intent')?.toString();
  const inviteMembershipIds = formData
    .getAll('classmateIds')
    .map((value) => value.toString())
    .filter(Boolean);

  try {
    if (intent === 'share-copy') {
      const sourceDocumentId = formData.get('sourceDocumentId')?.toString();
      if (!sourceDocumentId) {
        return redirectWithToast(backTo, {
          type: 'error',
          description: 'Choose which draft to share.',
        });
      }

      const shared = await shareDocumentCopy({
        membershipId: profile.id,
        sourceDocumentId,
        inviteMembershipIds,
      });

      // Seed the room from the copied content. Failing here leaves the draft
      // usable but empty, and `seededAt` unstamped so it can be retried — so the
      // student is told plainly rather than silently handed a blank page.
      try {
        await seedGroupRoomIfEmpty({
          groupId: shared.groupId,
          client: localRoomClient(),
        });
      } catch {
        return redirectWithToast(
          `/app/collab-documents/${shared.documentId}`,
          {
            type: 'error',
            description:
              'Shared draft created, but your existing writing could not be copied into it yet. Your original draft is untouched.',
          }
        );
      }

      return redirectWithToast(`/app/collab-documents/${shared.documentId}`, {
        type: 'success',
        description: 'Shared draft ready. Your original draft is untouched.',
      });
    }

    if (intent === 'create') {
      const assignmentTypeId = formData.get('assignmentTypeId')?.toString();
      if (!assignmentTypeId) {
        return redirectWithToast(backTo, {
          type: 'error',
          description: 'Choose what kind of writing this is.',
        });
      }

      // Do not trust the posted id: re-derive the permitted set rather than
      // believing the form, so an id crafted by hand cannot reach a kind of
      // writing outside this student's classes or outside the pilot.
      const permitted = await collaborativeAssignmentTypesForStudent(
        request,
        profile
      );
      if (!permitted.some((type) => type.id === assignmentTypeId)) {
        return redirectWithToast(backTo, {
          type: 'error',
          description: 'That kind of writing is not available to you.',
        });
      }

      const created = await createSharedDocument({
        membershipId: profile.id,
        assignmentTypeId,
        inviteMembershipIds,
      });

      // Nothing to seed: it starts empty by construction.
      return redirectWithToast(`/app/collab-documents/${created.documentId}`, {
        type: 'success',
        description: 'Shared draft created.',
      });
    }
  } catch (error) {
    if (error instanceof DocumentShareError) {
      return redirectWithToast(backTo, {
        type: 'error',
        description: error.message,
      });
    }
    throw error;
  }

  return redirectWithToast(backTo, {
    type: 'error',
    description: 'Unsupported action.',
  });
}

export default function NewSharedDraftRoute() {
  const { assignmentTypes, classmates, drafts, maxWriters, preselectedDraftId } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';

  if (classmates.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <h1 className="mb-2 text-xl font-semibold">Write with a classmate</h1>
        <p className="text-sm text-gray-600">
          You are not in a class with anyone else yet, so there is nobody to share
          a draft with.
        </p>
      </div>
    );
  }

  const classmatePicker = (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">
        Who are you writing with?{' '}
        <span className="font-normal text-gray-600">
          (up to {maxWriters - 1} classmates)
        </span>
      </legend>
      {classmates.map((classmate) => (
        <label
          key={classmate.membershipId}
          className="flex items-center gap-2 text-sm"
        >
          <input
            type="checkbox"
            name="classmateIds"
            value={classmate.membershipId}
            className="size-4"
          />
          {classmate.name}
        </label>
      ))}
    </fieldset>
  );

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Write with a classmate</h1>
        <p className="text-sm text-gray-600">
          A shared draft is one document everyone in it writes in at the same time.
        </p>
      </header>

      {drafts.length > 0 ? (
        <Form method="post" className="mb-8 grid gap-4 rounded border p-4">
          <input type="hidden" name="intent" value="share-copy" />
          <div>
            <h2 className="text-sm font-semibold">Share a copy of a draft</h2>
            <p className="text-sm text-gray-600">
              Your original stays private and unchanged — this makes a shared copy
              to work on together.
            </p>
          </div>

          <label className="grid gap-1 text-sm">
            Which draft?
            <select
              name="sourceDocumentId"
              className="rounded border px-2 py-1"
              defaultValue={preselectedDraftId ?? drafts[0].id}
            >
              {drafts.map((draft) => (
                <option key={draft.id} value={draft.id}>
                  {draft.title} · {draft.assignmentTypeTitle}
                </option>
              ))}
            </select>
          </label>

          {classmatePicker}

          <Button type="submit" disabled={busy} className="justify-self-start">
            Share a copy
          </Button>
        </Form>
      ) : null}

      <Form method="post" className="grid gap-4 rounded border p-4">
        <input type="hidden" name="intent" value="create" />
        <div>
          <h2 className="text-sm font-semibold">Or start a new shared draft</h2>
          <p className="text-sm text-gray-600">
            Begins empty, shared from the moment you create it.
          </p>
        </div>

        {assignmentTypes.length > 0 ? (
          <label className="grid gap-1 text-sm">
            What kind of writing?
            <select
              name="assignmentTypeId"
              className="rounded border px-2 py-1"
              defaultValue={assignmentTypes[0].id}
            >
              {assignmentTypes.map((assignmentType) => (
                <option key={assignmentType.id} value={assignmentType.id}>
                  {assignmentType.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-gray-600">
            None of your classes use a kind of writing you can work on together
            yet.
          </p>
        )}

        {classmatePicker}

        <Button
          type="submit"
          disabled={busy || assignmentTypes.length === 0}
          className="justify-self-start"
        >
          Start a shared draft
        </Button>
      </Form>
    </div>
  );
}
