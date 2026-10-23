import { type LoaderFunctionArgs } from 'react-router';

export async function loader(_args: LoaderFunctionArgs) {
  return new Response('OK');
}
