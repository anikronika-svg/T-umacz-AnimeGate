"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribeUpdaterStatus = subscribeUpdaterStatus;
exports.getUpdaterStatus = getUpdaterStatus;
exports.initializeAutoUpdate = initializeAutoUpdate;
exports.checkForUpdates = checkForUpdates;
exports.downloadUpdate = downloadUpdate;
exports.installUpdate = installUpdate;
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
let listeners = new Set();
let eventsRegistered = false;
let initialized = false;
let lastStatus = {
    phase: 'idle',
    message: 'Updater nie został jeszcze zainicjalizowany.',
    timestamp: new Date().toISOString(),
};
function formatBytesPerSecond(bytesPerSecond) {
    if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0)
        return '0 B/s';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let value = bytesPerSecond;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
function logUpdater(status) {
    console.info(`[Updater][${status.timestamp}][${status.phase}] ${status.message}`);
}
function logUpdaterError(error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return pushStatus({
        phase: 'error',
        message: `Błąd updatera: ${message}`,
        error: message,
    });
}
function pushStatus(partial) {
    const status = {
        ...partial,
        timestamp: new Date().toISOString(),
    };
    lastStatus = status;
    logUpdater(status);
    listeners.forEach(listener => {
        try {
            listener(status);
        }
        catch (error) {
            console.error('[Updater] Listener failure:', error);
        }
    });
    return status;
}
function subscribeUpdaterStatus(listener) {
    listeners.add(listener);
    listener(lastStatus);
    return () => {
        listeners.delete(listener);
    };
}
function getUpdaterStatus() {
    return lastStatus;
}
function registerUpdaterEvents() {
    if (eventsRegistered)
        return;
    eventsRegistered = true;
    electron_updater_1.autoUpdater.on('checking-for-update', () => {
        pushStatus({
            phase: 'checking-for-update',
            message: 'Sprawdzam dostępność nowej wersji.',
        });
    });
    electron_updater_1.autoUpdater.on('update-available', info => {
        pushStatus({
            phase: 'update-available',
            message: `Dostępna nowa wersja: ${info.version}.`,
            version: info.version,
        });
    });
    electron_updater_1.autoUpdater.on('update-not-available', info => {
        pushStatus({
            phase: 'update-not-available',
            message: `Brak nowszej wersji. Aktualna: ${info.version}.`,
            version: info.version,
        });
    });
    electron_updater_1.autoUpdater.on('error', error => {
        logUpdaterError(error);
    });
    electron_updater_1.autoUpdater.on('download-progress', (progress) => {
        pushStatus({
            phase: 'download-progress',
            message: `Pobieranie aktualizacji: ${progress.percent.toFixed(1)}% (${formatBytesPerSecond(progress.bytesPerSecond)}).`,
            percent: progress.percent,
            bytesPerSecond: progress.bytesPerSecond,
            transferred: progress.transferred,
            total: progress.total,
        });
    });
    electron_updater_1.autoUpdater.on('update-downloaded', info => {
        pushStatus({
            phase: 'update-downloaded',
            message: `Aktualizacja ${info.version} została pobrana i czeka na instalację.`,
            version: info.version,
        });
    });
}
async function initializeAutoUpdate() {
    if (initialized)
        return;
    initialized = true;
    registerUpdaterEvents();
    if (!electron_1.app.isPackaged) {
        pushStatus({
            phase: 'idle',
            message: 'Auto-update wyłączony w trybie deweloperskim (app.isPackaged=false).',
        });
        return;
    }
    electron_updater_1.autoUpdater.autoDownload = false;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.allowPrerelease = false;
    await checkForUpdates();
}
async function checkForUpdates() {
    if (!electron_1.app.isPackaged) {
        return pushStatus({
            phase: 'idle',
            message: 'Sprawdzanie aktualizacji jest dostępne tylko w aplikacji spakowanej.',
        });
    }
    try {
        const result = await electron_updater_1.autoUpdater.checkForUpdates();
        if (!result) {
            return pushStatus({
                phase: 'update-not-available',
                message: 'Brak informacji o nowej wersji (provider zwrócił pusty wynik).',
            });
        }
        return lastStatus;
    }
    catch (error) {
        return logUpdaterError(error);
    }
}
async function downloadUpdate() {
    if (!electron_1.app.isPackaged) {
        return pushStatus({
            phase: 'idle',
            message: 'Pobieranie aktualizacji jest dostępne tylko w aplikacji spakowanej.',
        });
    }
    try {
        pushStatus({
            phase: 'download-started',
            message: 'Rozpoczynam pobieranie aktualizacji.',
        });
        await electron_updater_1.autoUpdater.downloadUpdate();
        return lastStatus;
    }
    catch (error) {
        return logUpdaterError(error);
    }
}
function installUpdate() {
    if (!electron_1.app.isPackaged) {
        return pushStatus({
            phase: 'idle',
            message: 'Instalacja aktualizacji jest dostępna tylko w aplikacji spakowanej.',
        });
    }
    if (lastStatus.phase !== 'update-downloaded') {
        return pushStatus({
            phase: 'error',
            message: 'Brak pobranej aktualizacji do instalacji.',
            error: 'update-not-downloaded',
        });
    }
    pushStatus({
        phase: 'installing',
        message: 'Zamykam aplikację i uruchamiam instalację aktualizacji.',
        version: lastStatus.version,
    });
    electron_updater_1.autoUpdater.quitAndInstall();
    return lastStatus;
}
