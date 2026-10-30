import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useNavigation,
} from 'react-router';
import { Form, Link, useSearchParams } from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary.tsx';
import { FormInput } from '~/components/rvf-forms/form-input.tsx';
import { Button } from '~/components/ui/button.tsx';
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { enforceUnauthByIpAndTarget, rateLimitedFormResponse } from '~/utils/rate-limit.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import { normalizeEmail } from '~/utils/normalize-email';
import {
  verifyInvitationCredentials,
  verifyInvitationFromQuery,
  VerifyInvitationSchema,
} from './verify-invitation.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const autoVerified = await verifyInvitationFromQuery(request);
  if (autoVerified) return autoVerified;
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const { data, error } = await parseFormData(request, VerifyInvitationSchema);
  if (error) return validationError(error);

  const { target, type } = data;
  const normalizedTarget = normalizeEmail(target);
  {
    const cfg = RATE_LIMITS.unauth.verify;
    const decision = await enforceUnauthByIpAndTarget({
      request,
      route: '/auth/inv/verify',
      targetKey: `${type}:${normalizedTarget}`,
      perIpPerMinute: cfg.perIpPerMinute,
      perIpPerHour: cfg.perIpPerHour,
      perTargetPerHour: cfg.perEmailPerHour,
    });
    if (!decision.allowed) {
      return rateLimitedFormResponse(
        'code',
        decision.retryAfterSeconds,
        'Too many verification attempts. Please wait and try again.'
      );
    }
  }

  const result = await verifyInvitationCredentials(data);
  if (result.ok) return result.response;
  return validationError({ fieldErrors: result.fieldErrors });
}

export default function Route() {
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const type = (searchParams.get('type') ?? '') as any;
  const code = searchParams.get('code') ?? '';
  const target = searchParams.get('target') ?? '';
  const isUa = searchParams.get('partner') === 'ua';
  const isClassInvite =
    type === 'onboard-student' && Boolean(code && target && code.length === 6);

  const form = useForm({
    schema: VerifyInvitationSchema,
    method: 'POST',
    defaultValues: { code, type, target },
  });

  return (
    <main className="mx-auto w-full max-w-xs rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 max-sm:w-[calc(100%-2rem)] sm:p-7">
      <div className="flex flex-col items-start gap-2 text-left">
        <h1 className="text-lg font-semibold">
          {isClassInvite ? 'Join your class' : 'Check your email'}
        </h1>
        <p className="text-pretty text-base text-muted-foreground sm:text-sm">
          {isClassInvite
            ? 'Confirm the code from your invitation email to create your account.'
            : 'We’ve sent you a code to verify your email address.'}
        </p>
      </div>
      <Form {...form.getFormProps()} className="mt-6 flex flex-col gap-5">
        <FormInput scope={form.scope('code')} type="text" label="Code" />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="target" value={target} />
        <Button
          className="h-11 w-full text-base sm:h-10 sm:text-sm"
          type="submit"
          disabled={navigation.state !== 'idle'}
        >
          {isClassInvite ? 'Continue' : 'Submit'}
        </Button>
      </Form>
      <div className="mt-6 border-t border-black/10 pt-4 text-center">
        <Button asChild variant="link" className="w-full text-base sm:text-sm">
          <Link to={isUa ? '/auth/login?redirectTo=%2F' : '/auth/login'}>
            Back to login
          </Link>
        </Button>
      </div>
    </main>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
