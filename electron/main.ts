import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { spawn } from 'child_process'
import {
  checkForUpdates,
  downloadUpdate,
  getUpdaterStatus,
  initializeAutoUpdate,
  installUpdate,
  subscribeUpdaterStatus,
  type UpdaterStatusPayload,
} from './updater'
import {
  createProjectOnDisk,
  openProjectFromDisk,
  saveProjectConfigOnDisk,
  type DiskProjectConfigV1,
} from './projectStorage'

const OPEN_STATE_FILE = 'open-state.json'

interface OpenSubtitleArgs {
  projectDir?: string
}

interface SaveSubtitleArgs {
  sourcePath: string
  content: string
}

interface OpenVideoArgs {
  projectDir?: string
}

interface OpenState {
  lastDir?: string
}

interface VideoWaveformArgs {
  filePath: string
  forceRefresh?: boolean
}

interface VideoWaveformResult {
  ok: boolean
  filePath: string
  sampleRate: number
  peaks: number[]
  duration: number
  fromCache: boolean
  ffmpegSource?: 'bundled' | 'system'
  ffmpegPath?: string
  error?: string
}

interface HttpRequestArgs {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

interface ApiRequestErrorPayload {
  code: string
  message: string
  details?: string
}

interface ApiRequestResult {
  ok: boolean
  status: number
  statusText: string
  body: string
  headers?: Record<string, string>
  error?: ApiRequestErrorPayload
}

interface CreateProjectArgs {
  title: string
  projectId: string
  parentDir: string
  initialConfig: Omit<DiskProjectConfigV1, 'projectDir' | 'configPath' | 'createdAt' | 'updatedAt'>
}

const STARTUP_LOG_FILE = 'startup.log'

type StartupLogLevel = 'INFO' | 'WARN' | 'ERROR'

function getOpenStatePath(): string {
  return path.join(app.getPath('userData'), OPEN_STATE_FILE)
}

function getApiConfigPath(): string {
  return path.join(app.getPath('userData'), 'api-config.json')
}

function getWaveformCacheDir(): string {
  return path.join(app.getPath('userData'), 'waveform-cache')
}

function getStartupLogPath(): string {
  try {
    return path.join(app.getPath('userData'), 'logs', STARTUP_LOG_FILE)
  } catch {
    return path.join(process.cwd(), STARTUP_LOG_FILE)
  }
}

function toLogString(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}\n${value.stack ?? ''}`.trim()
  }
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function startupLog(level: StartupLogLevel, message: string, details?: unknown): void {
  const stamp = new Date().toISOString()
  const detailsText = details === undefined ? '' : ` | ${toLogString(details)}`
  const line = `[${stamp}] [${level}] ${message}${detailsText}\n`

  if (level === 'ERROR') {
    console.error(line.trimEnd())
  } else if (level === 'WARN') {
    console.warn(line.trimEnd())
  } else {
    console.log(line.trimEnd())
  }

  const logPath = getStartupLogPath()
  const logDir = path.dirname(logPath)
  void fs.mkdir(logDir, { recursive: true })
    .then(() => fs.appendFile(logPath, line, 'utf-8'))
    .catch(error => {
      console.error('[startup-log-write-failed]', error)
    })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderStartupErrorPage(win: BrowserWindow, title: string, details: string): void {
  const safeTitle = escapeHtml(title)
  const safeDetails = escapeHtml(details)
  const safeLogPath = escapeHtml(getStartupLogPath())
  const html = `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <title>AnimeGate - blad startu</title>
    <style>
      body { margin: 0; font-family: Segoe UI, Arial, sans-serif; background: #181825; color: #cdd6f4; }
      .wrap { max-width: 840px; margin: 40px auto; padding: 20px 24px; border: 1px solid #3d3f53; border-radius: 10px; background: #1e1e2e; }
      h1 { margin: 0 0 12px; font-size: 20px; color: #f38ba8; }
      p { margin: 0 0 10px; line-height: 1.5; }
      code, pre { font-family: Consolas, monospace; }
      pre { white-space: pre-wrap; word-break: break-word; background: #11111b; border: 1px solid #2e2f42; padding: 12px; border-radius: 8px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>${safeTitle}</h1>
      <p>Aplikacja wykryla krytyczny blad startu i uruchomila tryb diagnostyczny.</p>
      <p>Log diagnostyczny: <code>${safeLogPath}</code></p>
      <pre>${safeDetails}</pre>
    </div>
  </body>
</html>`
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
}

function buildWaveformCacheKey(filePath: string, size: number, mtimeMs: number): string {
  return createHash('sha1').update(`${filePath}|${size}|${mtimeMs}`).digest('hex')
}

async function ensureWaveformCacheDir(): Promise<void> {
  await fs.mkdir(getWaveformCacheDir(), { recursive: true })
}

type FfmpegLocation = {
  command: string
  source: 'bundled' | 'system'
  pathHint: string
}

function ffmpegBinName(): string {
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

function getBundledFfmpegCandidates(): string[] {
  const bin = ffmpegBinName()
  const appPath = app.getAppPath()
  const appDir = path.dirname(appPath)
  const resourcesPath = process.resourcesPath
  const execDir = path.dirname(process.execPath)

  // Priority: local bundled binaries in app resources first.
  return [
    path.join(resourcesPath, 'ffmpeg', bin),
    path.join(resourcesPath, 'bin', bin),
    path.join(appDir, 'ffmpeg', bin),
    path.join(appDir, 'bin', bin),
    path.join(appPath, 'ffmpeg', bin),
    path.join(process.cwd(), 'ffmpeg', bin),
    path.join(execDir, 'ffmpeg', bin),
  ]
}

async function probeExecutable(command: string): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const child = spawn(command, ['-version'], { windowsHide: true })
    child.once('error', () => resolve(false))
    child.once('exit', code => resolve(code === 0))
  })
}

async function findFfmpegCommand(): Promise<FfmpegLocation> {
  const bundledCandidates = getBundledFfmpegCandidates()
  for (const candidatePath of bundledCandidates) {
    try {
      await fs.access(candidatePath)
      const ok = await probeExecutable(candidatePath)
      if (ok) {
        return {
          command: candidatePath,
          source: 'bundled',
          pathHint: candidatePath,
        }
      }
    } catch {
      // candidate missing or not executable
    }
  }

  const systemCandidates = process.platform === 'win32'
    ? ['ffmpeg.exe', 'ffmpeg']
    : ['ffmpeg']

  for (const candidate of systemCandidates) {
    const ok = await probeExecutable(candidate)
    if (ok) {
      return {
        command: candidate,
        source: 'system',
        pathHint: candidate,
      }
    }
  }

  throw new Error(
    'Nie znaleziono ffmpeg. Waveform i auto-timing wymagaja ffmpeg (najpierw szukam lokalnego bundled ffmpeg, potem PATH).',
  )
}

async function generateWaveformData(
  filePath: string,
  sampleRate = 200,
): Promise<{ sampleRate: number; peaks: number[]; duration: number; ffmpegSource: 'bundled' | 'system'; ffmpegPath: string }> {
  const ffmpeg = await findFfmpegCommand()

  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-i', filePath,
      '-vn',
      '-ac', '1',
      '-ar', String(sampleRate),
      '-f', 's16le',
      '-',
    ]

    const child = spawn(ffmpeg.command, args, { windowsHide: true })
    const chunks: Buffer[] = []
    let stderr = ''

    child.stdout.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })
    child.once('error', error => {
      reject(new Error(`Nie mozna uruchomic ffmpeg: ${error.message}`))
    })
    child.once('close', code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffmpeg zakonczyl sie kodem ${code}`))
        return
      }
      const pcm = Buffer.concat(chunks)
      if (pcm.length < 2) {
        reject(new Error('Brak danych audio do wygenerowania waveformu.'))
        return
      }
      const samplesCount = Math.floor(pcm.length / 2)
      const peaks = new Array<number>(samplesCount)
      for (let i = 0; i < samplesCount; i += 1) {
        const sample = pcm.readInt16LE(i * 2)
        peaks[i] = Math.min(1, Math.abs(sample) / 32768)
      }
      const duration = samplesCount / sampleRate
      resolve({ sampleRate, peaks, duration, ffmpegSource: ffmpeg.source, ffmpegPath: ffmpeg.pathHint })
    })
  })
}

