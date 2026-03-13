import { describe, expect, it } from 'vitest'
import { buildCharacterVoiceProfile } from './characterVoiceEngine'
import { createDefaultCharacterSpeechProfile } from './characterProfileModel'

describe('characterVoiceEngine', () => {
  it('builds tsundere-like voice', () => {
    const profile = createDefaultCharacterSpeechProfile()
    profile.archetype = 'tsundere'
    const voice = buildCharacterVoiceProfile(profile)
    expect(voice.summary).toMatch(/sharp/i)
    expect(voice.summary).toMatch(/defensive/i)
  })

  it('builds shy/hesitant voice', () => {
    const profile = createDefaultCharacterSpeechProfile()
    profile.archetype = 'shy'
    const voice = buildCharacterVoiceProfile(profile)
    expect(voice.summary).toMatch(/soft/i)
    expect(voice.summary).toMatch(/hesitant/i)
  })

  it('builds calm mentor voice', () => {
    const profile = createDefaultCharacterSpeechProfile()
    profile.archetype = 'formal_knight'
    profile.temperament = 'Spokojny'
    const voice = buildCharacterVoiceProfile(profile)
    expect(voice.summary).toMatch(/formal/i)
    expect(voice.summary).toMatch(/calm/i)
  })

  it('builds energetic comic voice', () => {
    const profile = createDefaultCharacterSpeechProfile()
    profile.archetype = 'comic_slacker'
    profile.temperament = 'Zywiolowy'
    const voice = buildCharacterVoiceProfile(profile)
    expect(voice.summary).toMatch(/energetic/i)
    expect(voice.summary).toMatch(/casual/i)
  })

  it('keeps stable output across lines', () => {
    const profile = createDefaultCharacterSpeechProfile()
    profile.archetype = 'calm_girl'
    const voiceA = buildCharacterVoiceProfile(profile)
    const voiceB = buildCharacterVoiceProfile(profile)
    expect(voiceA.summary).toBe(voiceB.summary)
  })

  it('adapts for thought mode tag', () => {
    const profile = createDefaultCharacterSpeechProfile()
    profile.archetype = 'shy'
    const voice = buildCharacterVoiceProfile(profile, { speakerModeTag: 'M' })
    expect(voice.summary).toMatch(/Internal thought/i)
  })

  it('manual overrides win as source', () => {
    const profile = createDefaultCharacterSpeechProfile()
    profile.manualOverrides = { speakingStyle: true }
    profile.speakingStyle = 'agresywny'
    const voice = buildCharacterVoiceProfile(profile)
    expect(voice.source).toBe('manual')
  })
})
