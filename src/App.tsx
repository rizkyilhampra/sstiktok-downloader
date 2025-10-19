import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Clipboard, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { QueueDisplay } from '@/components/QueueDisplay'
import type { DownloadResponse } from '@/types/api'
import type { QueueItem, QueueState } from '@/types/queue'

function App() {
  const [url, setUrl] = useState('')
  const [isPasting, setIsPasting] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [queue, setQueue] = useState<QueueState>({
    items: [],
    processingId: null,
  })
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const validationTimerRef = useRef<NodeJS.Timeout | null>(null)
  const processingRef = useRef<boolean>(false)

  // Auto-hide completed items after 10 seconds
  useEffect(() => {
    const completedItems = queue.items.filter(item => item.status === 'completed')
    if (completedItems.length > 0) {
      const timer = setTimeout(() => {
        setQueue(prev => ({
          ...prev,
          items: prev.items.filter(item => item.status !== 'completed'),
        }))
        setUrl('')
      }, 10_000)

      return () => clearTimeout(timer)
    }
  }, [queue.items])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Process a single queue item
  const processQueueItem = useCallback(async (item: QueueItem) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, 5 * 60 * 1000) // 5 minute timeout

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: item.url }),
        signal: controller.signal,
      })

      const data: DownloadResponse = await response.json()

      // Update queue item with result and metadata
      setQueue(prev => ({
        ...prev,
        items: prev.items.map(i =>
          i.id === item.id
            ? {
              ...i,
              status: data.success ? 'completed' : 'failed',
              result: data.success ? data : null,
              error: data.success ? null : (data.error || data.message || 'Failed to process video'),
              suggestion: data.success ? undefined : data.suggestion,
              retryAttempt: data.retryAttempt || null,
              metadata: data.author || data.description ? {
                author: data.author,
                description: data.description,
              } : undefined,
            }
            : i
        ),
      }))

      if (data.success && data.downloadUrl) {
        // Automatically trigger download through proxy
        const filename = data.filename || 'tiktok-video.mp4'
        const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(data.downloadUrl)}&filename=${encodeURIComponent(filename)}`
        const a = document.createElement('a')
        a.href = proxyUrl
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
    } catch (err) {
      let errorMsg = 'Network error occurred'

      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMsg = 'Request timeout - took too long to process (over 5 minutes)'
        } else {
          errorMsg = err.message
        }
      }

      setQueue(prev => ({
        ...prev,
        items: prev.items.map(i =>
          i.id === item.id
            ? {
              ...i,
              status: 'failed',
              error: errorMsg,
              suggestion: 'Check your internet connection and try again.'
            }
            : i
        ),
      }))
    } finally {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [])

  // Add URL to queue and trigger auto-download
  const addToQueue = useCallback((videoUrl: string) => {
    if (!videoUrl.trim()) {
      return
    }

    if (!videoUrl.includes('tiktok.com')) {
      return
    }

    const newItem: QueueItem = {
      id: `${Date.now()}-${Math.random()}`,
      url: videoUrl.trim(),
      status: 'pending',
      result: null,
      error: null,
      retryAttempt: null,
      addedAt: Date.now(),
    }

    setQueue(prev => ({
      ...prev,
      items: [...prev.items, newItem],
    }))
  }, [])

  const handleInputChange = (value: string) => {
    setUrl(value)
    setValidationError(null)

    // Clear existing timers
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    if (validationTimerRef.current) {
      clearTimeout(validationTimerRef.current)
    }

    if (!value.trim()) {
      setIsValidating(false)
      return
    }

    // Instant URL format validation (client-side)
    const isValidUrl = value.includes('tiktok.com') && (value.includes('http://') || value.includes('https://') || value.startsWith('www.'))
    if (!isValidUrl) {
      setValidationError('Invalid TikTok URL format')
    }

    // Show validating state during debounce
    setIsValidating(true)

    // Set new debounce timer (1.5 seconds delay)
    debounceTimerRef.current = setTimeout(() => {
      setIsValidating(false)
      if (value.trim() && isValidUrl) {
        addToQueue(value)
      }
    }, 1500)
  }

  // Process next item in queue
  useEffect(() => {
    if (processingRef.current) return

    const pendingItem = queue.items.find(item => item.status === 'pending')
    if (!pendingItem) return

    processingRef.current = true
    setQueue(prev => ({
      ...prev,
      processingId: pendingItem.id,
      items: prev.items.map(i =>
        i.id === pendingItem.id ? { ...i, status: 'processing' } : i
      ),
    }))

    processQueueItem(pendingItem).finally(() => {
      processingRef.current = false
    })
  }, [queue.items, processQueueItem])

  const handlePasteAndDownload = async () => {
    setIsPasting(true)

    try {
      // Check if Clipboard API is available
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setIsPasting(false)
        return
      }

      // Read from clipboard
      const text = await navigator.clipboard.readText()

      if (!text.trim()) {
        setIsPasting(false)
        return
      }

      // Validate URL
      if (!text.includes('tiktok.com')) {
        setIsPasting(false)
        return
      }

      // Add to queue immediately (no debounce for paste)
      addToQueue(text.trim())
      setIsPasting(false)
    } catch (err) {
      setIsPasting(false)
    }
  }

  const handleRetry = (itemId: string) => {
    setQueue(prev => ({
      ...prev,
      items: prev.items.map(i =>
        i.id === itemId ? { ...i, status: 'pending', error: null } : i
      ),
    }))
  }

  const handleClearCompleted = () => {
    setQueue(prev => ({
      ...prev,
      items: prev.items.filter(i => i.status !== 'completed'),
    }))
  }

  const handleRemoveItem = (itemId: string) => {
    setQueue(prev => ({
      ...prev,
      items: prev.items.filter(i => i.id !== itemId),
    }))
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl">TikTok Downloader</CardTitle>
          <CardDescription className="text-base">
            Download HD TikTok videos without watermarks—no need to watch ads. Simply paste a URL and your video downloads automatically.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">

          {/* Input Section */}
          <div className="space-y-2">
            <Label htmlFor="url" className="text-sm font-medium">
              Paste TikTok URL
            </Label>
            <div className="flex gap-2">
              <Input
                id="url"
                type="text"
                placeholder="https://www.tiktok.com/@username/video/..."
                value={url}
                onChange={(e) => handleInputChange(e.target.value)}
                disabled={isPasting}
                className="flex-1"
                aria-describedby="url-helper"
              />
              <Button
                type="button"
                onClick={handlePasteAndDownload}
                disabled={isPasting}
                variant="outline"
                size="icon"
                title="Paste from clipboard and add to queue"
                aria-label="Paste URL from clipboard"
              >
                {isPasting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Clipboard className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Validation Error or Helper Text */}
            {validationError ? (
              <div className="flex items-center gap-2 p-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{validationError}</span>
              </div>
            ) : isValidating ? (
              <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground animate-pulse">
                <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" />
                <span>Validating...</span>
              </div>
            ) : (
              <p id="url-helper" className="text-xs text-muted-foreground">
                Videos are added to queue automatically and processed one at a time
              </p>
            )}
          </div>

          {/* Queue Display */}
          <QueueDisplay
            items={queue.items}
            onRetry={handleRetry}
            onRemove={handleRemoveItem}
            onClearCompleted={handleClearCompleted}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default App
