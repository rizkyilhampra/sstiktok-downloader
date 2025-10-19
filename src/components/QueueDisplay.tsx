import { Loader2, CheckCircle2, AlertCircle, Trash2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  if (items.length === 0) {
    return null
  }

  const completedCount = items.filter(i => i.status === 'completed').length
  const processingCount = items.filter(i => i.status === 'processing').length
  const totalCount = items.length

  return (
    <div className="space-y-3">
      {/* Queue Summary */}
      <div className="flex items-center justify-between p-3 bg-secondary/50 border border-secondary rounded-lg">
        <div className="text-sm font-medium text-foreground">
          Queue: {totalCount} item{totalCount !== 1 ? 's' : ''}
          {processingCount > 0 && ` (${processingCount} processing)`}
        </div>
        {completedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearCompleted}
            className="h-7 px-2 text-xs"
          >
            Clear ({completedCount})
          </Button>
        )}
      </div>

      {/* Queue Items */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
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
          >
            <div className="flex items-start gap-3">
              {/* Status Icon */}
              <div className="flex-shrink-0 mt-0.5">
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
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-foreground">
                    #{index + 1}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.status === 'processing' &&
                      (item.retryAttempt
                        ? `Retrying (${item.retryAttempt}/3)`
                        : 'Processing...')}
                    {item.status === 'completed' && 'Download started'}
                    {item.status === 'failed' && 'Failed'}
                    {item.status === 'pending' && 'Waiting...'}
                  </div>
                </div>

                {/* URL - truncated */}
                <div className="text-xs text-muted-foreground truncate mt-1">
                  {item.url}
                </div>

                {/* Error Message */}
                {item.error && (
                  <p className="text-xs text-destructive mt-1.5">{item.error}</p>
                )}

                {/* Success Details */}
                {item.result?.success && item.result.filename && (
                  <p className="text-xs text-primary mt-1.5">{item.result.filename}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {item.status === 'failed' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRetry(item.id)}
                    className="h-7 w-7 p-0"
                    title="Retry"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(item.id)}
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
