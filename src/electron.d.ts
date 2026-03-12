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
      getUpdaterStatus: () => Promise<{
        phase: 'idle' | 'checking-for-update' | 'update-available' | 'update-not-available' | 'download-started' | 'download-progress' | 'update-downloaded' | 'installing' | 'error'
        message: string
        timestamp: string
        version?: string
        percent?: number
        bytesPerSecond?: number
        transferred?: number
        total?: number
        error?: string
      }>
      checkForUpdates: () => Promise<{
        phase: 'idle' | 'checking-for-update' | 'update-available' | 'update-not-available' | 'download-started' | 'download-progress' | 'update-downloaded' | 'installing' | 'error'
        message: string
        timestamp: string
        version?: string
        percent?: number
        bytesPerSecond?: number
        transferred?: number
        total?: number
        error?: string
      }>
      downloadUpdate: () => Promise<{
        phase: 'idle' | 'checking-for-update' | 'update-available' | 'update-not-available' | 'download-started' | 'download-progress' | 'update-downloaded' | 'installing' | 'error'
        message: string
        timestamp: string
        version?: string
        percent?: number
        bytesPerSecond?: number
        transferred?: number
        total?: number
        error?: string
      }>
      installUpdate: () => Promise<{
        phase: 'idle' | 'checking-for-update' | 'update-available' | 'update-not-available' | 'download-started' | 'download-progress' | 'update-downloaded' | 'installing' | 'error'
        message: string
        timestamp: string
        version?: string
        percent?: number
        bytesPerSecond?: number
        transferred?: number
        total?: number
        error?: string
      }>
      onUpdaterStatus: (callback: (status: {
        phase: 'idle' | 'checking-for-update' | 'update-available' | 'update-not-available' | 'download-started' | 'download-progress' | 'update-downloaded' | 'installing' | 'error'
        message: string
        timestamp: string
        version?: string
        percent?: number
        bytesPerSecond?: number
        transferred?: number
        total?: number
        error?: string
      }) => void) => (() => void)
      pickProjectDirectory: (args?: { title?: string; defaultPath?: string }) => Promise<{
        canceled: boolean
        directoryPath?: string
      }>
      pickProjectFile: (args?: { title?: string; defaultPath?: string }) => Promise<{
        canceled: boolean
        filePath?: string
      }>
      createProject: (args: {
        title: string
        projectId: string
        parentDir: string
        initialConfig: {
          schemaVersion: number
          projectId: string
          title: string
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
            characters: Array<{
              id: number
              name: string
              anilistCharacterId?: number | null
              anilistRole?: string
              imageUrl?: string | null
              gender: string
              avatarColor: string
              style: string | null
              profile: {
                archetype: string
                characterTypeId?: string
                characterSubtypeId?: string
                characterUserNotes?: string
                speakingTraits: string
                characterNote: string
                anilistDescription: string
                mannerOfAddress: string
                politenessLevel: string
                vocabularyType: string
                temperament: string
              }
            }>
            lineCharacterAssignments: Array<{
              lineId: number
              rawCharacter: string
              resolvedCharacterName: string
            }>
          }
          translationStyleSettings: {
            projectId: string
            globalStyle: string
            characters: Array<{
              id: number
              name: string
              anilistCharacterId?: number | null
              anilistRole?: string
              imageUrl?: string | null
              gender: string
              avatarColor: string
              style: string | null
              profile: {
                archetype: string
                characterTypeId?: string
                characterSubtypeId?: string
                characterUserNotes?: string
                speakingTraits: string
                characterNote: string
                anilistDescription: string
                mannerOfAddress: string
                politenessLevel: string
                vocabularyType: string
                temperament: string
              }
            }>
            updatedAt: string
          }
        }
      }) => Promise<{
        ok: boolean
        projectDir: string
        configPath: string
        config: {
          schemaVersion: number
          projectId: string
          title: string
          projectDir: string
          configPath: string
          createdAt: string
          updatedAt: string
          anilist: { id: number | null; title: string }
          translationPreferences: { sourceLang: string; targetLang: string; preferredModelId: string }
          characterWorkflow: {
            characters: Array<{
              id: number
              name: string
              anilistCharacterId?: number | null
              anilistRole?: string
              imageUrl?: string | null
              gender: string
              avatarColor: string
              style: string | null
              profile: {
                archetype: string
                characterTypeId?: string
                characterSubtypeId?: string
                characterUserNotes?: string
                speakingTraits: string
                characterNote: string
                anilistDescription: string
                mannerOfAddress: string
                politenessLevel: string
                vocabularyType: string
                temperament: string
              }
            }>
            lineCharacterAssignments: Array<{ lineId: number; rawCharacter: string; resolvedCharacterName: string }>
          }
          translationStyleSettings: {
            projectId: string
            globalStyle: string
            characters: Array<{
              id: number
              name: string
              anilistCharacterId?: number | null
              anilistRole?: string
              imageUrl?: string | null
              gender: string
              avatarColor: string
              style: string | null
              profile: {
                archetype: string
                characterTypeId?: string
                characterSubtypeId?: string
                characterUserNotes?: string
                speakingTraits: string
                characterNote: string
                anilistDescription: string
                mannerOfAddress: string
                politenessLevel: string
                vocabularyType: string
                temperament: string
              }
            }>
            updatedAt: string
          }
        }
      }>
      openProject: (projectPath: string) => Promise<{
        ok: boolean
        projectDir: string
        configPath: string
        config: {
          schemaVersion: number
          projectId: string
          title: string
          projectDir: string
          configPath: string
          createdAt: string
          updatedAt: string
          anilist: { id: number | null; title: string }
          translationPreferences: { sourceLang: string; targetLang: string; preferredModelId: string }
          characterWorkflow: {
            characters: Array<{
              id: number
              name: string
              anilistCharacterId?: number | null
              anilistRole?: string
              imageUrl?: string | null
              gender: string
              avatarColor: string
              style: string | null
              profile: {
                archetype: string
                characterTypeId?: string
                characterSubtypeId?: string
                characterUserNotes?: string
                speakingTraits: string
                characterNote: string
                anilistDescription: string
                mannerOfAddress: string
                politenessLevel: string
                vocabularyType: string
                temperament: string
              }
            }>
            lineCharacterAssignments: Array<{ lineId: number; rawCharacter: string; resolvedCharacterName: string }>
          }
          translationStyleSettings: {
            projectId: string
            globalStyle: string
            characters: Array<{
              id: number
              name: string
              anilistCharacterId?: number | null
              anilistRole?: string
              imageUrl?: string | null
              gender: string
              avatarColor: string
              style: string | null
              profile: {
                archetype: string
                characterTypeId?: string
                characterSubtypeId?: string
                characterUserNotes?: string
                speakingTraits: string
                characterNote: string
                anilistDescription: string
                mannerOfAddress: string
                politenessLevel: string
                vocabularyType: string
                temperament: string
              }
            }>
            updatedAt: string
          }
        }
      }>
      saveProjectConfig: (args: {
        projectDir: string
        config: {
          schemaVersion: number
          projectId: string
          title: string
          projectDir: string
          configPath: string
          createdAt: string
          updatedAt: string
          anilist: { id: number | null; title: string }
          translationPreferences: { sourceLang: string; targetLang: string; preferredModelId: string }
          characterWorkflow: {
            characters: Array<{
              id: number
              name: string
              anilistCharacterId?: number | null
              anilistRole?: string
              imageUrl?: string | null
              gender: string
              avatarColor: string
              style: string | null
              profile: {
                archetype: string
                characterTypeId?: string
                characterSubtypeId?: string
                characterUserNotes?: string
                speakingTraits: string
                characterNote: string
                anilistDescription: string
                mannerOfAddress: string
                politenessLevel: string
                vocabularyType: string
                temperament: string
              }
            }>
            lineCharacterAssignments: Array<{ lineId: number; rawCharacter: string; resolvedCharacterName: string }>
          }
          translationStyleSettings: {
            projectId: string
            globalStyle: string
            characters: Array<{
              id: number
              name: string
              anilistCharacterId?: number | null
              anilistRole?: string
              imageUrl?: string | null
              gender: string
              avatarColor: string
              style: string | null
              profile: {
                archetype: string
                characterTypeId?: string
                characterSubtypeId?: string
                characterUserNotes?: string
                speakingTraits: string
                characterNote: string
                anilistDescription: string
                mannerOfAddress: string
                politenessLevel: string
                vocabularyType: string
                temperament: string
              }
            }>
            updatedAt: string
          }
        }
      }) => Promise<{
        ok: boolean
        projectDir: string
        configPath: string
      }>
    }
  }
}



