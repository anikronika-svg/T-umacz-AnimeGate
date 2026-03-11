import {
  getCharacterSubtypeById,
  getCharacterTypeById,
  type CharacterSpeechTuning,
} from './characterArchetypes'

function formatTuning(tuning: CharacterSpeechTuning): string {
  return [
    `- ton: ${tuning.tone}`,
    `- formalnosc: ${tuning.politenessLevel}`,
    `- emocjonalnosc: ${tuning.emotionality}`,
    `- slownictwo: ${tuning.vocabularyType}`,
    `- zwracanie sie do innych: ${tuning.mannerOfAddress}`,
    `- styl reakcji: ${tuning.reactionStyle}`,
    `- tempo mowy: ${tuning.speechPacing}`,
  ].join('\n')
}

export function buildCharacterArchetypePrompt(typeId: string, subtypeId: string): string {
  const type = getCharacterTypeById(typeId)
  const subtype = getCharacterSubtypeById(typeId, subtypeId)
  if (!type || !subtype) return ''

  return [
    `Typ charakteru (PL): ${type.label}`,
    `Podtyp (PL): ${subtype.label}`,
    `Opis podtypu: ${subtype.description}`,
    'Wplyw na styl wypowiedzi:',
    formatTuning(subtype.speech),
    'Instrukcja: zachowaj ten profil tylko dla tej postaci; nie uogolniaj na caly projekt.',
  ].join('\n')
}
