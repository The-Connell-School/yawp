import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import {
  applicationIdFromSignedToken,
  peekSignedLink,
} from '~/domain/free-tier/signed-link.server';
import {
  fetchFreeTierApplicationTerminalGate,
  resolveAdminLinkReplacedGate,
} from '~/domain/free-tier/admin-link-gate.server';
import {
  denySchoolAdminApproval,
  resolveAdminDenyAnsweredGate,
} from '~/domain/free-tier/approval-deny.server';
import { prisma } from '~/utils/db.server';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';
import { FREE_TIER_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import {
  AdminAlreadyApprovedCard,
  AdminDeclinedCard,
  AdminDenyAlreadyAnsweredCard,
  AdminDenyThanksCard,
  AdminLinkInvalidCard,
} from '../free-tier/AdminApprovalStates';
import {
  adminDenyConfirmBody,
  adminDenyConfirmTitle,
  adminDenyReasonHint,
  adminDenySaveError,
} from '~/domain/free-tier/admin-deny-copy';
import { Textarea } from '~/components/ui/textarea';
import {
  FreeTierAuthCard,
  FreeTierButton,
} from '../free-tier/FreeTierAuthCard';

type LoaderData =
  | { ok: false; reason: string; teacherName?: string; schoolName?: string; decidedAt?: string }
  | {
      ok: true;
      token: string;
      teacherName: string;
      schoolName: string;
      showDenyFeatures: boolean;
    };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  const token = new URL(request.url).searchParams.get('t') ?? '';
  if (!token) return { ok: false as const, reason: 'invalid' as const };
  const showDenyFeatures = await isFeatureFlagEnabled(FREE_TIER_FLAG);
  if (!showDenyFeatures) {
    return { ok: false as const, reason: 'not_allowed' as const };
  }
  const peek = await peekSignedLink({
    token,
    expectedPurpose: 'ADMIN_APPROVE',
  });
  const appId = peek.ok
    ? peek.applicationId
    : applicationIdFromSignedToken(token);
  if (appId) {
    const gate = await fetchFreeTierApplicationTerminalGate(appId);
    if (gate) return { ok: false as const, ...gate };
    const denied = await resolveAdminDenyAnsweredGate({ token });
    if (denied?.reason === 'admin_denied') {
      return {
        ok: false as const,
        reason: 'admin_denied' as const,
        teacherName: denied.teacherName,
        schoolName: denied.schoolName,
        decidedAt: denied.decidedAt.toISOString(),
      };
    }
  }
  if (peek.ok) {
    const app = await prisma.freeTierApplication.findUnique({
      where: { id: peek.applicationId },
      select: { schoolName: true, name: true },
    });
    return {
      ok: true as const,
      token,
      schoolName: app?.schoolName ?? 'your school',
      teacherName: app?.name ?? 'A teacher',
      showDenyFeatures,
    };
  }
  const replaced = await resolveAdminLinkReplacedGate({ token, peek });
  if (replaced) return { ok: false as const, ...replaced };
  return { ok: false as const, reason: peek.reason ?? 'invalid' };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireFreeTierEnabled();
  if (!(await isFeatureFlagEnabled(FREE_TIER_FLAG))) {
    return { ok: false as const, reason: 'not_allowed' as const };
  }
  const formData = await request.formData();
  const token = String(formData.get('token') ?? '');
  const reason = String(formData.get('reason') ?? '');
  const result = await denySchoolAdminApproval({ token, reason, request });
  if (!result.ok && result.reason === 'unavailable') {
    return { ...result, keptReason: reason };
  }
  return result;
}

