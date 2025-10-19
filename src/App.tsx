import { useState, useEffect, useRef } from 'react'
import { Loader2, CheckCircle2, AlertCircle, Clipboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import type { DownloadResponse } from '@/types/api'

function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [isPasting, setIsPasting] = useState(false)
  const [result, setResult] = useState<DownloadResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryAttempt, setRetryAttempt] = useState<number | null>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  //auto hide error message after 30 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null)
      }, 30_000)

      return () => clearTimeout(timer)
    }
  }, [error])

  // Auto-hide success message and clear input after 10 seconds
  useEffect(() => {
    if (result?.success) {
      const timer = setTimeout(() => {
        setResult(null)
        setUrl('')
      }, 10_000)

      return () => clearTimeout(timer)
    }
  }, [result])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const processDownload = async (videoUrl: string) => {
    if (!videoUrl.trim()) {
      setError('Please enter a TikTok URL')
      return
    }

    if (!videoUrl.includes('tiktok.com')) {
      setError('Please enter a valid TikTok URL')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    setRetryAttempt(null)

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: videoUrl }),
      })

      const data: DownloadResponse = await response.json()

      // Track retry attempt if present
      if (data.retryAttempt) {
        setRetryAttempt(data.retryAttempt)
      }

      if (data.success && data.downloadUrl) {
        setResult(data)

        // Automatically trigger download through proxy with dynamic filename
        const filename = data.filename || 'tiktok-video.mp4'
        const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(data.downloadUrl)}&filename=${encodeURIComponent(filename)}`
        const a = document.createElement('a')
        a.href = proxyUrl
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else {
        const errorMsg = data.message || data.error || 'Failed to process video'
        const details = data.details ? ` ${data.details}` : ''
        setError(`${errorMsg}${details}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error occurred')
    } finally {
      setLoading(false)
      setRetryAttempt(null)
    }
  }

  const handleInputChange = (value: string) => {
    setUrl(value)

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Set new debounce timer (1.5 seconds delay)
    debounceTimerRef.current = setTimeout(() => {
      if (value.trim()) {
        processDownload(value)
      }
    }, 1500)
  }

  const handlePasteAndDownload = async () => {
    setIsPasting(true)
    setError(null)
    setResult(null)

    try {
      // Check if Clipboard API is available
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setError('Clipboard access not supported on this device. Please paste manually.')
        setIsPasting(false)
        return
      }

      // Read from clipboard
      const text = await navigator.clipboard.readText()

      if (!text.trim()) {
        setError('Clipboard is empty')
        setIsPasting(false)
        return
      }

      // Validate URL
      if (!text.includes('tiktok.com')) {
        setError('Please copy a valid TikTok URL to clipboard')
        setIsPasting(false)
        return
      }

      // Trigger input change which will handle the download with debounce
      handleInputChange(text.trim())
      setIsPasting(false)
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Clipboard access denied. Please grant permission or paste manually.')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to paste from clipboard')
      }
      setIsPasting(false)
    }
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
          <div className="space-y-3">
            <Label htmlFor="url" className="sr-only">
              Video URL
            </Label>
            <div className="flex gap-2">
              <Input
                id="url"
                type="text"
                placeholder="https://www.tiktok.com/@username/video/..."
                value={url}
                onChange={(e) => handleInputChange(e.target.value)}
                disabled={loading || isPasting}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={handlePasteAndDownload}
                disabled={loading || isPasting}
                variant="outline"
                size="icon"
                title="Paste from clipboard and auto-download"
              >
                {isPasting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Clipboard className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-lg">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {retryAttempt ? `Retrying... (attempt ${retryAttempt}/3)` : 'Processing video...'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {retryAttempt ? 'Retrying the download after a brief delay' : 'This may take a few seconds'}
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="flex items-start gap-3 p-4 border rounded-lg border-destructive bg-destructive/10">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-destructive">Error</p>
                <p className="text-sm text-destructive/90">{error}</p>
              </div>
            </div>
          )}

          {/* Success State */}
          {result?.success && (
            <div className="flex items-start gap-3 p-4 border rounded-lg border-primary/50 bg-primary/10">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">Download Started!</p>
                <p className="text-sm text-muted-foreground">Check your downloads folder</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default App
