import { app } from 'electron'
import { autoUpdater, type ProgressInfo, type UpdateCheckResult } from 'electron-updater'

export type UpdaterStatusPhase =
  | 'idle'
  | 'checking-for-update'
  | 'update-available'
  | 'update-not-available'
  | 'download-started'
  | 'download-progress'
  | 'update-downloaded'
  | 'installing'
  | 'error'

export interface UpdaterStatusPayload {
  phase: UpdaterStatusPhase
  message: string
  timestamp: string
  version?: string
  percent?: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
  error?: string
}

type UpdaterStatusListener = (status: UpdaterStatusPayload) => void

let listeners = new Set<UpdaterStatusListener>()
let eventsRegistered = false
let initialized = false
let lastStatus: UpdaterStatusPayload = {
  phase: 'idle',
  message: 'Updater nie został jeszcze zainicjalizowany.',
  timestamp: new Date().toISOString(),
}

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

function logUpdater(status: UpdaterStatusPayload): void {
  console.info(`[Updater][${status.timestamp}][${status.phase}] ${status.message}`)
}

function logUpdaterError(error: unknown): UpdaterStatusPayload {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return pushStatus({
    phase: 'error',
    message: `Błąd updatera: ${message}`,
    error: message,
  })
}

function pushStatus(partial: Omit<UpdaterStatusPayload, 'timestamp'>): UpdaterStatusPayload {
  const status: UpdaterStatusPayload = {
    ...partial,
    timestamp: new Date().toISOString(),
  }
  lastStatus = status
  logUpdater(status)
  listeners.forEach(listener => {
    try {
      listener(status)
    } catch (error) {
      console.error('[Updater] Listener failure:', error)
    }
  })
  return status
}

export function subscribeUpdaterStatus(listener: UpdaterStatusListener): () => void {
  listeners.add(listener)
  listener(lastStatus)
  return () => {
    listeners.delete(listener)
  }
}

export function getUpdaterStatus(): UpdaterStatusPayload {
  return lastStatus
}

function registerUpdaterEvents(): void {
  if (eventsRegistered) return
  eventsRegistered = true

  autoUpdater.on('checking-for-update', () => {
    pushStatus({
      phase: 'checking-for-update',
      message: 'Sprawdzam dostępność nowej wersji.',
    })
  })

  autoUpdater.on('update-available', info => {
    pushStatus({
      phase: 'update-available',
      message: `Dostępna nowa wersja: ${info.version}.`,
      version: info.version,
    })
  })

  autoUpdater.on('update-not-available', info => {
    pushStatus({
      phase: 'update-not-available',
      message: `Brak nowszej wersji. Aktualna: ${info.version}.`,
      version: info.version,
    })
  })

  autoUpdater.on('error', error => {
    logUpdaterError(error)
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    pushStatus({
      phase: 'download-progress',
      message: `Pobieranie aktualizacji: ${progress.percent.toFixed(1)}% (${formatBytesPerSecond(progress.bytesPerSecond)}).`,
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', info => {
    pushStatus({
      phase: 'update-downloaded',
      message: `Aktualizacja ${info.version} została pobrana i czeka na instalację.`,
      version: info.version,
    })
  })
}

export async function initializeAutoUpdate(): Promise<void> {
  if (initialized) return
  initialized = true

  registerUpdaterEvents()

  if (!app.isPackaged) {
    pushStatus({
      phase: 'idle',
      message: 'Auto-update wyłączony w trybie deweloperskim (app.isPackaged=false).',
    })
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  await checkForUpdates()
}

export async function checkForUpdates(): Promise<UpdaterStatusPayload> {
  if (!app.isPackaged) {
    return pushStatus({
      phase: 'idle',
      message: 'Sprawdzanie aktualizacji jest dostępne tylko w aplikacji spakowanej.',
    })
  }

  try {
    const result: UpdateCheckResult | null = await autoUpdater.checkForUpdates()
    if (!result) {
      return pushStatus({
        phase: 'update-not-available',
        message: 'Brak informacji o nowej wersji (provider zwrócił pusty wynik).',
      })
    }
    return lastStatus
  } catch (error) {
    return logUpdaterError(error)
  }
}

export async function downloadUpdate(): Promise<UpdaterStatusPayload> {
  if (!app.isPackaged) {
    return pushStatus({
      phase: 'idle',
      message: 'Pobieranie aktualizacji jest dostępne tylko w aplikacji spakowanej.',
    })
  }

  try {
    pushStatus({
      phase: 'download-started',
      message: 'Rozpoczynam pobieranie aktualizacji.',
    })
    await autoUpdater.downloadUpdate()
    return lastStatus
  } catch (error) {
    return logUpdaterError(error)
  }
}

export function installUpdate(): UpdaterStatusPayload {
  if (!app.isPackaged) {
    return pushStatus({
      phase: 'idle',
      message: 'Instalacja aktualizacji jest dostępna tylko w aplikacji spakowanej.',
    })
  }
  if (lastStatus.phase !== 'update-downloaded') {
    return pushStatus({
      phase: 'error',
      message: 'Brak pobranej aktualizacji do instalacji.',
      error: 'update-not-downloaded',
    })
  }
  pushStatus({
    phase: 'installing',
    message: 'Zamykam aplikację i uruchamiam instalację aktualizacji.',
    version: lastStatus.version,
  })
  autoUpdater.quitAndInstall()
  return lastStatus
}
