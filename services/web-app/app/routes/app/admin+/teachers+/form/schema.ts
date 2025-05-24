import { z } from 'zod';

export const Schema = z.object({
  email: z.string().email(),
  students: z.array(z.object({ email: z.string().email() })).optional(),
});

export const validator = Schema;
