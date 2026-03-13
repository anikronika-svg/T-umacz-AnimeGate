import { app, BrowserWindow, dialog, ipcMain, Menu, session } from 'electron'
import { promises as fs } from 'fs'
import net from 'net'
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
const PREVIEW_WINDOW_STATE_FILE = 'preview-window-state.json'

interface DetachedPreviewState {
  videoSrc: string | null
  currentTime: number
  playbackRate: number
  paused: boolean
  sourceText: string
  targetText: string
}

interface PreviewWindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}

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

const APPROVED_ROOTS = new Set<string>()
const API_MAX_RESPONSE_BYTES = 5 * 1024 * 1024

const API_ALLOWED_HOSTS = new Set([
  'graphql.anilist.co',
  'api.openai.com',
  'api.anthropic.com',
  'api.mistral.ai',
  'api.groq.com',
  'api.together.ai',
  'api.openrouter.ai',
  'openrouter.ai',
  'api.cohere.ai',
  'api.deepl.com',
  'api-free.deepl.com',
  'api.mymemory.translated.net',
  'libretranslate.com',
  'translate.argosopentech.com',
  'generativelanguage.googleapis.com',
  'translation.googleapis.com',
  'translate.googleapis.com',
  'api.cognitive.microsofttranslator.com',
  'translate.yandex.net',
  'translate.api.cloud.yandex.net',
  'openapi.naver.com',
  'papago.naver.com',
])

const API_ALLOWED_SUFFIXES = [
  '.cognitiveservices.azure.com',
  '.openai.azure.com',
]

const API_ALLOWED_METHODS = new Set(['GET', 'POST'])

function normalizeFsPath(value: string): string {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function approveRootPath(dirPath: string): void {
  if (!dirPath) return
  APPROVED_ROOTS.add(normalizeFsPath(dirPath))
}

function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
  const root = normalizeFsPath(rootPath)
  const candidate = normalizeFsPath(candidatePath)
  return candidate === root || candidate.startsWith(root + path.sep)
}

function isApprovedPath(candidatePath: string): boolean {
  const normalized = normalizeFsPath(candidatePath)
  for (const root of APPROVED_ROOTS) {
    if (normalized === root || normalized.startsWith(root + path.sep)) return true
  }
  return false
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return false
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

function isPrivateIpv6(host: string): boolean {
  const value = host.toLowerCase()
  if (value === '::1') return true
  if (value.startsWith('fc') || value.startsWith('fd')) return true
  if (value.startsWith('fe80')) return true
  return false
}

function isBlockedHostname(hostname: string): boolean {
  if (!hostname) return true
  if (hostname === 'localhost') return true
  const ipType = net.isIP(hostname)
  if (ipType === 4) return isPrivateIpv4(hostname)
  if (ipType === 6) return isPrivateIpv6(hostname)
  return false
}

function isAllowedApiHost(hostname: string): boolean {
  if (API_ALLOWED_HOSTS.has(hostname)) return true
  return API_ALLOWED_SUFFIXES.some(suffix => hostname.endsWith(suffix))
}

function getCspHeaderValue(): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src https:",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}

async function readResponseTextWithLimit(response: Response, limitBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    const text = await response.text()
    if (text.length > limitBytes) throw new Error('response-too-large')
    return text
  }

  const decoder = new TextDecoder()
  let received = 0
  let output = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      received += value.byteLength
      if (received > limitBytes) {
        try {
          await reader.cancel()
        } catch {
          // ignore
        }
        throw new Error('response-too-large')
      }
      output += decoder.decode(value, { stream: true })
    }
  }

  output += decoder.decode()
  return output
}

function getOpenStatePath(): string {
  return path.join(app.getPath('userData'), OPEN_STATE_FILE)
}

