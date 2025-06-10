import {
  type ActionFunctionArgs,
  data as dataResponse,
  type LoaderFunctionArgs,
} from 'react-router';
import { useLoaderData } from 'react-router';
import {
  parseFormData,
  ValidatedForm,
  validationError,
} from '@rvf/react-router';
import { z } from 'zod';
import { FormInput } from '~/components/forms/form-input-2';
import { FormListInput } from '~/components/forms/form-list-input.tsx';
import { Button } from '~/components/ui/button';
import { prisma } from '~/utils/db.server';
import { requireUserWithRole } from '~/utils/permissions';
import { startCase } from '~/utils/startCase';
import { redirectWithToast } from '~/utils/toast.server';

const Schema = z.object({
  name: z.string(),
  value: z.string(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserWithRole(request, 'admin');
  const settings = await prisma.setting.findMany({
    orderBy: [{ valueType: 'desc' }, { name: 'desc' }],
  });
  return dataResponse({ settings });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUserWithRole(request, 'admin');
  const { error, data } = await parseFormData(request, Schema);
  if (error) return validationError(error);

  await prisma.setting.upsert({
    where: { name: data.name },
    create: data,
    update: data,
  });

  return redirectWithToast('/app/admin/general', {
    type: 'success',
    description: 'Setting updated successfully',
  });
}

export default function GeneralSettings() {
  const { settings } = useLoaderData<typeof loader>();

  return (
    <div className="p-3 sm:p-5">
      <h3>Settings</h3>
      <div className="mt-6 max-w-[500px]">
        {settings.map((setting) =>
          setting.valueType === 'string' ? (
            <ValidatedForm
              key={setting.id}
              method="POST"
              schema={Schema}
              defaultValues={{
                name: setting.name,
                value: setting.value,
              }}
              className="mb-4"
            >
              <div className="flex items-end gap-4">
                <input type="hidden" name="name" value={setting.name} />
                <FormInput
                  name="value"
                  label={startCase(setting.name)}
                  className="flex-1"
                />
                <Button type="submit">Save</Button>
              </div>
            </ValidatedForm>
          ) : setting.valueType === 'arrayOfStrings' ? (
            <ValidatedForm
              key={setting.id}
              method="POST"
              schema={Schema}
              defaultValues={{
                name: setting.name,
                value: setting.value,
              }}
              className="mb-4"
              id={setting.id}
            >
              <div className="flex flex-col gap-4">
                <input type="hidden" name="name" value={setting.name} />
                <FormListInput
                  name="value"
                  label={startCase(setting.name)}
                  defaultValue={setting.value}
                  formId={setting.id}
                />
              </div>
            </ValidatedForm>
          ) : null
        )}
      </div>
    </div>
  );
}
