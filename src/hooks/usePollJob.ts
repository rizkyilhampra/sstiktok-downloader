import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { JobStartResponse, JobStatusResponse } from '@/types/api'
import type { QueueItem, QueueState } from '@/types/queue'

const POLL_INTERVAL_MS = 1500
const POLL_CEILING_MS = 2 * 60 * 1000

export function usePollJob(setQueue: Dispatch<SetStateAction<QueueState>>) {
  const pollControlsRef = useRef<Map<string, { pollNow: () => void; stop: () => void }>>(new Map())

  // Fires an immediate poll for every in-flight job when the tab returns,
  // so minimize-and-restore feels instant instead of waiting for the next interval.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      pollControlsRef.current.forEach((c) => c.pollNow())
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const processQueueItem = useCallback(async (item: QueueItem) => {
    const requestId = `${item.id}-${Date.now()}`

    const finalize = (patch: Partial<QueueItem>) => {
      setQueue(prev => ({
        ...prev,
        items: prev.items.map(i => (i.id === item.id ? { ...i, ...patch } : i)),
      }))
    }

    const failJob = (error: string, suggestion?: string) =>
      finalize({ status: 'failed', error, suggestion })

    let startData: JobStartResponse
    try {
      const startRes = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url, requestId }),
      })
      startData = await startRes.json()
      if (!startRes.ok || !startData.jobId) {
        failJob(startData.error || 'Failed to start job', startData.suggestion)
        return
      }
    } catch (err) {
      failJob(
        err instanceof Error ? err.message : 'Network error occurred',
        'Check your internet connection and try again.',
      )
      return
    }

    finalize({ jobId: startData.jobId, maxAttempts: startData.maxAttempts })

    const startedAt = Date.now()
    const jobId = startData.jobId

    return new Promise<void>((resolve) => {
      let interval: ReturnType<typeof setInterval> | null = null
      let inFlight = false

      const stop = () => {
        if (interval !== null) {
          clearInterval(interval)
          interval = null
        }
        pollControlsRef.current.delete(item.id)
        resolve()
      }

      const poll = async () => {
        if (inFlight) return
        inFlight = true
        try {
          const res = await fetch(`/api/jobs/${jobId}`)
          if (!res.ok) {
            if (res.status === 404) {
              failJob('Job no longer exists on the server', 'Try again — the job may have expired.')
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
                if (i.id !== item.id) return i
                if (
                  i.retryAttempt === nextAttempt &&
                  i.maxAttempts === nextMax &&
                  i.retryDelay === data.retryDelay
                ) {
                  return i
                }
                return {
                  ...i,
                  retryAttempt: nextAttempt,
                  maxAttempts: nextMax,
                  retryDelay: data.retryDelay,
                }
              }),
            }))
            if (Date.now() - startedAt > POLL_CEILING_MS) {
              failJob('Timed out waiting for the server to finish processing', 'Try again in a moment.')
              stop()
            }
            return
          }

          if (data.status === 'completed' && data.downloadUrl) {
            finalize({
              status: 'completed',
              result: {
                success: true,
                downloadUrl: data.downloadUrl,
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

            const filename = data.filename || 'tiktok-video.mp4'
            const proxyUrl = `/api/proxy-download?jobId=${encodeURIComponent(jobId)}&filename=${encodeURIComponent(filename)}`
            const a = document.createElement('a')
            a.href = proxyUrl
            a.download = filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            stop()
            return
          }

          if (data.status === 'failed') {
            finalize({
              status: 'failed',
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

      pollControlsRef.current.set(item.id, {
        pollNow: () => void poll(),
        stop,
      })
      interval = setInterval(poll, POLL_INTERVAL_MS)
      void poll()
    })
  }, [setQueue])

  const stopJob = useCallback((itemId: string) => {
    pollControlsRef.current.get(itemId)?.stop()
  }, [])

  return { processQueueItem, stopJob }
}
