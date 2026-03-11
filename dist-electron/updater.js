"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeAutoUpdate = initializeAutoUpdate;
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
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
function logUpdater(status, message) {
    const now = new Date().toISOString();
    console.info(`[Updater][${now}][${status}] ${message}`);
}
function logUpdaterError(error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    logUpdater('error', message);
}
function registerUpdaterEvents() {
    electron_updater_1.autoUpdater.on('checking-for-update', () => {
        logUpdater('checking-for-update', 'Sprawdzam dostępność nowej wersji.');
    });
    electron_updater_1.autoUpdater.on('update-available', info => {
        logUpdater('update-available', `Dostępna nowa wersja: ${info.version}. Rozpoczynam pobieranie.`);
    });
    electron_updater_1.autoUpdater.on('update-not-available', info => {
        logUpdater('update-not-available', `Brak nowszej wersji. Aktualna: ${info.version}.`);
    });
    electron_updater_1.autoUpdater.on('error', error => {
        logUpdaterError(error);
    });
    electron_updater_1.autoUpdater.on('download-progress', (progress) => {
        logUpdater('download-progress', `Pobieranie aktualizacji: ${progress.percent.toFixed(1)}% (${formatBytesPerSecond(progress.bytesPerSecond)}).`);
    });
    electron_updater_1.autoUpdater.on('update-downloaded', info => {
        logUpdater('update-downloaded', `Aktualizacja ${info.version} została pobrana i czeka na instalację.`);
    });
}
async function initializeAutoUpdate() {
    if (!electron_1.app.isPackaged) {
        logUpdater('disabled-dev', 'Auto-update wyłączony w trybie deweloperskim (app.isPackaged=false).');
        return;
    }
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.allowPrerelease = false;
    registerUpdaterEvents();
    try {
        const result = await electron_updater_1.autoUpdater.checkForUpdates();
        if (!result) {
            logUpdater('update-not-available', 'Brak informacji o nowej wersji (provider zwrócił pusty wynik).');
        }
    }
    catch (error) {
        logUpdaterError(error);
    }
}
