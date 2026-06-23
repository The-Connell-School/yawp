import {
  data as dataResponse,
  Form,
  redirect,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { GradingAssistantTemplateEditor } from '~/components/admin/grading-assistant-template-form';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { createGradingAssistantTemplate } from '~/utils/grading-assistant-template-admin.server';
import {
  DEFAULT_PROMPT_CONFIG,
  DEFAULT_RUBRIC,
  DEFAULT_SCORING_SCALE,
} from '~/utils/grading-assistant-template.shared';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const assignmentTypes = await prisma.assignmentType.findMany({
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  });

  return dataResponse({ assignmentTypes });
}

export async function action({ request }: ActionFunctionArgs) {
  const templateId = await createGradingAssistantTemplate(request);
  return redirect(`/app/admin/grading-assistants/${templateId}`);
}

export default function NewGradingAssistantRoute() {
  const { assignmentTypes } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== 'idle';

  return (
    <Form method="post">
      <GradingAssistantTemplateEditor
        mode="create"
        title="New grading assistant"
        description="Configure scoring, rubric categories, and AI grading instructions."
        assignmentTypes={assignmentTypes}
        scoringScale={DEFAULT_SCORING_SCALE}
        rubric={DEFAULT_RUBRIC}
        promptConfig={DEFAULT_PROMPT_CONFIG}
        submitLabel="Create draft"
        savingLabel="Creating…"
        isSubmitting={isSubmitting}
      />
    </Form>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
