import { describe, expect, it } from 'vitest'
import type { AniListCharacter } from '../anilist'
import { mapAniListCharacterToImported } from './anilistProvider'

const baseCast: AniListCharacter = {
  id: 101,
  name: 'Tino Shade',
  gender: 'Female',
  avatarColor: '#fff',
  roleLabel: 'Glowna',
  imageUrl: 'https://img.test/tino.jpg',
  description: 'Opis',
  descriptionShort: 'Opis',
  personalityTraits: [],
  inferredArchetype: 'default',
  inferredStyle: null,
  inferredMannerOfAddress: '',
  inferredPolitenessLevel: '',
  inferredVocabularyType: '',
  inferredTemperament: '',
}

describe('mapAniListCharacterToImported', () => {
  it('maps core fields and role', () => {
    const mapped = mapAniListCharacterToImported(baseCast, '777', 'Anime Title')
    expect(mapped.source).toBe('anilist')
    expect(mapped.sourceAnimeId).toBe('777')
    expect(mapped.sourceCharacterId).toBe('101')
    expect(mapped.animeTitle).toBe('Anime Title')
    expect(mapped.nameFull).toBe('Tino Shade')
    expect(mapped.nameFirst).toBe('Tino')
    expect(mapped.nameLast).toBe('Shade')
    expect(mapped.role).toBe('main')
    expect(mapped.gender).toBe('Female')
    expect(mapped.imageUrl).toBe('https://img.test/tino.jpg')
  })

  it('maps supporting role', () => {
    const mapped = mapAniListCharacterToImported({ ...baseCast, roleLabel: 'Drugopl.' }, '1', 'Anime')
    expect(mapped.role).toBe('supporting')
  })

  it('maps background role', () => {
    const mapped = mapAniListCharacterToImported({ ...baseCast, roleLabel: 'Tlo' }, '1', 'Anime')
    expect(mapped.role).toBe('background')
  })
})
