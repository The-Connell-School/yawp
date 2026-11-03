import { type LoaderFunctionArgs } from 'react-router';
import { getBuildMetadata } from '~/utils/build-metadata.server';

export async function loader(_args: LoaderFunctionArgs) {
  return Response.json(getBuildMetadata(), {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
