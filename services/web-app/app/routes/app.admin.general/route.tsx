import {
  type ActionFunctionArgs,
  data as dataResponse,
  type LoaderFunctionArgs,
  useSearchParams,
} from 'react-router';
import { useFetcher, useLoaderData } from 'react-router';
import { parseFormData, validationError, useForm } from '@rvf/react-router';
import { z } from 'zod';
import { FormInput } from '~/components/forms/form-input-2';
import { Button } from '~/components/ui/button';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { Setting } from '@app/prisma';
import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { ArrowRight, Trash2 } from 'lucide-react';
import { Input } from '~/components/ui/input';
import startCase from 'lodash/startCase';
import { requireAdmin } from '~/utils/auth.server';

const Schema = z.object({
  name: z.string(),
  value: z.string(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const settings = await prisma.setting.findMany({
    orderBy: [{ valueType: 'desc' }, { name: 'desc' }],
  });
  return dataResponse({ settings });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
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
      <div className="max-w-[500px]">
        {settings.length === 0 && (
          <div className="text-sm text-muted-foreground">No settings found</div>
        )}
        {settings.map((setting) =>
          setting.valueType === 'string' ? (
            <StringSetting setting={setting} />
          ) : setting.valueType === 'arrayOfStrings' ? (
            <ArrayOfStringsSetting setting={setting} />
          ) : null
        )}
      </div>
    </div>
  );
}

function StringSetting({ setting }: { setting: Setting }) {
  const fetcher = useFetcher();

  const form = useForm({
    schema: Schema,
    defaultValues: { name: setting.name, value: setting.value },
    handleSubmit: (_data, formData) => {
      fetcher.submit(formData, { method: 'POST' });
    },
  });

  return (
    <form
      {...form.getFormProps()}
      key={setting.id}
      className="mb-4 rounded-xl border shadow-sm bg-muted p-4"
    >
      <input type="hidden" name="name" value={setting.name} />
      <div className="flex items-end gap-4">
        <FormInput
          scope={form.scope('value')}
          labelInfo={setting.description ?? undefined}
          label={startCase(setting.name)}
          className="flex-1"
        />
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}

function ArrayOfStringsSetting({ setting }: { setting: Setting }) {
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();
  const formId = setting.id;
  const open = searchParams.get('open') === formId;
  const [items, setItems] = useState<string[]>(
    setting.value ? setting.value.split(',') : []
  );
  const [newItem, setNewItem] = useState('');

  const form = useForm({
    id: formId,
    schema: Schema,
    defaultValues: { name: setting.name, value: setting.value },
    handleSubmit: (_data, formData) => {
      fetcher.submit(formData, { method: 'POST' });
    },
  });

  const onOpenChange = (open: boolean) => {
    if (open) {
      setSearchParams((prev) => {
        prev.set('open', formId ?? '');
        return prev;
      });
    } else {
      setSearchParams((prev) => {
        prev.delete('open');
        return prev;
      });
    }
  };

  const handleAddItem = () => {
    if (newItem.trim()) {
      setItems([...items, newItem.trim()]);
      setNewItem('');
    }
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddItem();
    }
  };

  return (
    <form
      {...form.getFormProps()}
      key={setting.id}
      className="mb-4 rounded-xl border shadow-sm bg-muted p-4"
    >
      <input type="hidden" name="name" value={setting.name} />
      <input type="hidden" name="value" value={items.join(',')} />
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <label className="font-medium">{startCase(setting.name)}</label>
          {setting.description && (
            <p className="text-sm text-muted-foreground">
              {setting.description}
            </p>
          )}
        </div>

        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
            >
              <span className="flex-1 text-left">{items.length} items</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent className="flex h-full flex-col gap-0 p-0">
            <SheetHeader className="mb-2 p-4">
              <SheetTitle>{startCase(setting.name)}</SheetTitle>
            </SheetHeader>

            <div className="flex gap-2 border-b px-4 pb-4">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={handleKeyPress}
                className="flex-1"
                placeholder="Add item"
              />
              <Button type="button" onClick={handleAddItem}>
                Add
              </Button>
            </div>

            <div className="flex-1 overflow-y-scroll p-4">
              <div className="flex flex-col gap-2">
                {items.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      name={`item-${index}`}
                      value={item}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[index] = e.target.value;
                        setItems(newItems);
                      }}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handleRemoveItem(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <SheetFooter className="border-t p-4">
              <Button type="submit" form={formId}>
                Save Changes
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </form>
  );
}
