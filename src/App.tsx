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
import type { ClientConfigResponse, JobStatusResponse } from '@/types/api'

function isTikTokUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return false
    if (['tt.site', 'www.tt.site'].includes(url.hostname)) {
      return url.protocol === 'https:' && /^\/t\/[A-Za-z0-9]+\/?$/.test(url.pathname)
    }
    return ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname)
  } catch {
    return false
  }
}

function findTikTokUrl(text: string): string | null {
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const candidate = match[0].replace(/[),.!?]+$/, '')
    if (isTikTokUrl(candidate)) return candidate
  }
  return null
}
const DEFAULT_MAX_CONCURRENT_DOWNLOADS = 3
const DEFAULT_MAX_ATTEMPTS = 5
const QUEUE_STORAGE_KEY = 'sstiktok-queue'
const REQUEST_ID_RE = /^[A-Za-z0-9._-]{1,128}$/
const SAVED_JOB_CHECK_INTERVAL_MS = 5000
const CONFIG_RETRY_INTERVAL_MS = 5000

function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function loadQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((i): i is QueueItem => typeof i?.id === 'string' && typeof i?.url === 'string')
      .filter(i => typeof i.addedAt === 'number')
      .map(i => ({
        ...i,
        result: i.result ? { ...i.result, downloadUrl: undefined } : null,
        requestId: typeof i.requestId === 'string' && REQUEST_ID_RE.test(i.requestId)
          ? i.requestId
          : REQUEST_ID_RE.test(i.id) ? i.id : newRequestId(),
      }))
      // Resume an uncertain POST with its saved request ID.
      .map(i => (i.status === 'processing' && !i.jobId ? { ...i, status: 'pending' } : i))
  } catch {
    return []
  }
}

function saveQueue(items: QueueItem[]) {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Quota or private-mode failures are non-fatal — persistence is best-effort.
  }
}

