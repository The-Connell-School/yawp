import {
  data as dataResponse,
  Form,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { GradingAssistantTemplateEditor } from '~/components/admin/grading-assistant-template-form';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { updateGradingAssistantTemplate } from '~/utils/grading-assistant-template-admin.server';
import {
  parsePromptConfig,
  parseRubric,
  parseScoringScale,
} from '~/utils/grading-assistant-template.shared';

function statusBadge(status: string) {
  if (status === 'active') {
    return (
      <Badge className="border-green-200 bg-green-100 text-green-800 hover:bg-green-100">
        active
      </Badge>
    );
  }
  if (status === 'archived') {
    return <Badge variant="secondary">archived</Badge>;
  }
  return <Badge variant="outline">draft</Badge>;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const templateId = params.id;
  if (!templateId) {
    throw new Response('Not Found', { status: 404 });
  }

  const [template, assignmentTypes] = await Promise.all([
    prisma.gradingAssistantTemplate.findUnique({
      where: { id: templateId },
    }),
    prisma.assignmentType.findMany({
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    }),
  ]);

  if (!template) {
    throw new Response('Not Found', { status: 404 });
  }

  return dataResponse({ template, assignmentTypes });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const templateId = params.id;
  if (!templateId) {
    throw new Response('Not Found', { status: 404 });
  }

  await updateGradingAssistantTemplate(request, templateId);
  return dataResponse({ status: 'success' });
}

export default function EditGradingAssistantRoute() {
  const { template, assignmentTypes } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== 'idle';

  return (
    <Form method="post" key={template.version}>
      <GradingAssistantTemplateEditor
        mode="edit"
        title={template.name}
        description="Update scoring, rubric categories, and AI grading instructions."
        assignmentTypes={assignmentTypes}
        nameDefaultValue={template.name}
        scoringScale={parseScoringScale(template.scoringScale)}
        rubric={parseRubric(template.rubricJson)}
        promptConfig={parsePromptConfig(template.promptConfigJson)}
        submitLabel="Save changes"
        savingLabel="Saving…"
        isSubmitting={isSubmitting}
        headerExtra={
          <>
            {statusBadge(template.status)}
            <Badge variant="outline" className="tabular-nums">
              v{template.version}
            </Badge>
          </>
        }
      />
    </Form>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
