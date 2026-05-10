import type { MetaFunction } from 'react-router';
import { DbqAssignmentScreen } from '~/components/dbq/dbq-assignment-screen';

export const meta: MetaFunction = () => [
  { title: 'DBQ assignment prototype | Yawp!' },
];

export default function DbqAssignmentPrototypeRoute() {
  return <DbqAssignmentScreen />;
}
