import { Form } from 'react-router';
import { Button } from '~/components/ui/button';

export function UaPartnerCodeStatus({
  clearAction = '/ua/sign-up',
}: {
  clearAction?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/40 p-4">
      <p className="font-medium">University of Alabama code accepted</p>
      <p className="mt-1 text-sm text-muted-foreground">
        We’ll remember this code for future signups on this device.
      </p>
      <Form method="post" action={clearAction} className="mt-2">
        <input type="hidden" name="intent" value="clear-partner-code" />
        <Button type="submit" variant="link" className="h-auto p-0">
          Use a different code
        </Button>
      </Form>
    </div>
  );
}
