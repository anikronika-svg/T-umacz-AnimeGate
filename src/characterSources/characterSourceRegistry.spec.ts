import { describe, expect, it } from 'vitest'
import { buildCharacterSourceProvider } from './characterSourceRegistry'


describe('buildCharacterSourceProvider', () => {
  it('returns MAL provider when selected', () => {
    const provider = buildCharacterSourceProvider('mal', { malClientId: '' })
    expect(provider.id).toBe('mal')
    expect(provider.isConfigured().ok).toBe(false)
  })

  it('returns AniList provider by default', () => {
    const provider = buildCharacterSourceProvider('anilist', {})
    expect(provider.id).toBe('anilist')
  })
})
