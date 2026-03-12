import { contextBridge, ipcRenderer } from 'electron'

interface OpenSubtitleArgs {
  projectDir?: string
}

interface OpenSubtitleResult {
  canceled: boolean
  filePath?: string
  content?: string
  error?: string
}

interface ReadSubtitleResult {
  filePath: string
  content: string
}

interface SaveSubtitleArgs {
  sourcePath: string
  content: string
}

interface SaveSubtitleResult {
  savedPath: string
}

interface OpenVideoArgs {
  projectDir?: string
}

interface OpenVideoResult {
  canceled: boolean
  filePath?: string
  error?: string
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

interface ApiRequestArgs {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

interface ApiRequestResult {
  ok: boolean
  status: number
  statusText: string
  body: string
  headers?: Record<string, string>
  error?: {
    code: string
    message: string
    details?: string
  }
}

interface DiskProjectCharacterProfile {
  archetype: string
  characterTypeId?: string
  characterSubtypeId?: string
  characterUserNotes?: string
  speakingTraits: string
  characterNote: string
  personalitySummary?: string
  anilistDescription: string
  mannerOfAddress: string
  politenessLevel: string
  vocabularyType: string
  temperament: string
  translationGender?: string
  speakingStyle?: string
  toneProfile?: string
  personalityTraits?: string[]
  translationNotes?: string
  honorificPreference?: string
  formalityPreference?: string
  relationshipNotes?: string
  customPromptHint?: string
  isUserEdited?: boolean
  createdAt?: string
  updatedAt?: string
  sourceName?: string
  manualOverrides?: Record<string, true>
}

interface DiskProjectCharacter {
  id: number
  name: string
  displayName?: string
  originalName?: string
  anilistCharacterId?: number | null
  anilistRole?: string
  imageUrl?: string | null
  avatarPath?: string | null
  avatarUrl?: string | null
  gender: string
  avatarColor: string
  style: string | null
  profile: DiskProjectCharacterProfile
}

interface DiskProjectConfigV1 {
  schemaVersion: number
  projectId: string
  title: string
  projectDir: string
  configPath: string
  createdAt: string
  updatedAt: string
  anilist: {
    id: number | null
    title: string
  }
  translationPreferences: {
    sourceLang: string
    targetLang: string
    preferredModelId: string
  }
  characterWorkflow: {
    characters: DiskProjectCharacter[]
    lineCharacterAssignments: Array<{
      lineId: number
      rawCharacter: string
      resolvedCharacterName: string
      lineKey?: string
    }>
  }
  translationStyleSettings: {
    projectId: string
    globalStyle: string
    globalStyleProfile?: {
      styleId: string
      tone?: string
      register?: string
      naturalness?: string
      notes?: string
    }
    characters: DiskProjectCharacter[]
    updatedAt: string
  }
}

interface UpdaterStatusPayload {
  phase: 'idle' | 'checking-for-update' | 'update-available' | 'update-not-available' | 'download-started' | 'download-progress' | 'update-downloaded' | 'installing' | 'error'
  message: string
  timestamp: string
  version?: string
  percent?: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
  error?: string
}

interface DetachedPreviewState {
  videoSrc: string | null
  currentTime: number
  playbackRate: number
  paused: boolean
  sourceText: string
  targetText: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  openSubtitleFile: (args?: OpenSubtitleArgs): Promise<OpenSubtitleResult> =>
    ipcRenderer.invoke('file:openSubtitle', args),
  readSubtitleFile: (filePath: string): Promise<ReadSubtitleResult> =>
    ipcRenderer.invoke('file:readSubtitle', filePath),
  saveSubtitleFile: (args: SaveSubtitleArgs): Promise<SaveSubtitleResult> =>
    ipcRenderer.invoke('file:saveSubtitle', args),
  openVideoFile: (args?: OpenVideoArgs): Promise<OpenVideoResult> =>
    ipcRenderer.invoke('file:openVideo', args),
  getVideoWaveform: (args: VideoWaveformArgs): Promise<VideoWaveformResult> =>
    ipcRenderer.invoke('video:getWaveform', args),
  getApiConfig: (): Promise<Record<string, string>> =>
    ipcRenderer.invoke('api:getConfig'),
  saveApiConfig: (config: Record<string, string>): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('api:saveConfig', config),
  apiRequest: (args: ApiRequestArgs): Promise<ApiRequestResult> =>
    ipcRenderer.invoke('api:request', args),
  getUpdaterStatus: (): Promise<UpdaterStatusPayload> =>
    ipcRenderer.invoke('updater:getStatus'),
  checkForUpdates: (): Promise<UpdaterStatusPayload> =>
    ipcRenderer.invoke('updater:checkForUpdates'),
  downloadUpdate: (): Promise<UpdaterStatusPayload> =>
    ipcRenderer.invoke('updater:downloadUpdate'),
  installUpdate: (): Promise<UpdaterStatusPayload> =>
    ipcRenderer.invoke('updater:installUpdate'),
  onUpdaterStatus: (callback: (status: UpdaterStatusPayload) => void): (() => void) => {
    const listener = (_event: unknown, status: UpdaterStatusPayload): void => {
      callback(status)
    }
    ipcRenderer.on('updater:status', listener)
    return () => {
      ipcRenderer.removeListener('updater:status', listener)
    }
  },
  pickProjectDirectory: (args?: { title?: string; defaultPath?: string }): Promise<{ canceled: boolean; directoryPath?: string }> =>
    ipcRenderer.invoke('project:pickDirectory', args),
  pickProjectFile: (args?: { title?: string; defaultPath?: string }): Promise<{ canceled: boolean; filePath?: string }> =>
    ipcRenderer.invoke('project:pickFile', args),
  createProject: (args: {
    title: string
    projectId: string
    parentDir: string
    initialConfig: Omit<DiskProjectConfigV1, 'projectDir' | 'configPath' | 'createdAt' | 'updatedAt'>
  }): Promise<{ ok: boolean; projectDir: string; configPath: string; config: DiskProjectConfigV1 }> =>
    ipcRenderer.invoke('project:create', args),
  openProject: (projectPath: string): Promise<{ ok: boolean; projectDir: string; configPath: string; config: DiskProjectConfigV1 }> =>
    ipcRenderer.invoke('project:open', projectPath),
  saveProjectConfig: (args: { projectDir: string; config: DiskProjectConfigV1 }): Promise<{ ok: boolean; projectDir: string; configPath: string; config: DiskProjectConfigV1 }> =>
    ipcRenderer.invoke('project:saveConfig', args),
  openDetachedPreviewWindow: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('preview:openWindow'),
  closeDetachedPreviewWindow: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('preview:closeWindow'),
  updateDetachedPreviewState: (state: Partial<DetachedPreviewState>): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('preview:updateState', state),
  getDetachedPreviewState: (): Promise<DetachedPreviewState> =>
    ipcRenderer.invoke('preview:getState'),
  requestDetachedPreviewTogglePlayback: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('preview:togglePlayback'),
  onDetachedPreviewState: (callback: (state: DetachedPreviewState) => void): (() => void) => {
    const listener = (_event: unknown, state: DetachedPreviewState): void => {
      callback(state)
    }
    ipcRenderer.on('preview:state', listener)
    return () => {
      ipcRenderer.removeListener('preview:state', listener)
    }
  },
  onDetachedPreviewCommand: (callback: (payload: { type: 'toggle-playback' }) => void): (() => void) => {
    const listener = (_event: unknown, payload: { type: 'toggle-playback' }): void => {
      callback(payload)
    }
    ipcRenderer.on('preview:command', listener)
    return () => {
      ipcRenderer.removeListener('preview:command', listener)
    }
  },
})
