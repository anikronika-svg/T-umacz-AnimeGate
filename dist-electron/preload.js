"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    openSubtitleFile: (args) => electron_1.ipcRenderer.invoke('file:openSubtitle', args),
    readSubtitleFile: (filePath) => electron_1.ipcRenderer.invoke('file:readSubtitle', filePath),
    saveSubtitleFile: (args) => electron_1.ipcRenderer.invoke('file:saveSubtitle', args),
    openVideoFile: (args) => electron_1.ipcRenderer.invoke('file:openVideo', args),
    getVideoWaveform: (args) => electron_1.ipcRenderer.invoke('video:getWaveform', args),
    getApiConfig: () => electron_1.ipcRenderer.invoke('api:getConfig'),
    saveApiConfig: (config) => electron_1.ipcRenderer.invoke('api:saveConfig', config),
    apiRequest: (args) => electron_1.ipcRenderer.invoke('api:request', args),
});
