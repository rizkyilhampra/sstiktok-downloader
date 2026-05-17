import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Clipboard } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { QueueDisplay } from '@/components/QueueDisplay'
import type { QueueItem, QueueState } from '@/types/queue'
import { usePollJob } from '@/hooks/usePollJob'
import type { ClientConfigResponse } from '@/types/api'

const isTikTokUrl = (url: string) => url.includes('tiktok.com')
const DEFAULT_MAX_CONCURRENT_DOWNLOADS = 3
const DEFAULT_MAX_ATTEMPTS = 5

function App() {
  const [url, setUrl] = useState('')
  const [isPasting, setIsPasting] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [maxConcurrentDownloads, setMaxConcurrentDownloads] = useState(DEFAULT_MAX_CONCURRENT_DOWNLOADS)
  const [maxAttempts, setMaxAttempts] = useState(DEFAULT_MAX_ATTEMPTS)

  const [queue, setQueue] = useState<QueueState>({
    items: [],
  })
  const [schedulerTick, setSchedulerTick] = useState(0)
  const [pendingDuplicateUrl, setPendingDuplicateUrl] = useState<string | null>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const validationTimerRef = useRef<NodeJS.Timeout | null>(null)
  const processingIdsRef = useRef<Set<string>>(new Set())
  const confirmedUrlsRef = useRef<Set<string>>(new Set())
  const activeUrlsRef = useRef<Set<string>>(new Set())

  const { processQueueItem, stopJob } = usePollJob(setQueue)

  useEffect(() => {
    let cancelled = false

    void fetch('/api/config')
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json() as ClientConfigResponse
        if (!cancelled && Number.isInteger(data.maxClientConcurrentDownloads) && data.maxClientConcurrentDownloads > 0) {
          setMaxConcurrentDownloads(data.maxClientConcurrentDownloads)
        }
        if (!cancelled && Number.isInteger(data.maxAttempts) && data.maxAttempts > 0) {
          setMaxAttempts(data.maxAttempts)
        }
      })
      .catch((err) => {
        console.warn('Failed to load client config:', err)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const updateQueueItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue(prev => ({
      ...prev,
      items: prev.items.map(i => (i.id === id ? { ...i, ...patch } : i)),
    }))
  }, [])

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

  useEffect(() => {
    activeUrlsRef.current = new Set(queue.items.map(i => i.url))
  }, [queue.items])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Add URL to queue
  const addToQueue = useCallback((videoUrl: string) => {
    if (!videoUrl.trim() || !isTikTokUrl(videoUrl)) return

    const newItem: QueueItem = {
      id: `${Date.now()}-${Math.random()}`,
      url: videoUrl.trim(),
      status: 'pending',
      result: null,
      error: null,
      retryAttempt: null,
      maxAttempts,
      addedAt: Date.now(),
    }

    setQueue(prev => ({
      ...prev,
      items: [...prev.items, newItem],
    }))
  }, [maxAttempts])

  const tryAddToQueue = useCallback((videoUrl: string) => {
    const trimmed = videoUrl.trim()
    if (activeUrlsRef.current.has(trimmed) && !confirmedUrlsRef.current.has(trimmed)) {
      setPendingDuplicateUrl(trimmed)
    } else {
      addToQueue(trimmed)
    }
  }, [addToQueue])

  const handleDuplicateConfirm = () => {
    if (!pendingDuplicateUrl) return
    confirmedUrlsRef.current.add(pendingDuplicateUrl)
    addToQueue(pendingDuplicateUrl)
    setPendingDuplicateUrl(null)
  }

  const handleInputChange = (value: string) => {
    setUrl(value)

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    if (validationTimerRef.current) clearTimeout(validationTimerRef.current)

    if (!value.trim()) {
      setIsValidating(false)
      return
    }

    const isValidUrl = isTikTokUrl(value) && (value.includes('http://') || value.includes('https://') || value.startsWith('www.'))
    setIsValidating(true)

    debounceTimerRef.current = setTimeout(() => {
      setIsValidating(false)
      if (!isValidUrl) {
        toast.error('Invalid TikTok URL format')
      } else {
        tryAddToQueue(value)
      }
    }, 1500)
  }

  useEffect(() => {
    const availableSlots = maxConcurrentDownloads - processingIdsRef.current.size
    if (availableSlots <= 0) return

    const pendingItems = queue.items
      .filter(item => item.status === 'pending' && !processingIdsRef.current.has(item.id))
      .slice(0, availableSlots)
    if (pendingItems.length === 0) return

    pendingItems.forEach(item => processingIdsRef.current.add(item.id))
    setQueue(prev => ({
      ...prev,
      items: prev.items.map(i =>
        processingIdsRef.current.has(i.id) && i.status === 'pending'
          ? { ...i, status: 'processing' }
          : i
      ),
    }))

    pendingItems.forEach(item => {
      processQueueItem(item).finally(() => {
        processingIdsRef.current.delete(item.id)
        setSchedulerTick(tick => tick + 1)
      })
    })
  }, [queue.items, processQueueItem, schedulerTick, maxConcurrentDownloads])

  const handlePasteAndDownload = async () => {
    setIsPasting(true)
    try {
      if (!navigator.clipboard?.readText) {
        toast.error('Clipboard access not supported in your browser')
        return
      }
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        toast.error('Clipboard is empty. Copy a TikTok URL first.')
        return
      }
      if (!isTikTokUrl(text)) {
        toast.error("Clipboard doesn't contain a TikTok URL")
        return
      }
      tryAddToQueue(text.trim())
    } catch (err) {
      toast.error(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Permission denied. Please allow clipboard access.'
          : 'Failed to read from clipboard. Try pasting manually below.'
      )
    } finally {
      setIsPasting(false)
    }
  }

  const handleRetry = (itemId: string) => {
    updateQueueItem(itemId, { status: 'pending', error: null })
  }

  const handleClearCompleted = () => {
    setQueue(prev => ({
      ...prev,
      items: prev.items.filter(i => i.status !== 'completed'),
    }))
  }

  const handleRemoveItem = (itemId: string) => {
    stopJob(itemId)
    setQueue(prev => ({
      ...prev,
      items: prev.items.filter(i => i.id !== itemId),
    }))
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Dialog open={pendingDuplicateUrl !== null} onOpenChange={(open) => { if (!open) setPendingDuplicateUrl(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Already in queue</DialogTitle>
            <DialogDescription>
              This video is already in your download queue. Download another copy?
              Future pastes of this URL will skip this check.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDuplicateUrl(null)}>Cancel</Button>
            <Button onClick={handleDuplicateConfirm}>Download again</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl">TikTok Downloader</CardTitle>
          <CardDescription className="text-base">
            Download HD TikTok videos without watermarks—no need to watch ads. Simply paste a URL and your video downloads automatically.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">

          {/* Input Section */}
          <div className="space-y-4">
            {/* Primary CTA - Paste Button */}
            <div className="space-y-2">
              <Button
                type="button"
                onClick={handlePasteAndDownload}
                disabled={isPasting}
                variant="default"
                size="lg"
                className="w-full h-12"
                aria-label="Paste URL from clipboard and add to queue"
              >
                {isPasting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Pasting...</span>
                  </>
                ) : (
                  <>
                    <Clipboard className="h-5 w-5" />
                    <span>Paste from Clipboard</span>
                  </>
                )}
              </Button>


            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  Or enter manually
                </span>
              </div>
            </div>

            {/* Secondary - Manual Input */}
            <div className="space-y-2">
              <Input
                id="url"
                type="text"
                placeholder="https://www.tiktok.com/@username/video/..."
                value={url}
                onChange={(e) => handleInputChange(e.target.value)}
                disabled={isPasting}
                aria-describedby="url-helper"
              />

              {/* Validation Loading or Helper Text */}
              {isValidating ? (
                <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground animate-pulse">
                  <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
                  <span>Validating...</span>
                </div>
              ) : (
                <p id="url-helper" className="text-sm text-muted-foreground">
                  Videos are added to queue automatically and processed up to {maxConcurrentDownloads} at a time
                </p>
              )}
            </div>
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
