import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect,
  data,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { Form } from 'react-router';
import { useState } from 'react';
import { selfAdminEmailError } from '~/domain/free-tier/admin-email';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { submitAdminDetails } from '~/domain/free-tier/approval-flow.server';
import {
  FreeTierAuthCard,
  FreeTierButton,
  FreeTierFieldLabel,
  FreeTierSignOut,
  FreeTierTextInput,
  FreeTierProgress,
} from '../free-tier/FreeTierAuthCard';
import { freeTierConfigErrorMessage } from '~/domain/free-tier/free-tier-config.server';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

import {
  isClassPreparationEnabled,
  saveClassPreparation,
} from '~/domain/free-tier/class-preparation.server';
import {
  classGradePrefill,
  needsClassPreparation,
} from '~/domain/free-tier/class-preparation';
import { ClassPreparationForm } from '../free-tier/ClassPreparationForm';
import { FreeTierOnboardingTimeline } from '../free-tier/FreeTierOnboardingTimeline';

const MAX_NAME = 200;

function progressedDestination(status: string) {
  if (status === 'SENT' || status === 'MANUAL_REVIEW')
    return '/app/free-tier/pending';
  if (status === 'APPROVED') return '/app/my-classes';
  if (status === 'REJECTED' || status === 'EXPIRED')
    return '/app/free-tier/status';
  return null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  const userId = await requireUserId(request);
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: {
      id: true,
      schoolName: true,
      organizationId: true,
      gradeLevel: true,
      starterClassName: true,
      starterClassGrade: true,
      name: true,
      email: true,
      status: true,
    },
  });
  const onboardingV2 =
    !!app && (await isClassPreparationEnabled(userId, app.organizationId));
  const destination =
    onboardingV2 && app ? progressedDestination(app.status) : null;
  if (destination) throw redirect(destination);
  const step = new URL(request.url).searchParams.get('step');
  if (needsClassPreparation(app, onboardingV2) && step === 'administrator')
    throw redirect('/app/free-tier/onboarding');
  const showClass =
    onboardingV2 &&
    app?.status === 'ACCOUNT_CREATED' &&
    (needsClassPreparation(app, true) || step === 'class');
  const lastFailedEmail = app
    ? await prisma.freeTierEmailLog.findFirst({
        where: {
          applicationId: app.id,
          kind: 'admin_approval',
          success: false,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
    : null;
  const pending = app
    ? await prisma.freeTierAdminApproval.findFirst({
        where: { applicationId: app.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: { adminName: true, adminEmail: true, adminRole: true },
      })
    : null;
  return { app, lastFailedEmail, pending, onboardingV2, showClass };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireFreeTierEnabled();
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: {
      id: true,
      status: true,
      organizationId: true,
      starterClassName: true,
      starterClassGrade: true,
    },
  });
  if (!app) return redirect('/app/free-tier/onboarding');
  const onboardingV2 = await isClassPreparationEnabled(
    userId,
    app.organizationId
  );
  const destination = onboardingV2 ? progressedDestination(app.status) : null;
  if (destination) return redirect(destination);
  if (formData.get('intent') === 'prepare-class') {
    const values = {
      className: String(formData.get('className') ?? ''),
      grade: String(formData.get('grade') ?? ''),
    };
    const result = await saveClassPreparation({
      applicationId: app.id,
      userId,
      ...values,
    });
    if (!result.ok) return { ...result, values };
    return redirect('/app/free-tier/onboarding?step=administrator');
  }
  if (needsClassPreparation(app, onboardingV2))
    return redirect('/app/free-tier/onboarding');
  try {
    const result = await submitAdminDetails({
      applicationId: app.id,
      userId,
      adminName: String(formData.get('adminName') ?? '')
        .trim()
        .slice(0, MAX_NAME),
      adminEmail: String(formData.get('adminEmail') ?? '')
        .trim()
        .slice(0, 320),
      adminRole: String(formData.get('adminRole') ?? '')
        .trim()
        .slice(0, 100),
    });
    if (!result.ok) {
      if (result.reason === 'same_as_teacher')
        return data(result, { status: 400 });
      if (result.reason === 'class_required')
        return redirect('/app/free-tier/onboarding');
      return result;
    }
    throw redirect('/app/free-tier/pending');
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      ok: false as const,
      reason: 'config' as const,
      message: freeTierConfigErrorMessage(error),
    };
  }
}

