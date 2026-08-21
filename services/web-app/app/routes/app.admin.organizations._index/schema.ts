import { z } from 'zod';

export const CreateOrganizationSchema = z.object({
  name: z.string(),
  numOfStudentSeats: z.string().refine((value) => !isNaN(Number(value)), {
    message: 'Number of student seats must be a number',
  }),
  numOfTeacherSeats: z.string().refine((value) => !isNaN(Number(value)), {
    message: 'Number of teacher seats must be a number',
  }),
  accessExpiresAt: z.string().optional(),
});
