import { getSignedGetUrl } from '~/services/s3.server';
import { buildSafeErrorForLog } from '~/utils/server-error-request-context.server';

type SignVideoUrl = (key: string) => Promise<string>;
type ReportVideoSignError = (error: unknown) => void;

export async function getTeacherTrainingPlaybackUrl(
  videoS3Key: string | null | undefined,
  signVideoUrl: SignVideoUrl = getSignedGetUrl,
  reportVideoSignError: ReportVideoSignError = (error) => {
    console.warn('teacher_training_video_sign_failed', {
      error: buildSafeErrorForLog(error),
    });
  }
) {
  if (!videoS3Key) return null;

  try {
    return await signVideoUrl(videoS3Key);
  } catch (error) {
    reportVideoSignError(error);
    return null;
  }
}
