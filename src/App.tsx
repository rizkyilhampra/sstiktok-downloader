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
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-2xl">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl">
              <Download className="w-8 h-8 text-white" />
            </div>
            <div>
              <CardTitle className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                TikTok Downloader
              </CardTitle>
              <CardDescription className="text-base mt-1">
                Download TikTok videos without watermark - Fast & Free
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url" className="text-base font-medium">
                TikTok Video URL
              </Label>
              <Input
                id="url"
                type="text"
                placeholder="https://www.tiktok.com/@username/video/1234567890"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                className="h-12 text-base"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-5 w-5" />
                  Get Download Link
                </>
              )}
            </Button>
          </form>

          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-red-900">Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {result?.success && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-green-900">Video Ready!</p>
                  <p className="text-sm text-green-700 mt-1">
                    Your video is ready to download without watermark.
                  </p>
                </div>
              </div>

              <Button
                onClick={handleDownload}
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              >
                <Download className="mr-2 h-5 w-5" />
                Download Video
              </Button>
            </div>
          )}

          <div className="pt-4 border-t">
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-sm font-medium text-slate-700 mb-2">Example URL:</p>
              <code className="text-xs text-slate-600 break-all">
                https://www.tiktok.com/@username/video/1234567890123456789
              </code>
            </div>
          </div>

          <div className="text-center pt-2">
            <p className="text-sm text-slate-500">
              Built with React 19, TypeScript, Vite, Tailwind CSS 4 & shadcn/ui
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Powered by ssstik.io
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default App
