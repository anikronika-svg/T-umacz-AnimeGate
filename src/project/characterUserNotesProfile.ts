import type { CharacterSpeechProfile } from './characterProfileModel'

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function firstSentence(value: string): string {
  const clean = compact(value)
  if (!clean) return ''
  const sentenceEnd = clean.search(/[.!?](\s|$)/)
  if (sentenceEnd >= 16) return clean.slice(0, sentenceEnd + 1).trim()
  if (clean.length <= 160) return clean
  return `${clean.slice(0, 160).trim()}...`
}

export interface NotesProfileHints {
  speakingTraits: string
  characterNote: string
  personalitySummary: string
  mannerOfAddress: string
  politenessLevel: string
  vocabularyType: string
  temperament: string
}

export function deriveProfileHintsFromUserNotes(notes: string): NotesProfileHints {
  const cleaned = compact(notes)
  const normalized = cleaned.toLowerCase()
  if (!cleaned) {
    return {
      speakingTraits: '',
      characterNote: '',
      personalitySummary: '',
      mannerOfAddress: '',
      politenessLevel: '',
      vocabularyType: '',
      temperament: '',
    }
  }

  const formal = /\b(formaln|formaln(ie|y)|uprzejm|grzeczn|dystans|arystokrat)\b/.test(normalized)
  const casual = /\b(luzn|potoczn|swobodn|na luzie)\b/.test(normalized)
  const ironic = /\b(ironi|sarkazm|kąśliw|złośliw)\b/.test(normalized)
  const cold = /\b(chłodn|zimn|zdystansowan|powściągliw)\b/.test(normalized)
  const warm = /\b(ciepł|łagodn|opiekuńcz|serdeczn)\b/.test(normalized)
  const aggressive = /\b(agresywn|ostr|drażliw|wybuchow)\b/.test(normalized)

  const speakingTraits = [
    formal ? 'formalny i uporządkowany styl wypowiedzi' : '',
    casual ? 'swobodny, bardziej potoczny rytm mowy' : '',
    ironic ? 'skłonność do ironii i uszczypliwości' : '',
    cold ? 'chłodny, zdystansowany ton' : '',
    warm ? 'cieplejszy, łagodniejszy ton wobec bliskich' : '',
    aggressive ? 'ostrzejsze, bardziej impulsywne reakcje' : '',
  ].filter(Boolean).join(', ')

  const mannerOfAddress = formal
    ? 'Używa bardziej formalnych zwrotów, utrzymuje dystans.'
    : casual
      ? 'Używa bezpośrednich, swobodnych zwrotów.'
      : ''

  const politenessLevel = formal ? 'Wysoki' : casual ? 'Niski' : ''
  const vocabularyType = formal
    ? 'Staranne, bardziej formalne słownictwo.'
    : casual
      ? 'Potoczne, codzienne słownictwo.'
      : cold
        ? 'Rzeczowe i oszczędne słownictwo.'
        : ''
  const temperament = aggressive
    ? 'Impulsywny / drażliwy'
    : cold
      ? 'Powściągliwy / chłodny'
      : warm
        ? 'Łagodny / opiekuńczy'
        : ''
  const summary = firstSentence(cleaned)

  return {
    speakingTraits,
    characterNote: summary,
    personalitySummary: summary,
    mannerOfAddress,
    politenessLevel,
    vocabularyType,
    temperament,
  }
}

export function mergeUserNotesIntoProfile(
  profile: CharacterSpeechProfile,
  notes: string,
): CharacterSpeechProfile {
  const nextNotes = notes.trim()
  const hints = deriveProfileHintsFromUserNotes(nextNotes)
  return {
    ...profile,
    characterUserNotes: nextNotes,
    speakingTraits: profile.speakingTraits.trim() || hints.speakingTraits,
    characterNote: profile.characterNote.trim() || hints.characterNote,
    personalitySummary: profile.personalitySummary.trim() || hints.personalitySummary,
    mannerOfAddress: profile.mannerOfAddress.trim() || hints.mannerOfAddress,
    politenessLevel: profile.politenessLevel.trim() || hints.politenessLevel,
    vocabularyType: profile.vocabularyType.trim() || hints.vocabularyType,
    temperament: profile.temperament.trim() || hints.temperament,
  }
}
