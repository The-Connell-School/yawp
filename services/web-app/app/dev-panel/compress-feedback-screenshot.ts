const MAX_WIDTH = 1280;
const JPEG_QUALITY = 0.7;
const MAX_BYTES = 400_000;

function estimateDataUrlBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return dataUrl.length;
  const base64 = dataUrl.slice(comma + 1);
  return Math.floor((base64.length * 3) / 4);
}

async function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('screenshot decode failed'));
    img.src = dataUrl;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return canvas.toDataURL('image/jpeg', quality);
}

/** Downscale PNG/data-URL captures to JPEG ≤400 KB for dev-panel feedback POST bodies. */
export async function compressFeedbackScreenshot(
  pngDataUrl: string | null
): Promise<{ dataUrl: string | null; dropped: boolean }> {
  if (!pngDataUrl) return { dataUrl: null, dropped: false };
  if (estimateDataUrlBytes(pngDataUrl) <= MAX_BYTES && pngDataUrl.startsWith('data:image/jpeg')) {
    return { dataUrl: pngDataUrl, dropped: false };
  }
  try {
    const img = await loadImage(pngDataUrl);
    const scale = Math.min(1, MAX_WIDTH / Math.max(img.width, 1));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { dataUrl: null, dropped: true };
    ctx.drawImage(img, 0, 0, width, height);
    let quality = JPEG_QUALITY;
    let jpeg = canvasToJpeg(canvas, quality);
    while (estimateDataUrlBytes(jpeg) > MAX_BYTES && quality > 0.35) {
      quality -= 0.1;
      jpeg = canvasToJpeg(canvas, quality);
    }
    if (estimateDataUrlBytes(jpeg) > MAX_BYTES) {
      return { dataUrl: null, dropped: true };
    }
    return { dataUrl: jpeg, dropped: false };
  } catch {
    return { dataUrl: null, dropped: true };
  }
}
