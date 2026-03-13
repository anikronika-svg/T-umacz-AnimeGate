import type { CharacterSpeechProfile, CharacterArchetypeId } from './characterProfileModel'

export type CharacterVoiceSource = 'manual' | 'project' | 'notes' | 'archetype' | 'anilist' | 'default'

export interface CharacterVoiceProfile {
  summary: string
  source: CharacterVoiceSource
  applied: boolean
}

const ARCHETYPE_TRAITS: Record<CharacterArchetypeId, string[]> = {
  default: [],
  tsundere: ['sharp', 'slightly defensive', 'not overly polite'],
  formal_knight: ['formal', 'disciplined', 'honorable'],
  child: ['simple', 'childlike', 'more direct'],
  elderly_man: ['calm', 'measured', 'slightly old-fashioned'],
  calm_girl: ['gentle', 'calm'],
  energetic_girl: ['energetic', 'lively', 'casual'],
  cold_professional: ['cool', 'concise', 'restrained'],
  arrogant_noble: ['proud', 'authoritative', 'formal'],
  shy: ['soft', 'hesitant', 'polite'],
  comic_slacker: ['casual', 'lightly humorous', 'easygoing'],
}

const SPEAKING_STYLE_TRAITS: Record<string, string[]> = {
  formalny: ['formal', 'polite'],
  nieformalny: ['casual', 'colloquial'],
  chlodny: ['cool', 'restrained'],
  cieply: ['warm', 'friendly'],
  agresywny: ['sharp', 'forceful'],
  delikatny: ['soft', 'gentle'],
  dziecinny: ['childlike', 'simple'],
  dumny: ['proud', 'authoritative'],
  sarkastyczny: ['sardonic', 'dry'],
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function extractTraits(profile: CharacterSpeechProfile): string[] {
  const traits = new Set<string>()
  const archetypeTraits = ARCHETYPE_TRAITS[profile.archetype] ?? []
  archetypeTraits.forEach(trait => traits.add(trait))

  const speakingStyleTraits = SPEAKING_STYLE_TRAITS[profile.speakingStyle] ?? []
  speakingStyleTraits.forEach(trait => traits.add(trait))

  const politeness = normalizeText(profile.politenessLevel)
  if (politeness.includes('wysok')) traits.add('polite')
  if (politeness.includes('niski')) traits.add('blunt')

  const vocab = normalizeText(profile.vocabularyType)
  if (vocab.includes('potoczne')) traits.add('colloquial')
  if (vocab.includes('staranne')) traits.add('refined')
  if (vocab.includes('precyzyjne')) traits.add('precise')

  const temperament = normalizeText(profile.temperament)
  if (temperament.includes('zywiol')) traits.add('energetic')
  if (temperament.includes('spokoj')) traits.add('calm')
  if (temperament.includes('powsciagli')) traits.add('restrained')

  if (profile.toneProfile.trim()) traits.add('tone-aware')
  if (profile.speakingTraits.trim()) traits.add('trait-specific')

  return [...traits]
}

function resolveSource(profile: CharacterSpeechProfile): CharacterVoiceSource {
  if (Object.keys(profile.manualOverrides ?? {}).length > 0) return 'manual'
  if (profile.isUserEdited) return 'project'
  if (
    profile.characterUserNotes.trim()
    || profile.speakingTraits.trim()
    || profile.characterNote.trim()
    || profile.personalitySummary.trim()
    || profile.translationNotes.trim()
    || profile.relationshipNotes.trim()
    || profile.customPromptHint.trim()
  ) return 'notes'
  if (profile.characterTypeId || profile.characterSubtypeId || profile.archetype !== 'default') return 'archetype'
  if (profile.anilistDescription.trim()) return 'anilist'
  return 'default'
}

function modeAdjustment(tag: string | undefined): string {
  if (!tag) return ''
  const normalized = tag.trim().toUpperCase()
  if (normalized.includes('M')) return 'Internal thought: soften delivery and keep it introspective.'
  if (normalized.includes('N')) return 'Narration: keep it composed and slightly more descriptive.'
  if (normalized.includes('S')) return 'Whisper: soften delivery and keep it hushed.'
  if (normalized.includes('V')) return 'Shout: allow stronger emphasis while staying subtitle-safe.'
  return ''
}

export function buildCharacterVoiceProfile(
  profile: CharacterSpeechProfile,
  opts?: { speakerModeTag?: string },
): CharacterVoiceProfile {
  const source = resolveSource(profile)
  const traits = extractTraits(profile)
  const baseTraits = traits.length > 0 ? traits.join(', ') : 'natural, neutral'
  const modeHint = modeAdjustment(opts?.speakerModeTag)
  const summaryParts = [
    `Use ${baseTraits} speech.`,
    'Keep lines concise, subtitle-safe, and meaning-accurate.',
    modeHint,
  ].filter(Boolean)

  const summary = summaryParts.join(' ')
  const applied = source !== 'default' || traits.length > 0 || Boolean(modeHint)
  return { summary, source, applied }
}
