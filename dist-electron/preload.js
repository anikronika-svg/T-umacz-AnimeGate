"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    openSubtitleFile: (args) => electron_1.ipcRenderer.invoke('file:openSubtitle', args),
    readSubtitleFile: (filePath) => electron_1.ipcRenderer.invoke('file:readSubtitle', filePath),
    saveSubtitleFile: (args) => electron_1.ipcRenderer.invoke('file:saveSubtitle', args),
    openVideoFile: (args) => electron_1.ipcRenderer.invoke('file:openVideo', args),
    getVideoWaveform: (args) => electron_1.ipcRenderer.invoke('video:getWaveform', args),
    getApiConfig: () => electron_1.ipcRenderer.invoke('api:getConfig'),
    saveApiConfig: (config) => electron_1.ipcRenderer.invoke('api:saveConfig', config),
    apiRequest: (args) => electron_1.ipcRenderer.invoke('api:request', args),
    getUpdaterStatus: () => electron_1.ipcRenderer.invoke('updater:getStatus'),
    checkForUpdates: () => electron_1.ipcRenderer.invoke('updater:checkForUpdates'),
    downloadUpdate: () => electron_1.ipcRenderer.invoke('updater:downloadUpdate'),
    installUpdate: () => electron_1.ipcRenderer.invoke('updater:installUpdate'),
    getAppVersion: () => electron_1.ipcRenderer.invoke('app:getVersion'),
    onUpdaterStatus: (callback) => {
        const listener = (_event, status) => {
            callback(status);
        };
        electron_1.ipcRenderer.on('updater:status', listener);
        return () => {
            electron_1.ipcRenderer.removeListener('updater:status', listener);
        };
    },
    pickProjectDirectory: (args) => electron_1.ipcRenderer.invoke('project:pickDirectory', args),
    pickProjectFile: (args) => electron_1.ipcRenderer.invoke('project:pickFile', args),
    createProject: (args) => electron_1.ipcRenderer.invoke('project:create', args),
    openProject: (projectPath) => electron_1.ipcRenderer.invoke('project:open', projectPath),
    saveProjectConfig: (args) => electron_1.ipcRenderer.invoke('project:saveConfig', args),
    readProjectTextFile: (args) => electron_1.ipcRenderer.invoke('project:readTextFile', args),
    writeProjectTextFile: (args) => electron_1.ipcRenderer.invoke('project:writeTextFile', args),
    listAssFiles: (args) => electron_1.ipcRenderer.invoke('project:listAssFiles', args),
    readUserDataTextFile: (args) => electron_1.ipcRenderer.invoke('app:readUserDataFile', args),
    writeUserDataTextFile: (args) => electron_1.ipcRenderer.invoke('app:writeUserDataFile', args),
    openDetachedPreviewWindow: () => electron_1.ipcRenderer.invoke('preview:openWindow'),
    closeDetachedPreviewWindow: () => electron_1.ipcRenderer.invoke('preview:closeWindow'),
    updateDetachedPreviewState: (state) => electron_1.ipcRenderer.invoke('preview:updateState', state),
    getDetachedPreviewState: () => electron_1.ipcRenderer.invoke('preview:getState'),
    requestDetachedPreviewTogglePlayback: () => electron_1.ipcRenderer.invoke('preview:togglePlayback'),
    signalRendererReady: () => {
        electron_1.ipcRenderer.send('app:renderer-ready');
    },
    onDetachedPreviewState: (callback) => {
        const listener = (_event, state) => {
            callback(state);
        };
        electron_1.ipcRenderer.on('preview:state', listener);
        return () => {
            electron_1.ipcRenderer.removeListener('preview:state', listener);
        };
    },
    onDetachedPreviewCommand: (callback) => {
        const listener = (_event, payload) => {
            callback(payload);
        };
        electron_1.ipcRenderer.on('preview:command', listener);
        return () => {
            electron_1.ipcRenderer.removeListener('preview:command', listener);
        };
    },
};
electron_1.contextBridge.exposeInMainWorld('electronAPI', api);
electron_1.ipcRenderer.send('app:preload-ready', { apiKeys: Object.keys(api) });
