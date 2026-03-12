import { describe, expect, it } from 'vitest'
import {
  normalizeCharacterAlias,
  normalizeCharacterName,
  parseCharacterSpeaker,
  resolveCharacterByName,
} from './characterNameMatching'

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

  it('matches speaker variants with bracket metadata', () => {
    expect(resolveCharacterByName('Tino (N)', characters)?.name).toBe('Tino Shade')
    expect(resolveCharacterByName('Tino (M)', characters)?.name).toBe('Tino Shade')
    expect(resolveCharacterByName('Tino (myśli)', characters)?.name).toBe('Tino Shade')
    expect(resolveCharacterByName('Tino (narracja)', characters)?.name).toBe('Tino Shade')
    expect(resolveCharacterByName('Shade Tino (N)', characters)?.name).toBe('Tino Shade')
  })

  it('parses speaker metadata and keeps base identity', () => {
    expect(parseCharacterSpeaker('Tino (N)')).toMatchObject({ baseName: 'Tino', modeTag: 'narration' })
    expect(parseCharacterSpeaker('Tino (M)')).toMatchObject({ baseName: 'Tino', modeTag: 'thought' })
    expect(parseCharacterSpeaker('Kurisu (thought)')).toMatchObject({ baseName: 'Kurisu', modeTag: 'thought' })
    expect(parseCharacterSpeaker('Shade Tino')).toMatchObject({ baseName: 'Shade Tino', modeTag: null })
  })

  it('uses persisted alias map when provided', () => {
    const aliasMap = new Map<string, string>([
      ['shade', 'Tino Shade'],
      ['tino', 'Tino Shade'],
    ])
    expect(resolveCharacterByName('Shade', characters, { aliasMap })?.name).toBe('Tino Shade')
  })
})
