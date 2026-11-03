import { z } from 'zod';
export const forwardApprovalSchema = z.object({
  newAdminName: z
    .string()
    .trim()
    .min(1, 'Enter their name.')
    .max(120, 'Use 120 characters or fewer.')
    .refine((v) => !/[\r\n\x00]/.test(v), 'Enter their name.'),
  newAdminEmail: z
    .string()
    .trim()
    .max(254)
    .email('Enter a valid email address.')
    .transform((v) => v.toLowerCase()),
});
export function approvalMailto(args: {
  adminEmail: string;
  adminName: string;
  teacherName: string;
  schoolName: string;
  approvalEmailFrom: string;
}) {
  const subject = 'My Yawp! classroom approval request';
  const body = `Hi ${args.adminName},\n\nI requested Yawp! for my classroom at ${args.schoolName}, and Yawp! just sent you an approval email. It should be in your inbox from ${args.approvalEmailFrom}.\n\nApproving takes about a minute, and it lets my students start writing with Yawp!\n\nThank you!\n${args.teacherName}`;
  return `mailto:${encodeURIComponent(args.adminEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
export function approvalSentDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date));
}
