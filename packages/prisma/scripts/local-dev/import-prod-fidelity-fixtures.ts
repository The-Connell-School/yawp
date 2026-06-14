/* eslint-disable no-console */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '../../generated/prisma';
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

export async function loadProdFidelityBundle(): Promise<ProdFidelityBundle> {
  const manifest = await readJson<ProdFidelityManifest>('manifest.json');
  return {
    manifest,
    gradingAssistantTemplates: await readJson('grading-assistant-templates.json'),
    assignmentTypes: await readJson('assignment-types.json'),
    assignmentTypeImages: await readJson('assignment-type-images.json'),
    assignmentModules: await readJson('assignment-modules.json'),
    assignmentModuleInstructions: await readJson('assignment-module-instructions.json'),
    assignmentModuleInstructionButtons: await readJson(
      'assignment-module-instruction-buttons.json'
    ),
    assignmentTypeGradingAssistants: await readJson(
      'assignment-type-grading-assistants.json'
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
  if ('ownerOrgId' in next) next.ownerOrgId = LOCAL_DEV_ORG_ID;
  return next;
}

export async function importProdFidelityFixtures(
  prisma: PrismaClient,
  bundle: ProdFidelityBundle
) {
  for (const row of bundle.gradingAssistantTemplates) {
    await prisma.gradingAssistantTemplate.create({
      data: withTimestamps(stripProfileRefs(row)) as never,
    });
  }

  for (const row of bundle.assignmentTypes) {
    await prisma.assignmentType.create({
      data: withTimestamps(stripProfileRefs(row)) as never,
    });
  }

  for (const row of bundle.assignmentTypeImages) {
    const { blob, ...rest } = row;
    await prisma.assignmentTypeImage.create({
      data: {
        ...(rest as Record<string, unknown>),
        blob: decodeBytes(blob),
      } as never,
    });
  }

  for (const row of bundle.assignmentModules) {
    await prisma.assignmentModule.create({ data: withTimestamps(row) as never });
  }

  for (const row of bundle.assignmentModuleInstructions) {
    await prisma.assignmentModuleInstruction.create({
      data: withTimestamps(row) as never,
    });
  }

  for (const row of bundle.assignmentModuleInstructionButtons) {
    await prisma.assignmentModuleInstructionButton.create({
      data: withTimestamps(row) as never,
    });
  }

  for (const row of bundle.assignmentTypeGradingAssistants) {
    await prisma.assignmentTypeGradingAssistant.create({
      data: {
        ...withTimestamps(row),
        activeFrom: asDate(row.activeFrom),
        activeTo: row.activeTo ? asDate(row.activeTo) : null,
      } as never,
    });
  }

  for (const row of bundle.teacherTrainings) {
    await prisma.teacherTraining.create({ data: withTimestamps(row) as never });
  }

  for (const row of bundle.teacherTrainingImages) {
    const { blob, ...rest } = row;
    await prisma.teacherTrainingImage.create({
      data: {
        ...(rest as Record<string, unknown>),
        blob: decodeBytes(blob),
      } as never,
    });
  }

  for (const row of bundle.teacherTrainingModules) {
    await prisma.teacherTrainingModule.create({
      data: withTimestamps(row) as never,
    });
  }

  for (const row of bundle.teacherTrainingModuleResources) {
    const { blob, ...rest } = row;
    await prisma.teacherTrainingModuleResource.create({
      data: {
        ...(rest as Record<string, unknown>),
        blob: decodeBytes(blob),
      } as never,
    });
  }

  for (const row of bundle.teacherTrainingResources) {
    await prisma.teacherTrainingResource.create({ data: row as never });
  }

  for (const row of bundle.apHistoryPromptLibraryEntries) {
    await prisma.apHistoryPromptLibraryEntry.create({
      data: withTimestamps(row) as never,
    });
  }

  for (const row of bundle.apHistoryPromptLibrarySources) {
    await prisma.apHistoryPromptLibrarySource.create({ data: row as never });
  }

  for (const row of bundle.assignmentTypes) {
    await prisma.organizationAssignmentType.create({
      data: {
        organizationId: LOCAL_DEV_ORG_ID,
        assignmentTypeId: String(row.id),
      },
    });
  }

  console.log(
    `Imported prod-fidelity fixtures (${bundle.assignmentTypes.length} assignment types, ${bundle.gradingAssistantTemplates.length} grading assistants, ${bundle.teacherTrainings.length} teacher trainings).`
  );
}
