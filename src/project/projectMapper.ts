import {
  createDefaultProfile,
  createProjectStyleSettings,
  type CharacterArchetypeId,
  type CharacterGender,
  type CharacterStyleAssignment,
  type ProjectTranslationStyleSettings,
  type TranslationStyleId,
} from '../translationStyle'
import {
  normalizeGlobalStyleProfile,
  type ProjectGlobalStyleProfile,
} from './characterProfileModel'

export const PROJECT_SCHEMA_VERSION = 1

export interface DiskProjectCharacterProfile {
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

export interface DiskProjectCharacter {
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
      speakerModeTag?: string
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
    speakerModeTag?: string
    lineKey?: string
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
    displayName: character.displayName,
    originalName: character.originalName,
    anilistCharacterId: character.anilistCharacterId ?? null,
    anilistRole: character.anilistRole,
    imageUrl: character.imageUrl ?? null,
    avatarPath: character.avatarPath ?? null,
    avatarUrl: character.avatarUrl ?? null,
    gender: character.gender,
    avatarColor: character.avatarColor,
    style: character.style,
    profile: {
      archetype: character.profile.archetype,
      characterTypeId: character.profile.characterTypeId,
      characterSubtypeId: character.profile.characterSubtypeId,
      characterUserNotes: character.profile.characterUserNotes,
      speakingTraits: character.profile.speakingTraits,
      characterNote: character.profile.characterNote,
      personalitySummary: character.profile.personalitySummary,
      anilistDescription: character.profile.anilistDescription,
      mannerOfAddress: character.profile.mannerOfAddress,
      politenessLevel: character.profile.politenessLevel,
      vocabularyType: character.profile.vocabularyType,
      temperament: character.profile.temperament,
      translationGender: character.profile.translationGender,
      speakingStyle: character.profile.speakingStyle,
      toneProfile: character.profile.toneProfile,
      personalityTraits: character.profile.personalityTraits,
      translationNotes: character.profile.translationNotes,
      honorificPreference: character.profile.honorificPreference,
      formalityPreference: character.profile.formalityPreference,
      relationshipNotes: character.profile.relationshipNotes,
      customPromptHint: character.profile.customPromptHint,
      isUserEdited: character.profile.isUserEdited,
      createdAt: character.profile.createdAt,
      updatedAt: character.profile.updatedAt,
      sourceName: character.profile.sourceName,
      manualOverrides: character.profile.manualOverrides,
    },
  }
}

function mapDiskToCharacter(character: DiskProjectCharacter, fallbackId: number): CharacterStyleAssignment {
  const defaults = createDefaultProfile()
  const mergedProfile = {
    ...defaults,
    archetype: (character.profile?.archetype as CharacterArchetypeId) || defaults.archetype,
    characterTypeId: character.profile?.characterTypeId || defaults.characterTypeId,
    characterSubtypeId: character.profile?.characterSubtypeId || defaults.characterSubtypeId,
    characterUserNotes: character.profile?.characterUserNotes || defaults.characterUserNotes,
    speakingTraits: character.profile?.speakingTraits || defaults.speakingTraits,
    characterNote: character.profile?.characterNote || defaults.characterNote,
    personalitySummary: character.profile?.personalitySummary || defaults.personalitySummary,
    anilistDescription: character.profile?.anilistDescription || defaults.anilistDescription,
    mannerOfAddress: character.profile?.mannerOfAddress || defaults.mannerOfAddress,
    politenessLevel: character.profile?.politenessLevel || defaults.politenessLevel,
    vocabularyType: character.profile?.vocabularyType || defaults.vocabularyType,
    temperament: character.profile?.temperament || defaults.temperament,
    translationGender: character.profile?.translationGender || defaults.translationGender,
    speakingStyle: character.profile?.speakingStyle || defaults.speakingStyle,
    toneProfile: character.profile?.toneProfile || defaults.toneProfile,
    personalityTraits: Array.isArray(character.profile?.personalityTraits)
      ? character.profile.personalityTraits.filter(Boolean)
      : defaults.personalityTraits,
    translationNotes: character.profile?.translationNotes || defaults.translationNotes,
    honorificPreference: character.profile?.honorificPreference || defaults.honorificPreference,
    formalityPreference: character.profile?.formalityPreference || defaults.formalityPreference,
    relationshipNotes: character.profile?.relationshipNotes || defaults.relationshipNotes,
    customPromptHint: character.profile?.customPromptHint || defaults.customPromptHint,
    isUserEdited: Boolean(character.profile?.isUserEdited),
    createdAt: character.profile?.createdAt || defaults.createdAt,
    updatedAt: character.profile?.updatedAt || character.profile?.createdAt || defaults.updatedAt,
    sourceName: character.profile?.sourceName || defaults.sourceName,
    manualOverrides: character.profile?.manualOverrides || defaults.manualOverrides,
  }
  return {
    id: Number.isFinite(character.id) ? character.id : fallbackId,
    name: character.name || `Character_${fallbackId}`,
    displayName: character.displayName || character.name || `Character_${fallbackId}`,
    originalName: character.originalName || '',
    anilistCharacterId: character.anilistCharacterId ?? null,
    anilistRole: character.anilistRole,
    imageUrl: character.imageUrl ?? null,
    avatarPath: character.avatarPath ?? null,
    avatarUrl: character.avatarUrl ?? null,
    gender: (character.gender as CharacterGender) || 'Unknown',
    avatarColor: character.avatarColor || '#4f8ad6',
    style: (character.style as TranslationStyleId | null) ?? null,
    profile: mergedProfile,
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
      globalStyleProfile: input.styleSettings.globalStyleProfile,
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

  const fallbackStyleSettings = createProjectStyleSettings(projectId, [])
  const globalStyle = (config.translationStyleSettings?.globalStyle as TranslationStyleId) || 'neutral'
  const globalStyleProfile: ProjectGlobalStyleProfile = normalizeGlobalStyleProfile(
    config.translationStyleSettings?.globalStyleProfile,
    globalStyle,
  )

  const styleSettings: ProjectTranslationStyleSettings = {
    projectId,
    globalStyle,
    globalStyleProfile: globalStyleProfile.styleId
      ? globalStyleProfile
      : fallbackStyleSettings.globalStyleProfile,
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
