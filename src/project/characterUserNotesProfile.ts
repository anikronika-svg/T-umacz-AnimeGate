import type { CharacterSpeechProfile } from './characterProfileModel'
import {
  analyzeCharacterNotes,
  mergeCharacterNotesAnalysisIntoProfile,
  type CharacterNotesAnalysisResult,
} from './characterNotesAnalysis'

export type NotesProfileHints = Omit<CharacterNotesAnalysisResult, 'suggestedTypeId' | 'suggestedSubtypeId'>

export function deriveProfileHintsFromUserNotes(notes: string): NotesProfileHints {
  const { suggestedTypeId: _typeId, suggestedSubtypeId: _subtypeId, ...hints } = analyzeCharacterNotes(notes)
  return hints
}

export function mergeUserNotesIntoProfile(
  profile: CharacterSpeechProfile,
  notes: string,
): CharacterSpeechProfile {
  return mergeCharacterNotesAnalysisIntoProfile(profile, notes)
}
