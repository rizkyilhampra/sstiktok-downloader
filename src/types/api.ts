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
}

export interface HealthResponse {
  status: string;
}
