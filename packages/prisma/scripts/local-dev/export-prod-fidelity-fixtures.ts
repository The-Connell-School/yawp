/* eslint-disable no-console */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '../../generated/prisma';
import {
  encodeBytes,
  type ProdFidelityBundle,
  type ProdFidelityManifest,
} from './prod-fidelity-types';

const FIXTURE_DIR = path.resolve(
  import.meta.dir,
  '../../fixtures/prod-fidelity'
);

function serializeRow<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row } as Record<string, unknown>;
  for (const [key, value] of Object.entries(next)) {
    if (value instanceof Date) {
      next[key] = value.toISOString();
    }
  }
  return next as T;
}

export async function exportProdFidelityFixtures(
  prisma: PrismaClient,
  sourceDatabaseUrl: string
): Promise<ProdFidelityBundle> {
  const [
    assignmentTypes,
    assignmentTypeImagesRaw,
    assignmentModules,
    assignmentModuleInstructions,
    assignmentModuleInstructionButtons,
    teacherTrainings,
    teacherTrainingImagesRaw,
    teacherTrainingModules,
    teacherTrainingModuleResourcesRaw,
    teacherTrainingResources,
    apHistoryPromptLibraryEntries,
    apHistoryPromptLibrarySources,
  ] = await Promise.all([
    prisma.assignmentType.findMany({ orderBy: { position: 'asc' } }),
    prisma.assignmentTypeImage.findMany(),
    prisma.assignmentModule.findMany({ orderBy: [{ assignmentTypeId: 'asc' }, { position: 'asc' }] }),
    prisma.assignmentModuleInstruction.findMany({
      orderBy: [{ assignmentModuleId: 'asc' }, { position: 'asc' }],
    }),
    prisma.assignmentModuleInstructionButton.findMany({
      orderBy: [{ assignmentModuleInstructionId: 'asc' }, { position: 'asc' }],
    }),
    prisma.teacherTraining.findMany({ orderBy: { position: 'asc' } }),
    prisma.teacherTrainingImage.findMany(),
    prisma.teacherTrainingModule.findMany({
      orderBy: [{ teacherTrainingId: 'asc' }, { position: 'asc' }],
    }),
    prisma.teacherTrainingModuleResource.findMany({
      orderBy: [{ teacherTrainingModuleId: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.teacherTrainingResource.findMany({
      orderBy: [{ teacherTrainingId: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.apHistoryPromptLibraryEntry.findMany({
      orderBy: [{ assignmentTypeId: 'asc' }, { externalKey: 'asc' }],
    }),
    prisma.apHistoryPromptLibrarySource.findMany({
      orderBy: [{ promptLibraryEntryId: 'asc' }, { position: 'asc' }],
    }),
  ]);

  const assignmentTypeImages = assignmentTypeImagesRaw.map((row) => ({
    ...serializeRow(row as unknown as Record<string, unknown>),
    blob: encodeBytes(row.blob),
  }));

  const teacherTrainingImages = teacherTrainingImagesRaw.map((row) => ({
    ...serializeRow(row as unknown as Record<string, unknown>),
    blob: encodeBytes(row.blob),
  }));

  const teacherTrainingModuleResources = teacherTrainingModuleResourcesRaw.map(
    (row) => ({
      ...serializeRow(row as unknown as Record<string, unknown>),
      blob: encodeBytes(row.blob),
    })
  );

  const manifest: ProdFidelityManifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceDatabaseUrl,
    counts: {
      assignmentTypes: assignmentTypes.length,
      assignmentTypeImages: assignmentTypeImages.length,
      assignmentModules: assignmentModules.length,
      assignmentModuleInstructions: assignmentModuleInstructions.length,
      assignmentModuleInstructionButtons: assignmentModuleInstructionButtons.length,
      teacherTrainings: teacherTrainings.length,
      teacherTrainingImages: teacherTrainingImages.length,
      teacherTrainingModules: teacherTrainingModules.length,
      teacherTrainingModuleResources: teacherTrainingModuleResources.length,
      teacherTrainingResources: teacherTrainingResources.length,
      apHistoryPromptLibraryEntries: apHistoryPromptLibraryEntries.length,
      apHistoryPromptLibrarySources: apHistoryPromptLibrarySources.length,
    },
  };

  return {
    manifest,
    assignmentTypes: assignmentTypes.map((row) =>
      serializeRow(row as unknown as Record<string, unknown>)
    ),
    assignmentTypeImages,
    assignmentModules: assignmentModules.map((row) =>
      serializeRow(row as unknown as Record<string, unknown>)
    ),
    assignmentModuleInstructions: assignmentModuleInstructions.map((row) =>
      serializeRow(row as unknown as Record<string, unknown>)
    ),
    assignmentModuleInstructionButtons: assignmentModuleInstructionButtons.map(
      (row) => serializeRow(row as unknown as Record<string, unknown>)
    ),
    teacherTrainings: teacherTrainings.map((row) =>
      serializeRow(row as unknown as Record<string, unknown>)
    ),
    teacherTrainingImages,
    teacherTrainingModules: teacherTrainingModules.map((row) =>
      serializeRow(row as unknown as Record<string, unknown>)
    ),
    teacherTrainingModuleResources,
    teacherTrainingResources: teacherTrainingResources.map((row) =>
      serializeRow(row as unknown as Record<string, unknown>)
    ),
    apHistoryPromptLibraryEntries: apHistoryPromptLibraryEntries.map((row) =>
      serializeRow(row as unknown as Record<string, unknown>)
    ),
    apHistoryPromptLibrarySources: apHistoryPromptLibrarySources.map((row) =>
      serializeRow(row as unknown as Record<string, unknown>)
    ),
  };
}

export async function writeProdFidelityBundle(bundle: ProdFidelityBundle) {
  await mkdir(FIXTURE_DIR, { recursive: true });
  const files: Array<[string, unknown]> = [
    ['manifest.json', bundle.manifest],
    ['assignment-types.json', bundle.assignmentTypes],
    ['assignment-type-images.json', bundle.assignmentTypeImages],
    ['assignment-modules.json', bundle.assignmentModules],
    ['assignment-module-instructions.json', bundle.assignmentModuleInstructions],
    [
      'assignment-module-instruction-buttons.json',
      bundle.assignmentModuleInstructionButtons,
    ],
    ['teacher-trainings.json', bundle.teacherTrainings],
    ['teacher-training-images.json', bundle.teacherTrainingImages],
    ['teacher-training-modules.json', bundle.teacherTrainingModules],
    [
      'teacher-training-module-resources.json',
      bundle.teacherTrainingModuleResources,
    ],
    ['teacher-training-resources.json', bundle.teacherTrainingResources],
    ['ap-history-prompt-library-entries.json', bundle.apHistoryPromptLibraryEntries],
    ['ap-history-prompt-library-sources.json', bundle.apHistoryPromptLibrarySources],
  ];

  for (const [filename, payload] of files) {
    await writeFile(
      path.join(FIXTURE_DIR, filename),
      `${JSON.stringify(payload, null, 2)}\n`
    );
  }

  console.log(`Wrote prod-fidelity fixtures to ${FIXTURE_DIR}`);
  console.log(JSON.stringify(bundle.manifest.counts, null, 2));
}

export function getProdFidelityFixtureDir() {
  return FIXTURE_DIR;
}
