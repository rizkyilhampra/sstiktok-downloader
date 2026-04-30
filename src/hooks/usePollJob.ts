import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { JobStartResponse, JobStatusResponse } from '@/types/api'
import type { QueueItem, QueueState } from '@/types/queue'

const POLL_INTERVAL_MS = 1500
const POLL_CEILING_MS = 2 * 60 * 1000

export function usePollJob(setQueue: Dispatch<SetStateAction<QueueState>>) {
  const pollControlsRef = useRef<Map<string, { pollNow: () => void; stop: () => void }>>(new Map())
  const retryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

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

    const eventSource = new EventSource(`/api/progress/${requestId}`)
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'retry' || data.type === 'status') {
          setQueue(prev => ({
            ...prev,
            items: prev.items.map(i =>
              i.id === item.id
                ? {
                    ...i,
                    retryAttempt: data.attempt || null,
                    maxAttempts: data.maxAttempts || i.maxAttempts,
                    retryDelay: data.delay ?? i.retryDelay,
                  }
                : i
            ),
          }))
          // Clear retryDelay once the backoff wait period ends so the UI stops
          // showing "waiting Xs" while the attempt is actively running.
          if (data.type === 'retry' && typeof data.delay === 'number' && data.delay > 0) {
            const timerId = setTimeout(() => {
              retryTimersRef.current.delete(item.id)
              setQueue(prev => ({
                ...prev,
                items: prev.items.map(i =>
                  i.id === item.id && i.retryDelay === data.delay ? { ...i, retryDelay: undefined } : i
                ),
              }))
            }, data.delay)
            retryTimersRef.current.set(item.id, timerId)
          }
        }
      } catch (e) {
        console.error('Failed to parse SSE message:', e)
      }
    }
    eventSource.onerror = () => eventSource.close()

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
        eventSource.close()
        failJob(startData.error || 'Failed to start job', startData.suggestion)
        return
      }
    } catch (err) {
      eventSource.close()
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
        const pending = retryTimersRef.current.get(item.id)
        if (pending !== undefined) {
          clearTimeout(pending)
          retryTimersRef.current.delete(item.id)
        }
        if (interval !== null) {
          clearInterval(interval)
          interval = null
        }
        pollControlsRef.current.delete(item.id)
        eventSource.close()
        resolve()
      }

      const poll = async () => {
        if (inFlight) return
        inFlight = true
        try {
          const res = await fetch(`/api/jobs/${jobId}`)
          if (!res.ok) {
            if (res.status === 404) {
              failJob('Job no longer exists on the server', 'Try again — the server may have restarted.')
              stop()
            } else {
              console.warn(`Poll returned unexpected ${res.status}`)
            }
            return
          }
          const data: JobStatusResponse = await res.json()

          if (data.status === 'processing') {
            const nextAttempt = data.attempt ?? null
            const nextMax = data.maxAttempts
            setQueue(prev => ({
              ...prev,
              items: prev.items.map(i =>
                i.id === item.id ? { ...i, retryAttempt: nextAttempt, maxAttempts: nextMax } : i
              ),
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
