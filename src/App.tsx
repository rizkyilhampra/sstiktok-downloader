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
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-hide success message and clear input after 5 seconds
  useEffect(() => {
    if (result?.success) {
      const timer = setTimeout(() => {
        setResult(null)
        setUrl('')
      }, 5000)

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

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: videoUrl }),
      })

      const data: DownloadResponse = await response.json()

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
        setError(data.message || data.error || 'Failed to process video')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error occurred')
    } finally {
      setLoading(false)
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
        <CardHeader>
          <CardTitle>TikTok Downloader</CardTitle>
          <CardDescription>
            Download TikTok videos without watermark
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="p-3 bg-muted/50 border border-border rounded-lg">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Auto-Download:</span> Paste or type a TikTok URL below. It will automatically process and download after 1-2 seconds.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">Video URL</Label>
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
              {loading && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 border rounded-lg border-destructive bg-destructive/10">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <div className="text-sm text-destructive">{error}</div>
            </div>
          )}

          {result?.success && (
            <div className="flex items-start gap-2 p-3 border rounded-lg border-green-600 bg-green-600/10">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
              <div className="text-sm text-green-600">Download started! Check your downloads folder.</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default App
