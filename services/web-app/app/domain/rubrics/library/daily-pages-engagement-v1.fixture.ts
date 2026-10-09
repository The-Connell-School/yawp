import fixture from './daily-pages-engagement-v1.fixture.json';
import type { RubricSchema } from '~/domain/rubrics/rubric-schema';

/** Frozen Sep-14 Daily Pages library schema (main @ pre-v2). Tests must not use live STARTER_RUBRICS. */
export const dailyPagesEngagementV1LibrarySchema = fixture as RubricSchema;
