import type { ErrorInfo } from '../types/server.js';

export function getErrorResponse(error: unknown): ErrorInfo {
  const message = error instanceof Error ? error.message : '';

  if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND') || message.includes('timeout')) {
    return {
      errorType: 'NETWORK_ERROR',
      message: 'Network connection failed',
      suggestion: 'Check your internet connection and try again.',
    };
  }

  if (message.includes('429') || message.includes('Too Many Requests')) {
    return {
      errorType: 'RATE_LIMIT_ERROR',
      message: 'Too many requests',
      suggestion: 'Wait 30 seconds and try again or use a different video.',
    };
  }

  if (
    message.includes('Could not find') ||
    message.includes('download link') ||
    message.includes('HD download not available')
  ) {
    return {
      errorType: 'VIDEO_NOT_FOUND',
      message: 'Could not process this video',
      suggestion: 'The video may be private, deleted, or has restrictions. Try a different video.',
    };
  }

  if (message.includes('extract') || message.includes('parse') || message.includes('hx-redirect')) {
    return {
      errorType: 'PARSE_ERROR',
      message: 'Unable to extract video data',
      suggestion: 'This may be a temporary issue. Try again in a moment.',
    };
  }

  return {
    errorType: 'UNKNOWN_ERROR',
    message: 'Failed to process video',
    suggestion: 'Please try again. If the problem persists, try a different video.',
  };
}
