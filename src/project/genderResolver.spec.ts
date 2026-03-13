import { describe, expect, it } from 'vitest'
import { resolveTranslationGender } from './genderResolver'

describe('genderResolver', () => {
  it('resolves masculine for male characters', () => {
    const result = resolveTranslationGender(
      { gender: 'Male' },
      { translationGender: 'unknown' },
    )
    expect(result).toBe('masculine')
  })

  it('resolves feminine for female characters', () => {
    const result = resolveTranslationGender(
      { gender: 'Female' },
      { translationGender: 'unknown' },
    )
    expect(result).toBe('feminine')
  })

  it('resolves neutral for unknown gender', () => {
    const result = resolveTranslationGender(
      { gender: 'Unknown' },
      { translationGender: 'unknown' },
    )
    expect(result).toBe('neutral')
  })

  it('respects manual override', () => {
    const result = resolveTranslationGender(
      { gender: 'Male' },
      { translationGender: 'feminine', userOverrideGender: true },
    )
    expect(result).toBe('feminine')
  })
})