async function getWaveformForVideo(args: VideoWaveformArgs): Promise<VideoWaveformResult> {
  const filePath = args?.filePath?.trim()
  if (!filePath) {
    return {
      ok: false,
      filePath: '',
      sampleRate: 0,
      peaks: [],
      duration: 0,
      fromCache: false,
      error: 'Brak sciezki pliku wideo.',
    }
  }

  try {
    const stat = await fs.stat(filePath)
    const cacheKey = buildWaveformCacheKey(filePath, stat.size, stat.mtimeMs)
    const cacheFile = path.join(getWaveformCacheDir(), `${cacheKey}.json`)
    await ensureWaveformCacheDir()

    if (!args.forceRefresh) {
      try {
        const raw = await fs.readFile(cacheFile, 'utf-8')
        const parsed = JSON.parse(raw) as {
          sampleRate: number
          peaks: number[]
          duration: number
          ffmpegSource?: 'bundled' | 'system'
          ffmpegPath?: string
        }
        if (Array.isArray(parsed.peaks) && parsed.peaks.length > 0) {
          return {
            ok: true,
            filePath,
            sampleRate: parsed.sampleRate,
            peaks: parsed.peaks,
            duration: parsed.duration,
            fromCache: true,
            ffmpegSource: parsed.ffmpegSource,
            ffmpegPath: parsed.ffmpegPath,
          }
        }
      } catch {
        // Cache miss - continue to generate.
      }
    }

    const generated = await generateWaveformData(filePath, 200)
    await fs.writeFile(cacheFile, JSON.stringify(generated), 'utf-8')
    return {
      ok: true,
      filePath,
      sampleRate: generated.sampleRate,
      peaks: generated.peaks,
      duration: generated.duration,
      fromCache: false,
      ffmpegSource: generated.ffmpegSource,
      ffmpegPath: generated.ffmpegPath,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nie udalo sie wygenerowac waveformu.'
    return {
      ok: false,
      filePath,
      sampleRate: 0,
      peaks: [],
      duration: 0,
      fromCache: false,
      error: message,
    }
  }
}

async function readOpenState(): Promise<OpenState> {
  try {
    const raw = await fs.readFile(getOpenStatePath(), 'utf-8')
    const parsed = JSON.parse(raw) as OpenState
    return parsed ?? {}
  } catch {
    return {}
  }
}

async function writeOpenState(state: OpenState): Promise<void> {
  await fs.writeFile(getOpenStatePath(), JSON.stringify(state, null, 2), 'utf-8')
}

async function readApiConfig(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(getApiConfigPath(), 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next: Record<string, string> = {}
    Object.entries(parsed ?? {}).forEach(([key, value]) => {
      next[key] = typeof value === 'string' ? value.trim() : ''
    })
    return next
  } catch {
    return {}
  }
}

async function writeApiConfig(config: Record<string, string>): Promise<void> {
  const sanitized: Record<string, string> = {}
  Object.entries(config ?? {}).forEach(([key, value]) => {
    sanitized[key] = typeof value === 'string' ? value.trim() : ''
  })
  await fs.writeFile(getApiConfigPath(), JSON.stringify(sanitized, null, 2), 'utf-8')
}

function createWindow(): void {
  const preloadPath = path.join(__dirname, 'preload.js')
  const rendererIndexPath = path.join(__dirname, '../dist/index.html')
  startupLog('INFO', 'createWindow:start', {
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    execPath: process.execPath,
    resourcesPath: process.resourcesPath,
    dirname: __dirname,
    preloadPath,
    rendererIndexPath,
    hasDevServerUrl: Boolean(process.env.VITE_DEV_SERVER_URL),
  })

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
    title: 'AnimeGate Translator',
  })

  win.webContents.on('did-finish-load', () => {
    startupLog('INFO', 'webContents:did-finish-load', {
      url: win.webContents.getURL(),
    })
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    startupLog('ERROR', 'webContents:did-fail-load', {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
    })
    if (isMainFrame) {
      renderStartupErrorPage(
        win,
        'Nie mozna zaladowac UI aplikacji',
        `Code: ${errorCode}\nDescription: ${errorDescription}\nURL: ${validatedURL}`,
      )
    }
  })

  win.webContents.on('preload-error', (_event, preloadFile, error) => {
    startupLog('ERROR', 'webContents:preload-error', {
      preloadFile,
      error: toLogString(error),
    })
    renderStartupErrorPage(
      win,
      'Blad preload',
      `Preload file: ${preloadFile}\nError: ${toLogString(error)}`,
    )
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    startupLog('ERROR', 'webContents:render-process-gone', details)
    renderStartupErrorPage(
      win,
      'Proces renderera zostal zakonczony',
      toLogString(details),
    )
  })

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      startupLog('WARN', 'renderer:console-message', { level, message, line, sourceId })
    }
  })

  const loadPromise = process.env.VITE_DEV_SERVER_URL
    ? win.loadURL(process.env.VITE_DEV_SERVER_URL)
    : win.loadFile(rendererIndexPath)

  void loadPromise.catch(error => {
    startupLog('ERROR', 'window-load-failed', error)
    renderStartupErrorPage(
      win,
      'Nie mozna uruchomic aplikacji',
      toLogString(error),
    )
  })

  Menu.setApplicationMenu(null)
}

