"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const fs_1 = require("fs");
const net_1 = __importDefault(require("net"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const child_process_1 = require("child_process");
const updater_1 = require("./updater");
const projectStorage_1 = require("./projectStorage");
const OPEN_STATE_FILE = 'open-state.json';
const PREVIEW_WINDOW_STATE_FILE = 'preview-window-state.json';
const STARTUP_LOG_FILE = 'startup.log';
const APPROVED_ROOTS = new Set();
const API_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
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
]);
const API_ALLOWED_SUFFIXES = [
    '.cognitiveservices.azure.com',
    '.openai.azure.com',
];
const API_ALLOWED_METHODS = new Set(['GET', 'POST']);
const USER_DATA_ALLOWED_FILES = new Set([
    'translation_memory_db.json',
    'dialogue_patterns.json',
]);
function normalizeFsPath(value) {
    const resolved = path_1.default.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
function approveRootPath(dirPath) {
    if (!dirPath)
        return;
    APPROVED_ROOTS.add(normalizeFsPath(dirPath));
}
function isPathWithinRoot(rootPath, candidatePath) {
    const root = normalizeFsPath(rootPath);
    const candidate = normalizeFsPath(candidatePath);
    return candidate === root || candidate.startsWith(root + path_1.default.sep);
}
function isApprovedPath(candidatePath) {
    const normalized = normalizeFsPath(candidatePath);
    for (const root of APPROVED_ROOTS) {
        if (normalized === root || normalized.startsWith(root + path_1.default.sep))
            return true;
    }
    return false;
}
function resolveProjectFilePath(projectDir, relativePath) {
    if (!projectDir)
        throw new Error('Brak folderu projektu.');
    if (!relativePath)
        throw new Error('Brak sciezki pliku projektu.');
    if (!isApprovedPath(projectDir))
        throw new Error('Sciezka projektu nie zostala zatwierdzona.');
    const resolved = path_1.default.resolve(projectDir, relativePath);
    if (!isPathWithinRoot(projectDir, resolved))
        throw new Error('Nieprawidlowa sciezka pliku projektu.');
    return resolved;
}
function resolveUserDataFilePath(relativePath) {
    if (!relativePath)
        throw new Error('Brak sciezki pliku userData.');
    const userDataPath = electron_1.app.getPath('userData');
    const normalized = relativePath.replace(/\\/g, '/');
    if (USER_DATA_ALLOWED_FILES.has(normalized)) {
        return path_1.default.resolve(userDataPath, normalized);
    }
    if (normalized.startsWith('import_reports/') && normalized.endsWith('.json')) {
        return path_1.default.resolve(userDataPath, normalized);
    }
    throw new Error('Plik userData nie jest dozwolony.');
}
async function listAssFilesInDir(dirPath, recursive, rootPath) {
    const entries = await fs_1.promises.readdir(dirPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path_1.default.join(dirPath, entry.name);
        if (!isPathWithinRoot(rootPath, fullPath))
            continue;
        if (entry.isDirectory()) {
            if (recursive) {
                const nested = await listAssFilesInDir(fullPath, true, rootPath);
                files.push(...nested);
            }
            continue;
        }
        if (entry.isFile() && /\.ass$/i.test(entry.name)) {
            files.push(fullPath);
        }
    }
    return files;
}
function isPrivateIpv4(host) {
    const parts = host.split('.').map(part => Number(part));
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255))
        return false;
    const [a, b] = parts;
    if (a === 10)
        return true;
    if (a === 127)
        return true;
    if (a === 169 && b === 254)
        return true;
    if (a === 192 && b === 168)
        return true;
    if (a === 172 && b >= 16 && b <= 31)
        return true;
    return false;
}
function isPrivateIpv6(host) {
    const value = host.toLowerCase();
    if (value === '::1')
        return true;
    if (value.startsWith('fc') || value.startsWith('fd'))
        return true;
    if (value.startsWith('fe80'))
        return true;
    return false;
}
function isBlockedHostname(hostname) {
    if (!hostname)
        return true;
    if (hostname === 'localhost')
        return true;
    const ipType = net_1.default.isIP(hostname);
    if (ipType === 4)
        return isPrivateIpv4(hostname);
    if (ipType === 6)
        return isPrivateIpv6(hostname);
    return false;
}
function isAllowedApiHost(hostname) {
    if (API_ALLOWED_HOSTS.has(hostname))
        return true;
    return API_ALLOWED_SUFFIXES.some(suffix => hostname.endsWith(suffix));
}
function getCspHeaderValue() {
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
    ].join('; ');
}
async function readResponseTextWithLimit(response, limitBytes) {
    const reader = response.body?.getReader();
    if (!reader) {
        const text = await response.text();
        if (text.length > limitBytes)
            throw new Error('response-too-large');
        return text;
    }
    const decoder = new TextDecoder();
    let received = 0;
    let output = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        if (value) {
            received += value.byteLength;
            if (received > limitBytes) {
                try {
                    await reader.cancel();
                }
                catch {
                    // ignore
                }
                throw new Error('response-too-large');
            }
            output += decoder.decode(value, { stream: true });
        }
    }
    output += decoder.decode();
    return output;
}
function getOpenStatePath() {
    return path_1.default.join(electron_1.app.getPath('userData'), OPEN_STATE_FILE);
}
function getPreviewWindowStatePath() {
    return path_1.default.join(electron_1.app.getPath('userData'), PREVIEW_WINDOW_STATE_FILE);
}
function getApiConfigPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'api-config.json');
}
function getWaveformCacheDir() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'waveform-cache');
}
function getStartupLogPath() {
    try {
        return path_1.default.join(electron_1.app.getPath('userData'), 'logs', STARTUP_LOG_FILE);
    }
    catch {
        return path_1.default.join(process.cwd(), STARTUP_LOG_FILE);
    }
}
let mainWindow = null;
let previewWindow = null;
let detachedPreviewState = {
    videoSrc: null,
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    sourceText: '',
    targetText: '',
};
let mainRendererReady = false;
let mainRendererReadyTimer = null;
async function readPreviewWindowBounds() {
    try {
        const raw = await fs_1.promises.readFile(getPreviewWindowStatePath(), 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Number.isFinite(parsed.width) || !Number.isFinite(parsed.height))
            return null;
        return {
            x: Number.isFinite(parsed.x) ? parsed.x : undefined,
            y: Number.isFinite(parsed.y) ? parsed.y : undefined,
            width: Math.max(520, parsed.width),
            height: Math.max(340, parsed.height),
        };
    }
    catch {
        return null;
    }
}
async function savePreviewWindowBounds(bounds) {
    const normalized = {
        x: Number.isFinite(bounds.x) ? bounds.x : undefined,
        y: Number.isFinite(bounds.y) ? bounds.y : undefined,
        width: Math.max(520, Number(bounds.width) || 520),
        height: Math.max(340, Number(bounds.height) || 340),
    };
    await fs_1.promises.writeFile(getPreviewWindowStatePath(), JSON.stringify(normalized, null, 2), 'utf-8');
}
function toLogString(value) {
    if (value instanceof Error) {
        return `${value.name}: ${value.message}\n${value.stack ?? ''}`.trim();
    }
    if (typeof value === 'string')
        return value;
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
function startupLog(level, message, details) {
    const stamp = new Date().toISOString();
    const detailsText = details === undefined ? '' : ` | ${toLogString(details)}`;
    const line = `[${stamp}] [${level}] ${message}${detailsText}\n`;
    if (level === 'ERROR') {
        console.error(line.trimEnd());
    }
    else if (level === 'WARN') {
        console.warn(line.trimEnd());
    }
    else {
        console.log(line.trimEnd());
    }
    const logPath = getStartupLogPath();
    const logDir = path_1.default.dirname(logPath);
    void fs_1.promises.mkdir(logDir, { recursive: true })
        .then(() => fs_1.promises.appendFile(logPath, line, 'utf-8'))
        .catch(error => {
        console.error('[startup-log-write-failed]', error);
    });
}
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function renderStartupErrorPage(win, title, details) {
    const safeTitle = escapeHtml(title);
    const safeDetails = escapeHtml(details);
    const safeLogPath = escapeHtml(getStartupLogPath());
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
</html>`;
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}
async function fileExists(filePath) {
    try {
        await fs_1.promises.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
function buildWaveformCacheKey(filePath, size, mtimeMs) {
    return (0, crypto_1.createHash)('sha1').update(`${filePath}|${size}|${mtimeMs}`).digest('hex');
}
async function ensureWaveformCacheDir() {
    await fs_1.promises.mkdir(getWaveformCacheDir(), { recursive: true });
}
function ffmpegBinName() {
    return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}
function getBundledFfmpegCandidates() {
    const bin = ffmpegBinName();
    const appPath = electron_1.app.getAppPath();
    const appDir = path_1.default.dirname(appPath);
    const resourcesPath = process.resourcesPath;
    const execDir = path_1.default.dirname(process.execPath);
    // Priority: local bundled binaries in app resources first.
    return [
        path_1.default.join(resourcesPath, 'ffmpeg', bin),
        path_1.default.join(resourcesPath, 'bin', bin),
        path_1.default.join(appDir, 'ffmpeg', bin),
        path_1.default.join(appDir, 'bin', bin),
        path_1.default.join(appPath, 'ffmpeg', bin),
        path_1.default.join(process.cwd(), 'ffmpeg', bin),
        path_1.default.join(execDir, 'ffmpeg', bin),
    ];
}
async function probeExecutable(command) {
    return new Promise(resolve => {
        const child = (0, child_process_1.spawn)(command, ['-version'], { windowsHide: true });
        child.once('error', () => resolve(false));
        child.once('exit', code => resolve(code === 0));
    });
}
async function findFfmpegCommand() {
    const bundledCandidates = getBundledFfmpegCandidates();
    for (const candidatePath of bundledCandidates) {
        try {
            await fs_1.promises.access(candidatePath);
            const ok = await probeExecutable(candidatePath);
            if (ok) {
                return {
                    command: candidatePath,
                    source: 'bundled',
                    pathHint: candidatePath,
                };
            }
        }
        catch {
            // candidate missing or not executable
        }
    }
    const systemCandidates = process.platform === 'win32'
        ? ['ffmpeg.exe', 'ffmpeg']
        : ['ffmpeg'];
    for (const candidate of systemCandidates) {
        const ok = await probeExecutable(candidate);
        if (ok) {
            return {
                command: candidate,
                source: 'system',
                pathHint: candidate,
            };
        }
    }
    throw new Error('Nie znaleziono ffmpeg. Waveform i auto-timing wymagaja ffmpeg (najpierw szukam lokalnego bundled ffmpeg, potem PATH).');
}
async function generateWaveformData(filePath, sampleRate = 200) {
    const ffmpeg = await findFfmpegCommand();
    return new Promise((resolve, reject) => {
        const args = [
            '-v', 'error',
            '-i', filePath,
            '-vn',
            '-ac', '1',
            '-ar', String(sampleRate),
            '-f', 's16le',
            '-',
        ];
        const child = (0, child_process_1.spawn)(ffmpeg.command, args, { windowsHide: true });
        const chunks = [];
        let stderr = '';
        child.stdout.on('data', chunk => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        child.stderr.on('data', chunk => {
            stderr += chunk.toString();
        });
        child.once('error', error => {
            reject(new Error(`Nie mozna uruchomic ffmpeg: ${error.message}`));
        });
        child.once('close', code => {
            if (code !== 0) {
                reject(new Error(stderr.trim() || `ffmpeg zakonczyl sie kodem ${code}`));
                return;
            }
            const pcm = Buffer.concat(chunks);
            if (pcm.length < 2) {
                reject(new Error('Brak danych audio do wygenerowania waveformu.'));
                return;
            }
            const samplesCount = Math.floor(pcm.length / 2);
            const peaks = new Array(samplesCount);
            for (let i = 0; i < samplesCount; i += 1) {
                const sample = pcm.readInt16LE(i * 2);
                peaks[i] = Math.min(1, Math.abs(sample) / 32768);
            }
            const duration = samplesCount / sampleRate;
            resolve({ sampleRate, peaks, duration, ffmpegSource: ffmpeg.source, ffmpegPath: ffmpeg.pathHint });
        });
    });
}
async function getWaveformForVideo(args) {
    const filePath = args?.filePath?.trim();
    if (!filePath) {
        return {
            ok: false,
            filePath: '',
            sampleRate: 0,
            peaks: [],
            duration: 0,
            fromCache: false,
            error: 'Brak sciezki pliku wideo.',
        };
    }
    try {
        const stat = await fs_1.promises.stat(filePath);
        const cacheKey = buildWaveformCacheKey(filePath, stat.size, stat.mtimeMs);
        const cacheFile = path_1.default.join(getWaveformCacheDir(), `${cacheKey}.json`);
        await ensureWaveformCacheDir();
        if (!args.forceRefresh) {
            try {
                const raw = await fs_1.promises.readFile(cacheFile, 'utf-8');
                const parsed = JSON.parse(raw);
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
                    };
                }
            }
            catch {
                // Cache miss - continue to generate.
            }
        }
        const generated = await generateWaveformData(filePath, 200);
        await fs_1.promises.writeFile(cacheFile, JSON.stringify(generated), 'utf-8');
        return {
            ok: true,
            filePath,
            sampleRate: generated.sampleRate,
            peaks: generated.peaks,
            duration: generated.duration,
            fromCache: false,
            ffmpegSource: generated.ffmpegSource,
            ffmpegPath: generated.ffmpegPath,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Nie udalo sie wygenerowac waveformu.';
        return {
            ok: false,
            filePath,
            sampleRate: 0,
            peaks: [],
            duration: 0,
            fromCache: false,
            error: message,
        };
    }
}
async function readOpenState() {
    try {
        const raw = await fs_1.promises.readFile(getOpenStatePath(), 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed ?? {};
    }
    catch {
        return {};
    }
}
async function writeOpenState(state) {
    await fs_1.promises.writeFile(getOpenStatePath(), JSON.stringify(state, null, 2), 'utf-8');
}
async function readApiConfig() {
    try {
        const raw = await fs_1.promises.readFile(getApiConfigPath(), 'utf-8');
        const parsed = JSON.parse(raw);
        const next = {};
        Object.entries(parsed ?? {}).forEach(([key, value]) => {
            next[key] = typeof value === 'string' ? value.trim() : '';
        });
        return next;
    }
    catch {
        return {};
    }
}
async function writeApiConfig(config) {
    const sanitized = {};
    Object.entries(config ?? {}).forEach(([key, value]) => {
        sanitized[key] = typeof value === 'string' ? value.trim() : '';
    });
    await fs_1.promises.writeFile(getApiConfigPath(), JSON.stringify(sanitized, null, 2), 'utf-8');
}
function loadRendererWindow(win, hash) {
    const rendererIndexPath = path_1.default.join(__dirname, '../dist/index.html');
    if (process.env.VITE_DEV_SERVER_URL) {
        const url = hash
            ? `${process.env.VITE_DEV_SERVER_URL}#${hash}`
            : process.env.VITE_DEV_SERVER_URL;
        startupLog('INFO', 'renderer:load', { mode: 'dev', url });
        return win.loadURL(url);
    }
    startupLog('INFO', 'renderer:load', { mode: 'file', path: rendererIndexPath, hash: hash ?? '' });
    return win.loadFile(rendererIndexPath, hash ? { hash } : undefined);
}
async function createWindow() {
    const preloadPath = path_1.default.join(__dirname, 'preload.js');
    const rendererIndexPath = path_1.default.join(__dirname, '../dist/index.html');
    const preloadExists = await fileExists(preloadPath);
    const rendererExists = await fileExists(rendererIndexPath);
    startupLog('INFO', 'createWindow:start', {
        isPackaged: electron_1.app.isPackaged,
        appPath: electron_1.app.getAppPath(),
        execPath: process.execPath,
        resourcesPath: process.resourcesPath,
        dirname: __dirname,
        preloadPath,
        rendererIndexPath,
        preloadExists,
        rendererExists,
        hasDevServerUrl: Boolean(process.env.VITE_DEV_SERVER_URL),
    });
    const win = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: preloadPath,
        },
        title: 'AnimeGate Translator',
    });
    mainWindow = win;
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => {
        if (process.env.VITE_DEV_SERVER_URL)
            return;
        event.preventDefault();
    });
    win.on('closed', () => {
        mainWindow = null;
        if (previewWindow && !previewWindow.isDestroyed()) {
            previewWindow.close();
        }
    });
    win.webContents.on('did-finish-load', () => {
        startupLog('INFO', 'webContents:did-finish-load', {
            url: win.webContents.getURL(),
        });
        if (win === mainWindow) {
            if (mainRendererReadyTimer)
                clearTimeout(mainRendererReadyTimer);
            mainRendererReadyTimer = setTimeout(() => {
                if (!mainRendererReady) {
                    startupLog('ERROR', 'renderer:ready-timeout', { url: win.webContents.getURL() });
                    renderStartupErrorPage(win, 'Nie mozna uruchomic UI aplikacji', 'Renderer nie potwierdzil poprawnego startu w wymaganym czasie.');
                }
            }, 5000);
        }
    });
    win.webContents.on('did-start-loading', () => {
        startupLog('INFO', 'webContents:did-start-loading', {
            url: win.webContents.getURL(),
        });
    });
    win.webContents.on('did-stop-loading', () => {
        startupLog('INFO', 'webContents:did-stop-loading', {
            url: win.webContents.getURL(),
        });
    });
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        startupLog('ERROR', 'webContents:did-fail-load', {
            errorCode,
            errorDescription,
            validatedURL,
            isMainFrame,
        });
        if (isMainFrame) {
            renderStartupErrorPage(win, 'Nie mozna zaladowac UI aplikacji', `Code: ${errorCode}\nDescription: ${errorDescription}\nURL: ${validatedURL}`);
        }
    });
    win.webContents.on('preload-error', (_event, preloadFile, error) => {
        startupLog('ERROR', 'webContents:preload-error', {
            preloadFile,
            error: toLogString(error),
        });
        renderStartupErrorPage(win, 'Blad preload', `Preload file: ${preloadFile}\nError: ${toLogString(error)}`);
    });
    win.webContents.on('render-process-gone', (_event, details) => {
        startupLog('ERROR', 'webContents:render-process-gone', details);
        renderStartupErrorPage(win, 'Proces renderera zostal zakonczony', toLogString(details));
    });
    win.webContents.on('unresponsive', () => {
        startupLog('WARN', 'webContents:unresponsive', { url: win.webContents.getURL() });
    });
    win.webContents.on('responsive', () => {
        startupLog('INFO', 'webContents:responsive', { url: win.webContents.getURL() });
    });
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        const severity = level >= 3 ? 'ERROR' : (level === 2 ? 'WARN' : 'INFO');
        startupLog(severity, 'renderer:console-message', { level, message, line, sourceId });
    });
    if (!preloadExists || !rendererExists) {
        renderStartupErrorPage(win, 'Nie mozna zaladowac UI aplikacji', `Brak wymaganych plikow UI.\npreload: ${preloadPath} (exists=${preloadExists})\nindex.html: ${rendererIndexPath} (exists=${rendererExists})`);
        return;
    }
    const loadPromise = loadRendererWindow(win);
    void loadPromise.catch(error => {
        startupLog('ERROR', 'window-load-failed', error);
        renderStartupErrorPage(win, 'Nie mozna uruchomic aplikacji', toLogString(error));
    });
    electron_1.Menu.setApplicationMenu(null);
}
async function createDetachedPreviewWindow() {
    if (previewWindow && !previewWindow.isDestroyed()) {
        previewWindow.focus();
        return previewWindow;
    }
    const preloadPath = path_1.default.join(__dirname, 'preload.js');
    const savedBounds = await readPreviewWindowBounds();
    const preview = new electron_1.BrowserWindow({
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
    });
    previewWindow = preview;
    preview.on('closed', () => {
        previewWindow = null;
    });
    preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    preview.webContents.on('will-navigate', event => {
        if (process.env.VITE_DEV_SERVER_URL)
            return;
        event.preventDefault();
    });
    const persistBounds = () => {
        if (!previewWindow || previewWindow.isDestroyed())
            return;
        const bounds = previewWindow.getBounds();
        void savePreviewWindowBounds(bounds).catch(error => {
            startupLog('WARN', 'preview:save-bounds-failed', toLogString(error));
        });
    };
    preview.on('resize', persistBounds);
    preview.on('move', persistBounds);
    preview.webContents.on('did-finish-load', () => {
        preview.webContents.send('preview:state', detachedPreviewState);
    });
    await loadRendererWindow(preview, 'video-preview');
    return preview;
}
function setupFileIpc() {
    electron_1.ipcMain.handle('file:openSubtitle', async (_event, args) => {
        const state = await readOpenState();
        const preferredDir = args?.projectDir || state.lastDir;
        const result = await electron_1.dialog.showOpenDialog({
            title: 'Otworz plik ASS',
            properties: ['openFile'],
            filters: [
                { name: 'Napisy ASS/SSA (*.ass;*.ssa)', extensions: ['ass', 'ssa'] },
                { name: 'Wszystkie pliki (*.*)', extensions: ['*'] },
            ],
            defaultPath: preferredDir,
        });
        if (result.canceled || result.filePaths.length === 0) {
            return { canceled: true };
        }
        const filePath = result.filePaths[0];
        try {
            const content = await fs_1.promises.readFile(filePath, 'utf-8');
            approveRootPath(path_1.default.dirname(filePath));
            await writeOpenState({ lastDir: path_1.default.dirname(filePath) });
            return { canceled: false, filePath, content };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Nie udalo sie odczytac pliku.';
            return { canceled: false, filePath, error: message };
        }
    });
    electron_1.ipcMain.handle('file:readSubtitle', async (_event, filePath) => {
        if (!filePath || !/\.(ass|ssa)$/i.test(filePath)) {
            throw new Error('Nieprawidłowy format pliku napisów.');
        }
        if (!isApprovedPath(filePath)) {
            throw new Error('Brak dostępu do pliku spoza zatwierdzonego katalogu.');
        }
        const content = await fs_1.promises.readFile(filePath, 'utf-8');
        await writeOpenState({ lastDir: path_1.default.dirname(filePath) });
        return { filePath, content };
    });
    electron_1.ipcMain.handle('file:saveSubtitle', async (_event, args) => {
        const sourcePath = args?.sourcePath;
        const content = args?.content ?? '';
        if (!sourcePath) {
            throw new Error('Brak ścieżki pliku źródłowego.');
        }
        if (!/\.(ass|ssa)$/i.test(sourcePath)) {
            throw new Error('Nieprawidłowy format pliku napisów.');
        }
        if (!isApprovedPath(sourcePath)) {
            throw new Error('Brak dostępu do zapisu poza zatwierdzonym katalogiem.');
        }
        const sourceDir = path_1.default.dirname(sourcePath);
        const sourceBaseName = path_1.default.basename(sourcePath);
        const savedPath = path_1.default.join(sourceDir, `PL ${sourceBaseName}`);
        await fs_1.promises.writeFile(savedPath, content, 'utf-8');
        await writeOpenState({ lastDir: sourceDir });
        return { savedPath };
    });
    electron_1.ipcMain.handle('file:openVideo', async (_event, args) => {
        const state = await readOpenState();
        const preferredDir = args?.projectDir || state.lastDir;
        const result = await electron_1.dialog.showOpenDialog({
            title: 'Wybierz plik wideo',
            properties: ['openFile'],
            filters: [
                { name: 'Wideo (*.mp4;*.mkv;*.avi;*.mov)', extensions: ['mp4', 'mkv', 'avi', 'mov'] },
                { name: 'Wszystkie pliki (*.*)', extensions: ['*'] },
            ],
            defaultPath: preferredDir,
        });
        if (result.canceled || result.filePaths.length === 0) {
            return { canceled: true };
        }
        const filePath = result.filePaths[0];
        approveRootPath(path_1.default.dirname(filePath));
        await writeOpenState({ lastDir: path_1.default.dirname(filePath) });
        return { canceled: false, filePath };
    });
    electron_1.ipcMain.handle('video:getWaveform', async (_event, args) => {
        const filePath = args?.filePath?.trim();
        if (!filePath) {
            return {
                ok: false,
                filePath: '',
                sampleRate: 0,
                peaks: [],
                duration: 0,
                fromCache: false,
                error: 'Brak sciezki pliku wideo.',
            };
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
            };
        }
        return getWaveformForVideo(args);
    });
    electron_1.ipcMain.handle('api:getConfig', async () => readApiConfig());
    electron_1.ipcMain.handle('api:saveConfig', async (_event, config) => {
        await writeApiConfig(config);
        return { ok: true };
    });
    electron_1.ipcMain.handle('api:request', async (_event, args) => {
        const url = args?.url?.trim() ?? '';
        if (!url) {
            return {
                ok: false,
                status: 0,
                statusText: 'INVALID_REQUEST',
                body: '',
                error: { code: 'invalid-request', message: 'Brak URL zapytania.' },
            };
        }
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        }
        catch {
            return {
                ok: false,
                status: 0,
                statusText: 'INVALID_URL',
                body: '',
                error: { code: 'invalid-url', message: 'Nieprawidłowy URL.' },
            };
        }
        if (parsedUrl.protocol !== 'https:') {
            return {
                ok: false,
                status: 0,
                statusText: 'INVALID_PROTOCOL',
                body: '',
                error: { code: 'invalid-protocol', message: 'Dozwolony jest tylko protokół HTTPS.' },
            };
        }
        if (isBlockedHostname(parsedUrl.hostname) || !isAllowedApiHost(parsedUrl.hostname)) {
            return {
                ok: false,
                status: 0,
                statusText: 'HOST_BLOCKED',
                body: '',
                error: { code: 'host-blocked', message: 'Host nie znajduje się na liście dozwolonych.' },
            };
        }
        const method = (args.method ?? 'GET').toUpperCase();
        if (!API_ALLOWED_METHODS.has(method)) {
            return {
                ok: false,
                status: 0,
                statusText: 'METHOD_NOT_ALLOWED',
                body: '',
                error: { code: 'method-not-allowed', message: 'Niedozwolona metoda HTTP.' },
            };
        }
        const timeoutMs = Math.max(1000, Math.min(45000, Number(args.timeoutMs ?? 15000)));
        const timeoutController = new AbortController();
        let timeoutReached = false;
        const timer = setTimeout(() => {
            timeoutReached = true;
            timeoutController.abort();
        }, timeoutMs);
        try {
            const response = await fetch(parsedUrl.toString(), {
                method,
                headers: args.headers ?? {},
                body: args.body,
                signal: timeoutController.signal,
                redirect: 'error',
            });
            const body = await readResponseTextWithLimit(response, API_MAX_RESPONSE_BYTES);
            const headers = Object.fromEntries(response.headers.entries());
            return {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                body,
                headers,
            };
        }
        catch (error) {
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
                };
            }
            const fetchErr = error;
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
                };
            }
            const causeCode = fetchErr.cause?.code;
            const networkCode = causeCode ?? 'network';
            const details = fetchErr.cause?.message ?? fetchErr.message;
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
            };
        }
        finally {
            clearTimeout(timer);
        }
    });
    electron_1.ipcMain.handle('project:pickDirectory', async (_event, args) => {
        const result = await electron_1.dialog.showOpenDialog({
            title: args?.title ?? 'Wybierz folder',
            properties: ['openDirectory', 'createDirectory'],
            defaultPath: args?.defaultPath,
        });
        if (result.canceled || result.filePaths.length === 0) {
            return { canceled: true };
        }
        approveRootPath(result.filePaths[0]);
        return { canceled: false, directoryPath: result.filePaths[0] };
    });
    electron_1.ipcMain.handle('project:pickFile', async (_event, args) => {
        const result = await electron_1.dialog.showOpenDialog({
            title: args?.title ?? 'Wybierz plik projektu',
            properties: ['openFile'],
            defaultPath: args?.defaultPath,
            filters: [
                { name: 'Projekt AnimeGate', extensions: ['json', 'agproj'] },
                { name: 'Wszystkie pliki', extensions: ['*'] },
            ],
        });
        if (result.canceled || result.filePaths.length === 0) {
            return { canceled: true };
        }
        approveRootPath(path_1.default.dirname(result.filePaths[0]));
        return { canceled: false, filePath: result.filePaths[0] };
    });
    electron_1.ipcMain.handle('project:create', async (_event, args) => {
        if (!isApprovedPath(args.parentDir)) {
            throw new Error('Brak dostępu do folderu projektu (niezatwierdzony katalog).');
        }
        const created = await (0, projectStorage_1.createProjectOnDisk)(args);
        approveRootPath(created.projectDir);
        return { ok: true, ...created };
    });
    electron_1.ipcMain.handle('project:open', async (_event, projectPath) => {
        startupLog('INFO', 'projectPath', { projectPath });
        const opened = await (0, projectStorage_1.openProjectFromDisk)(projectPath);
        approveRootPath(opened.projectDir);
        startupLog('INFO', 'projectFileFound', { configPath: opened.configPath });
        startupLog('INFO', 'projectLoaded', {
            projectId: opened.config.projectId,
            title: opened.config.title,
            projectDir: opened.projectDir,
        });
        return { ok: true, ...opened };
    });
    electron_1.ipcMain.handle('project:saveConfig', async (_event, args) => {
        if (!isApprovedPath(args.projectDir)) {
            throw new Error('Brak dostępu do zapisu projektu (niezatwierdzony katalog).');
        }
        const saved = await (0, projectStorage_1.saveProjectConfigOnDisk)(args.projectDir, args.config);
        return { ok: true, ...saved };
    });
    electron_1.ipcMain.handle('project:readTextFile', async (_event, args) => {
        try {
            const filePath = resolveProjectFilePath(args.projectDir, args.relativePath);
            const content = await fs_1.promises.readFile(filePath, 'utf-8');
            return { ok: true, content };
        }
        catch (error) {
            const code = error?.code;
            if (code === 'ENOENT')
                return { ok: false, error: 'not-found' };
            const message = error instanceof Error ? error.message : 'Nie udalo sie odczytac pliku projektu.';
            return { ok: false, error: message };
        }
    });
    electron_1.ipcMain.handle('project:writeTextFile', async (_event, args) => {
        try {
            const filePath = resolveProjectFilePath(args.projectDir, args.relativePath);
            await fs_1.promises.mkdir(path_1.default.dirname(filePath), { recursive: true });
            await fs_1.promises.writeFile(filePath, args.content ?? '', 'utf-8');
            return { ok: true };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Nie udalo sie zapisac pliku projektu.';
            return { ok: false, error: message };
        }
    });
    electron_1.ipcMain.handle('project:listAssFiles', async (_event, args) => {
        try {
            if (!args?.dir)
                return { ok: false, error: 'Brak katalogu.' };
            if (!isApprovedPath(args.dir))
                return { ok: false, error: 'Brak dostepu do katalogu (niezatwierdzony).' };
            const normalizedDir = path_1.default.resolve(args.dir);
            const files = await listAssFilesInDir(normalizedDir, Boolean(args.recursive), normalizedDir);
            return { ok: true, files };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Nie udalo sie odczytac katalogu.';
            return { ok: false, error: message };
        }
    });
    electron_1.ipcMain.handle('app:readUserDataFile', async (_event, args) => {
        try {
            const filePath = resolveUserDataFilePath(args.relativePath);
            const content = await fs_1.promises.readFile(filePath, 'utf-8');
            return { ok: true, content };
        }
        catch (error) {
            const code = error?.code;
            if (code === 'ENOENT')
                return { ok: false, error: 'not-found' };
            const message = error instanceof Error ? error.message : 'Nie udalo sie odczytac pliku userData.';
            return { ok: false, error: message };
        }
    });
    electron_1.ipcMain.handle('app:writeUserDataFile', async (_event, args) => {
        try {
            const filePath = resolveUserDataFilePath(args.relativePath);
            await fs_1.promises.mkdir(path_1.default.dirname(filePath), { recursive: true });
            await fs_1.promises.writeFile(filePath, args.content ?? '', 'utf-8');
            return { ok: true };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Nie udalo sie zapisac pliku userData.';
            return { ok: false, error: message };
        }
    });
    electron_1.ipcMain.handle('preview:openWindow', async () => {
        await createDetachedPreviewWindow();
        return { ok: true };
    });
    electron_1.ipcMain.handle('preview:closeWindow', async () => {
        if (previewWindow && !previewWindow.isDestroyed()) {
            previewWindow.close();
        }
        return { ok: true };
    });
    electron_1.ipcMain.handle('preview:updateState', async (_event, state) => {
        detachedPreviewState = {
            ...detachedPreviewState,
            ...state,
            videoSrc: typeof state.videoSrc === 'string' ? state.videoSrc : (state.videoSrc === null ? null : detachedPreviewState.videoSrc),
            sourceText: typeof state.sourceText === 'string' ? state.sourceText : detachedPreviewState.sourceText,
            targetText: typeof state.targetText === 'string' ? state.targetText : detachedPreviewState.targetText,
            currentTime: Number.isFinite(state.currentTime) ? Number(state.currentTime) : detachedPreviewState.currentTime,
            playbackRate: Number.isFinite(state.playbackRate) ? Number(state.playbackRate) : detachedPreviewState.playbackRate,
            paused: typeof state.paused === 'boolean' ? state.paused : detachedPreviewState.paused,
        };
        if (previewWindow && !previewWindow.isDestroyed()) {
            previewWindow.webContents.send('preview:state', detachedPreviewState);
        }
        return { ok: true };
    });
    electron_1.ipcMain.handle('preview:getState', async () => detachedPreviewState);
    electron_1.ipcMain.handle('preview:togglePlayback', async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('preview:command', { type: 'toggle-playback' });
        }
        return { ok: true };
    });
}
function setupUpdaterIpc() {
    const broadcastStatus = (status) => {
        electron_1.BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('updater:status', status);
        });
    };
    (0, updater_1.subscribeUpdaterStatus)(status => {
        broadcastStatus(status);
    });
    electron_1.ipcMain.handle('updater:getStatus', async () => (0, updater_1.getUpdaterStatus)());
    electron_1.ipcMain.handle('updater:checkForUpdates', async () => (0, updater_1.checkForUpdates)());
    electron_1.ipcMain.handle('updater:downloadUpdate', async () => (0, updater_1.downloadUpdate)());
    electron_1.ipcMain.handle('updater:installUpdate', async () => (0, updater_1.installUpdate)());
}
function setupAppIpc() {
    electron_1.ipcMain.handle('app:getVersion', async () => ({
        version: electron_1.app.getVersion(),
        isPackaged: electron_1.app.isPackaged,
        execPath: process.execPath,
    }));
}
function setupPreloadDiagnostics() {
    electron_1.ipcMain.on('app:preload-ready', (event, payload) => {
        startupLog('INFO', 'preload:ready', {
            url: event.sender?.getURL?.() ?? '',
            payload,
        });
    });
    electron_1.ipcMain.on('app:renderer-ready', event => {
        if (event.sender === mainWindow?.webContents) {
            mainRendererReady = true;
            if (mainRendererReadyTimer) {
                clearTimeout(mainRendererReadyTimer);
                mainRendererReadyTimer = null;
            }
            startupLog('INFO', 'renderer:ready', { url: event.sender.getURL() });
        }
    });
}
electron_1.app.whenReady().then(() => {
    startupLog('INFO', 'app:ready', {
        version: electron_1.app.getVersion(),
        isPackaged: electron_1.app.isPackaged,
        userData: electron_1.app.getPath('userData'),
    });
    if (electron_1.app.isPackaged) {
        electron_1.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
            const headers = details.responseHeaders ?? {};
            headers['Content-Security-Policy'] = [getCspHeaderValue()];
            callback({ responseHeaders: headers });
        });
    }
    setupFileIpc();
    setupUpdaterIpc();
    setupAppIpc();
    setupPreloadDiagnostics();
    void createWindow();
    void (0, updater_1.initializeAutoUpdate)();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    startupLog('INFO', 'app:window-all-closed', { platform: process.platform });
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('web-contents-created', (_event, contents) => {
    contents.on('unresponsive', () => {
        startupLog('WARN', 'webContents:unresponsive', { id: contents.id });
    });
});
process.on('uncaughtException', error => {
    startupLog('ERROR', 'process:uncaughtException', error);
});
process.on('unhandledRejection', reason => {
    startupLog('ERROR', 'process:unhandledRejection', reason);
});