export default function FreeAdminApproveDenyRoute() {
  const data = useLoaderData<LoaderData>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const denying =
    navigation.state === 'submitting' &&
    navigation.formData?.get('intent') === 'deny';

  if (actionData?.ok && !('idempotent' in actionData && actionData.idempotent)) {
    const teacherName = data.ok ? data.teacherName : 'A teacher';
    const schoolName = data.ok ? data.schoolName : 'your school';
    return <AdminDenyThanksCard teacherName={teacherName} schoolName={schoolName} />;
  }

  if (actionData?.ok && actionData.idempotent && !data.ok) {
    if (data.reason === 'admin_denied' && data.teacherName && data.decidedAt) {
      return (
        <AdminDenyAlreadyAnsweredCard
          teacherName={data.teacherName}
          schoolName={data.schoolName ?? 'your school'}
          decidedAt={new Date(data.decidedAt)}
        />
      );
    }
  }

  if (!data.ok) {
    if (data.reason === 'already_approved') {
      return (
        <AdminAlreadyApprovedCard
          teacherName={data.teacherName ?? 'A teacher'}
          schoolName={data.schoolName ?? 'your school'}
        />
      );
    }
    if (data.reason === 'declined') {
      return (
        <AdminDeclinedCard
          teacherName={data.teacherName ?? 'A teacher'}
          schoolName={data.schoolName ?? 'your school'}
        />
      );
    }
    if (data.reason === 'admin_denied' && data.teacherName && data.decidedAt) {
      return (
        <AdminDenyAlreadyAnsweredCard
          teacherName={data.teacherName}
          schoolName={data.schoolName ?? 'your school'}
          decidedAt={new Date(data.decidedAt)}
        />
      );
    }
    return <AdminLinkInvalidCard />;
  }

  if (actionData && !actionData.ok) {
    if (actionData.reason === 'already_approved') {
      return (
        <AdminAlreadyApprovedCard
          teacherName={data.teacherName}
          schoolName={data.schoolName}
        />
      );
    }
    if ('reason' in actionData && actionData.reason === 'admin_denied') {
      return (
        <AdminDenyAlreadyAnsweredCard
          teacherName={data.teacherName}
          schoolName={data.schoolName}
          decidedAt={new Date()}
        />
      );
    }
    const terminal =
      actionData.reason === 'declined' ||
      (actionData.reason === 'illegal_state' &&
        'status' in actionData &&
        (actionData.status === 'REJECTED' || actionData.status === 'EXPIRED'));
    if (terminal) {
      return (
        <AdminDeclinedCard
          teacherName={data.teacherName}
          schoolName={data.schoolName}
        />
      );
    }
  }

  const keptReason =
    actionData &&
    !actionData.ok &&
    actionData.reason === 'unavailable' &&
    'keptReason' in actionData
      ? String(actionData.keptReason ?? '')
      : undefined;
  const saveFailed =
    actionData && !actionData.ok && actionData.reason === 'unavailable';

  return (
    <FreeTierAuthCard title={adminDenyConfirmTitle()}>
      <p className="text-sm text-muted-foreground">
        {adminDenyConfirmBody(data.teacherName, data.schoolName)}
      </p>
      <Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="token" value={data.token} />
        <input type="hidden" name="intent" value="deny" />
        <label
          className="flex flex-col gap-1.5 text-left text-card-foreground"
          htmlFor="denyReason"
        >
          <span>
            Reason{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <Textarea
            id="denyReason"
            name="reason"
            defaultValue={keptReason}
            maxLength={2000}
            rows={4}
            className="min-h-[96px] resize-y text-base"
          />
          <span className="text-xs text-muted-foreground">
            {adminDenyReasonHint(data.teacherName)}
          </span>
        </label>
        {saveFailed ? (
          <p role="alert" className="text-sm text-destructive">
            {adminDenySaveError()}
          </p>
        ) : null}
        <FreeTierButton
          type="submit"
          variant="destructive"
          isLoading={denying}
          disabled={denying}
          aria-busy={denying || undefined}
        >
          {denying ? 'Denying…' : 'Deny request'}
        </FreeTierButton>
        <FreeTierButton asChild variant="outline" disabled={denying}>
          <Link to={`/free/admin/approve?t=${encodeURIComponent(data.token)}`}>
            Cancel
          </Link>
        </FreeTierButton>
      </Form>
    </FreeTierAuthCard>
  );
}
