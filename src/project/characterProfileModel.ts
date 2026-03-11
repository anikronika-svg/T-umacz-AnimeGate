export interface CharacterSpeechProfile {
  archetype: string
  characterTypeId: string
  characterSubtypeId: string
  speakingTraits: string
  characterNote: string
  personalitySummary: string
  anilistDescription: string
  mannerOfAddress: string
  politenessLevel: string
  vocabularyType: string
  temperament: string
}

export interface ProjectGlobalStyleProfile {
  styleId: string
  tone: string
  register: string
  naturalness: string
  notes: string
}

export function createDefaultCharacterSpeechProfile(): CharacterSpeechProfile {
  return {
    archetype: 'default',
    characterTypeId: '',
    characterSubtypeId: '',
    speakingTraits: '',
    characterNote: '',
    personalitySummary: '',
    anilistDescription: '',
    mannerOfAddress: '',
    politenessLevel: '',
    vocabularyType: '',
    temperament: '',
  }
}

export function normalizeCharacterSpeechProfile(
  profile?: Partial<CharacterSpeechProfile> | null,
): CharacterSpeechProfile {
  const defaults = createDefaultCharacterSpeechProfile()
  return {
    archetype: profile?.archetype ?? defaults.archetype,
    characterTypeId: profile?.characterTypeId ?? defaults.characterTypeId,
    characterSubtypeId: profile?.characterSubtypeId ?? defaults.characterSubtypeId,
    speakingTraits: profile?.speakingTraits ?? defaults.speakingTraits,
    characterNote: profile?.characterNote ?? defaults.characterNote,
    personalitySummary: profile?.personalitySummary ?? defaults.personalitySummary,
    anilistDescription: profile?.anilistDescription ?? defaults.anilistDescription,
    mannerOfAddress: profile?.mannerOfAddress ?? defaults.mannerOfAddress,
    politenessLevel: profile?.politenessLevel ?? defaults.politenessLevel,
    vocabularyType: profile?.vocabularyType ?? defaults.vocabularyType,
    temperament: profile?.temperament ?? defaults.temperament,
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
