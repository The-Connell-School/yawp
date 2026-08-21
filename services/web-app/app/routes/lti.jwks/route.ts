import { json } from 'react-router';
import { getToolJwks } from '~/integrations/blackboard-ags.server';

export async function loader() {
  return json(getToolJwks());
}

