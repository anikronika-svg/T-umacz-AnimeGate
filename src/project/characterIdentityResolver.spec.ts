import { describe, expect, it } from 'vitest'
import { resolveCharacterIdentity } from './characterIdentityResolver'

describe('characterIdentityResolver', () => {
  const characters = [
    { name: 'Tino Shade', gender: 'Female' as const },
    { name: 'Bahan', gender: 'Male' as const },
    { name: 'Oyaji', gender: 'Male' as const },
    { name: 'Zuro Latoma', gender: 'Male' as const },
  ]

  it('resolves single-token name to full name', () => {
    expect(resolveCharacterIdentity('Tino', characters).character?.name).toBe('Tino Shade')
    expect(resolveCharacterIdentity('Bahan', characters).character?.name).toBe('Bahan')
  })

  it('handles speaker tags in brackets', () => {
    const resolvedN = resolveCharacterIdentity('Tino (N)', characters)
    expect(resolvedN.character?.name).toBe('Tino Shade')
    expect(resolvedN.speaker.modeTag).toBe('narration')

    const resolvedM = resolveCharacterIdentity('Tino (M)', characters)
    expect(resolvedM.character?.name).toBe('Tino Shade')
    expect(resolvedM.speaker.modeTag).toBe('thought')
  })

  it('prefers known-gender full name over unknown short placeholder', () => {
    const withPlaceholder = [
      { name: 'Tino', gender: 'Unknown' as const },
      { name: 'Tino Shade', gender: 'Female' as const },
    ]
    expect(resolveCharacterIdentity('Tino', withPlaceholder).character?.name).toBe('Tino Shade')
  })

  it('handles reversed full name', () => {
    expect(resolveCharacterIdentity('Latoma Zuro', characters).character?.name).toBe('Zuro Latoma')
  })
})
