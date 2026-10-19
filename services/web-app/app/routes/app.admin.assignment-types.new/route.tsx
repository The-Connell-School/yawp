import {
  listLiveRubricsForAdminPicker,
  resolveAdminRubricPickerSelection,
} from '~/domain/rubrics/admin-rubric-picker.server';
import {
  data as dataResponse,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { AssignmentTypeEditorForm } from '~/components/admin/assignment-type-editor-form';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { createAssignmentType, parseAdminCreateGradingConfig } from '~/domain/assignment-types/assignment-type-admin-writes.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const rubrics = (await listLiveRubricsForAdminPicker()).map(
    ({ id, name, title, json }) => ({ id, name, title, json })
  );
  return dataResponse({ rubrics });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const title = formData.get('title')?.toString().trim();
  const description = formData.get('description')?.toString().trim() || null;
  const tutorInstructions =
    formData.get('tutorInstructions')?.toString().trim() || null;

  if (!title) {
    return dataResponse({ error: 'Title is required' }, { status: 400 });
  }

  const rawRubricId = formData.get('rubricId')?.toString().trim() ?? '';
  let rubricSelection: Awaited<
    ReturnType<typeof resolveAdminRubricPickerSelection>
  > | null = null;
  if (formData.has('rubricId')) {
    try {
      rubricSelection = await resolveAdminRubricPickerSelection(rawRubricId);
    } catch (error) {
      if (error instanceof Response) {
        return dataResponse({ error: await error.text() }, { status: 400 });
      }
      throw error;
    }
  }

  let gradingConfigData: ReturnType<typeof parseAdminCreateGradingConfig>;
  try {
    gradingConfigData = parseAdminCreateGradingConfig(formData);
  } catch (error) {
    if (error instanceof Response && error.status === 400) {
      return dataResponse({ error: await error.text() }, { status: 400 });
    }
    throw error;
  }

  // A blank legacy form field leaves the copied per-type configuration intact.
  const override = formData.get('gradingInstructionsOverride')?.toString().trim();
  if (override) {
    gradingConfigData = {
      ...gradingConfigData,
      gradingPromptConfigJson: {
        ...(gradingConfigData.gradingPromptConfigJson ?? {}),
        gradingInstructionsOverride: override,
      },
    };
  }
  const assignmentType = await createAssignmentType(prisma, {
    title, description, tutorInstructions,
    ...(rubricSelection ? { rubricSelection } : {}),
    gradingConfig: gradingConfigData,
  });

  return redirect(`/app/admin/assignment-types/${assignmentType.id}`);
}

export default function NewAssignmentTypeRoute() {
  const { rubrics } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return <AssignmentTypeEditorForm mode="create" rubrics={rubrics} error={actionData?.error} />;
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