export default function FreeTierOnboardingRoute() {
  const { app, lastFailedEmail, pending, onboardingV2, showClass } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [editedAdminEmail, setEditedAdminEmail] = useState<string>();
  const adminEmail = editedAdminEmail ?? pending?.adminEmail ?? '';
  const adminEmailError =
    selfAdminEmailError(app?.email ?? '', adminEmail) ??
    (editedAdminEmail === undefined &&
    actionData &&
    !actionData.ok &&
    'reason' in actionData &&
    actionData.reason === 'same_as_teacher'
      ? actionData.fieldErrors.adminEmail
      : null);
  const errorMessage =
    actionData && !actionData.ok && 'reason' in actionData
      ? actionData.reason === 'same_as_teacher'
        ? null
        : actionData.reason === 'config'
          ? actionData.message
          : actionData.reason === 'email_failed'
            ? "We couldn't send the email. Try again, or contact support@yawp.school."
            : actionData.reason === 'illegal_state'
              ? "This application isn't ready for administrator details yet. Contact support@yawp.school."
              : 'Something went wrong. Try again.'
      : null;

  if (showClass) {
    const values =
      actionData && 'values' in actionData ? actionData.values : null;
    const errors =
      actionData && 'errors' in actionData ? actionData.errors : undefined;
    return (
      <ClassPreparationForm
        className={values?.className ?? app?.starterClassName ?? ''}
        grade={
          values?.grade ??
          app?.starterClassGrade ??
          classGradePrefill(app?.gradeLevel)
        }
        errors={errors}
        saving={navigation.state === 'submitting'}
        error={!!actionData && !actionData.ok && !errors}
      />
    );
  }

  return (
    <FreeTierAuthCard
      title={onboardingV2 ? 'One last step: your administrator’s approval' : 'Who can approve Yawp!'}
      footer={<FreeTierSignOut />}
      subtitle={onboardingV2 ? undefined : 'A site or district administrator. Department chairs and teachers can’t.'}
    >
      {onboardingV2 ? (
        <>
          <FreeTierOnboardingTimeline current={1} />
          <p className="text-sm text-muted-foreground">
            The technology we bring into our classrooms matters. Students
            deserve tools that are safe, transparent, and built to help them
            learn, not do the work for them. That’s why we ask an administrator
            to approve every free Yawp! classroom.
          </p>
          <p className="text-sm text-muted-foreground">
            It protects your students, and it protects you. And in our
            experience, when an administrator knows about the good work
            happening in a classroom, that work gets noticed, supported, and
            shared.
          </p>
          <p className="text-sm text-muted-foreground">
            We’ll send your administrator a short email explaining Yawp! and
            asking for a one-click approval. Ask a site or district
            administrator; department chairs and teachers can’t approve.
          </p>
          {app?.status === 'ACCOUNT_CREATED' ? (
            <Link to="?step=class" className="text-sm text-primary underline">
              Back to your class
            </Link>
          ) : null}
        </>
      ) : null}
      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {lastFailedEmail && app?.status === 'ADMIN_SUBMITTED' ? (
        <p className="text-sm text-destructive" role="alert">
          We couldn't send the email. Try again, or contact support@yawp.school.
        </p>
      ) : null}
      <Form
        method="post"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          if (adminEmailError) {
            event.preventDefault();
            event.currentTarget
              .querySelector<HTMLInputElement>('#adminEmail')
              ?.focus();
          }
        }}
      >
        <FreeTierFieldLabel label={onboardingV2 ? 'Administrator’s name' : 'Administrator name'} htmlFor="adminName">
          <FreeTierTextInput
            id="adminName"
            name="adminName"
            required
            maxLength={MAX_NAME}
            defaultValue={pending?.adminName ?? ''}
          />
        </FreeTierFieldLabel>
        <FreeTierFieldLabel label="Administrator email" htmlFor="adminEmail">
          <FreeTierTextInput
            id="adminEmail"
            name="adminEmail"
            placeholder="name@district.org"
            type="email"
            required
            maxLength={320}
            value={adminEmail}
            onChange={(event) => setEditedAdminEmail(event.currentTarget.value)}
            aria-invalid={adminEmailError ? true : undefined}
            aria-describedby={adminEmailError ? 'adminEmail-error' : undefined}
            variant={adminEmailError ? 'destructive' : undefined}
          />
        </FreeTierFieldLabel>
        {adminEmailError ? (
          <p
            id="adminEmail-error"
            className="text-sm text-destructive"
            role="alert"
          >
            {adminEmailError}
          </p>
        ) : null}
        <FreeTierFieldLabel label={onboardingV2 ? 'Title' : 'Administrator role'} htmlFor="adminRole">
          <FreeTierTextInput
            id="adminRole"
            name="adminRole"
            placeholder={onboardingV2 ? 'Principal, Assistant Principal, Director of Curriculum and Instruction' : 'Principal, Technology Director'}
            required
            maxLength={100}
            defaultValue={pending?.adminRole ?? ''}
          />
        </FreeTierFieldLabel>
        {onboardingV2 ? null : (
          <FreeTierProgress
            steps={[
              'Account created',
              'Ask your administrator',
              'Start teaching',
            ]}
            current={1}
          />
        )}
        <FreeTierButton
          type="submit"
          disabled={onboardingV2 && navigation.state === 'submitting'}
        >
          {navigation.state === 'submitting'
            ? 'Sending…'
            : 'Send approval request'}
        </FreeTierButton>
      </Form>
    </FreeTierAuthCard>
  );
}
