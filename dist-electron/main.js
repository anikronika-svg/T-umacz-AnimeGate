"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const child_process_1 = require("child_process");
const updater_1 = require("./updater");
const OPEN_STATE_FILE = 'open-state.json';
function getOpenStatePath() {
    return path_1.default.join(electron_1.app.getPath('userData'), OPEN_STATE_FILE);
}
function getApiConfigPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'api-config.json');
}
function getWaveformCacheDir() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'waveform-cache');
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
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path_1.default.join(__dirname, 'preload.js'),
        },
        title: 'AnimeGate Translator',
    });
    if (process.env.VITE_DEV_SERVER_URL) {
        void win.loadURL(process.env.VITE_DEV_SERVER_URL);
    }
    else {
        void win.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
    electron_1.Menu.setApplicationMenu(null);
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
            await writeOpenState({ lastDir: path_1.default.dirname(filePath) });
            return { canceled: false, filePath, content };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Nie udalo sie odczytac pliku.';
            return { canceled: false, filePath, error: message };
        }
    });
    electron_1.ipcMain.handle('file:readSubtitle', async (_event, filePath) => {
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
        await writeOpenState({ lastDir: path_1.default.dirname(filePath) });
        return { canceled: false, filePath };
    });
    electron_1.ipcMain.handle('video:getWaveform', async (_event, args) => getWaveformForVideo(args));
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
        const timeoutMs = Math.max(1000, Math.min(45000, Number(args.timeoutMs ?? 15000)));
        const timeoutController = new AbortController();
        let timeoutReached = false;
        const timer = setTimeout(() => {
            timeoutReached = true;
            timeoutController.abort();
        }, timeoutMs);
        try {
            const response = await fetch(url, {
                method: args.method ?? 'GET',
                headers: args.headers ?? {},
                body: args.body,
                signal: timeoutController.signal,
            });
            const body = await response.text();
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
}
electron_1.app.whenReady().then(() => {
    setupFileIpc();
    createWindow();
    void (0, updater_1.initializeAutoUpdate)();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
