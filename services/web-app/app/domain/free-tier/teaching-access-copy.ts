export const TEACHING_ACCESS_LOCKED_TOOLTIP =
  'Unlocks once your administrator approves.' as const;

export const TEACHING_ACCESS_MOBILE_SHEET_TITLE = 'Unlocks after approval' as const;

function teachingAccessAdminLabel(adminName: string) {
  return adminName.trim() && adminName !== 'your administrator'
    ? adminName.trim()
    : 'your administrator';
}

export function teachingAccessMobileSheetBody(adminName: string) {
  const who = teachingAccessAdminLabel(adminName);
  return `Creating assignments, adding students, and sending invites unlock once ${who} approves your classroom.`;
}

export function teachingAccessMobileSheetBodyInvite(adminName: string) {
  const who = teachingAccessAdminLabel(adminName);
  return `Inviting students and sharing your class code unlock once ${who} approves your classroom.`;
}

export function teachingAccessMobileSheetBodySend(adminName: string) {
  const who = teachingAccessAdminLabel(adminName);
  return `Sending assignments to your class unlocks once ${who} approves your classroom.`;
}

export const TEACHING_ACCESS_CLASS_CODE_HIDDEN_LABEL =
  'Class code hidden until approval' as const;

export function teachingAccessClassCodeCaption(adminName: string) {
  const who = teachingAccessAdminLabel(adminName);
  return `Your class code appears once ${who} approves.`;
}

export const TEACHING_APPROVAL_REQUIRED_ALERT_TITLE =
  'Approval required' as const;

export const TEACHING_APPROVAL_REQUIRED_ALERT_BODY =
  "This needs your administrator's approval first. Nothing was saved, and your work is still here." as const;

export const TEACHING_ACCESS_APPROVAL_TOAST_TITLE =
  "You're approved. Start teaching." as const;

export const TEACHING_ACCESS_APPROVAL_TOAST_BODY =
  'Your classroom is open. Create an assignment or share your class code.' as const;

export const TEACHING_ACCESS_ERROR_TOAST_TITLE = 'Approval required' as const;

export const TEACHING_ACCESS_ERROR_TOAST_BODY =
  "This needs your administrator's approval first. Nothing was saved." as const;

export function teachingAccessBannerMessage(adminName: string) {
  return `Waiting for ${adminName} to approve your classroom.`;
}