function getPreviewWindowStatePath(): string {
  return path.join(app.getPath('userData'), PREVIEW_WINDOW_STATE_FILE)
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

let mainWindow: BrowserWindow | null = null
let previewWindow: BrowserWindow | null = null
let detachedPreviewState: DetachedPreviewState = {
  videoSrc: null,
  currentTime: 0,
  playbackRate: 1,
  paused: true,
  sourceText: '',
  targetText: '',
}

async function readPreviewWindowBounds(): Promise<PreviewWindowBounds | null> {
  try {
    const raw = await fs.readFile(getPreviewWindowStatePath(), 'utf-8')
    const parsed = JSON.parse(raw) as PreviewWindowBounds
    if (!Number.isFinite(parsed.width) || !Number.isFinite(parsed.height)) return null
    return {
      x: Number.isFinite(parsed.x) ? parsed.x : undefined,
      y: Number.isFinite(parsed.y) ? parsed.y : undefined,
      width: Math.max(520, parsed.width),
      height: Math.max(340, parsed.height),
    }
  } catch {
    return null
  }
}

async function savePreviewWindowBounds(bounds: PreviewWindowBounds): Promise<void> {
  const normalized: PreviewWindowBounds = {
    x: Number.isFinite(bounds.x) ? bounds.x : undefined,
    y: Number.isFinite(bounds.y) ? bounds.y : undefined,
    width: Math.max(520, Number(bounds.width) || 520),
    height: Math.max(340, Number(bounds.height) || 340),
  }
  await fs.writeFile(getPreviewWindowStatePath(), JSON.stringify(normalized, null, 2), 'utf-8')
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

function loadRendererWindow(win: BrowserWindow, hash?: string): Promise<void> {
  const rendererIndexPath = path.join(__dirname, '../dist/index.html')
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = hash
      ? `${process.env.VITE_DEV_SERVER_URL}#${hash}`
      : process.env.VITE_DEV_SERVER_URL
    return win.loadURL(url)
  }
  return win.loadFile(rendererIndexPath, hash ? { hash } : undefined)
}

function createWindow(): void {
  const preloadPath = path.join(__dirname, 'preload.js')
  startupLog('INFO', 'createWindow:start', {
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    execPath: process.execPath,
    resourcesPath: process.resourcesPath,
    dirname: __dirname,
    preloadPath,
    rendererIndexPath: path.join(__dirname, '../dist/index.html'),
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
  mainWindow = win

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', event => {
    if (process.env.VITE_DEV_SERVER_URL) return
    event.preventDefault()
  })

  win.on('closed', () => {
    mainWindow = null
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.close()
    }
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

  const loadPromise = loadRendererWindow(win)

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

async function createDetachedPreviewWindow(): Promise<BrowserWindow> {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.focus()
    return previewWindow
  }

  const preloadPath = path.join(__dirname, 'preload.js')
  const savedBounds = await readPreviewWindowBounds()
  const preview = new BrowserWindow({
    title: 'AnimeGate Translator - Powiekszony podglad',
    autoHideMenuBar: true,
    resizable: true,
    minimizable: true,
    maximizable: true,
    width: savedBounds?.width ?? 1080,
    height: savedBounds?.height ?? 640,
    x: savedBounds?.x,
    y: savedBounds?.y,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  })

  previewWindow = preview
  preview.on('closed', () => {
    previewWindow = null
  })

  preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  preview.webContents.on('will-navigate', event => {
    if (process.env.VITE_DEV_SERVER_URL) return
    event.preventDefault()
  })

  const persistBounds = (): void => {
    if (!previewWindow || previewWindow.isDestroyed()) return
    const bounds = previewWindow.getBounds()
    void savePreviewWindowBounds(bounds).catch(error => {
      startupLog('WARN', 'preview:save-bounds-failed', toLogString(error))
    })
  }
  preview.on('resize', persistBounds)
  preview.on('move', persistBounds)

  preview.webContents.on('did-finish-load', () => {
    preview.webContents.send('preview:state', detachedPreviewState)
  })

  await loadRendererWindow(preview, 'video-preview')
  return preview
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
      approveRootPath(path.dirname(filePath))
      await writeOpenState({ lastDir: path.dirname(filePath) })
      return { canceled: false, filePath, content }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie odczytac pliku.'
      return { canceled: false, filePath, error: message }
    }
  })

  ipcMain.handle('file:readSubtitle', async (_event, filePath: string) => {
    if (!filePath || !/\.(ass|ssa)$/i.test(filePath)) {
      throw new Error('Nieprawidłowy format pliku napisów.')
    }
    if (!isApprovedPath(filePath)) {
      throw new Error('Brak dostępu do pliku spoza zatwierdzonego katalogu.')
    }
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
    if (!/\.(ass|ssa)$/i.test(sourcePath)) {
      throw new Error('Nieprawidłowy format pliku napisów.')
    }
    if (!isApprovedPath(sourcePath)) {
      throw new Error('Brak dostępu do zapisu poza zatwierdzonym katalogiem.')
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
    approveRootPath(path.dirname(filePath))
    await writeOpenState({ lastDir: path.dirname(filePath) })
    return { canceled: false, filePath }
  })

  ipcMain.handle('video:getWaveform', async (_event, args: VideoWaveformArgs) => {
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
    if (!isApprovedPath(filePath)) {
      return {
        ok: false,
        filePath,
        sampleRate: 0,
        peaks: [],
        duration: 0,
        fromCache: false,
        error: 'Brak dostepu do pliku wideo spoza zatwierdzonego katalogu.',
      }
    }
    return getWaveformForVideo(args)
  })

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

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return {
        ok: false,
        status: 0,
        statusText: 'INVALID_URL',
        body: '',
        error: { code: 'invalid-url', message: 'Nieprawidłowy URL.' },
      }
    }

    if (parsedUrl.protocol !== 'https:') {
      return {
        ok: false,
        status: 0,
        statusText: 'INVALID_PROTOCOL',
        body: '',
        error: { code: 'invalid-protocol', message: 'Dozwolony jest tylko protokół HTTPS.' },
      }
    }

    if (isBlockedHostname(parsedUrl.hostname) || !isAllowedApiHost(parsedUrl.hostname)) {
      return {
        ok: false,
        status: 0,
        statusText: 'HOST_BLOCKED',
        body: '',
        error: { code: 'host-blocked', message: 'Host nie znajduje się na liście dozwolonych.' },
      }
    }

    const method = (args.method ?? 'GET').toUpperCase()
    if (!API_ALLOWED_METHODS.has(method)) {
      return {
        ok: false,
        status: 0,
        statusText: 'METHOD_NOT_ALLOWED',
        body: '',
        error: { code: 'method-not-allowed', message: 'Niedozwolona metoda HTTP.' },
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
      const response = await fetch(parsedUrl.toString(), {
        method,
        headers: args.headers ?? {},
        body: args.body,
        signal: timeoutController.signal,
        redirect: 'error',
      })

      const body = await readResponseTextWithLimit(response, API_MAX_RESPONSE_BYTES)
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
      if (fetchErr.message === 'response-too-large') {
        return {
          ok: false,
          status: 0,
          statusText: 'RESPONSE_TOO_LARGE',
          body: '',
          error: {
            code: 'response-too-large',
            message: `Odpowiedź przekracza limit ${API_MAX_RESPONSE_BYTES} bajtów.`,
          },
        }
      }
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
    approveRootPath(result.filePaths[0])
    return { canceled: false, directoryPath: result.filePaths[0] }
  })

  ipcMain.handle('project:pickFile', async (_event, args?: { title?: string; defaultPath?: string }) => {
    const result = await dialog.showOpenDialog({
      title: args?.title ?? 'Wybierz plik projektu',
      properties: ['openFile'],
      defaultPath: args?.defaultPath,
      filters: [
        { name: 'Projekt AnimeGate', extensions: ['json', 'agproj'] },
        { name: 'Wszystkie pliki', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }
    approveRootPath(path.dirname(result.filePaths[0]))
    return { canceled: false, filePath: result.filePaths[0] }
  })

  ipcMain.handle('project:create', async (_event, args: CreateProjectArgs) => {
    if (!isApprovedPath(args.parentDir)) {
      throw new Error('Brak dostępu do folderu projektu (niezatwierdzony katalog).')
    }
    const created = await createProjectOnDisk(args)
    approveRootPath(created.projectDir)
    return { ok: true, ...created }
  })

  ipcMain.handle('project:open', async (_event, projectPath: string) => {
    startupLog('INFO', 'projectPath', { projectPath })
    const opened = await openProjectFromDisk(projectPath)
    approveRootPath(opened.projectDir)
    startupLog('INFO', 'projectFileFound', { configPath: opened.configPath })
    startupLog('INFO', 'projectLoaded', {
      projectId: opened.config.projectId,
      title: opened.config.title,
      projectDir: opened.projectDir,
    })
    return { ok: true, ...opened }
  })

  ipcMain.handle('project:saveConfig', async (_event, args: { projectDir: string; config: DiskProjectConfigV1 }) => {
    if (!isApprovedPath(args.projectDir)) {
      throw new Error('Brak dostępu do zapisu projektu (niezatwierdzony katalog).')
    }
    const saved = await saveProjectConfigOnDisk(args.projectDir, args.config)
    return { ok: true, ...saved }
  })

  ipcMain.handle('preview:openWindow', async () => {
    await createDetachedPreviewWindow()
    return { ok: true }
  })

  ipcMain.handle('preview:closeWindow', async () => {
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.close()
    }
    return { ok: true }
  })

  ipcMain.handle('preview:updateState', async (_event, state: Partial<DetachedPreviewState>) => {
    detachedPreviewState = {
      ...detachedPreviewState,
      ...state,
      videoSrc: typeof state.videoSrc === 'string' ? state.videoSrc : (state.videoSrc === null ? null : detachedPreviewState.videoSrc),
      sourceText: typeof state.sourceText === 'string' ? state.sourceText : detachedPreviewState.sourceText,
      targetText: typeof state.targetText === 'string' ? state.targetText : detachedPreviewState.targetText,
      currentTime: Number.isFinite(state.currentTime) ? Number(state.currentTime) : detachedPreviewState.currentTime,
      playbackRate: Number.isFinite(state.playbackRate) ? Number(state.playbackRate) : detachedPreviewState.playbackRate,
      paused: typeof state.paused === 'boolean' ? state.paused : detachedPreviewState.paused,
    }
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.webContents.send('preview:state', detachedPreviewState)
    }
    return { ok: true }
  })

  ipcMain.handle('preview:getState', async () => detachedPreviewState)

  ipcMain.handle('preview:togglePlayback', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('preview:command', { type: 'toggle-playback' })
    }
    return { ok: true }
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

  if (app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = details.responseHeaders ?? {}
      headers['Content-Security-Policy'] = [getCspHeaderValue()]
      callback({ responseHeaders: headers })
    })
  }

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
