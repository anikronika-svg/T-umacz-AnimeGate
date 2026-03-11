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

interface PhraseBoostRule {
  typeId: string
  subtypeId: string
  requiresAll: string[]
  boost: number
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
  const sentenceParts = clean
    .split(/[.!?]+/)
    .map(part => compact(part))
    .filter(Boolean)
  if (sentenceParts.length > 0) {
    if (sentenceParts[0].length >= 16) return `${sentenceParts[0]}.`
    if (sentenceParts.length > 1) {
      return `${sentenceParts[0]}. ${sentenceParts[1]}.`
    }
  }
  const sentenceEnd = clean.search(/[.!?](\s|$)/)
  if (sentenceEnd >= 8) return clean.slice(0, sentenceEnd + 1).trim()
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
  { typeId: 'genki', subtypeId: 'energiczna', keywords: [{ value: 'energiczn', weight: 2 }, { value: 'glosn', weight: 2 }, { value: 'zywiolow' }, { value: 'impulsywn' }] },
  { typeId: 'postac_komediowa', subtypeId: 'przesadzona', keywords: [{ value: 'zart', weight: 2 }, { value: 'komedi', weight: 2 }, { value: 'chaos' }, { value: 'przesad', weight: 2 }] },
  { typeId: 'mentor', subtypeId: 'spokojny_nauczyciel', keywords: [{ value: 'dojrzal' }, { value: 'spokojna', weight: 2 }, { value: 'lagodn' }, { value: 'wspiera' }] },
]

const PHRASE_BOOST_RULES: PhraseBoostRule[] = [
  { typeId: 'tsundere', subtypeId: 'niesmiala', requiresAll: ['ukrywa uczuc', 'zawstydz'], boost: 3 },
  { typeId: 'tsundere', subtypeId: 'niesmiala', requiresAll: ['ale', 'zalezy'], boost: 2 },
  { typeId: 'kuudere', subtypeId: 'chlodna', requiresAll: ['chlodn', 'zdystans'], boost: 3 },
  { typeId: 'kuudere', subtypeId: 'chlodna', requiresAll: ['ukrywa emoc', 'rzeczow'], boost: 3 },
  { typeId: 'dandere', subtypeId: 'zakochana', requiresAll: ['niesmial', 'zakochan'], boost: 3 },
  { typeId: 'dandere', subtypeId: 'zakochana', requiresAll: ['delikatn', 'wahani'], boost: 3 },
  { typeId: 'wredna_zlosliwa', subtypeId: 'pogardliwa', requiresAll: ['patrzy z gory', 'aroganck'], boost: 3 },
  { typeId: 'wredna_zlosliwa', subtypeId: 'pogardliwa', requiresAll: ['pogardliw', 'kasliw'], boost: 2 },
  { typeId: 'genki', subtypeId: 'energiczna', requiresAll: ['energiczn', 'impulsywn'], boost: 2 },
  { typeId: 'postac_komediowa', subtypeId: 'przesadzona', requiresAll: ['zart', 'chaos'], boost: 3 },
  { typeId: 'opiekuncza', subtypeId: 'troskliwa', requiresAll: ['opiekuncz', 'troskliw'], boost: 3 },
  { typeId: 'opiekuncza', subtypeId: 'ciepla_opiekunka', requiresAll: ['ciepla', 'lagodn'], boost: 2 },
]

function buildCandidateKey(typeId: string, subtypeId: string): string {
  return `${typeId}:${subtypeId}`
}

function inferCharacterTypeFromNotes(normalizedNotes: string): { typeId: string; subtypeId: string } {
  const scoreByCandidate = new Map<string, { typeId: string; subtypeId: string; score: number }>()

  const upsertScore = (typeId: string, subtypeId: string, delta: number): void => {
    const key = buildCandidateKey(typeId, subtypeId)
    const current = scoreByCandidate.get(key) ?? { typeId, subtypeId, score: 0 }
    current.score += delta
    scoreByCandidate.set(key, current)
  }

  ARCHETYPE_RULES.forEach(rule => {
    const positive = countKeywordScore(normalizedNotes, rule.keywords)
    const negative = countKeywordScore(normalizedNotes, rule.antiKeywords ?? [])
    const score = Math.max(0, positive - negative)
    if (score > 0) upsertScore(rule.typeId, rule.subtypeId, score)
  })

  PHRASE_BOOST_RULES.forEach(rule => {
    const matched = rule.requiresAll.every(fragment => normalizedNotes.includes(fragment))
    if (matched) {
      upsertScore(rule.typeId, rule.subtypeId, rule.boost)
    }
  })

  let best: { typeId: string; subtypeId: string; score: number } = { typeId: '', subtypeId: '', score: 0 }
  scoreByCandidate.forEach(candidate => {
    if (candidate.score > best.score) best = candidate
  })

  if (best.score < 2) return { typeId: '', subtypeId: '' }
  return { typeId: best.typeId, subtypeId: best.subtypeId }
}

