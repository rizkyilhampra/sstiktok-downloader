export interface DownloadRequest {
  url: string;
}

export interface DownloadResponse {
  success: boolean;
  downloadUrl?: string;
  quality?: 'hd' | 'standard';
  filename?: string;
  error?: string;
  message?: string;
  details?: string;
  retryAttempt?: number;
  isRetrying?: boolean;
}

export interface HealthResponse {
  status: string;
}
