import {
  data as dataResponse,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { AssignmentTypeEditorForm } from '~/components/admin/assignment-type-editor-form';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  DEFAULT_OUTPUT_SCHEMA_JSON,
  parseRubric,
} from '~/domain/assignment-types/assignment-type-rubric.shared';
import { isRubricFullyPopulated } from '~/domain/assignment-types/assignment-type-rubric-config';

function parseJsonFormField(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    throw new Response(`${name} must be valid JSON`, { status: 400 });
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  return dataResponse({});
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const title = formData.get('title')?.toString().trim();
  const description = formData.get('description')?.toString().trim() || null;

  if (!title) {
    throw new Response('Title is required', { status: 400 });
  }

  const hasGradingConfigFields =
    formData.has('scoringScale') ||
    formData.has('rubricJson') ||
    formData.has('promptConfigJson') ||
    formData.has('outputSchemaJson');
  const rubricJson = hasGradingConfigFields
    ? parseJsonFormField(formData, 'rubricJson')
    : null;
  if (
    hasGradingConfigFields &&
    !isRubricFullyPopulated(parseRubric(rubricJson))
  ) {
    throw new Response(
      'Every rubric category needs a key, label, description, and weight before you can create this assignment type. Add at least one, and finish the ones you started.',
      { status: 400 }
    );
  }

  const gradingConfigData = hasGradingConfigFields
    ? {
        scoringScaleJson: parseJsonFormField(formData, 'scoringScale'),
        rubricJson,
        gradingPromptConfigJson: parseJsonFormField(
          formData,
          'promptConfigJson'
        ),
        gradingOutputSchemaJson:
          parseJsonFormField(formData, 'outputSchemaJson') ??
          DEFAULT_OUTPUT_SCHEMA_JSON,
      }
    : {};

  const count = await prisma.assignmentType.count();
  const assignmentType = await prisma.assignmentType.create({
    data: {
      title,
      kind: null,
      description,
      position: count,
      ...gradingConfigData,
    },
  });

  return redirect(`/app/admin/assignment-types/${assignmentType.id}`);
}

export default function NewAssignmentTypeRoute() {
  return <AssignmentTypeEditorForm mode="create" />;
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
