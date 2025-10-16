export interface DownloadRequest {
  url: string;
}

export interface DownloadResponse {
  success: boolean;
  downloadUrl?: string;
  hash?: string;
  error?: string;
  message?: string;
}

export interface HealthResponse {
  status: string;
}
