import { app } from 'electron'
import { autoUpdater, type ProgressInfo, type UpdateCheckResult } from 'electron-updater'

export type UpdaterLifecycleStatus =
  | 'disabled-dev'
  | 'checking-for-update'
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error'

function formatBytesPerSecond(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0 B/s'
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let value = bytesPerSecond
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function logUpdater(status: UpdaterLifecycleStatus, message: string): void {
  const now = new Date().toISOString()
  console.info(`[Updater][${now}][${status}] ${message}`)
}

function logUpdaterError(error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  logUpdater('error', message)
}

function registerUpdaterEvents(): void {
  autoUpdater.on('checking-for-update', () => {
    logUpdater('checking-for-update', 'Sprawdzam dostępność nowej wersji.')
  })

  autoUpdater.on('update-available', info => {
    logUpdater('update-available', `Dostępna nowa wersja: ${info.version}. Rozpoczynam pobieranie.`)
  })

  autoUpdater.on('update-not-available', info => {
    logUpdater('update-not-available', `Brak nowszej wersji. Aktualna: ${info.version}.`)
  })

  autoUpdater.on('error', error => {
    logUpdaterError(error)
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    logUpdater(
      'download-progress',
      `Pobieranie aktualizacji: ${progress.percent.toFixed(1)}% (${formatBytesPerSecond(progress.bytesPerSecond)}).`,
    )
  })

  autoUpdater.on('update-downloaded', info => {
    logUpdater('update-downloaded', `Aktualizacja ${info.version} została pobrana i czeka na instalację.`)
  })
}

export async function initializeAutoUpdate(): Promise<void> {
  if (!app.isPackaged) {
    logUpdater('disabled-dev', 'Auto-update wyłączony w trybie deweloperskim (app.isPackaged=false).')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  registerUpdaterEvents()

  try {
    const result: UpdateCheckResult | null = await autoUpdater.checkForUpdates()
    if (!result) {
      logUpdater('update-not-available', 'Brak informacji o nowej wersji (provider zwrócił pusty wynik).')
    }
  } catch (error) {
    logUpdaterError(error)
  }
}
