import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
} from 'react-router';
import { Form } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { submitAdminDetails } from '~/domain/free-tier/approval-flow.server';
import { renderAdminApprovalEmailBody } from '~/domain/free-tier/email-copy';
import {
  FreeTierAuthCard,
  FreeTierEmailPreview,
  FreeTierFieldLabel,
  FreeTierTextArea,
  FreeTierTextInput,
} from '../free-tier/FreeTierAuthCard';
import { freeTierConfigErrorMessage } from '~/domain/free-tier/free-tier-config.server';

const MAX_NOTE = 500;
const MAX_NAME = 200;
const LINK_PLACEHOLDER = '(link included in the email we send)';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: { id: true, schoolName: true, name: true, email: true, status: true },
  });
  return { app };
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const app = await prisma.freeTierApplication.findFirst({ where: { userId }, select: { id: true } });
  if (!app) return redirect('/app/free-tier/onboarding');
  try {
    const result = await submitAdminDetails({
      applicationId: app.id,
      userId,
      adminName: String(formData.get('adminName') ?? '').trim().slice(0, MAX_NAME),
      adminEmail: String(formData.get('adminEmail') ?? '').trim().slice(0, 320),
      adminRole: String(formData.get('adminRole') ?? '').trim().slice(0, 100),
      personalNote: String(formData.get('personalNote') ?? '').trim().slice(0, MAX_NOTE),
    });
    if (!result.ok) {
      return result;
    }
    throw redirect('/app/free-tier/pending');
  } catch (error) {
    if (error instanceof Response) throw error;
    return { ok: false as const, reason: 'config' as const, message: freeTierConfigErrorMessage(error) };
  }
}

export default function FreeTierOnboardingRoute() {
  const { app } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const preview = renderAdminApprovalEmailBody({
    teacherName: app?.name ?? 'You',
    teacherEmail: app?.email ?? 'teacher@school.edu',
    schoolName: app?.schoolName ?? 'your school',
    personalNote: '',
    approveUrl: LINK_PLACEHOLDER,
    notRightPersonUrl: LINK_PLACEHOLDER,
  });

  const errorMessage =
    actionData && !actionData.ok
      ? actionData.reason === 'config'
        ? actionData.message
        : actionData.reason === 'email_failed'
          ? 'We could not send the approval email. Try again or contact support@yawp.school.'
          : actionData.reason === 'illegal_state'
            ? 'This application is not ready for administrator details yet.'
            : 'Something went wrong. Try again.'
      : null;

  return (
    <FreeTierAuthCard
      title="Administrator approval"
      subtitle="Site- or district-level administrators can approve YAWP. Department chairs and classroom teachers cannot."
      showLogo={false}
    >
      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">{errorMessage}</p>
      ) : null}
      <Form method="post" className="flex flex-col gap-4">
        <FreeTierFieldLabel label="Administrator name" htmlFor="adminName">
          <FreeTierTextInput id="adminName" name="adminName" required maxLength={MAX_NAME} />
        </FreeTierFieldLabel>
        <FreeTierFieldLabel label="Administrator email" htmlFor="adminEmail">
          <FreeTierTextInput id="adminEmail" name="adminEmail" type="email" required maxLength={320} />
        </FreeTierFieldLabel>
        <FreeTierFieldLabel label="Administrator role" htmlFor="adminRole">
          <FreeTierTextInput id="adminRole" name="adminRole" required maxLength={100} />
        </FreeTierFieldLabel>
        <FreeTierFieldLabel label="Personal note (optional, shown at top of email)" htmlFor="personalNote">
          <FreeTierTextArea id="personalNote" name="personalNote" maxLength={MAX_NOTE} rows={3} />
        </FreeTierFieldLabel>
        <FreeTierEmailPreview body={preview} />
        <button type="submit" className="yawp-entry-button yawp-entry-button-primary">
          Send approval request
        </button>
      </Form>
    </FreeTierAuthCard>
  );
}