function App() {
  const [url, setUrl] = useState('')
  const [isPasting, setIsPasting] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [maxConcurrentDownloads, setMaxConcurrentDownloads] = useState(DEFAULT_MAX_CONCURRENT_DOWNLOADS)
  const [maxAttempts, setMaxAttempts] = useState(DEFAULT_MAX_ATTEMPTS)
  const [jobTtlSeconds, setJobTtlSeconds] = useState<number | null>(null)

  const [queue, setQueue] = useState<QueueState>(() => ({ items: loadQueue() }))
  const [schedulerTick, setSchedulerTick] = useState(0)
  const [pendingDuplicateUrl, setPendingDuplicateUrl] = useState<string | null>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const validationTimerRef = useRef<NodeJS.Timeout | null>(null)
  const processingIdsRef = useRef<Set<string>>(new Set())
  const confirmedUrlsRef = useRef<Set<string>>(new Set())
  const activeUrlsRef = useRef<Set<string>>(new Set())
  const queueItemsRef = useRef(queue.items)
  const restoredIdsRef = useRef(new Set(queue.items.map(i => i.id)))

  const { processQueueItem, reattachJob, stopJob } = usePollJob(setQueue)
  const didRehydrate = useRef(false)

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const loadConfig = async () => {
      try {
        const res = await fetch('/api/config')
        if (!res.ok) throw new Error(`Config request returned ${res.status}`)
        const data = await res.json() as ClientConfigResponse
        if (!Number.isInteger(data.jobTtlSeconds) || data.jobTtlSeconds <= 0) {
          throw new Error('Config response has no valid job TTL')
        }
        if (!cancelled && Number.isInteger(data.maxClientConcurrentDownloads) && data.maxClientConcurrentDownloads > 0) {
          setMaxConcurrentDownloads(data.maxClientConcurrentDownloads)
        }
        if (!cancelled && Number.isInteger(data.maxAttempts) && data.maxAttempts > 0) {
          setMaxAttempts(data.maxAttempts)
        }
        if (!cancelled) setJobTtlSeconds(data.jobTtlSeconds)
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to load client config (will retry):', err)
          retryTimer = setTimeout(() => void loadConfig(), CONFIG_RETRY_INTERVAL_MS)
        }
      }
    }

    void loadConfig()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  const updateSavedCompletedItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue(prev => {
      let changed = false
      const items = prev.items.map(i => {
        if (i.id !== id || i.status !== 'completed' || i.finishedAt) return i
        changed = true
        return { ...i, ...patch }
      })
      return changed ? { ...prev, items } : prev
    })
  }, [])

  // Resume in-flight jobs saved by an earlier session.
  useEffect(() => {
    if (didRehydrate.current) return
    didRehydrate.current = true
    queue.items.forEach(item => {
      if (item.jobId && item.status === 'processing') {
        processingIdsRef.current.add(item.id)
        reattachJob(item).finally(() => {
          processingIdsRef.current.delete(item.id)
          setSchedulerTick(tick => tick + 1)
        })
      }
    })
  }, [queue.items, reattachJob])

  useEffect(() => {
    queueItemsRef.current = queue.items
  }, [queue.items])

  // Older saved items have no finishedAt. Recheck them until the server gives
  // a definitive result; a temporary network or Redis failure is not expiry.
  useEffect(() => {
    if (!queueItemsRef.current.some(i => i.status === 'completed' && !i.finishedAt)) return
    let cancelled = false
    const inFlight = new Set<string>()
    let timer: ReturnType<typeof setInterval>

    const check = () => {
      const pending = queueItemsRef.current.filter(i => i.status === 'completed' && !i.finishedAt)
      if (pending.length === 0) {
        clearInterval(timer)
        return
      }
      pending.forEach(item => {
        if (!item.jobId) {
          updateSavedCompletedItem(item.id, { status: 'expired' })
          return
        }
        if (inFlight.has(item.id)) return
        inFlight.add(item.id)
        void fetch(`/api/jobs/${encodeURIComponent(item.jobId)}`)
          .then(async res => {
            if (cancelled) return
            if (res.status === 404) {
              updateSavedCompletedItem(item.id, { status: 'expired' })
              return
            }
            if (!res.ok) return
            const data = await res.json() as JobStatusResponse
            if (cancelled) return
            if (data.status === 'failed') {
              updateSavedCompletedItem(item.id, { status: 'expired' })
            } else if (data.status === 'completed' && typeof data.finishedAt === 'number') {
              updateSavedCompletedItem(item.id, { finishedAt: data.finishedAt })
            }
          })
          .catch(err => console.warn('Failed to check saved download (will retry):', err))
          .finally(() => inFlight.delete(item.id))
      })
    }

    check()
    timer = setInterval(check, SAVED_JOB_CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [updateSavedCompletedItem])

  // Persist the queue so it can be rehydrated on the next load.
  useEffect(() => {
    saveQueue(queue.items)
  }, [queue.items])

  // Keep completed items, but replace their download link when Redis expires it.
  useEffect(() => {
    if (jobTtlSeconds === null) return
    const completed = queue.items.filter(i => i.status === 'completed' && typeof i.finishedAt === 'number')
    if (completed.length === 0) return
    const nextDeadline = Math.min(...completed.map(i => i.finishedAt! + jobTtlSeconds * 1000))
    const delay = Math.max(0, nextDeadline - Date.now())
    const timer = setTimeout(() => {
      const cutoff = Date.now() - jobTtlSeconds * 1000
      setQueue(prev => ({
        ...prev,
        items: prev.items.map(i =>
          i.status === 'completed' && typeof i.finishedAt === 'number' && i.finishedAt <= cutoff
            ? { ...i, status: 'expired' }
            : i,
        ),
      }))
    }, delay)
    return () => clearTimeout(timer)
  }, [queue.items, jobTtlSeconds])

  // Only restored, unsubmitted work needs an age check. A fresh item may wait
  // in the client queue longer than the server job TTL before it gets a slot.
  useEffect(() => {
    if (jobTtlSeconds === null) return
    const cutoff = Date.now() - jobTtlSeconds * 1000
    setQueue(prev => {
      let changed = false
      const items = prev.items.map(i => {
        if (!restoredIdsRef.current.has(i.id) || i.status !== 'pending' || i.jobId ||
          (i.submittedAt ?? i.addedAt) >= cutoff) return i
        changed = true
        return {
          ...i,
          status: 'failed' as const,
          retryMode: 'restart' as const,
          error: 'Saved request is too old to resume',
          suggestion: 'Retry to start a new download.',
        }
      })
      return changed ? { ...prev, items } : prev
    })
  }, [jobTtlSeconds])

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

  // Handle inbound Share Target intents from the PWA share sheet.
  // Share text can contain a caption around the link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const shared = params.get('url') ?? params.get('text') ?? params.get('title')
    if (!shared) {
      return
    }
    const sharedUrl = findTikTokUrl(shared)
    if (sharedUrl) {
      tryAddToQueue(sharedUrl)
    }
    window.history.replaceState({}, '', '/')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Add URL to queue
  const addToQueue = useCallback((videoUrl: string) => {
    if (!videoUrl.trim() || !isTikTokUrl(videoUrl)) return

    const id = newRequestId()
    const newItem: QueueItem = {
      id,
      requestId: id,
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
    setUrl('')
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

    const videoUrl = findTikTokUrl(value)
    setIsValidating(true)

    debounceTimerRef.current = setTimeout(() => {
      setIsValidating(false)
      if (!videoUrl) {
        toast.error('Invalid TikTok URL format')
      } else {
        tryAddToQueue(videoUrl)
      }
    }, 1500)
  }

  useEffect(() => {
    const availableSlots = maxConcurrentDownloads - processingIdsRef.current.size
    if (availableSlots <= 0) return

    const pendingItems = queue.items
      .filter(item =>
        item.status === 'pending' &&
        !processingIdsRef.current.has(item.id) &&
        (!restoredIdsRef.current.has(item.id) || Boolean(item.jobId) ||
          (jobTtlSeconds !== null && Date.now() - (item.submittedAt ?? item.addedAt) < jobTtlSeconds * 1000)),
      )
      .slice(0, availableSlots)
    if (pendingItems.length === 0) return

    pendingItems.forEach(item => processingIdsRef.current.add(item.id))
    const startedAt = Date.now()
    const markStarted = (items: QueueItem[]) => items.map(i =>
      processingIdsRef.current.has(i.id) && i.status === 'pending'
        ? { ...i, status: 'processing' as const, submittedAt: i.retryMode === 'poll' ? i.submittedAt : startedAt }
        : i,
    )
    // Persist the submission timestamp and request ID before the POST begins.
    saveQueue(markStarted(queue.items))
    setQueue(prev => ({
      ...prev,
      items: markStarted(prev.items),
    }))

    pendingItems.forEach(item => {
      const task = item.retryMode === 'poll' && item.jobId ? reattachJob(item) : processQueueItem(item)
      task.finally(() => {
        processingIdsRef.current.delete(item.id)
        setSchedulerTick(tick => tick + 1)
      })
    })
  }, [queue.items, processQueueItem, reattachJob, schedulerTick, maxConcurrentDownloads, jobTtlSeconds])

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
      const videoUrl = findTikTokUrl(text)
      if (!videoUrl) {
        toast.error("Clipboard doesn't contain a TikTok URL")
        return
      }
      tryAddToQueue(videoUrl)
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
    restoredIdsRef.current.delete(itemId)
    setQueue(prev => ({
      ...prev,
      items: prev.items.map(i => {
        if (i.id !== itemId) return i
        const mode = i.status === 'expired' ? 'restart' : i.retryMode ?? 'restart'
        return {
          ...i,
          status: 'pending',
          requestId: mode === 'restart' ? newRequestId() : i.requestId,
          jobId: mode === 'poll' ? i.jobId : undefined,
          retryMode: mode === 'poll' ? 'poll' : undefined,
          result: null,
          metadata: undefined,
          finishedAt: undefined,
          addedAt: Date.now(),
          submittedAt: undefined,
          error: null,
          suggestion: undefined,
          retryAttempt: null,
          retryDelay: undefined,
        }
      }),
    }))
  }

  const handleClearCompleted = () => {
    setQueue(prev => ({
      ...prev,
      items: prev.items.filter(i => i.status !== 'completed' && i.status !== 'expired'),
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
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-8">
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
      <footer className="mt-6 text-sm text-muted-foreground text-center">
        Built with love ❤️ by{' '}
        <a href="https://rizkyilhampra.dev" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground transition-colors">
          Rizky Ilham Pratama
        </a>
        {' · '}
        <a href="https://github.com/rizkyilhampra/sstiktok-downloader" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground transition-colors">
          GitHub
        </a>
        {__BUILD_COMMIT__ && (
          <div className="mt-2">
            Built from{' '}
            <a
              href={`https://github.com/rizkyilhampra/sstiktok-downloader/commit/${__BUILD_COMMIT__.sha}`}
              target="_blank"
              rel="noopener noreferrer"
              title={__BUILD_COMMIT__.title}
              aria-label={`Commit ${__BUILD_COMMIT__.sha.slice(0, 7)}: ${__BUILD_COMMIT__.title}`}
              className="underline underline-offset-4 hover:text-foreground transition-colors"
            >
              {__BUILD_COMMIT__.sha.slice(0, 7)}
            </a>
          </div>
        )}
      </footer>
    </div>
  )
}

export default App
