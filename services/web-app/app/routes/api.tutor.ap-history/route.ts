import { data, type ActionFunctionArgs } from 'react-router';

export async function action({ request }: ActionFunctionArgs) {
  return data(
    { error: 'AP History tutor is not yet implemented' },
    { status: 501 }
  );
}
