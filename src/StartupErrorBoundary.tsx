import React from 'react'

interface StartupErrorBoundaryState {
  errorMessage: string | null
}

export class StartupErrorBoundary extends React.Component<React.PropsWithChildren, StartupErrorBoundaryState> {
  state: StartupErrorBoundaryState = {
    errorMessage: null,
  }

  static getDerivedStateFromError(error: unknown): StartupErrorBoundaryState {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    return { errorMessage: message }
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    console.error('[renderer-error-boundary]', error, errorInfo.componentStack)
  }

  render(): React.ReactNode {
    if (!this.state.errorMessage) return this.props.children
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#181825',
          color: '#cdd6f4',
          padding: '36px 24px',
          fontFamily: 'Segoe UI, Arial, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            maxWidth: 860,
            margin: '0 auto',
            border: '1px solid #3d3f53',
            borderRadius: 10,
            background: '#1e1e2e',
            padding: '20px 24px',
          }}
        >
          <h1 style={{ margin: '0 0 10px', color: '#f38ba8', fontSize: 20 }}>Krytyczny błąd UI</h1>
          <p style={{ margin: '0 0 8px' }}>Renderer nie uruchomił się poprawnie.</p>
          <p style={{ margin: 0 }}>
            Szczegóły: <code>{this.state.errorMessage}</code>
          </p>
        </div>
      </div>
    )
  }
}
