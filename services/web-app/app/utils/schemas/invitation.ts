import { z } from 'zod';

export const OwnerOnboardingMetadataSchema = z.object({
  organizationId: z.string(),
});

const ClassStudentOnboardingMetadataSchema = z
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

const UaStudentOnboardingMetadataSchema = z.object({
  partner: z.literal('ua'),
  organizationId: z.string().min(1),
});

export const StudentOnboardingMetadataSchema = z.union([
  ClassStudentOnboardingMetadataSchema,
  UaStudentOnboardingMetadataSchema,
]);

export const TeacherOnboardingMetadataSchema = z.object({
  organizationId: z.string(),
});
