import type { DownloadResponse } from './api'

export type QueueItemStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface QueueItem {
  id: string
  url: string
  status: QueueItemStatus
  result: DownloadResponse | null
  error: string | null
  retryAttempt: number | null
  addedAt: number
}

export interface QueueState {
  items: QueueItem[]
  processingId: string | null
}
