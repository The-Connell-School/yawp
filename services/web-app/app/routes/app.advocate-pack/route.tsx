import { redirect, type LoaderFunctionArgs } from 'react-router';
import { requireUserId, requireMembership } from '~/utils/auth.server';
import { monthlyFreeTierPolicy } from '~/domain/free-tier/monthly-policy.server';
import { FULL_ACCESS_CONTACT } from '~/components/free-account-usage';
export async function loader({ request }: LoaderFunctionArgs) {
  const member = await requireMembership(request, await requireUserId(request));
  if (
    member.role !== 'TEACHER' ||
    !(await monthlyFreeTierPolicy(member.organization)).enabled
  )
    throw redirect('/app');
  return null;
}
export default function AdvocatePack() {
  return (
    <section className="h-full overflow-auto bg-background p-5 sm:p-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Advocate Pack</h1>
          <p className="mt-3 text-lg">Take this to your administrator</p>
        </header>
        <div className="rounded-xl border bg-popover p-6">
          <h2 className="text-xl font-semibold">Your one-page PDF</h2>
          <p className="mt-3 text-muted-foreground">
            The Advocate Pack PDF is coming soon.
          </p>
          <p className="mt-4">Unlimited with a site license</p>
          <a
            className="mt-4 inline-block text-primary underline"
            href={FULL_ACCESS_CONTACT}
          >
            Need more? Talk to us
          </a>
        </div>
        <div className="rounded-xl border bg-popover p-6">
          <h2 className="text-xl font-semibold">Refer a colleague</h2>
          <p className="mt-3 text-muted-foreground">
            Referrals are coming soon.
          </p>
        </div>
      </div>
    </section>
  );
}
