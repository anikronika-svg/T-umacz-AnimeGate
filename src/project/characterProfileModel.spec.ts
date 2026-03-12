import { describe, expect, it } from 'vitest'
import {
  createDefaultCharacterSpeechProfile,
  normalizeCharacterSpeechProfile,
} from './characterProfileModel'

describe('characterProfileModel', () => {
  it('creates full default profile with safe values', () => {
    const profile = createDefaultCharacterSpeechProfile()
    expect(profile.translationGender).toBe('unknown')
    expect(profile.speakingStyle).toBe('neutralny')
    expect(profile.personalityTraits).toEqual([])
    expect(profile.manualOverrides).toEqual({})
    expect(profile.createdAt).toBeTruthy()
    expect(profile.updatedAt).toBeTruthy()
  })

  it('normalizes incomplete profile payload without crashing', () => {
    const normalized = normalizeCharacterSpeechProfile({
      speakingTraits: 'spokojna',
      personalityTraits: ['lojalna', '', 'lojalna', 'uprzejma'],
      translationGender: 'feminine',
      speakingStyle: 'formalny',
    })
    expect(normalized.speakingTraits).toBe('spokojna')
    expect(normalized.personalityTraits).toEqual(['lojalna', 'uprzejma'])
    expect(normalized.translationGender).toBe('feminine')
    expect(normalized.speakingStyle).toBe('formalny')
    expect(normalized.characterNote).toBe('')
  })
})
