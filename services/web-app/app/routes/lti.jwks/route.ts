import { data as dataResponse } from 'react-router';
import { getToolJwks } from '~/integrations/blackboard-ags.server';

export async function loader() {
  return dataResponse(getToolJwks());
}

