import { describe, expect, it } from 'vitest'
import { applyAutoTranslationGender, deriveTranslationGenderFromGender } from './characterTranslationGender'
import { createDefaultCharacterSpeechProfile } from './characterProfileModel'

describe('characterTranslationGender', () => {
  it('derives translation gender from character gender', () => {
    expect(deriveTranslationGenderFromGender('Male')).toBe('masculine')
    expect(deriveTranslationGenderFromGender('Female')).toBe('feminine')
    expect(deriveTranslationGenderFromGender('Unknown')).toBe('neutral')
  })

  it('auto-syncs translation gender when unset', () => {
    const base = createDefaultCharacterSpeechProfile()
    const next = applyAutoTranslationGender(base, 'Female')
    expect(next.translationGender).toBe('feminine')
  })
})
