import type { DownloadResponse } from './api'

export type QueueItemStatus = 'pending' | 'processing' | 'completed' | 'expired' | 'failed'

export type RetryMode = 'resubmit' | 'poll' | 'restart'

export interface QueueItemMetadata {
  author?: string
  description?: string
  thumbnail?: string
}

export interface QueueItem {
  id: string
  requestId: string
  url: string
  status: QueueItemStatus
  result: DownloadResponse | null
  error: string | null
  suggestion?: string
  retryAttempt: number | null
  retryDelay?: number
  maxAttempts?: number
  jobId?: string
  addedAt: number
  submittedAt?: number
  finishedAt?: number
  retryMode?: RetryMode
  metadata?: QueueItemMetadata
}

export interface QueueState {
  items: QueueItem[]
}
