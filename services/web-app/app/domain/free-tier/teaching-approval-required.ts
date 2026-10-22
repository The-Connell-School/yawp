export const TEACHING_APPROVAL_REQUIRED_ERROR = 'approval_required' as const;

export type TeachingApprovalRequiredFields = Record<
  string,
  string | string[] | undefined
>;

export function isTeachingApprovalRequiredActionData(
  data: unknown
): data is {
  error: typeof TEACHING_APPROVAL_REQUIRED_ERROR;
  approvalRequired: true;
  fields: TeachingApprovalRequiredFields;
} {
  return (
    typeof data === 'object' &&
    data !== null &&
    'approvalRequired' in data &&
    (data as { approvalRequired?: boolean }).approvalRequired === true &&
    'fields' in data
  );
}
