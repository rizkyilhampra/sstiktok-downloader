import { useState } from 'react'
import { Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import type { DownloadResponse } from '@/types/api'

function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DownloadResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!url.trim()) {
      setError('Please enter a TikTok URL')
      return
    }

    if (!url.includes('tiktok.com')) {
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
        body: JSON.stringify({ url }),
      })

      const data: DownloadResponse = await response.json()

      if (data.success) {
        setResult(data)
      } else {
        setError(data.message || data.error || 'Failed to process video')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (result?.downloadUrl) {
      const a = document.createElement('a')
      a.href = result.downloadUrl
      a.download = 'tiktok-video.mp4'
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">Video URL</Label>
              <Input
                id="url"
                type="text"
                placeholder="https://www.tiktok.com/@username/video/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Get Download Link
                </>
              )}
            </Button>
          </form>

          {error && (
            <div className="flex items-start gap-2 p-3 border rounded-lg border-destructive bg-destructive/10">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <div className="text-sm text-destructive">{error}</div>
            </div>
          )}

          {result?.success && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 border rounded-lg">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                <div className="text-sm">Video ready to download</div>
              </div>

              <Button
                onClick={handleDownload}
                className="w-full"
              >
                <Download className="mr-2 h-4 w-4" />
                Download Video
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default App
