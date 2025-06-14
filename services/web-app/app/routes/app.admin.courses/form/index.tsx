import { useFieldArray, useForm } from '@rvf/react-router';
import { type z } from 'zod';
import { FormInput } from '~/components/forms/form-input-2';
import { FormTextarea } from '~/components/forms/form-textarea-2';
import { Button } from '~/components/ui/button';
import { CourseModules } from './course-modules';
import { CourseResource } from './resource';
import { type Schema, validator } from './schema';
import { useSubmit } from 'react-router';

interface Props {
  formId: string;
  defaultValues: z.infer<typeof Schema>;
}

export const CourseForm = ({ defaultValues, formId }: Props) => {
  const submit = useSubmit();
  const form = useForm({
    id: formId,
    defaultValues,
    schema: validator,
    submitSource: 'state',
    handleSubmit: (data) => {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((item, index) => {
            Object.entries(item).forEach(([subKey, subValue]) => {
              if (subValue !== null && subValue !== undefined) {
                formData.append(
                  `${key}[${index}][${subKey}]`,
                  subValue.toString()
                );
              }
            });
          });
        } else if (value !== null && value !== undefined) {
          formData.append(key, value.toString());
        }
      });
      submit(formData, { method: 'POST' });
    },
  });
  const courseResources = useFieldArray(form.scope('resources'));

  return (
    <form {...form.getFormProps()} className="flex flex-col gap-4">
      <div className="flex w-full gap-4">
        <div className="h-[197px] w-[280px]">
          <div
            className="relative h-full w-full rounded-lg bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${form.field('courseImageSrc').value()})`,
            }}
          >
            {/* <TrashIcon
              className="absolute bottom-2 right-2 h-8 w-8 cursor-pointer rounded-full bg-destructive/75 p-2 text-destructive-foreground transition hover:bg-destructive"
              onClick={remove}
            /> */}
          </div>
        </div>
        <div className="flex w-full flex-col gap-4">
          <FormInput name="title" placeholder="Title" className="w-full" />
          <FormTextarea name="description" placeholder="Description" />
        </div>
      </div>
      <CourseModules />
      <div className="flex flex-col gap-1">
        <label>Resources</label>
        <p className="mb-1 text-sm text-muted-foreground">
          Resources are additional materials that teachers can use to enhance
          their understanding of this course. This could be a PDF, a video, or a
          website.
        </p>
        <div className="flex flex-col gap-1">
          {courseResources.map((key, _, i) => (
            <CourseResource
              key={key}
              onDelete={() => courseResources.remove(i)}
              name={`resources[${i}]`}
            />
          ))}
          <Button
            variant="secondary"
            onClick={(e) => {
              e.preventDefault();
              courseResources.push({
                title: 'New Resource',
                description: '',
                url: '',
              });
            }}
          >
            Add resource
          </Button>
          {courseResources.error() && (
            <p className="text-destructive-foreground">
              {courseResources.error()}
            </p>
          )}
        </div>
      </div>
    </form>
  );
};
