import type { DownloadResponse } from './api'

export type QueueItemStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface QueueItemMetadata {
  author?: string
  description?: string
  thumbnail?: string
}

export interface QueueItem {
  id: string
  url: string
  status: QueueItemStatus
  result: DownloadResponse | null
  error: string | null
  suggestion?: string
  retryAttempt: number | null
  addedAt: number
  metadata?: QueueItemMetadata
}

export interface QueueState {
  items: QueueItem[]
  processingId: string | null
}
