import { getJob, updateJob, scheduleJobCleanup, DEFAULT_MAX_ATTEMPTS } from './jobStore.js';
import { sendProgress, getSse, removeSse } from './sseStore.js';
import { getHDDownloadData, getHxRedirectUrl, getFinalDownloadUrl } from './tiktokApi.js';
import { retryWithBackoff } from '../utils/retry.js';
import { createFilename } from '../utils/filename.js';
import { getErrorResponse } from '../utils/errors.js';

export async function runDownloadJob(jobId: string, url: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;

  sendProgress(jobId, {
    type: 'status',
    status: 'processing',
    attempt: 1,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
  });

  try {
    const { result, attempt, retried } = await retryWithBackoff(
      async () => {
        const downloadData = await getHDDownloadData(url);

        const hxRedirectUrl = await getHxRedirectUrl(downloadData.directUrl, downloadData.ttValue);
        console.log('Got hx-redirect URL:', hxRedirectUrl);

        const downloadUrl = await getFinalDownloadUrl(hxRedirectUrl);
        console.log('Final download URL obtained');

        return {
          downloadUrl,
          quality: 'hd' as const,
          author: downloadData.author,
          description: downloadData.description,
        };
      },
      DEFAULT_MAX_ATTEMPTS,
      (currentAttempt, delay) => {
        updateJob(jobId, { attempt: currentAttempt });
        sendProgress(jobId, {
          type: 'retry',
          attempt: currentAttempt,
          maxAttempts: DEFAULT_MAX_ATTEMPTS,
          delay,
          message: `Retry attempt ${currentAttempt}/${DEFAULT_MAX_ATTEMPTS} (waiting ${(delay / 1000).toFixed(1)}s)`,
        });
      },
    );

    const filename = await createFilename(result.author, url);
    console.log('Generated filename:', filename);

    updateJob(jobId, {
      status: 'completed',
      attempt,
      retried,
      finishedAt: Date.now(),
      downloadUrl: result.downloadUrl,
      quality: result.quality,
      filename,
      author: result.author,
      description: result.description,
    });

    sendProgress(jobId, { type: 'success', attempt, retried });
  } catch (error) {
    console.error('Job error:', (error as Error).message);
    const errorInfo = getErrorResponse(error);
    updateJob(jobId, {
      status: 'failed',
      finishedAt: Date.now(),
      error: errorInfo.message,
      errorType: errorInfo.errorType,
      suggestion: errorInfo.suggestion,
    });
    sendProgress(jobId, {
      type: 'error',
      error: errorInfo.message,
      errorType: errorInfo.errorType,
      suggestion: errorInfo.suggestion,
    });
  } finally {
    const connection = getSse(jobId);
    if (connection) {
      connection.end();
      removeSse(jobId);
    }
    scheduleJobCleanup(jobId);
  }
}
