import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { StartupErrorBoundary } from './StartupErrorBoundary'
import { DetachedVideoPreviewWindow } from './components/DetachedVideoPreviewWindow'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderFatalStartupError(source: string, message: string): void {
  const safeSource = escapeHtml(source)
  const safeMessage = escapeHtml(message)
  document.body.innerHTML = `
    <div style="min-height:100vh;background:#181825;color:#cdd6f4;padding:36px 24px;font-family:Segoe UI,Arial,sans-serif;box-sizing:border-box;">
      <div style="max-width:860px;margin:0 auto;border:1px solid #3d3f53;border-radius:10px;background:#1e1e2e;padding:20px 24px;">
        <h1 style="margin:0 0 10px;color:#f38ba8;font-size:20px;">Krytyczny błąd startu renderera</h1>
        <p style="margin:0 0 8px;">Źródło: <code>${safeSource}</code></p>
        <p style="margin:0;">Szczegóły: <code>${safeMessage}</code></p>
      </div>
    </div>
  `
}

window.addEventListener('error', event => {
  const message = event.error instanceof Error
    ? `${event.error.name}: ${event.error.message}`
    : event.message || 'Nieznany błąd renderera.'
  console.error('[renderer-window-error]', event.error ?? event.message)
  renderFatalStartupError('window.error', message)
})

window.addEventListener('unhandledrejection', event => {
  const reason = event.reason instanceof Error
    ? `${event.reason.name}: ${event.reason.message}`
    : String(event.reason)
  console.error('[renderer-unhandled-rejection]', event.reason)
  renderFatalStartupError('window.unhandledrejection', reason)
})

const isDetachedPreviewRoute = window.location.hash === '#video-preview'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StartupErrorBoundary>
      {isDetachedPreviewRoute ? <DetachedVideoPreviewWindow /> : <App />}
    </StartupErrorBoundary>
  </React.StrictMode>
)
