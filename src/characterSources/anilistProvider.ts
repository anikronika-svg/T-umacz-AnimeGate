import { getAnimeCharactersForSeries, searchAnimeByTitle } from '../anilist'
import type { AniListCharacter } from '../anilist'
import type { AnimeSearchResult, CharacterRole, CharacterSourceProvider, ImportedCharacter } from './types'

function normalizeRole(roleLabel?: string): CharacterRole {
  if (!roleLabel) return 'unknown'
  if (roleLabel === 'Glowna') return 'main'
  if (roleLabel === 'Drugopl.') return 'supporting'
  if (roleLabel === 'Tlo') return 'background'
  return 'unknown'
}

function splitName(full: string): { first?: string; last?: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { first: parts[0] }
  return {
    first: parts[0],
    last: parts.slice(1).join(' '),
  }
}

export function mapAniListCharacterToImported(
  cast: AniListCharacter,
  animeId: string,
  animeTitle: string,
): ImportedCharacter {
  const nameParts = splitName(cast.name)
  return {
    source: 'anilist',
    sourceAnimeId: animeId,
    sourceCharacterId: String(cast.id),
    animeTitle,
    nameFull: cast.name,
    nameFirst: nameParts.first,
    nameLast: nameParts.last,
    role: normalizeRole(cast.roleLabel),
    gender: cast.gender,
    imageUrl: cast.imageUrl ?? undefined,
    description: cast.description || undefined,
    raw: cast,
  }
}

export function createAniListProvider(): CharacterSourceProvider {
  return {
    id: 'anilist',
    label: 'AniList',
    isConfigured: () => ({ ok: true }),
    searchAnime: async (query: string): Promise<AnimeSearchResult[]> => {
      const results = await searchAnimeByTitle(query)
      return results.map(item => ({
        id: String(item.id),
        title: item.title,
        seasonLabel: item.seasonLabel,
        source: 'anilist',
        raw: item,
      }))
    },
    getCharactersForAnime: async ({ animeId, animeTitle }) => {
      const cast = await getAnimeCharactersForSeries(Number(animeId))
      return cast.map(character => mapAniListCharacterToImported(character, animeId, animeTitle))
    },
  }
}
