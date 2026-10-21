import type { ActionFunctionArgs } from 'react-router';
import { data as dataResponse } from 'react-router';
import { userHasPendingFreeTierTeachingLock } from './locked-preview.server';
import {
  TEACHING_APPROVAL_REQUIRED_ERROR,
  type TeachingApprovalRequiredFields,
} from './teaching-approval-required';

export {
  TEACHING_APPROVAL_REQUIRED_ERROR,
  isTeachingApprovalRequiredActionData,
  type TeachingApprovalRequiredFields,
} from './teaching-approval-required';

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
