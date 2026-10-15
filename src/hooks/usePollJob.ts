import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { JobStartResponse, JobStatusResponse } from '@/types/api'
import type { QueueItem, QueueState } from '@/types/queue'

const POLL_INTERVAL_MS = 1500
// Ceiling measured in *active* (foreground) polling time, not wall clock, so a
// tab frozen in the background doesn't count against the job's deadline.
const POLL_CEILING_MS = 5 * 60 * 1000

export function proxyDownloadUrl(jobId: string, filename: string): string {
  return `/api/proxy-download?jobId=${encodeURIComponent(jobId)}&filename=${encodeURIComponent(filename)}`
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export function usePollJob(setQueue: Dispatch<SetStateAction<QueueState>>) {
  const pollControlsRef = useRef<Map<string, { pollNow: () => void; stop: () => void }>>(new Map())

  // On tab return, fire an immediate poll for every in-flight job.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      pollControlsRef.current.forEach((c) => c.pollNow())
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Shared polling loop used both for freshly-started jobs and for jobs
  // re-attached after a reload. Returns a promise that resolves when the job
  // reaches a terminal state (or is stopped).
  const runPollLoop = useCallback((itemId: string, jobId: string) => {
    const finalize = (patch: Partial<QueueItem>) => {
      setQueue(prev => ({
        ...prev,
        items: prev.items.map(i => (i.id === itemId ? { ...i, ...patch } : i)),
      }))
    }
    const failJob = (error: string, retryMode: QueueItem['retryMode'], suggestion?: string) =>
      finalize({ status: 'failed', error, suggestion, retryMode })

    return new Promise<void>((resolve) => {
      let interval: ReturnType<typeof setInterval> | null = null
      let inFlight = false
      // Accumulated foreground time. Each poll adds the gap since the previous
      // poll, capped so a single long background freeze contributes almost
      // nothing toward the ceiling.
      let activeMs = 0
      let lastPollAt = Date.now()

      const stop = () => {
        if (interval !== null) {
          clearInterval(interval)
          interval = null
        }
        pollControlsRef.current.delete(itemId)
        resolve()
      }

      const poll = async () => {
        if (inFlight) return
        inFlight = true
        const now = Date.now()
        if (document.visibilityState === 'visible') {
          activeMs += Math.min(now - lastPollAt, 2 * POLL_INTERVAL_MS)
        }
        lastPollAt = now
        try {
          const res = await fetch(`/api/jobs/${jobId}`)
          if (!res.ok) {
            if (res.status === 404) {
              failJob('Job no longer exists on the server', 'restart', 'Try again — the job may have expired.')
              stop()
            } else {
              console.warn(`Poll returned unexpected ${res.status}`)
            }
            return
          }
          const data: JobStatusResponse = await res.json()

          if (data.status === 'queued' || data.status === 'processing') {
            const nextAttempt = data.attempt ?? null
            const nextMax = data.maxAttempts
            setQueue(prev => ({
              ...prev,
              items: prev.items.map(i => {
                if (i.id !== itemId) return i
                if (
                  i.status === 'processing' &&
                  i.retryAttempt === nextAttempt &&
                  i.maxAttempts === nextMax &&
                  i.retryDelay === data.retryDelay
                ) {
                  return i
                }
                return {
                  ...i,
                  status: 'processing',
                  retryAttempt: nextAttempt,
                  maxAttempts: nextMax,
                  retryDelay: data.retryDelay,
                }
              }),
            }))
            if (activeMs > POLL_CEILING_MS) {
              failJob('Timed out waiting for the server to finish processing', 'poll', 'Try again in a moment.')
              stop()
            }
            return
          }

          if (data.status === 'completed' && data.downloadUrl) {
            const filename = data.filename || 'tiktok-video.mp4'
            const visible = document.visibilityState === 'visible'
            finalize({
              status: 'completed',
              finishedAt: data.finishedAt ?? Date.now(),
              retryMode: undefined,
              result: {
                success: true,
                quality: data.quality,
                filename: data.filename,
                author: data.author,
                description: data.description,
              },
              error: null,
              retryAttempt: data.attempt ?? null,
              metadata:
                data.author || data.description
                  ? { author: data.author, description: data.description }
                  : undefined,
            })

            // Only auto-download when the tab is in the foreground. A
            // programmatic click from a background/visibility callback has no
            // user activation — browsers block it (and block multiple
            // simultaneous downloads). QueueDisplay always renders an explicit
            // Download link as the reliable fallback.
            if (visible) {
              triggerDownload(proxyDownloadUrl(jobId, filename), filename)
            }
            stop()
            return
          }

          if (data.status === 'failed') {
            finalize({
              status: 'failed',
              retryMode: 'restart',
              error: data.error || 'Failed to process video',
              suggestion: data.suggestion,
              retryAttempt: data.attempt ?? null,
            })
            stop()
            return
          }
        } catch (err) {
          console.warn('Poll failed (will retry):', err)
        } finally {
          inFlight = false
        }
      }

      pollControlsRef.current.set(itemId, {
        pollNow: () => void poll(),
        stop,
      })
      interval = setInterval(poll, POLL_INTERVAL_MS)
      void poll()
    })
  }, [setQueue])

  const processQueueItem = useCallback(async (item: QueueItem) => {
    const failJob = (error: string, retryMode: QueueItem['retryMode'], suggestion?: string) =>
      setQueue(prev => ({
        ...prev,
        items: prev.items.map(i => (i.id === item.id ? { ...i, status: 'failed', error, suggestion, retryMode } : i)),
      }))

    let startData: JobStartResponse
    try {
      const startRes = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url, requestId: item.requestId }),
      })
      startData = await startRes.json()
      if (!startRes.ok || !startData.jobId) {
        failJob(
          startData.error || 'Failed to start job',
          startRes.status >= 400 && startRes.status < 500 ? 'restart' : 'resubmit',
          startData.suggestion,
        )
        return
      }
    } catch (err) {
      failJob(
        err instanceof Error ? err.message : 'Network error occurred',
        'resubmit',
        'Check your internet connection and try again.',
      )
      return
    }

    setQueue(prev => ({
      ...prev,
      items: prev.items.map(i =>
        i.id === item.id ? { ...i, jobId: startData.jobId, maxAttempts: startData.maxAttempts } : i,
      ),
    }))

    return runPollLoop(item.id, startData.jobId)
  }, [setQueue, runPollLoop])

  // Resume polling for a known job after reload or a local polling timeout.
  const reattachJob = useCallback((item: QueueItem) => {
    if (!item.jobId) return Promise.resolve()
    return runPollLoop(item.id, item.jobId)
  }, [runPollLoop])

  const stopJob = useCallback((itemId: string) => {
    pollControlsRef.current.get(itemId)?.stop()
  }, [])

  return { processQueueItem, reattachJob, stopJob }
}
