import { updateJob, failJob } from './jobStore.js';
import { config } from '../config.js';
import { getHDDownloadData, getHxRedirectUrl, getFinalDownloadUrl } from './tiktokApi.js';
import { retryWithBackoff } from '../utils/retry.js';
import { createFilename } from '../utils/filename.js';

export async function runDownloadJob(jobId: string, url: string): Promise<void> {
  const jobStarted = await updateJob(jobId, {
    status: 'processing',
    attempt: 1,
    retryDelay: undefined,
  });
  if (!jobStarted) return;

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
      config.maxAttempts,
      async (currentAttempt, delay) => {
        await updateJob(jobId, { attempt: currentAttempt, retryDelay: delay });
      },
      async () => { await updateJob(jobId, { retryDelay: undefined }); },
    );

    const filename = await createFilename(result.author, url);
    console.log('Generated filename:', filename);

    await updateJob(jobId, {
      status: 'completed',
      attempt,
      retried,
      finishedAt: Date.now(),
      retryDelay: undefined,
      downloadUrl: result.downloadUrl,
      quality: result.quality,
      filename,
      author: result.author,
      description: result.description,
    });
  } catch (error) {
    console.error('Job error:', (error as Error).message);
    await failJob(jobId, error);
  }
}