function setupFileIpc(): void {
  ipcMain.handle('file:openSubtitle', async (_event, args?: OpenSubtitleArgs) => {
    const state = await readOpenState()
    const preferredDir = args?.projectDir || state.lastDir
    const result = await dialog.showOpenDialog({
      title: 'Otworz plik ASS',
      properties: ['openFile'],
      filters: [
        { name: 'Napisy ASS/SSA (*.ass;*.ssa)', extensions: ['ass', 'ssa'] },
        { name: 'Wszystkie pliki (*.*)', extensions: ['*'] },
      ],
      defaultPath: preferredDir,
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }

    const filePath = result.filePaths[0]
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      await writeOpenState({ lastDir: path.dirname(filePath) })
      return { canceled: false, filePath, content }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie odczytac pliku.'
      return { canceled: false, filePath, error: message }
    }
  })

  ipcMain.handle('file:readSubtitle', async (_event, filePath: string) => {
    const content = await fs.readFile(filePath, 'utf-8')
    await writeOpenState({ lastDir: path.dirname(filePath) })
    return { filePath, content }
  })

  ipcMain.handle('file:saveSubtitle', async (_event, args: SaveSubtitleArgs) => {
    const sourcePath = args?.sourcePath
    const content = args?.content ?? ''
    if (!sourcePath) {
      throw new Error('Brak ścieżki pliku źródłowego.')
    }

    const sourceDir = path.dirname(sourcePath)
    const sourceBaseName = path.basename(sourcePath)
    const savedPath = path.join(sourceDir, `PL ${sourceBaseName}`)

    await fs.writeFile(savedPath, content, 'utf-8')
    await writeOpenState({ lastDir: sourceDir })
    return { savedPath }
  })

  ipcMain.handle('file:openVideo', async (_event, args?: OpenVideoArgs) => {
    const state = await readOpenState()
    const preferredDir = args?.projectDir || state.lastDir
    const result = await dialog.showOpenDialog({
      title: 'Wybierz plik wideo',
      properties: ['openFile'],
      filters: [
        { name: 'Wideo (*.mp4;*.mkv;*.avi;*.mov)', extensions: ['mp4', 'mkv', 'avi', 'mov'] },
        { name: 'Wszystkie pliki (*.*)', extensions: ['*'] },
      ],
      defaultPath: preferredDir,
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }

    const filePath = result.filePaths[0]
    await writeOpenState({ lastDir: path.dirname(filePath) })
    return { canceled: false, filePath }
  })

  ipcMain.handle('video:getWaveform', async (_event, args: VideoWaveformArgs) => getWaveformForVideo(args))

  ipcMain.handle('api:getConfig', async () => readApiConfig())

  ipcMain.handle('api:saveConfig', async (_event, config: Record<string, string>) => {
    await writeApiConfig(config)
    return { ok: true }
  })

  ipcMain.handle('api:request', async (_event, args: HttpRequestArgs): Promise<ApiRequestResult> => {
    const url = args?.url?.trim() ?? ''
    if (!url) {
      return {
        ok: false,
        status: 0,
        statusText: 'INVALID_REQUEST',
        body: '',
        error: { code: 'invalid-request', message: 'Brak URL zapytania.' },
      }
    }

    const timeoutMs = Math.max(1000, Math.min(45000, Number(args.timeoutMs ?? 15000)))
    const timeoutController = new AbortController()
    let timeoutReached = false
    const timer = setTimeout(() => {
      timeoutReached = true
      timeoutController.abort()
    }, timeoutMs)

    try {
      const response = await fetch(url, {
        method: args.method ?? 'GET',
        headers: args.headers ?? {},
        body: args.body,
        signal: timeoutController.signal,
      })

      const body = await response.text()
      const headers = Object.fromEntries(response.headers.entries())
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        body,
        headers,
      }
    } catch (error) {
      if (timeoutReached) {
        return {
          ok: false,
          status: 0,
          statusText: 'TIMEOUT',
          body: '',
          error: {
            code: 'timeout',
            message: `Przekroczono limit czasu zapytania (${timeoutMs} ms).`,
          },
        }
      }

      const fetchErr = error as Error & { cause?: { code?: string; message?: string } }
      const causeCode = fetchErr.cause?.code
      const networkCode = causeCode ?? 'network'
      const details = fetchErr.cause?.message ?? fetchErr.message

      return {
        ok: false,
        status: 0,
        statusText: 'NETWORK_ERROR',
        body: '',
        error: {
          code: networkCode.toLowerCase(),
          message: 'Nie mozna wykonac zapytania sieciowego.',
          details,
        },
      }
    } finally {
      clearTimeout(timer)
    }
  })

  ipcMain.handle('project:pickDirectory', async (_event, args?: { title?: string; defaultPath?: string }) => {
    const result = await dialog.showOpenDialog({
      title: args?.title ?? 'Wybierz folder',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: args?.defaultPath,
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }
    return { canceled: false, directoryPath: result.filePaths[0] }
  })

  ipcMain.handle('project:create', async (_event, args: CreateProjectArgs) => {
    const created = await createProjectOnDisk(args)
    return { ok: true, ...created }
  })

  ipcMain.handle('project:open', async (_event, projectDir: string) => {
    const opened = await openProjectFromDisk(projectDir)
    return { ok: true, ...opened }
  })

  ipcMain.handle('project:saveConfig', async (_event, args: { projectDir: string; config: DiskProjectConfigV1 }) => {
    const saved = await saveProjectConfigOnDisk(args.projectDir, args.config)
    return { ok: true, ...saved }
  })
}

function setupUpdaterIpc(): void {
  const broadcastStatus = (status: UpdaterStatusPayload): void => {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('updater:status', status)
    })
  }

  subscribeUpdaterStatus(status => {
    broadcastStatus(status)
  })

  ipcMain.handle('updater:getStatus', async () => getUpdaterStatus())
  ipcMain.handle('updater:checkForUpdates', async () => checkForUpdates())
  ipcMain.handle('updater:downloadUpdate', async () => downloadUpdate())
  ipcMain.handle('updater:installUpdate', async () => installUpdate())
}

app.whenReady().then(() => {
  startupLog('INFO', 'app:ready', {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    userData: app.getPath('userData'),
  })
  setupFileIpc()
  setupUpdaterIpc()
  createWindow()
  void initializeAutoUpdate()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  startupLog('INFO', 'app:window-all-closed', { platform: process.platform })
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('web-contents-created', (_event, contents) => {
  contents.on('unresponsive', () => {
    startupLog('WARN', 'webContents:unresponsive', { id: contents.id })
  })
})

process.on('uncaughtException', error => {
  startupLog('ERROR', 'process:uncaughtException', error)
})

process.on('unhandledRejection', reason => {
  startupLog('ERROR', 'process:unhandledRejection', reason)
})
