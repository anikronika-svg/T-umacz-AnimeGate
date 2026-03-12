export interface CharacterSpeechProfile {
  archetype: string
  characterTypeId: string
  characterSubtypeId: string
  characterUserNotes: string
  speakingTraits: string
  characterNote: string
  personalitySummary: string
  anilistDescription: string
  mannerOfAddress: string
  politenessLevel: string
  vocabularyType: string
  temperament: string
  translationGender: CharacterTranslationGender
  speakingStyle: CharacterSpeakingStyle
  toneProfile: string
  personalityTraits: string[]
  translationNotes: string
  honorificPreference: string
  formalityPreference: string
  relationshipNotes: string
  customPromptHint: string
  isUserEdited: boolean
  createdAt: string
  updatedAt: string
  sourceName: string
  manualOverrides: Partial<Record<CharacterSpeechProfileManualField, true>>
}

export interface ProjectGlobalStyleProfile {
  styleId: string
  tone: string
  register: string
  naturalness: string
  notes: string
}

export type CharacterTranslationGender = 'unknown' | 'masculine' | 'feminine' | 'neutral'

export type CharacterSpeakingStyle =
  | 'neutralny'
  | 'formalny'
  | 'nieformalny'
  | 'chlodny'
  | 'cieply'
  | 'agresywny'
  | 'delikatny'
  | 'dziecinny'
  | 'dumny'
  | 'sarkastyczny'

export type CharacterSpeechProfileManualField =
  | 'translationGender'
  | 'speakingStyle'
  | 'toneProfile'
  | 'personalityTraits'
  | 'translationNotes'
  | 'honorificPreference'
  | 'formalityPreference'
  | 'relationshipNotes'
  | 'customPromptHint'
  | 'speakingTraits'
  | 'characterNote'
  | 'personalitySummary'
  | 'mannerOfAddress'
  | 'politenessLevel'
  | 'vocabularyType'
  | 'temperament'
  | 'characterTypeId'
  | 'characterSubtypeId'
  | 'archetype'

const SPEAKING_STYLE_VALUES = new Set<CharacterSpeakingStyle>([
  'neutralny',
  'formalny',
  'nieformalny',
  'chlodny',
  'cieply',
  'agresywny',
  'delikatny',
  'dziecinny',
  'dumny',
  'sarkastyczny',
])

const TRANSLATION_GENDER_VALUES = new Set<CharacterTranslationGender>([
  'unknown',
  'masculine',
  'feminine',
  'neutral',
])

function normalizeProfileUpdatedAt(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? ''
  return trimmed || fallback
}

function normalizeManualOverrides(
  overrides: Partial<Record<CharacterSpeechProfileManualField, true>> | undefined,
): Partial<Record<CharacterSpeechProfileManualField, true>> {
  if (!overrides || typeof overrides !== 'object') return {}
  const normalized: Partial<Record<CharacterSpeechProfileManualField, true>> = {}
  ;(Object.keys(overrides) as CharacterSpeechProfileManualField[]).forEach(key => {
    if (overrides[key]) normalized[key] = true
  })
  return normalized
}

function normalizePersonalityTraits(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const deduped = new Set<string>()
  value.forEach(item => {
    const trait = typeof item === 'string' ? item.trim() : ''
    if (trait) deduped.add(trait)
  })
  return [...deduped]
}

export function createDefaultCharacterSpeechProfile(): CharacterSpeechProfile {
  const now = new Date().toISOString()
  return {
    archetype: 'default',
    characterTypeId: '',
    characterSubtypeId: '',
    characterUserNotes: '',
    speakingTraits: '',
    characterNote: '',
    personalitySummary: '',
    anilistDescription: '',
    mannerOfAddress: '',
    politenessLevel: '',
    vocabularyType: '',
    temperament: '',
    translationGender: 'unknown',
    speakingStyle: 'neutralny',
    toneProfile: '',
    personalityTraits: [],
    translationNotes: '',
    honorificPreference: '',
    formalityPreference: '',
    relationshipNotes: '',
    customPromptHint: '',
    isUserEdited: false,
    createdAt: now,
    updatedAt: now,
    sourceName: '',
    manualOverrides: {},
  }
}

export function normalizeCharacterSpeechProfile(
  profile?: Partial<CharacterSpeechProfile> | null,
): CharacterSpeechProfile {
  const defaults = createDefaultCharacterSpeechProfile()
  const createdAt = normalizeProfileUpdatedAt(profile?.createdAt, defaults.createdAt)
  const updatedAt = normalizeProfileUpdatedAt(profile?.updatedAt, createdAt)
  return {
    archetype: profile?.archetype ?? defaults.archetype,
    characterTypeId: profile?.characterTypeId ?? defaults.characterTypeId,
    characterSubtypeId: profile?.characterSubtypeId ?? defaults.characterSubtypeId,
    characterUserNotes: profile?.characterUserNotes ?? defaults.characterUserNotes,
    speakingTraits: profile?.speakingTraits ?? defaults.speakingTraits,
    characterNote: profile?.characterNote ?? defaults.characterNote,
    personalitySummary: profile?.personalitySummary ?? defaults.personalitySummary,
    anilistDescription: profile?.anilistDescription ?? defaults.anilistDescription,
    mannerOfAddress: profile?.mannerOfAddress ?? defaults.mannerOfAddress,
    politenessLevel: profile?.politenessLevel ?? defaults.politenessLevel,
    vocabularyType: profile?.vocabularyType ?? defaults.vocabularyType,
    temperament: profile?.temperament ?? defaults.temperament,
    translationGender: TRANSLATION_GENDER_VALUES.has(profile?.translationGender ?? 'unknown')
      ? (profile?.translationGender as CharacterTranslationGender)
      : defaults.translationGender,
    speakingStyle: SPEAKING_STYLE_VALUES.has(profile?.speakingStyle ?? 'neutralny')
      ? (profile?.speakingStyle as CharacterSpeakingStyle)
      : defaults.speakingStyle,
    toneProfile: profile?.toneProfile ?? defaults.toneProfile,
    personalityTraits: normalizePersonalityTraits(profile?.personalityTraits),
    translationNotes: profile?.translationNotes ?? defaults.translationNotes,
    honorificPreference: profile?.honorificPreference ?? defaults.honorificPreference,
    formalityPreference: profile?.formalityPreference ?? defaults.formalityPreference,
    relationshipNotes: profile?.relationshipNotes ?? defaults.relationshipNotes,
    customPromptHint: profile?.customPromptHint ?? defaults.customPromptHint,
    isUserEdited: Boolean(profile?.isUserEdited),
    createdAt,
    updatedAt,
    sourceName: profile?.sourceName ?? defaults.sourceName,
    manualOverrides: normalizeManualOverrides(profile?.manualOverrides),
  }
}

export function createDefaultGlobalStyleProfile(styleId = 'neutral'): ProjectGlobalStyleProfile {
  return {
    styleId,
    tone: '',
    register: '',
    naturalness: '',
    notes: '',
  }
}

export function normalizeGlobalStyleProfile(
  profile: Partial<ProjectGlobalStyleProfile> | null | undefined,
  fallbackStyleId: string,
): ProjectGlobalStyleProfile {
  const defaults = createDefaultGlobalStyleProfile(fallbackStyleId)
  return {
    styleId: profile?.styleId || fallbackStyleId || defaults.styleId,
    tone: profile?.tone ?? defaults.tone,
    register: profile?.register ?? defaults.register,
    naturalness: profile?.naturalness ?? defaults.naturalness,
    notes: profile?.notes ?? defaults.notes,
  }
}
