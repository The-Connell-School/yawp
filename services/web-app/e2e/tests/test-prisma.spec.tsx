import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';

test.skip(true);

test('prisma test', async ({}) => {
  expect(true).toBe(true);
});
