// ESM wrapper for CommonJS Prisma client
// Use createRequire for proper CommonJS interop in Node.js/SSR
import { createRequire } from 'module';
// Re-export generated types for compile-time
export type * as PrismaTypes from './generated/prisma/index.js';
export type * from './generated/prisma/index.js';

const createRequireFromUrl = createRequire;
const requireFn = createRequireFromUrl(import.meta.url);

// According to package.json exports, require('@app/prisma') resolves to ./generated/prisma/index.js
// Use require.resolve to get the actual path to the generated file via Node's module resolution
// This works even when bundled because Node resolves the package location at runtime
let PrismaGenerated: any;
try {
  const generatedPath = requireFn.resolve('@app/prisma');
  PrismaGenerated = requireFn(generatedPath);
} catch (error) {
  // Fallback: try direct require of the package (should also resolve to generated file per exports)
  PrismaGenerated = requireFn('@app/prisma');
}

// Bridge runtime values to generated types so TypeScript sees the correct types
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type Generated = typeof import('./generated/prisma/index.js');
export const PrismaClient = PrismaGenerated
  .PrismaClient as unknown as Generated['PrismaClient'];
export const Prisma = PrismaGenerated.Prisma as unknown as Generated['Prisma'];
