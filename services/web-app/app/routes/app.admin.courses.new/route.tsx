import { type ActionFunctionArgs } from 'react-router';
import { Link } from 'react-router';
import omit from 'lodash/omit';
import { parseFormData, validationError } from '@rvf/react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { prisma } from '~/utils/db.server';
import { useIsPending } from '~/utils/misc';
import { redirectWithToast } from '~/utils/toast.server';
import { CourseForm } from '../app.admin.courses/form';
import { MAX_SIZE, validator } from '../app.admin.courses/form/schema';

export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, validator);
  if (error) return validationError(error);

  const count = await prisma.course.count();
  const created = await prisma.course.create({
    data: {
      ...omit(data, ['image', 'courseImageSrc']),
      position: count,
      resources: {
        create: data.resources ?? [],
      },
      courseModules: {
        create: (data.courseModules ?? []).map((cm, index) => ({
          ...omit(cm, ['id']),
          position: index,
          isSelfGuided: cm.isSelfGuided === 'true',
          instructions: {
            create: (cm.instructions ?? []).map((instruction, i) => ({
              ...instruction,
              position: i,
            })),
          },
        })),
      },
    },
  });

  // if (data.image && data.courseImageSrc) {
  //   await prisma.courseImage.create({
  //     data: {
  //       course: { connect: { id: created.id } },
  //       contentType: data.image.type,
  //       blob: Buffer.from(await data.image.arrayBuffer()),
  //     },
  //   });
  // }

  return redirectWithToast(`/app/admin/courses/${created.id}`, {
    type: 'success',
    description: 'Course created successfully',
    closeButton: false,
  });
}

export default function Route() {
  const isPending = useIsPending();

  return (
    <div className="flex h-full flex-col">
      <div className="no-scrollbar grow overflow-y-scroll p-6">
        <CourseForm
          formId="create-module"
          defaultValues={{
            title: '',
            description: '',
            courseModules: [],
            resources: [],
            courseImageSrc: '',
            image: null,
          }}
        />
      </div>
      <div className="flex gap-2 px-6 pb-6 pt-1">
        <Button type="submit" disabled={isPending} form="create-module">
          Create
        </Button>
        <Button
          disabled={isPending}
          variant="secondary"
          asChild
          className="md:hidden"
        >
          <Link to="/app/admin/courses">Cancel</Link>
        </Button>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
