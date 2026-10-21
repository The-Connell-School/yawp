import type { ActionFunctionArgs } from 'react-router';
import { data as dataResponse } from 'react-router';
import { userHasPendingFreeTierTeachingLock } from './locked-preview.server';

export const TEACHING_APPROVAL_REQUIRED_ERROR = 'approval_required' as const;

export type TeachingApprovalRequiredFields = Record<
  string,
  string | string[] | undefined
>;

export function teachingApprovalRequiredResponse(
  fields: TeachingApprovalRequiredFields
) {
  return dataResponse(
    {
      error: TEACHING_APPROVAL_REQUIRED_ERROR,
      approvalRequired: true as const,
      fields,
    },
    { status: 403 }
  );
}

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

export async function pendingTeachingLockOrApprovalResponse(
  userId: string,
  fields: TeachingApprovalRequiredFields
) {
  if (await userHasPendingFreeTierTeachingLock(userId)) {
    return teachingApprovalRequiredResponse(fields);
  }
  return null;
}

/** Extract string fields from FormData for re-display after a blocked submit. */
export function teachingFormFieldsFromFormData(formData: FormData) {
  const fields: TeachingApprovalRequiredFields = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string') continue;
    const existing = fields[key];
    if (existing === undefined) {
      fields[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      fields[key] = [existing, value];
    }
  }
  return fields;
}

export async function guardTeachingFormAction(
  request: Request,
  userId: string,
  formData: FormData
) {
  return pendingTeachingLockOrApprovalResponse(
    userId,
    teachingFormFieldsFromFormData(formData)
  );
}

export type TeachingFormActionArgs = Pick<ActionFunctionArgs, 'request'>;
