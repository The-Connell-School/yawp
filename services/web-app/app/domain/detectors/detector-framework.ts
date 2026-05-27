import type { ApEssayType } from '../grading/ap-rubric';

export interface DetectorResult {
  detectorId: string;
  severity: 'warning' | 'flag';
  message: string;
  suggestedFix?: string;
}

export interface Detector {
  id: string;
  name: string;
  appliesTo: ApEssayType[] | 'all';
  detect(essay: string, essayType: ApEssayType): DetectorResult[];
}

export function runDetectors(
  detectors: Detector[],
  essay: string,
  essayType: ApEssayType
): DetectorResult[] {
  const results: DetectorResult[] = [];
  for (const detector of detectors) {
    if (detector.appliesTo === 'all' || detector.appliesTo.includes(essayType)) {
      results.push(...detector.detect(essay, essayType));
    }
  }
  return results;
}
