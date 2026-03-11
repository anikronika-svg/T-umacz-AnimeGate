import {
  createDefaultProfile,
  type CharacterArchetypeId,
  type CharacterGender,
  type CharacterStyleAssignment,
  type ProjectTranslationStyleSettings,
  type TranslationStyleId,
} from '../translationStyle'

export const PROJECT_SCHEMA_VERSION = 1

export interface DiskProjectCharacterProfile {
  archetype: string
  speakingTraits: string
  characterNote: string
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
    }>
  }
  translationStyleSettings: {
    projectId: string
    globalStyle: string
    characters: DiskProjectCharacter[]
    updatedAt: string
  }
}

export interface BuildProjectConfigInput {
  projectDir: string
  configPath: string
  projectId: string
  title: string
  anilistId: number | null
  sourceLang: string
  targetLang: string
  preferredModelId: string
  styleSettings: ProjectTranslationStyleSettings
  lineCharacterAssignments: Array<{
    lineId: number
    rawCharacter: string
    resolvedCharacterName: string
  }>
}

export interface HydratedProjectState {
  projectId: string
  title: string
  anilistId: number | null
  sourceLang: string
  targetLang: string
  preferredModelId: string
  styleSettings: ProjectTranslationStyleSettings
}

function mapCharacterToDisk(character: CharacterStyleAssignment): DiskProjectCharacter {
  return {
    id: character.id,
    name: character.name,
    anilistCharacterId: character.anilistCharacterId ?? null,
    anilistRole: character.anilistRole,
    gender: character.gender,
    avatarColor: character.avatarColor,
    style: character.style,
    profile: {
      archetype: character.profile.archetype,
      speakingTraits: character.profile.speakingTraits,
      characterNote: character.profile.characterNote,
      anilistDescription: character.profile.anilistDescription,
      mannerOfAddress: character.profile.mannerOfAddress,
      politenessLevel: character.profile.politenessLevel,
      vocabularyType: character.profile.vocabularyType,
      temperament: character.profile.temperament,
    },
  }
}

function mapDiskToCharacter(character: DiskProjectCharacter, fallbackId: number): CharacterStyleAssignment {
  const defaults = createDefaultProfile()
  return {
    id: Number.isFinite(character.id) ? character.id : fallbackId,
    name: character.name || `Character_${fallbackId}`,
    anilistCharacterId: character.anilistCharacterId ?? null,
    anilistRole: character.anilistRole,
    gender: (character.gender as CharacterGender) || 'Unknown',
    avatarColor: character.avatarColor || '#4f8ad6',
    style: (character.style as TranslationStyleId | null) ?? null,
    profile: {
      archetype: (character.profile?.archetype as CharacterArchetypeId) || defaults.archetype,
      speakingTraits: character.profile?.speakingTraits || defaults.speakingTraits,
      characterNote: character.profile?.characterNote || defaults.characterNote,
      anilistDescription: character.profile?.anilistDescription || defaults.anilistDescription,
      mannerOfAddress: character.profile?.mannerOfAddress || defaults.mannerOfAddress,
      politenessLevel: character.profile?.politenessLevel || defaults.politenessLevel,
      vocabularyType: character.profile?.vocabularyType || defaults.vocabularyType,
      temperament: character.profile?.temperament || defaults.temperament,
    },
  }
}

export function buildDiskProjectConfig(input: BuildProjectConfigInput): DiskProjectConfigV1 {
  const now = new Date().toISOString()
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: input.projectId,
    title: input.title,
    projectDir: input.projectDir,
    configPath: input.configPath,
    createdAt: now,
    updatedAt: now,
    anilist: {
      id: Number.isFinite(input.anilistId) ? input.anilistId : null,
      title: input.title,
    },
    translationPreferences: {
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      preferredModelId: input.preferredModelId,
    },
    characterWorkflow: {
      characters: input.styleSettings.characters.map(mapCharacterToDisk),
      lineCharacterAssignments: input.lineCharacterAssignments,
    },
    translationStyleSettings: {
      projectId: input.projectId,
      globalStyle: input.styleSettings.globalStyle,
      characters: input.styleSettings.characters.map(mapCharacterToDisk),
      updatedAt: now,
    },
  }
}

export function hydrateStateFromDiskProject(config: DiskProjectConfigV1): HydratedProjectState {
  const projectId = config.projectId
  const title = config.title?.trim() || projectId
  const anilistId = Number.isFinite(config.anilist?.id) ? config.anilist.id : null
  const sourceLang = config.translationPreferences?.sourceLang || 'en'
  const targetLang = config.translationPreferences?.targetLang || 'pl'
  const preferredModelId = config.translationPreferences?.preferredModelId || 'deepl:deepl-default'

  const styleCharacters = Array.isArray(config.translationStyleSettings?.characters) && config.translationStyleSettings.characters.length > 0
    ? config.translationStyleSettings.characters
    : Array.isArray(config.characterWorkflow?.characters)
      ? config.characterWorkflow.characters
      : []

  const styleSettings: ProjectTranslationStyleSettings = {
    projectId,
    globalStyle: (config.translationStyleSettings?.globalStyle as TranslationStyleId) || 'neutral',
    characters: styleCharacters.map((item, idx) => mapDiskToCharacter(item, idx + 1)),
    updatedAt: config.translationStyleSettings?.updatedAt || new Date().toISOString(),
  }

  return {
    projectId,
    title,
    anilistId,
    sourceLang,
    targetLang,
    preferredModelId,
    styleSettings,
  }
}
