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

export interface JobStartResponse {
  jobId: string;
  maxAttempts: number;
  success?: false;
  error?: string;
  errorType?: ErrorType;
  suggestion?: string;
}

export interface JobStatusResponse {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  attempt?: number;
  maxAttempts?: number;
  retryDelay?: number;
  downloadUrl?: string;
  quality?: 'hd' | 'standard';
  filename?: string;
  author?: string;
  description?: string;
  error?: string;
  errorType?: ErrorType;
  suggestion?: string;
}

export interface HealthResponse {
  status: string;
}

export interface ClientConfigResponse {
  maxClientConcurrentDownloads: number;
  maxAttempts: number;
}
