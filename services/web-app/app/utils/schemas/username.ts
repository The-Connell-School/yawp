import { z } from 'zod';
import { validateUsername } from '../username.server';

export const UsernameFieldSchema = z
  .string({ required_error: 'Handle is required' })
  .superRefine((value, ctx) => {
    const result = validateUsername(value);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.message });
    }
  })
  .transform((value) => {
    const result = validateUsername(value);
    return result.ok ? result.username : value;
  });
