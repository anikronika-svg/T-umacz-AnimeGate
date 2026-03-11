import { useEffect, useState } from 'react'

export type UpdaterPhase =
  | 'idle'
  | 'checking-for-update'
  | 'update-available'
  | 'update-not-available'
  | 'download-started'
  | 'download-progress'
  | 'update-downloaded'
  | 'installing'
  | 'error'

export interface UpdaterStatus {
  phase: UpdaterPhase
  message: string
  timestamp: string
  version?: string
  percent?: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
  error?: string
}

const DEFAULT_STATUS: UpdaterStatus = {
  phase: 'idle',
  message: 'Aktualizacje: inicjalizacja...',
  timestamp: new Date().toISOString(),
}

export function useUpdaterStatus(): {
  status: UpdaterStatus
  isSupported: boolean
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
} {
  const [status, setStatus] = useState<UpdaterStatus>(DEFAULT_STATUS)
  const isSupported = Boolean(window.electronAPI?.getUpdaterStatus)

  useEffect(() => {
    if (!window.electronAPI?.getUpdaterStatus) {
      setStatus({
        phase: 'idle',
        message: 'Aktualizacje niedostępne w tym środowisku.',
        timestamp: new Date().toISOString(),
      })
      return
    }

    let disposed = false
    const pullInitial = async (): Promise<void> => {
      try {
        const initial = await window.electronAPI!.getUpdaterStatus()
        if (!disposed) setStatus(initial)
      } catch (error) {
        if (!disposed) {
          setStatus({
            phase: 'error',
            message: error instanceof Error ? error.message : 'Nie można odczytać statusu updatera.',
            timestamp: new Date().toISOString(),
          })
        }
      }
    }

    void pullInitial()
    const off = window.electronAPI.onUpdaterStatus(next => {
      if (!disposed) setStatus(next)
    })

    return () => {
      disposed = true
      off()
    }
  }, [])

  const checkForUpdates = async (): Promise<void> => {
    if (!window.electronAPI?.checkForUpdates) return
    const next = await window.electronAPI.checkForUpdates()
    setStatus(next)
  }

  const downloadUpdate = async (): Promise<void> => {
    if (!window.electronAPI?.downloadUpdate) return
    const next = await window.electronAPI.downloadUpdate()
    setStatus(next)
  }

  const installUpdate = async (): Promise<void> => {
    if (!window.electronAPI?.installUpdate) return
    const next = await window.electronAPI.installUpdate()
    setStatus(next)
  }

  return {
    status,
    isSupported,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  }
}
