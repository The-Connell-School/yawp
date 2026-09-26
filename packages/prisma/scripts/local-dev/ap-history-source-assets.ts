import { readFileSync } from 'node:fs';

// Real public-domain source images for curated AP History DBQs, extracted from
// the YAWP APUSH DBQ booklet. Committed as JPEG assets named by their source
// externalKey and seeded into ApHistoryPromptLibrarySource.imageBlob so they
// serve reliably from our own origin.
export function apHistorySourceImageAsset(
  externalKey: string
): { blob: Buffer; contentType: string } | null {
  try {
    const blob = readFileSync(
      new URL(`./ap-history-source-assets/${externalKey}.jpg`, import.meta.url)
    );
    return { blob, contentType: 'image/jpeg' };
  } catch {
    return null;
  }
}