function inferNotesHints(normalizedNotes: string, originalNotes: string): Omit<CharacterNotesAnalysisResult, 'suggestedTypeId' | 'suggestedSubtypeId'> {
  const formal = /formaln|uprzejm|grzeczn|arystokrat/.test(normalizedNotes)
  const casual = /luzn|potoczn|swobodn|slang/.test(normalizedNotes)
  const cold = /chlodn|zimn|zdystans|powosciagliw|rzeczow/.test(normalizedNotes)
  const warm = /ciepl|lagodn|opiekuncz|troskliw|serdeczn/.test(normalizedNotes)
  const shy = /niesmial|cicha|wycofan|zawstydz|z wahaniem/.test(normalizedNotes)
  const aggressive = /agresywn|ostra|wredn|cham|pogardliw|drazliw|wybuchow/.test(normalizedNotes)
  const ironic = /ironicz|sarkazm|kasliw|zlosliw/.test(normalizedNotes)
  const emotional = /emocjonal|uczuciow|zakochan|wrazliw/.test(normalizedNotes)
  const energetic = /energiczn|zywiolow|impulsywn|glosn|dynamiczn/.test(normalizedNotes)
  const comedic = /zart|komedi|chaos|zabaw|humor/.test(normalizedNotes)
  const mature = /dojrzal|opanowan|stateczn/.test(normalizedNotes)
  const soft = /delikatn|miekko|cicho|wahani/.test(normalizedNotes)

  const speakingTraits = [
    cold ? 'chłodna i bardziej zdystansowana wypowiedź' : '',
    warm ? 'cieplejsza mowa wobec bliskich' : '',
    shy ? 'niepewność, zawahanie i delikatniejszy ton' : '',
    aggressive ? 'ostrzejsze i bardziej drażliwe reakcje' : '',
    ironic ? 'ironiczne, kąśliwe podteksty' : '',
    emotional ? 'większa emocjonalność w kluczowych momentach' : '',
    energetic ? 'żywe, dynamiczne tempo wypowiedzi' : '',
    comedic ? 'żartobliwy, komediowy sposób reakcji' : '',
    soft ? 'łagodny, subtelny sposób mówienia' : '',
  ].filter(Boolean).join(', ')

  const mannerOfAddress = formal
    ? 'Utrzymuje dystans i częściej używa formalnych zwrotów.'
    : casual
      ? 'Stosuje bardziej bezpośrednie, swobodne zwroty.'
      : cold
        ? 'Zwraca się chłodno i rzeczowo.'
        : warm
          ? 'Zwraca się łagodnie i opiekuńczo.'
        : ''

  const politenessLevel = formal
    ? 'Wysoki'
    : casual || aggressive || energetic
      ? 'Niski'
      : warm || mature
        ? 'Średni'
        : ''
  const vocabularyType = formal
    ? 'Bardziej formalne i uporządkowane słownictwo.'
    : casual
      ? 'Potoczne, codzienne słownictwo.'
      : cold
        ? 'Oszczędne, rzeczowe słownictwo.'
        : aggressive
          ? 'Bardziej ostre i cięte słownictwo.'
          : comedic
            ? 'Bardziej potoczne, żartobliwe słownictwo.'
          : ''
  const temperament = aggressive
    ? 'Drażliwy / impulsywny'
    : energetic
      ? 'Żywiołowy / ekspresyjny'
    : cold
      ? 'Powściągliwy / chłodny'
      : shy
        ? 'Niepewny / wycofany'
        : warm || mature
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
  const hasCustomTypeSelection = Boolean(profile.characterTypeId)
    && (profile.characterTypeId !== legacyType.typeId || profile.characterSubtypeId !== legacyType.subtypeId)

  const shouldApplySuggestedType = !hasCustomTypeSelection && Boolean(analysis.suggestedTypeId)

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
