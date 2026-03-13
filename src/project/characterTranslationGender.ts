import type { CharacterGender } from '../translationStyle'
import type { CharacterSpeechProfile, CharacterTranslationGender } from './characterProfileModel'

export function deriveTranslationGenderFromGender(gender: CharacterGender): CharacterTranslationGender {
  if (gender === 'Male') return 'masculine'
  if (gender === 'Female') return 'feminine'
  return 'neutral'
}

export function shouldAutoSyncTranslationGender(
  profile: Pick<CharacterSpeechProfile, 'translationGender' | 'manualOverrides'>,
): boolean {
  if (profile.manualOverrides?.translationGender) return false
  return profile.translationGender === 'unknown' || profile.translationGender === 'neutral'
}

export function applyAutoTranslationGender(
  profile: CharacterSpeechProfile,
  gender: CharacterGender,
): CharacterSpeechProfile {
  if (!shouldAutoSyncTranslationGender(profile)) return profile
  return {
    ...profile,
    translationGender: deriveTranslationGenderFromGender(gender),
  }
}
