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
import { DEFAULT_OUTPUT_SCHEMA_JSON } from '~/utils/grading-assistant-template.shared';

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
  const kind = formData.get('kind')?.toString().trim() || null;
  const description = formData.get('description')?.toString().trim() || null;

  if (!title) {
    throw new Response('Title is required', { status: 400 });
  }

  const count = await prisma.assignmentType.count();
  const assignmentType = await prisma.assignmentType.create({
    data: {
      title,
      kind,
      description,
      position: count,
      scoringScaleJson: parseJsonFormField(formData, 'scoringScale'),
      rubricJson: parseJsonFormField(formData, 'rubricJson'),
      gradingPromptConfigJson: parseJsonFormField(
        formData,
        'promptConfigJson'
      ),
      gradingOutputSchemaJson:
        parseJsonFormField(formData, 'outputSchemaJson') ??
        DEFAULT_OUTPUT_SCHEMA_JSON,
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
