import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'
import './index.css'
import App from './App.tsx'
import { Toaster } from '@/components/ui/sonner'

function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.warn('SW registration error:', error)
    },
  })

  useEffect(() => {
    if (!needRefresh) return
    toast('New version available', {
      id: 'pwa-update',
      description: 'Reload to get the latest update.',
      action: {
        label: 'Update',
        onClick: () => void updateServiceWorker(true),
      },
      duration: Infinity,
    })
  }, [needRefresh, updateServiceWorker])

  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster />
    <PWAUpdatePrompt />
  </StrictMode>,
)
