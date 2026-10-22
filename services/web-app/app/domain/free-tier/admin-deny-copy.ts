/** Admin deny + teacher-after-deny copy (2026-10-22 design). */

import { teacherAtSchool } from './admin-approval-copy';

export function adminDenyConfirmTitle() {
  return 'Deny this request?';
}

export function adminDenyConfirmBody(teacherName: string, schoolName: string) {
  return `${teacherAtSchool(teacherName, schoolName)} won't get a free classroom from this request. We'll let ${teacherName.split(/\s+/)[0] ?? teacherName} know, and they can ask another administrator.`;
}

export function adminDenyReasonHint(teacherName: string) {
  const first = teacherName.split(/\s+/)[0] ?? teacherName;
  return `Only the Yawp! team sees this. ${first} won't.`;
}

export function adminDenySaveError() {
  return "We couldn't save your answer. Try again, or email support@yawp.school.";
}

export function adminDenyThanksTitle() {
  return 'Thanks for letting us know';
}

export function adminDenyThanksBody(teacherName: string, schoolName: string) {
  return `You declined the free classroom request from ${teacherAtSchool(teacherName, schoolName)}. We'll let them know they can ask another administrator at their school.`;
}

export const adminDenyReopenHint =
  "Changed your mind? Email support@yawp.school and we'll reopen the request.";

export function adminDenyAlreadyAnsweredTitle() {
  return "You've already answered this request.";
}

export function adminDenyAlreadyAnsweredBody(
  teacherName: string,
  schoolName: string,
  decidedAt: Date
) {
  const date = decidedAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `You declined the request from ${teacherAtSchool(teacherName, schoolName)} on ${date}.`;
}

export function teacherDeniedStatusTitle() {
  return "Your request wasn't approved.";
}

export function teacherDeniedStatusBody(
  adminName: string,
  schoolName: string
) {
  return `${adminName} didn't approve Yawp! for your classroom this time. Your class is still here, and you can ask another administrator at ${schoolName}.`;
}

export function teacherAskAnotherHint(used: number, cap: number) {
  const left = Math.max(0, cap - used);
  return `${left} of ${cap} requests left`;
}

export function teacherAllRequestsUsedBody() {
  return "You've used all three administrator requests for this classroom. Email support and we'll help you find a path forward.";
}

export function teacherDenyEmailSubject(schoolName: string) {
  return `Your Yawp! request for ${schoolName}`;
}

export const teacherDenyEmailPreheader =
  'Your class is still here. You can ask another administrator.';
