import { type LoaderFunctionArgs, redirect } from 'react-router';
import { prisma } from '../../utils/db.server';
import { preview } from '.././api.seed/utils.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const token = url.searchParams.get('token');

  if (
    !['preview'].includes(mode ?? '') ||
    token !== process.env.INTERNAL_COMMAND_TOKEN
  ) {
    return redirect('/');
  }

  const data = await preview();
  const dataExists = await prisma.user.count();

  if (dataExists) {
    return redirect('/', { status: 500 });
  }

  for (const key of Object.keys(data)) {
    await Promise.all(
      // @ts-expect-error - being fancy here
      data[key].map((item) => prisma[key].create({ data: item }))
    );
  }

  return new Response('OK');
}
