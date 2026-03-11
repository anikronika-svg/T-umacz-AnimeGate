import type { AniListCharacter } from '../anilist'
import type { CharacterStyleProfile } from '../translationStyle'

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function firstSentence(value: string): string {
  const clean = compact(value)
  if (!clean) return ''
  const sentenceEnd = clean.search(/[.!?](\s|$)/)
  if (sentenceEnd >= 20) return clean.slice(0, sentenceEnd + 1).trim()
  if (clean.length <= 180) return clean
  return `${clean.slice(0, 180).trim()}...`
}

function inferFromText(description: string): {
  speakingTraits: string
  mannerOfAddress: string
  politenessLevel: string
  vocabularyType: string
  temperament: string
} {
  const normalized = description.toLowerCase()
  if (!normalized) {
    return {
      speakingTraits: '',
      mannerOfAddress: '',
      politenessLevel: '',
      vocabularyType: '',
      temperament: '',
    }
  }

  const formal = /\b(formal|polite|courteous|proper|respectful|noble)\b/.test(normalized)
  const casual = /\b(casual|laid-back|easygoing|slang|playful|joking)\b/.test(normalized)
  const calm = /\b(calm|gentle|quiet|soft-spoken|reserved)\b/.test(normalized)
  const energetic = /\b(energetic|lively|cheerful|enthusiastic|impulsive)\b/.test(normalized)
  const cold = /\b(cold|stoic|detached|professional)\b/.test(normalized)

  const speakingTraits = [
    calm ? 'spokojna wypowiedz' : '',
    energetic ? 'bardziej ekspresyjna wypowiedz' : '',
    formal ? 'uprzejme i bardziej formalne sformulowania' : '',
    casual ? 'swobodny, codzienny rytm wypowiedzi' : '',
    cold ? 'rzeczowy i oszczedny ton' : '',
  ].filter(Boolean).join(', ')

  const politenessLevel = formal ? 'Wysoki' : casual ? 'Niski' : 'Sredni'
  const mannerOfAddress = formal
    ? 'Uprzejme zwroty i pelniejsze formy'
    : casual
      ? 'Bezposrednie i swobodne zwroty'
      : 'Naturalne, neutralne zwroty'
  const vocabularyType = formal
    ? 'Bardziej staranne i uporzadkowane'
    : casual
      ? 'Codzienne i potoczne'
      : cold
        ? 'Rzeczowe i precyzyjne'
        : 'Naturalne dialogowe'
  const temperament = energetic
    ? 'Zywiolowy'
    : calm
      ? 'Spokojny'
      : cold
        ? 'Powsciagliwy'
        : 'Zrownowazony'

  return {
    speakingTraits,
    mannerOfAddress,
    politenessLevel,
    vocabularyType,
    temperament,
  }
}

export function analyzeCharacterProfileFromAniList(cast: AniListCharacter): Partial<CharacterStyleProfile> {
  const description = compact(cast.description)
  const descriptionShort = compact(cast.descriptionShort)
  const traitsText = cast.personalityTraits.map(compact).filter(Boolean).slice(0, 6).join(', ')
  const inferred = inferFromText(description)

  const summary = firstSentence(descriptionShort || description)
  const roleHint = cast.roleLabel !== 'Unknown' ? `Rola: ${cast.roleLabel}.` : ''

  return {
    speakingTraits: traitsText || inferred.speakingTraits,
    characterNote: summary || roleHint,
    personalitySummary: summary || roleHint,
    anilistDescription: description,
    mannerOfAddress: cast.inferredMannerOfAddress || inferred.mannerOfAddress,
    politenessLevel: cast.inferredPolitenessLevel || inferred.politenessLevel,
    vocabularyType: cast.inferredVocabularyType || inferred.vocabularyType,
    temperament: cast.inferredTemperament || inferred.temperament,
  }
}
