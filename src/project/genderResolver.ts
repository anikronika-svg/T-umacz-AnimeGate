import type { CharacterGender } from '../translationStyle'
import type { CharacterTranslationGender } from './characterProfileModel'

export interface GenderResolverLineState {
  translationGender: CharacterTranslationGender
  userOverrideGender?: boolean
}

export interface GenderResolverCharacterState {
  gender: CharacterGender
}

export function resolveTranslationGender(
  character: GenderResolverCharacterState,
  line: GenderResolverLineState,
): CharacterTranslationGender {
  if (line.userOverrideGender) return line.translationGender
  if (line.translationGender !== 'unknown' && line.translationGender !== 'neutral') {
    return line.translationGender
  }
  if (character.gender === 'Male') return 'masculine'
  if (character.gender === 'Female') return 'feminine'
  return 'neutral'
}
