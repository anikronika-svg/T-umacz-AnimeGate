import { promises as fs } from 'fs'
import path from 'path'

export const PROJECT_CONFIG_FILE = 'animegate-project.json'
export const PROJECT_SCHEMA_VERSION = 1

export interface DiskProjectCharacterProfile {
  archetype: string
  speakingTraits: string
  characterNote: string
  personalitySummary?: string
  anilistDescription: string
  mannerOfAddress: string
  politenessLevel: string
  vocabularyType: string
  temperament: string
}

export interface DiskProjectCharacter {
  id: number
  name: string
  anilistCharacterId?: number | null
  anilistRole?: string
  gender: string
  avatarColor: string
  style: string | null
  profile: DiskProjectCharacterProfile
}

export interface DiskProjectConfigV1 {
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

interface CreateProjectArgs {
  title: string
  projectId: string
  parentDir: string
  initialConfig: Omit<DiskProjectConfigV1, 'projectDir' | 'configPath' | 'createdAt' | 'updatedAt'>
}

export interface ProjectOpenResult {
  projectDir: string
  configPath: string
  config: DiskProjectConfigV1
}

function sanitizePathPart(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80)
}

function normalizeConfig(config: DiskProjectConfigV1): DiskProjectConfigV1 {
  const now = new Date().toISOString()
  return {
    ...config,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    updatedAt: config.updatedAt || now,
    createdAt: config.createdAt || now,
    anilist: {
      id: Number.isFinite(config.anilist?.id) ? config.anilist.id : null,
      title: config.anilist?.title?.trim() || '',
    },
    translationPreferences: {
      sourceLang: config.translationPreferences?.sourceLang || 'en',
      targetLang: config.translationPreferences?.targetLang || 'pl',
      preferredModelId: config.translationPreferences?.preferredModelId || 'deepl:deepl-default',
    },
    characterWorkflow: {
      characters: Array.isArray(config.characterWorkflow?.characters) ? config.characterWorkflow.characters : [],
      lineCharacterAssignments: Array.isArray(config.characterWorkflow?.lineCharacterAssignments) ? config.characterWorkflow.lineCharacterAssignments : [],
    },
    translationStyleSettings: {
      projectId: config.translationStyleSettings?.projectId || config.projectId,
      globalStyle: config.translationStyleSettings?.globalStyle || 'neutral',
      characters: Array.isArray(config.translationStyleSettings?.characters) ? config.translationStyleSettings.characters : [],
      updatedAt: config.translationStyleSettings?.updatedAt || now,
    },
  }
}

function assertProjectConfig(raw: unknown): DiskProjectConfigV1 {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Nieprawidłowy plik projektu (brak obiektu JSON).')
  }
  const config = raw as Partial<DiskProjectConfigV1>
  if (config.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(`Nieobsługiwana wersja schematu projektu: ${String(config.schemaVersion)}.`)
  }
  if (!config.projectId || !config.title) {
    throw new Error('Nieprawidłowy plik projektu (brak projectId/title).')
  }
  return normalizeConfig(config as DiskProjectConfigV1)
}

export async function createProjectOnDisk(args: CreateProjectArgs): Promise<ProjectOpenResult> {
  const projectFolderName = sanitizePathPart(args.projectId || args.title || `project_${Date.now()}`)
  if (!projectFolderName) throw new Error('Nieprawidłowa nazwa projektu.')

  const projectDir = path.join(args.parentDir, projectFolderName)
  const configPath = path.join(projectDir, PROJECT_CONFIG_FILE)

  await fs.mkdir(projectDir, { recursive: true })
  try {
    await fs.access(configPath)
    throw new Error(`Projekt już istnieje: ${configPath}`)
  } catch {
    // Expected when file does not exist.
  }

  const now = new Date().toISOString()
  const config = normalizeConfig({
    ...args.initialConfig,
    projectDir,
    configPath,
    createdAt: now,
    updatedAt: now,
    schemaVersion: PROJECT_SCHEMA_VERSION,
  })
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  return { projectDir, configPath, config }
}

export async function openProjectFromDisk(projectDir: string): Promise<ProjectOpenResult> {
  const normalizedDir = projectDir.trim()
  if (!normalizedDir) throw new Error('Brak ścieżki folderu projektu.')
  const configPath = path.join(normalizedDir, PROJECT_CONFIG_FILE)
  const raw = await fs.readFile(configPath, 'utf-8')
  const parsed = JSON.parse(raw)
  const config = assertProjectConfig(parsed)
  return { projectDir: normalizedDir, configPath, config }
}

export async function saveProjectConfigOnDisk(projectDir: string, nextConfig: DiskProjectConfigV1): Promise<ProjectOpenResult> {
  const normalizedDir = projectDir.trim()
  if (!normalizedDir) throw new Error('Brak ścieżki folderu projektu do zapisu.')
  const configPath = path.join(normalizedDir, PROJECT_CONFIG_FILE)
  const normalized = normalizeConfig({
    ...nextConfig,
    projectDir: normalizedDir,
    configPath,
    updatedAt: new Date().toISOString(),
  })
  await fs.writeFile(configPath, JSON.stringify(normalized, null, 2), 'utf-8')
  return { projectDir: normalizedDir, configPath, config: normalized }
}
