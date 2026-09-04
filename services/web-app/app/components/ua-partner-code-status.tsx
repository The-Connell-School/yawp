import { Form } from 'react-router';
import { Button } from '~/components/ui/button';

export function UaPartnerCodeStatus({
  clearAction = '/ua/sign-up',
}: {
  clearAction?: string;
}) {
  return (
    <div className="rounded-lg bg-primary/5 px-3 py-2.5">
      <p className="text-sm font-semibold">University of Alabama</p>
      <Form method="post" action={clearAction} className="mt-0.5">
        <input type="hidden" name="intent" value="clear-partner-code" />
        <Button type="submit" variant="link" className="h-auto p-0 text-sm">
          Not your school?
        </Button>
      </Form>
    </div>
  );
}
