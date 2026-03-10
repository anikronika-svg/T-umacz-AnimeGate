export {}

declare global {
  interface Window {
    electronAPI?: {
      openSubtitleFile: (args?: { projectDir?: string }) => Promise<{
        canceled: boolean
        filePath?: string
        content?: string
        error?: string
      }>
      readSubtitleFile: (filePath: string) => Promise<{
        filePath: string
        content: string
      }>
      saveSubtitleFile: (args: { sourcePath: string; content: string }) => Promise<{
        savedPath: string
      }>
      openVideoFile: (args?: { projectDir?: string }) => Promise<{
        canceled: boolean
        filePath?: string
        error?: string
      }>
      getVideoWaveform: (args: { filePath: string; forceRefresh?: boolean }) => Promise<{
        ok: boolean
        filePath: string
        sampleRate: number
        peaks: number[]
        duration: number
        fromCache: boolean
        ffmpegSource?: 'bundled' | 'system'
        ffmpegPath?: string
        error?: string
      }>
      getApiConfig: () => Promise<Record<string, string>>
      saveApiConfig: (config: Record<string, string>) => Promise<{ ok: boolean }>
      apiRequest: (args: {
        url: string
        method?: string
        headers?: Record<string, string>
        body?: string
        timeoutMs?: number
      }) => Promise<{
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
      }>
    }
  }
}
