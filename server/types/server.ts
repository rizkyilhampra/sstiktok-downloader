// Wire-contract types (mirrors src/types/api.ts — kept separate due to tsconfig rootDir boundary)
export type ErrorType =
  | 'INVALID_INPUT'
  | 'INVALID_URL'
  | 'NETWORK_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'VIDEO_NOT_FOUND'
  | 'PARSE_ERROR'
  | 'UNKNOWN_ERROR';

export interface JobStartResponse {
  jobId: string;
  maxAttempts: number;
  success?: false;
  error?: string;
  errorType?: ErrorType;
  suggestion?: string;
}

export interface JobStatusResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  attempt: number;
  maxAttempts: number;
  createdAt: number;
  finishedAt: number | null;
  retryDelay?: number;
  downloadUrl?: string;
  quality?: 'hd' | 'standard';
  filename?: string;
  author?: string;
  description?: string;
  error?: string;
  errorType?: ErrorType;
  suggestion?: string;
  retried?: boolean;
}

export type Job = JobStatusResponse;

export interface ErrorInfo {
  errorType: ErrorType;
  message: string;
  suggestion: string;
}

export interface DownloadStepResult {
  downloadUrl: string;
  quality: 'hd';
  author: string;
  description: string;
}
