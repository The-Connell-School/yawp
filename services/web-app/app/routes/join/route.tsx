import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  Form,
  Link,
  redirect,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { z } from 'zod';
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { Button } from '~/components/ui/button';
import { FormInput } from '~/components/rvf-forms/form-input';
import { requireAnonymous, sessionKey } from '~/utils/auth.server';
import { NameSchema, PasswordAndConfirmPasswordSchema } from '~/utils/schemas/user';
import { enforceUnauthByIpAndTarget, rateLimitedFormResponse } from '~/utils/rate-limit.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import {
  findFreeTierClassesByCode,
  registerFreeTierStudent,
} from '~/domain/free-tier/student-join.server';
import { formatClassGradePeriod } from '~/utils/class-display';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import { combineHeaders } from '~/utils/misc';
import { UsernameFieldSchema } from '~/utils/schemas/username';

const CodeSchema = z.object({
  code: z.string().min(1, 'Class code is required'),
});

const JoinSchema = z
  .object({
    name: NameSchema,
    classId: z.string().min(1, 'Class is required'),
    code: z.string().min(1),
    username: UsernameFieldSchema,
  })
  .and(PasswordAndConfirmPasswordSchema);

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnonymous(request);
  const code = new URL(request.url).searchParams.get('code')?.trim() ?? '';
  if (!code) {
    return { code: null as string | null, classes: [] };
  }
  const classes = await findFreeTierClassesByCode(code);
  return { code, classes };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAnonymous(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'lookup-code') {
    const { error, data } = await parseFormData(formData, CodeSchema);
    if (error) return validationError(error);
    const classes = await findFreeTierClassesByCode(data.code);
    if (classes.length === 0) {
      return validationError(
        { fieldErrors: { code: 'Invalid class code for a free classroom.' } },
        data
      );
    }
    const params = new URLSearchParams({ code: data.code });
    return redirect(`/join?${params.toString()}`);
  }

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

  const classes = await findFreeTierClassesByCode(data.code);
  if (!classes.some((klass) => klass.id === data.classId)) {
    return validationError({ fieldErrors: { classId: 'Class not found.' } }, data);
  }

  const result = await registerFreeTierStudent({
    name: data.name,
    username: data.username,
    password: data.password,
    classId: data.classId,
  });

  if (result.status === 'error') {
    const fieldErrors: Record<string, string> = {
      [result.field]: result.error,
    };
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
  const showClassSelect = data.classes.length > 1;

  const lookupForm = useForm({
    schema: CodeSchema,
    method: 'POST',
    defaultValues: { code: data.code ?? '' },
  });

  const joinForm = useForm({
    schema: JoinSchema,
    method: 'POST',
    defaultValues: {
      name: '',
      username: '',
      password: '',
      confirmPassword: '',
      code: data.code ?? '',
      classId: showClassSelect ? '' : data.classes[0]?.id ?? '',
    },
  });

  if (!data.code || data.classes.length === 0) {
    return (
      <div className="mx-auto w-full max-w-xs rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 max-sm:w-[calc(100%-2rem)] sm:p-7">
        <h1 className="text-lg font-semibold">Join your class</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the class code from your teacher to create your free Yawp account.
        </p>
        <Form {...lookupForm.getFormProps()} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="intent" value="lookup-code" />
          <FormInput scope={lookupForm.scope('code')} label="Class code" autoFocus />
          <Button type="submit" className="w-full" disabled={isLoading}>
            Continue
          </Button>
        </Form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-primary underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 max-sm:w-[calc(100%-2rem)] sm:p-7">
      <h1 className="text-lg font-semibold">Create your student account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick a handle and password. No email required.
      </p>
      <Form {...joinForm.getFormProps()} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="code" value={data.code} />
        {showClassSelect ? (
          <div className="space-y-2">
            <label className="text-sm font-medium">Class</label>
            <select
              name="classId"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              defaultValue=""
            >
              <option value="" disabled>Select a class</option>
              {data.classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.school.name} • {klass.schoolYear}
                  {formatClassGradePeriod(klass)
                    ? ` • ${formatClassGradePeriod(klass)}`
                    : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <input type="hidden" name="classId" value={data.classes[0]!.id} />
        )}
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
  );
}
