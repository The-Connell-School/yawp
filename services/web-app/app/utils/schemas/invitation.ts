import { z } from 'zod';

export const OwnerOnboardingMetadataSchema = z.object({
  organizationId: z.string(),
});

export const StudentOnboardingMetadataSchema = z
  .object({
    schoolId: z.string(),
    klassId: z.string(),
    klassIds: z.array(z.string()).min(1),
  })
  .partial()
  .refine(
    (data) =>
      data.klassId ||
      (data.klassIds && data.klassIds.length > 0) ||
      data.schoolId,
    {
      message: 'At least one of klassId, klassIds, or schoolId is required',
    }
  );

export const TeacherOnboardingMetadataSchema = z.object({
  organizationId: z.string(),
});
