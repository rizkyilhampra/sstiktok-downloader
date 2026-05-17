export const STEP_TIMEOUT_MS = 15_000;
export const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

export function calculateBackoffDelay(attempt: number, baseDelay = 2000, maxDelay = 30_000): number {
  if (attempt === 1) return 0;
  const delay = baseDelay * Math.pow(2, attempt - 2);
  return Math.min(delay, maxDelay);
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts: number,
  onAttempt: ((attempt: number, delay: number) => void | Promise<void>) | null = null,
  onAfterDelay: ((attempt: number) => void | Promise<void>) | null = null,
): Promise<{ result: T; attempt: number; retried: boolean }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        const delay = calculateBackoffDelay(attempt);
        const delaySec = (delay / 1000).toFixed(1);
        console.log(`Retry attempt ${attempt}/${maxAttempts} - waiting ${delaySec}s (${delay}ms)...`);
        await onAttempt?.(attempt, delay);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      } else {
        console.log(`Starting download attempt 1/${maxAttempts}...`);
      }

      if (attempt > 1) await onAfterDelay?.(attempt);
      const result = await operation();
      if (attempt > 1) console.log(`✓ Success on attempt ${attempt}/${maxAttempts}`);
      return { result, attempt, retried: attempt > 1 };
    } catch (error) {
      lastError = error;
      console.error(`✗ Attempt ${attempt}/${maxAttempts} failed:`, (error as Error).message);
      if (attempt === maxAttempts) throw error;
    }
  }

  throw lastError;
}
