import { z } from 'zod';

export const VerifyInvitationSchema = z.object({
  code: z.string().min(6).max(6),
  type: z.enum([
    'onboard-student',
    'onboard-teacher',
    'onboard-owner',
    'password-reset',
  ]),
  target: z.string(),
});

export type VerifyInvitationInput = z.infer<typeof VerifyInvitationSchema>;
