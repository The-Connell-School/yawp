import { redirect } from 'react-router';

export async function loader() {
  return redirect('/app/organization/classes');
}
