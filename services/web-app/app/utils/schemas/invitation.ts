import { z } from 'zod';

export const OwnerOnboardingMetadataSchema = z.object({
  organizationId: z.string(),
});

export const StudentOnboardingMetadataSchema = z
  .object({
    schoolId: z.string(),
    klassId: z.string(),
  })
  .partial()
  .refine((data) => data.schoolId || data.klassId, {
    message: 'At least one of schoolId or klassId is required',
  });

export const TeacherOnboardingMetadataSchema = z.object({
  organizationId: z.string(),
});
