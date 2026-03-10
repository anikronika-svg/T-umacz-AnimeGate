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
})
