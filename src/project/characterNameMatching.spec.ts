import { describe, expect, it } from 'vitest'
import { normalizeCharacterAlias, normalizeCharacterName, resolveCharacterByName } from './characterNameMatching'

describe('characterNameMatching', () => {
  const characters = [
    { name: 'Tino Shade', gender: 'Female' as const },
    { name: 'Krai Andrey', gender: 'Male' as const },
    { name: 'Liz Smart', gender: 'Female' as const },
  ]

  it('normalizes full names and aliases consistently', () => {
    expect(normalizeCharacterName('  Tino  Shade ')).toBe('tinoshade')
    expect(normalizeCharacterAlias('Shade, Tino')).toBe('shade tino')
  })

  it('matches full name exactly', () => {
    expect(resolveCharacterByName('Tino Shade', characters)?.name).toBe('Tino Shade')
  })

  it('matches by first name when unique', () => {
    expect(resolveCharacterByName('Tino', characters)?.name).toBe('Tino Shade')
  })

  it('matches by surname when unique', () => {
    expect(resolveCharacterByName('Andrey', characters)?.name).toBe('Krai Andrey')
  })

  it('matches reversed name order', () => {
    expect(resolveCharacterByName('Shade Tino', characters)?.name).toBe('Tino Shade')
  })
})
