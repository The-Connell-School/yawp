import { Form } from 'react-router';
import { Button } from '~/components/ui/button';

type EscapeActionsProps = {
  studentPreviewActive: boolean;
};

export function EnterCodeEscapeActions({
  studentPreviewActive,
}: EscapeActionsProps) {
  if (!studentPreviewActive) {
    return null;
  }

  return (
    <div className="mt-6 flex justify-center">
      <Form method="POST" action="/api/student-preview">
        <input type="hidden" name="intent" value="end" />
        <input type="hidden" name="redirectTo" value="/app" />
        <Button type="submit" variant="link" className="h-auto px-0 py-0 text-sm">
          Back to teacher view
        </Button>
      </Form>
    </div>
  );
}
