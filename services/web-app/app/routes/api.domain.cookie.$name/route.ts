import { type ActionFunctionArgs } from 'react-router';

export async function action({ request }: ActionFunctionArgs) {
  const method = request.method;
  return {};
}
