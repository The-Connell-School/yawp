import {
  data as dataResponse,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { recordLtiLaunchClaims } from '~/integrations/blackboard-ags.server';

export async function loader() {
  // Launch is a POST; GET can confirm endpoint is up
  return dataResponse({ ok: true });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const idToken = String(form.get('id_token') || '');
  if (!idToken) {
    return dataResponse({ error: 'missing id_token' }, { status: 400 });
  }
  try {
    const parts = idToken.split('.');
    if (parts.length < 2) throw new Error('malformed jwt');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    recordLtiLaunchClaims(payload);
  } catch (error) {
    return dataResponse({ error: 'invalid id_token' }, { status: 400 });
  }
  // Hand control back to the app — devs can navigate to class/assignment.
  return redirect('/app');
}

