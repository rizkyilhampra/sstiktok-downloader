import { Loader2, CheckCircle2, AlertCircle, Trash2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import type { QueueItem } from '@/types/queue'

interface QueueDisplayProps {
  items: QueueItem[]
  onRetry: (itemId: string) => void
  onRemove: (itemId: string) => void
  onClearCompleted: () => void
}

export function QueueDisplay({
  items,
  onRetry,
  onRemove,
  onClearCompleted,
}: QueueDisplayProps) {
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)

  if (items.length === 0) {
    return null
  }

  const completedCount = items.filter(i => i.status === 'completed').length
  const processingCount = items.filter(i => i.status === 'processing').length
  const failedCount = items.filter(i => i.status === 'failed').length
  const totalCount = items.length

  const getStatusLabel = (status: QueueItem['status'], retryAttempt?: number | null) => {
    switch (status) {
      case 'processing':
        if (retryAttempt && retryAttempt >= 1) {
          return `Processing (Attempt ${retryAttempt}/10)`
        }
        return 'Processing...'
      case 'completed':
        return 'Downloading to browser'
      case 'failed':
        return 'Failed'
      case 'pending':
        return 'Queued'
      default:
        return status
    }
  }

  const getBackoffDelay = (attemptNumber: number): number => {
    if (attemptNumber === 1) return 0
    const delay = 1000 * Math.pow(2, attemptNumber - 2)
    return Math.min(delay, 60000) // Cap at 60 seconds
  }

  const getEstimatedWaitTime = (attemptNumber?: number | null): string => {
    if (!attemptNumber || attemptNumber < 2) return ''
    const nextDelay = getBackoffDelay(attemptNumber)
    const seconds = Math.ceil(nextDelay / 1000)
    return ` (waiting ${seconds}s before next retry)`
  }

  return (
    <div className="space-y-3">
      {/* Queue Summary */}
      <div className="flex items-center justify-between p-3 bg-secondary/50 border border-secondary rounded-lg">
        <div className="text-sm font-medium text-foreground" role="status" aria-live="polite">
          Queue: {totalCount} item{totalCount !== 1 ? 's' : ''}
          {processingCount > 0 && ` (${processingCount} processing)`}
          {failedCount > 0 && ` • ${failedCount} failed`}
        </div>
        {completedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearCompleted}
            className="h-8 px-2 text-xs"
            aria-label={`Clear ${completedCount} completed item${completedCount !== 1 ? 's' : ''}`}
            title="Clear completed downloads from queue"
          >
            Clear ({completedCount})
          </Button>
        )}
      </div>

      {/* Queue Items */}
      <div className="space-y-2 max-h-96 overflow-y-auto" role="region" aria-label="Download queue">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`p-3 border rounded-lg transition-colors ${
              item.status === 'completed'
                ? 'border-primary/50 bg-primary/10'
                : item.status === 'failed'
                  ? 'border-destructive/50 bg-destructive/10'
                  : item.status === 'processing'
                    ? 'border-blue-500/50 bg-blue-500/10'
                    : 'border-secondary/50 bg-secondary/30'
            }`}
            role="article"
            aria-label={`Item ${index + 1}: ${getStatusLabel(item.status, item.retryAttempt)}`}
            title={item.status === 'processing' && item.retryAttempt && item.retryAttempt > 1 ? `Currently on attempt ${item.retryAttempt}/10. Using exponential backoff retry strategy.` : undefined}
          >
            <div className="flex items-start gap-3">
              {/* Status Icon */}
              <div className="flex-shrink-0 mt-0.5" aria-hidden="true">
                {item.status === 'processing' && (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                )}
                {item.status === 'completed' && (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                )}
                {item.status === 'failed' && (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
                {item.status === 'pending' && (
                  <div className="h-4 w-4 rounded-full border-2 border-secondary-foreground/50 border-t-secondary-foreground animate-spin" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-sm font-medium text-foreground">
                    #{index + 1}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {getStatusLabel(item.status, item.retryAttempt)}
                    {item.status === 'processing' && getEstimatedWaitTime(item.retryAttempt)}
                  </div>
                </div>

                {/* Video metadata (author + description) */}
                {item.metadata?.author || item.metadata?.description ? (
                  <div className="mb-1.5">
                    {item.metadata.author && (
                      <div className="text-xs font-medium text-foreground truncate">
                        @{item.metadata.author}
                      </div>
                    )}
                    {item.metadata.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {item.metadata.description}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground truncate mb-1.5">
                    {item.url}
                  </div>
                )}

                {/* Error Message with Suggestion */}
                {item.error && (
                  <div className="mt-1.5 space-y-1">
                    <p className="text-xs font-medium text-destructive">{item.error}</p>
                    {item.suggestion && (
                      <p className="text-xs text-destructive/80">{item.suggestion}</p>
                    )}
                  </div>
                )}

                {/* Success Details */}
                {item.result?.success && item.result.filename && (
                  <p className="text-xs text-primary mt-1.5">{item.result.filename}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {item.status === 'failed' && !removeConfirm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRetry(item.id)}
                    className="h-9 w-9 p-0"
                    title="Retry download (add back to queue)"
                    aria-label="Retry this download"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                {removeConfirm === item.id ? (
                  <div className="flex gap-1">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        onRemove(item.id)
                        setRemoveConfirm(null)
                      }}
                      className="h-8 px-2 text-xs"
                    >
                      Remove
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemoveConfirm(null)}
                      className="h-8 px-2 text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemoveConfirm(item.id)}
                    className="h-9 w-9 p-0 text-destructive hover:text-destructive"
                    title="Remove from queue"
                    aria-label="Remove this item from queue"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
