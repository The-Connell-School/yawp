export type ProdFidelityManifest = {
  version: 1;
  exportedAt: string;
  sourceDatabaseUrl: string;
  counts: Record<string, number>;
};

export type SerializedBytes = {
  base64: string;
  contentType?: string;
};

export type ProdFidelityBundle = {
  manifest: ProdFidelityManifest;
  gradingAssistantTemplates: Array<Record<string, unknown>>;
  assignmentTypes: Array<Record<string, unknown>>;
  assignmentTypeImages: Array<Record<string, unknown> & { blob: SerializedBytes }>;
  assignmentModules: Array<Record<string, unknown>>;
  assignmentModuleInstructions: Array<Record<string, unknown>>;
  assignmentModuleInstructionButtons: Array<Record<string, unknown>>;
  assignmentTypeGradingAssistants: Array<Record<string, unknown>>;
  teacherTrainings: Array<Record<string, unknown>>;
  teacherTrainingImages: Array<Record<string, unknown> & { blob: SerializedBytes }>;
  teacherTrainingModules: Array<Record<string, unknown>>;
  teacherTrainingModuleResources: Array<
    Record<string, unknown> & { blob: SerializedBytes }
  >;
  teacherTrainingResources: Array<Record<string, unknown>>;
  apHistoryPromptLibraryEntries: Array<Record<string, unknown>>;
  apHistoryPromptLibrarySources: Array<Record<string, unknown>>;
};

export function encodeBytes(value: Uint8Array | Buffer): SerializedBytes {
  return { base64: Buffer.from(value).toString('base64') };
}

export function decodeBytes(value: SerializedBytes): Buffer {
  return Buffer.from(value.base64, 'base64');
}
