import { z } from 'zod';
import { zfd } from 'zod-form-data';

export const CourseResourceSchema = z.object({
  title: z.string(),
  description: z.string().nullish(),
  url: z
    .string()
    .regex(/^https:\/\//, 'The URL must start with https://')
    .nullable(),
});

export const CourseModuleInstructionSchema = z.object({
  title: z.string(),
  answerKey: z.string().nullish(),
  answerType: z.string().nullish(),
  answerTypeOptions: z.string().nullish(),
  prompt: z.string(),
  tutorInstructions: z.string().nullish(),
  interactiveType: z.string(),
  canAskQuestion: z.boolean().nullish(),
  nextInstructionBtnLabel: z.string().nullish(),
});

export const CourseModuleSchema = z.object({
  id: z.string().nullish(),
  title: z.string().min(1, 'Title is required'),
  position: zfd.numeric().nullish(),
  description: z.any(),
  tutorInstructions: z.any(),
  isSelfGuided: z.any(),
  instructions: z.array(CourseModuleInstructionSchema).optional(),
});

export const MAX_SIZE = 1024 * 1024 * 3; // 3MB

export const Schema = z.object({
  title: z.string(),
  description: z.string().nullish(),
  courseModules: z.array(CourseModuleSchema).nullish(),
  courseImageSrc: z.string().nullish(),
  image: z.instanceof(File).nullish(),
  resources: z.array(CourseResourceSchema),
});

export const validator = Schema;
