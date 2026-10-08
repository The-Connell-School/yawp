import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  Form,
  Link,
  redirect,
  useLoaderData,
  useActionData,
  useNavigation,
} from 'react-router';
import { z } from 'zod';
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { Button } from '~/components/ui/button';
import { FormInput } from '~/components/rvf-forms/form-input';
import { requireAnonymous, sessionKey } from '~/utils/auth.server';
import { NameSchema, PasswordAndConfirmPasswordSchema } from '~/utils/schemas/user';
import {
  enforceUnauthByIpAndTarget,
  enforceUnauthByIpOnly,
  rateLimitedFormResponse,
} from '~/utils/rate-limit.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import {
  findFreeTierClassByJoinToken,
  registerFreeTierStudent,
} from '~/domain/free-tier/student-join.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import { combineHeaders } from '~/utils/misc';
import { UsernameFieldSchema } from '~/utils/schemas/username';
import { AuthPageShell } from '~/components/auth-brand-lockup';
import { FREE_CLASS_CLASS_FULL_MESSAGE } from '~/domain/free-tier/class-seat-cap';

const JoinSchema = z
  .object({
    name: NameSchema,
    classId: z.string().min(1, 'Class is required'),
    joinToken: z.string().min(1, 'Join link is invalid or expired.'),
    username: UsernameFieldSchema,
  })
  .and(PasswordAndConfirmPasswordSchema);

async function rateLimitJoinLookup(request: Request) {
  const cfg = RATE_LIMITS.unauth.joinLookup;
  return enforceUnauthByIpOnly({
    request,
    route: '/join/lookup',
    perIpPerMinute: cfg.perIpPerMinute,
    perIpPerHour: cfg.perIpPerHour,
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnonymous(request);
  const token = new URL(request.url).searchParams.get('t')?.trim() ?? '';
  if (!token) {
    return { joinToken: null as string | null, klass: null };
  }
  const lookupLimit = await rateLimitJoinLookup(request);
  if (!lookupLimit.allowed) {
    throw Response.json(
      { error: 'Too many requests. Please wait and try again.' },
      {
        status: 429,
        headers: { 'Retry-After': String(lookupLimit.retryAfterSeconds) },
      }
    );
  }
  const klass = await findFreeTierClassByJoinToken(token);
  return { joinToken: token, klass };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAnonymous(request);
  const formData = await request.formData();
  const { error, data } = await parseFormData(formData, JoinSchema);
  if (error) return validationError(error);

  {
    const cfg = RATE_LIMITS.unauth.signup;
    const decision = await enforceUnauthByIpAndTarget({
      request,
      route: '/join',
      targetKey: data.username,
      perIpPerMinute: cfg.perIpPerMinute,
      perIpPerHour: cfg.perIpPerHour,
      perTargetPerHour: cfg.perEmailPerHour,
    });
    if (!decision.allowed) {
      return rateLimitedFormResponse(
        'username',
        decision.retryAfterSeconds,
        'Too many sign-up attempts. Please wait and try again.'
      );
    }
  }

  const klass = await findFreeTierClassByJoinToken(data.joinToken);
  if (!klass || klass.id !== data.classId) {
    return validationError(
      { fieldErrors: { _form: 'Class not found.' } },
      data
    );
  }

  const result = await registerFreeTierStudent({
    name: data.name,
    username: data.username,
    password: data.password,
    classId: data.classId,
    joinToken: data.joinToken,
  });

  if (result.status === 'error') {
    const fieldErrors: Record<string, string> = {};
    if (result.formLevel) {
      fieldErrors._form = result.error.includes('full')
          ? FREE_CLASS_CLASS_FULL_MESSAGE
          : result.error;
    } else {
      fieldErrors[result.field] = result.error;
    }
    if (result.field === 'username' && result.suggestions?.length) {
      fieldErrors.username = `${result.error} Try: ${result.suggestions.map((s) => `@${s}`).join(', ')}`;
    }
    return validationError({ fieldErrors }, data);
  }

  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  authSession.set(sessionKey, result.session.id);

  return redirect('/app', {
    headers: combineHeaders(
      {
        'set-cookie': await authSessionStorage.commitSession(authSession, {
          expires: result.session.expirationDate,
        }),
      },
      { 'set-cookie': await setMembershipId(result.membershipId) }
    ),
  });
}

export default function JoinRoute() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';

  const joinForm = useForm({
    schema: JoinSchema,
    method: 'POST',
    defaultValues: {
      name: '',
      username: '',
      password: '',
      confirmPassword: '',
      joinToken: data.joinToken ?? '',
      classId: data.klass?.id ?? '',
    },
  });

  const actionData = useActionData<{ fieldErrors?: Record<string, string> }>();
  const formLevelError = actionData?.fieldErrors?._form;

  if (!data.joinToken || !data.klass) {
    return (
      <AuthPageShell>
      <div className="mx-auto w-full max-w-xs rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 max-sm:w-[calc(100%-2rem)] sm:p-7">
        <h1 className="text-lg font-semibold">Join your class</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask your teacher for the class join link or scan their QR code. Class
          codes alone are not enough to join on Yawp.
        </p>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-primary underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
      </div>
      </AuthPageShell>
    );
  }

  const teacherName =
    data.klass.teachers[0]?.user.name?.trim() || 'your teacher';

  return (
    <AuthPageShell>
    <div className="mx-auto w-full max-w-xs rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 max-sm:w-[calc(100%-2rem)] sm:p-7">
      <h1 className="text-lg font-semibold">Create your student account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Join {data.klass.school.name} ({data.klass.schoolYear}) with{' '}
        {teacherName}. Pick a handle and password — no email required.
      </p>
      {formLevelError ? (
        <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {formLevelError}
        </p>
      ) : null}
      <Form {...joinForm.getFormProps()} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="joinToken" value={data.joinToken} />
        <input type="hidden" name="classId" value={data.klass.id} />
        <FormInput scope={joinForm.scope('name')} label="Display name" autoFocus />
        <FormInput
          scope={joinForm.scope('username')}
          label="Handle"
          autoComplete="username"
        />
        <p className="text-xs text-muted-foreground">
          3–30 characters. Letters, numbers, dots, underscores, hyphens.
        </p>
        <FormInput scope={joinForm.scope('password')} type="password" label="Password" />
        <FormInput
          scope={joinForm.scope('confirmPassword')}
          type="password"
          label="Confirm password"
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Creating account…' : 'Join class'}
        </Button>
      </Form>
    </div>
    </AuthPageShell>
  );
}
