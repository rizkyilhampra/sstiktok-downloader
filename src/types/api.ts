export interface DownloadRequest {
  url: string;
}

export type ErrorType =
  | 'INVALID_INPUT'
  | 'INVALID_URL'
  | 'NETWORK_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'VIDEO_NOT_FOUND'
  | 'PARSE_ERROR'
  | 'UNKNOWN_ERROR';

export interface DownloadResponse {
  success: boolean;
  downloadUrl?: string;
  quality?: 'hd' | 'standard';
  filename?: string;
  author?: string;
  description?: string;
  error?: string;
  message?: string;
  details?: string;
  errorType?: ErrorType;
  suggestion?: string;
  retryAttempt?: number;
  isRetrying?: boolean;
}

export interface HealthResponse {
  status: string;
}
