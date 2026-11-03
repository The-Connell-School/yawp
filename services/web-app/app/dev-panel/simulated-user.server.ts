import { parseSimulatedStudentEmail } from './class-simulation-mix';

export function isSimulatedDevPanelUser(user: {
  simulatedForClassId?: string | null;
}) {
  return Boolean(user.simulatedForClassId);
}

export function isSimulatedDevPanelEmail(email: string | null | undefined) {
  return parseSimulatedStudentEmail(email) !== null;
}
