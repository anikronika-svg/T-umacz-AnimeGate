import { describe, expect, it } from 'vitest'
import { createMalProvider, mapMalCharacterToImported } from './malProvider'

const entry = {
  role: 'MAIN',
  character: {
    id: 222,
    name: 'Krai Andrey',
    pictures: [{ small: 'small.jpg', medium: 'medium.jpg' }],
  },
  voice_actors: [{ language: 'Japanese', person: { id: 900, name: 'Kenji Sato' } }],
}

describe('mapMalCharacterToImported', () => {
  it('maps fields from MAL entry and detail', () => {
    const mapped = mapMalCharacterToImported(entry, '55', 'Anime X', {
      id: 222,
      name: 'Krai Andrey',
      about: 'Opis<br>postaci',
      gender: 'Male',
    })
    expect(mapped?.source).toBe('mal')
    expect(mapped?.sourceCharacterId).toBe('222')
    expect(mapped?.animeTitle).toBe('Anime X')
    expect(mapped?.nameFull).toBe('Krai Andrey')
    expect(mapped?.nameFirst).toBe('Krai')
    expect(mapped?.role).toBe('main')
    expect(mapped?.gender).toBe('Male')
    expect(mapped?.voiceActorName).toBe('Kenji Sato')
    expect(mapped?.voiceActorLanguage).toBe('Japanese')
    expect(mapped?.voiceActorId).toBe('900')
    expect(mapped?.description).toBe('Opis postaci')
  })
})

describe('createMalProvider', () => {
  it('requires client id to be configured', () => {
    const provider = createMalProvider({})
    expect(provider.isConfigured().ok).toBe(false)
  })
})
