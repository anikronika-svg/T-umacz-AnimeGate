import type { CharacterSpeechProfile } from './characterProfileModel'
import { mapLegacyArchetypeToCharacterType } from './characterArchetypes'

interface KeywordRule {
  value: string
  weight?: number
}

interface ArchetypeCandidateRule {
  typeId: string
  subtypeId: string
  keywords: KeywordRule[]
  antiKeywords?: KeywordRule[]
}

export interface CharacterNotesAnalysisResult {
  suggestedTypeId: string
  suggestedSubtypeId: string
  speakingTraits: string
  characterNote: string
  personalitySummary: string
  mannerOfAddress: string
  politenessLevel: string
  vocabularyType: string
  temperament: string
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeForMatch(value: string): string {
  return compact(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
}

function firstSentence(value: string): string {
  const clean = compact(value)
  if (!clean) return ''
  const sentenceEnd = clean.search(/[.!?](\s|$)/)
  if (sentenceEnd >= 16) return clean.slice(0, sentenceEnd + 1).trim()
  if (clean.length <= 180) return clean
  return `${clean.slice(0, 180).trim()}...`
}

function countKeywordScore(haystack: string, rules: KeywordRule[]): number {
  return rules.reduce((acc, rule) => {
    const weight = rule.weight ?? 1
    return haystack.includes(rule.value) ? acc + weight : acc
  }, 0)
}

const ARCHETYPE_RULES: ArchetypeCandidateRule[] = [
  { typeId: 'tsundere', subtypeId: 'niesmiala', keywords: [{ value: 'zawstydz' }, { value: 'ukrywa uczuc' }, { value: 'ale jej zalezy', weight: 2 }, { value: 'ostra gdy', weight: 2 }, { value: 'obronn' }, { value: 'drazliw' }] },
  { typeId: 'tsundere', subtypeId: 'agresywna', keywords: [{ value: 'wredn' }, { value: 'ostra' }, { value: 'agresywn' }, { value: 'drazliw' }, { value: 'wybuchow' }] },
  { typeId: 'kuudere', subtypeId: 'chlodna', keywords: [{ value: 'chlodn', weight: 2 }, { value: 'zdystans' }, { value: 'ukrywa emoc' }, { value: 'powosciagliw' }, { value: 'rzeczow' }] },
  { typeId: 'kuudere', subtypeId: 'logiczna', keywords: [{ value: 'logicz' }, { value: 'analitycz' }, { value: 'rzeczow' }, { value: 'fakty' }] },
  { typeId: 'dandere', subtypeId: 'niesmiala', keywords: [{ value: 'niesmial', weight: 2 }, { value: 'cicha', weight: 2 }, { value: 'wycofan' }, { value: 'zawstydz' }] },
  { typeId: 'dandere', subtypeId: 'zakochana', keywords: [{ value: 'zakochan', weight: 2 }, { value: 'delikatn' }, { value: 'mowi miekko', weight: 2 }, { value: 'z wahaniem', weight: 2 }, { value: 'niesmial' }] },
  { typeId: 'yandere', subtypeId: 'obsesyjna', keywords: [{ value: 'obsesyj', weight: 3 }, { value: 'chorobliwie zakochan', weight: 3 }, { value: 'kontroluj' }, { value: 'zaborcz' }] },
  { typeId: 'yandere', subtypeId: 'zazdrosna', keywords: [{ value: 'zazdrosn', weight: 2 }, { value: 'nie znosi rywalek', weight: 2 }, { value: 'wybucha o relacje' }] },
  { typeId: 'wredna_zlosliwa', subtypeId: 'pogardliwa', keywords: [{ value: 'pogardliw', weight: 2 }, { value: 'patrzy z gory', weight: 2 }, { value: 'aroganck' }, { value: 'cham', weight: 2 }, { value: 'wredn' }] },
  { typeId: 'wredna_zlosliwa', subtypeId: 'kasliwa', keywords: [{ value: 'kasliw', weight: 2 }, { value: 'zlosliw', weight: 2 }, { value: 'ironicz' }, { value: 'sarkazm' }] },
  { typeId: 'antybohater', subtypeId: 'cyniczny', keywords: [{ value: 'cyniczn', weight: 2 }, { value: 'samotn' }, { value: 'brutaln' }, { value: 'szorstk' }] },
  { typeId: 'samotnik', subtypeId: 'chlodny', keywords: [{ value: 'samotn', weight: 2 }, { value: 'zdystans' }, { value: 'nie ufa', weight: 2 }, { value: 'chlodn' }] },
  { typeId: 'opiekuncza', subtypeId: 'troskliwa', keywords: [{ value: 'opiekuncz', weight: 2 }, { value: 'troskliw', weight: 2 }, { value: 'matczyn' }, { value: 'ciepla' }] },
  { typeId: 'bohater', subtypeId: 'idealistyczny', keywords: [{ value: 'idealista', weight: 2 }, { value: 'wierzy w dobro', weight: 3 }, { value: 'pomaga wszystkim', weight: 2 }, { value: 'bohatersk' }] },
  { typeId: 'arystokratka_dama', subtypeId: 'arogancka', keywords: [{ value: 'arystokrat', weight: 2 }, { value: 'eleganck' }, { value: 'wyniosl' }, { value: 'aroganck', weight: 2 }] },
  { typeId: 'manipulator', subtypeId: 'subtelny', keywords: [{ value: 'manipul' }, { value: 'steruje innymi', weight: 2 }, { value: 'kontroluje relacje', weight: 2 }] },
  { typeId: 'romantyczna', subtypeId: 'delikatna', keywords: [{ value: 'romantyczn', weight: 2 }, { value: 'wrazliw' }, { value: 'delikatn', weight: 2 }, { value: 'czula' }] },
]

function inferCharacterTypeFromNotes(normalizedNotes: string): { typeId: string; subtypeId: string } {
  let best: { typeId: string; subtypeId: string; score: number } = { typeId: '', subtypeId: '', score: 0 }
  ARCHETYPE_RULES.forEach(rule => {
    const positive = countKeywordScore(normalizedNotes, rule.keywords)
    const negative = countKeywordScore(normalizedNotes, rule.antiKeywords ?? [])
    const score = Math.max(0, positive - negative)
    if (score > best.score) {
      best = { typeId: rule.typeId, subtypeId: rule.subtypeId, score }
    }
  })
  if (best.score < 2) return { typeId: '', subtypeId: '' }
  return { typeId: best.typeId, subtypeId: best.subtypeId }
}

function inferNotesHints(normalizedNotes: string, originalNotes: string): Omit<CharacterNotesAnalysisResult, 'suggestedTypeId' | 'suggestedSubtypeId'> {
  const formal = /formaln|uprzejm|grzeczn|arystokrat|dystans/.test(normalizedNotes)
  const casual = /luzn|potoczn|swobodn|slang/.test(normalizedNotes)
  const cold = /chlodn|zimn|zdystans|powosciagliw|rzeczow/.test(normalizedNotes)
  const warm = /ciepl|lagodn|opiekuncz|troskliw|serdeczn/.test(normalizedNotes)
  const shy = /niesmial|cicha|wycofan|zawstydz|z wahaniem/.test(normalizedNotes)
  const aggressive = /agresywn|ostra|wredn|cham|pogardliw|drazliw|wybuchow/.test(normalizedNotes)
  const ironic = /ironicz|sarkazm|kasliw|zlosliw/.test(normalizedNotes)
  const emotional = /emocjonal|uczuciow|zakochan|wrazliw/.test(normalizedNotes)

  const speakingTraits = [
    cold ? 'chłodna i bardziej zdystansowana wypowiedź' : '',
    warm ? 'cieplejsza mowa wobec bliskich' : '',
    shy ? 'niepewność, zawahanie i delikatniejszy ton' : '',
    aggressive ? 'ostrzejsze i bardziej drażliwe reakcje' : '',
    ironic ? 'ironiczne, kąśliwe podteksty' : '',
    emotional ? 'większa emocjonalność w kluczowych momentach' : '',
  ].filter(Boolean).join(', ')

  const mannerOfAddress = formal
    ? 'Utrzymuje dystans i częściej używa formalnych zwrotów.'
    : casual
      ? 'Stosuje bardziej bezpośrednie, swobodne zwroty.'
      : cold
        ? 'Zwraca się chłodno i rzeczowo.'
        : ''

  const politenessLevel = formal ? 'Wysoki' : casual || aggressive ? 'Niski' : ''
  const vocabularyType = formal
    ? 'Bardziej formalne i uporządkowane słownictwo.'
    : casual
      ? 'Potoczne, codzienne słownictwo.'
      : cold
        ? 'Oszczędne, rzeczowe słownictwo.'
        : aggressive
          ? 'Bardziej ostre i cięte słownictwo.'
          : ''
  const temperament = aggressive
    ? 'Drażliwy / impulsywny'
    : cold
      ? 'Powściągliwy / chłodny'
      : shy
        ? 'Niepewny / wycofany'
        : warm
          ? 'Łagodny / opiekuńczy'
          : ''
  const shortSummary = firstSentence(originalNotes)

  return {
    speakingTraits,
    characterNote: shortSummary,
    personalitySummary: shortSummary,
    mannerOfAddress,
    politenessLevel,
    vocabularyType,
    temperament,
  }
}

export function analyzeCharacterNotes(notes: string): CharacterNotesAnalysisResult {
  const cleaned = compact(notes)
  const normalized = normalizeForMatch(cleaned)
  if (!cleaned) {
    return {
      suggestedTypeId: '',
      suggestedSubtypeId: '',
      speakingTraits: '',
      characterNote: '',
      personalitySummary: '',
      mannerOfAddress: '',
      politenessLevel: '',
      vocabularyType: '',
      temperament: '',
    }
  }
  const typeSuggestion = inferCharacterTypeFromNotes(normalized)
  const hints = inferNotesHints(normalized, cleaned)
  return {
    suggestedTypeId: typeSuggestion.typeId,
    suggestedSubtypeId: typeSuggestion.subtypeId,
    ...hints,
  }
}

export function mergeCharacterNotesAnalysisIntoProfile(
  profile: CharacterSpeechProfile,
  notes: string,
): CharacterSpeechProfile {
  const nextNotes = notes.trim()
  const analysis = analyzeCharacterNotes(nextNotes)
  const legacyType = mapLegacyArchetypeToCharacterType(profile.archetype)
  const hasNonLegacyType = Boolean(profile.characterTypeId)
    && (profile.characterTypeId !== legacyType.typeId || profile.characterSubtypeId !== legacyType.subtypeId)

  const shouldApplySuggestedType = !hasNonLegacyType && Boolean(analysis.suggestedTypeId)

  return {
    ...profile,
    characterUserNotes: nextNotes,
    characterTypeId: shouldApplySuggestedType ? analysis.suggestedTypeId : profile.characterTypeId,
    characterSubtypeId: shouldApplySuggestedType ? analysis.suggestedSubtypeId : profile.characterSubtypeId,
    speakingTraits: profile.speakingTraits.trim() || analysis.speakingTraits,
    characterNote: profile.characterNote.trim() || analysis.characterNote,
    personalitySummary: profile.personalitySummary.trim() || analysis.personalitySummary,
    mannerOfAddress: profile.mannerOfAddress.trim() || analysis.mannerOfAddress,
    politenessLevel: profile.politenessLevel.trim() || analysis.politenessLevel,
    vocabularyType: profile.vocabularyType.trim() || analysis.vocabularyType,
    temperament: profile.temperament.trim() || analysis.temperament,
  }
}
