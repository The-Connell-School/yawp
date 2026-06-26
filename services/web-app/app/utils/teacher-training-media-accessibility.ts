export type TeacherTrainingMediaResource = {
  id: string;
  name: string;
  contentType: string;
};

function normalizedName(resource: TeacherTrainingMediaResource) {
  return resource.name.trim().toLowerCase();
}

function normalizedContentType(resource: TeacherTrainingMediaResource) {
  return resource.contentType.trim().toLowerCase();
}

export function isCaptionResource(resource: TeacherTrainingMediaResource) {
  const name = normalizedName(resource);
  const contentType = normalizedContentType(resource);

  return contentType === 'text/vtt' || name.endsWith('.vtt');
}

export function isTranscriptResource(resource: TeacherTrainingMediaResource) {
  if (isCaptionResource(resource)) return false;

  const name = normalizedName(resource);
  const contentType = normalizedContentType(resource);

  return (
    name.includes('transcript') ||
    contentType === 'text/plain' ||
    contentType === 'text/markdown' ||
    name.endsWith('.txt') ||
    name.endsWith('.md')
  );
}

export function getTeacherTrainingMediaAccessibilityResources(
  resources: TeacherTrainingMediaResource[]
) {
  return {
    captionResource: resources.find(isCaptionResource) ?? null,
    transcriptResource: resources.find(isTranscriptResource) ?? null,
  };
}
