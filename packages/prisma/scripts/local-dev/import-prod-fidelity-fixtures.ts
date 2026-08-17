/* eslint-disable no-console */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Prisma, PrismaClient } from '../../generated/prisma';
import { LOCAL_DEV_ORG_ID } from './dev-personas';
import {
  decodeBytes,
  type ProdFidelityBundle,
  type ProdFidelityManifest,
} from './prod-fidelity-types';
import { getProdFidelityFixtureDir } from './export-prod-fidelity-fixtures';

async function readJson<T>(filename: string): Promise<T> {
  const raw = await readFile(path.join(getProdFidelityFixtureDir(), filename), 'utf8');
  return JSON.parse(raw) as T;
}

async function readOptionalJson<T>(filename: string, fallback: T): Promise<T> {
  try {
    return await readJson<T>(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function loadProdFidelityBundle(): Promise<ProdFidelityBundle> {
  const manifest = await readJson<ProdFidelityManifest>('manifest.json');
  return {
    manifest,
    rubrics: await readOptionalJson('rubrics.json', []),
    assignmentTypes: await readJson('assignment-types.json'),
    assignmentTypeImages: await readJson('assignment-type-images.json'),
    assignmentModules: await readJson('assignment-modules.json'),
    assignmentModuleInstructions: await readJson('assignment-module-instructions.json'),
    assignmentModuleInstructionButtons: await readJson(
      'assignment-module-instruction-buttons.json'
    ),
    teacherTrainings: await readJson('teacher-trainings.json'),
    teacherTrainingImages: await readJson('teacher-training-images.json'),
    teacherTrainingModules: await readJson('teacher-training-modules.json'),
    teacherTrainingModuleResources: await readJson(
      'teacher-training-module-resources.json'
    ),
    teacherTrainingResources: await readJson('teacher-training-resources.json'),
    apHistoryPromptLibraryEntries: await readJson(
      'ap-history-prompt-library-entries.json'
    ),
    apHistoryPromptLibrarySources: await readJson(
      'ap-history-prompt-library-sources.json'
    ),
  };
}

function asDate(value: unknown) {
  return value ? new Date(String(value)) : undefined;
}

function withTimestamps(row: Record<string, unknown>) {
  const next = { ...row };
  if ('createdAt' in next) next.createdAt = asDate(next.createdAt);
  if ('updatedAt' in next) next.updatedAt = asDate(next.updatedAt);
  if ('archivedAt' in next) {
    next.archivedAt = next.archivedAt ? asDate(next.archivedAt) : null;
  }
  if ('deletedAt' in next) {
    next.deletedAt = next.deletedAt ? asDate(next.deletedAt) : null;
  }
  return next;
}

function stripProfileRefs(row: Record<string, unknown>) {
  const next = { ...row };
  delete next.createdBy;
  delete next.updatedBy;
  delete next.createdById;
  delete next.updatedById;
  delete next.ownerTeacherId;
  delete next.ownerMembershipId;
  if ('ownerOrgId' in next) next.ownerOrgId = LOCAL_DEV_ORG_ID;
  return next;
}

function withoutId(row: Record<string, unknown>) {
  const { id: _id, ...data } = row;
  return data;
}

type ProdFidelityClient = PrismaClient | Prisma.TransactionClient;

export async function syncProdFidelityFixtures(
  prisma: ProdFidelityClient,
  bundle: ProdFidelityBundle
) {
  const rubricIds = new Map<string, string>();
  for (const row of bundle.rubrics) {
    const data = withTimestamps(row);
    const rubric = await prisma.rubric.upsert({
      where: { name: String(row.name) },
      create: data as never,
      update: withoutId(data) as never,
    });
    rubricIds.set(String(row.id), rubric.id);
  }

  for (const row of bundle.assignmentTypes) {
    const data = withTimestamps(stripProfileRefs(row));
    if (typeof data.rubricId === 'string') {
      data.rubricId = rubricIds.get(data.rubricId) ?? null;
    }
    await prisma.assignmentType.upsert({
      where: { id: String(row.id) },
      create: data as never,
      update: withoutId(data) as never,
    });
  }

  for (const row of bundle.assignmentTypeImages) {
    const { blob, ...rest } = row;
    const data = {
      ...withTimestamps(rest),
      blob: decodeBytes(blob),
    };
    await prisma.assignmentTypeImage.upsert({
      where: { id: String(row.id) },
      create: data as never,
      update: withoutId(data) as never,
    });
  }

  for (const row of bundle.assignmentModules) {
    const data = withTimestamps(row);
    await prisma.assignmentModule.upsert({
      where: { id: String(row.id) },
      create: data as never,
      update: withoutId(data) as never,
    });
  }

  for (const row of bundle.assignmentModuleInstructions) {
    const data = withTimestamps(row);
    await prisma.assignmentModuleInstruction.upsert({
      where: { id: String(row.id) },
      create: data as never,
      update: withoutId(data) as never,
    });
  }

  for (const row of bundle.assignmentModuleInstructionButtons) {
    const data = withTimestamps(row);
    await prisma.assignmentModuleInstructionButton.upsert({
      where: { id: String(row.id) },
      create: data as never,
      update: withoutId(data) as never,
    });
  }

  for (const row of bundle.teacherTrainings) {
    const data = withTimestamps(row);
    await prisma.teacherTraining.upsert({
      where: { id: String(row.id) },
      create: data as never,
      update: withoutId(data) as never,
    });
  }

  for (const row of bundle.teacherTrainingImages) {
    const { blob, ...rest } = row;
    const data = {
      ...withTimestamps(rest),
      blob: decodeBytes(blob),
    };
    await prisma.teacherTrainingImage.upsert({
      where: { id: String(row.id) },
      create: data as never,
      update: withoutId(data) as never,
    });
  }

  for (const row of bundle.teacherTrainingModules) {
    const data = withTimestamps(row);
    await prisma.teacherTrainingModule.upsert({
      where: { id: String(row.id) },
      create: data as never,
      update: withoutId(data) as never,
    });
  }

  for (const row of bundle.teacherTrainingModuleResources) {
    const { blob, ...rest } = row;
    const data = {
      ...withTimestamps(rest),
      blob: decodeBytes(blob),
    };
    await prisma.teacherTrainingModuleResource.upsert({
      where: { id: String(row.id) },
      create: data as never,
      update: withoutId(data) as never,
    });
  }

  for (const row of bundle.teacherTrainingResources) {
    const data = withTimestamps(row);
    await prisma.teacherTrainingResource.upsert({
      where: { id: String(row.id) },
      create: data as never,
      update: withoutId(data) as never,
    });
  }

  for (const row of bundle.apHistoryPromptLibraryEntries) {
    const data = withTimestamps(row);
    await prisma.apHistoryPromptLibraryEntry.upsert({
      where: { id: String(row.id) },
      create: data as never,
      update: withoutId(data) as never,
    });
  }

  for (const row of bundle.apHistoryPromptLibrarySources) {
    const data = withTimestamps(row);
    await prisma.apHistoryPromptLibrarySource.upsert({
      where: { id: String(row.id) },
      create: data as never,
      update: withoutId(data) as never,
    });
  }

  const organizations = await prisma.organization.findMany({
    select: { id: true },
  });
  for (const organization of organizations) {
    await prisma.organizationAssignmentType.createMany({
      data: bundle.assignmentTypes.map((row) => ({
        organizationId: organization.id,
        assignmentTypeId: String(row.id),
      })),
      skipDuplicates: true,
    });
  }

  return {
    rubrics: bundle.rubrics.length,
    assignmentTypes: bundle.assignmentTypes.length,
    teacherTrainings: bundle.teacherTrainings.length,
    organizations: organizations.length,
  };
}

export async function importProdFidelityFixtures(
  prisma: PrismaClient,
  bundle: ProdFidelityBundle
) {
  await syncProdFidelityFixtures(prisma, bundle);

  console.log(
    `Imported prod-fidelity fixtures (${bundle.assignmentTypes.length} assignment types, ${bundle.teacherTrainings.length} teacher trainings).`
  );
}
