/**
 * Video processing utilities for extracting metadata like duration
 */

export interface VideoMetadata {
  duration: number; // Duration in seconds
  width?: number;
  height?: number;
  format?: string;
}

/**
 * Extract video duration from a video file using browser HTML5 video element
 * This approach works for client-side duration detection during file selection
 */
export function getVideoDurationFromFile(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = function () {
      // Clean up object URL
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };

    video.onerror = function () {
      URL.revokeObjectURL(video.src);
      reject(new Error('Error loading video metadata'));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Extract video duration from a video buffer/blob on the server side
 * Note: This is a simplified approach. For production, consider using ffprobe or similar
 */
export async function getVideoDurationFromBuffer(
  buffer: Buffer
): Promise<number | null> {
  try {
    // For server-side video duration extraction, we would typically use:
    // 1. ffprobe (requires ffmpeg installation)
    // 2. node-ffmpeg package
    // 3. Other video processing libraries

    // Since adding external dependencies requires careful consideration,
    // we'll return null for now and handle duration detection on the client side
    // during file upload, then pass it to the server

    console.log('Server-side video duration extraction not implemented yet');
    console.log('Buffer size:', buffer.length);

    return null;
  } catch (error) {
    console.error('Error extracting video duration:', error);
    return null;
  }
}

/**
 * Format duration in seconds to a human-readable string
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

/**
 * Client-side helper to get video duration during file input change
 * Usage in admin forms:
 *
 * const handleVideoFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
 *   const file = event.target.files?.[0];
 *   if (file) {
 *     try {
 *       const duration = await getVideoDurationFromFile(file);
 *       console.log(`Video duration: ${duration} seconds`);
 *       // Store duration in form state or pass to server
 *     } catch (error) {
 *       console.error('Could not get video duration:', error);
 *     }
 *   }
 * };
 */
