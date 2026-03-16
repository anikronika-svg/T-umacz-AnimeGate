import type { AnimeSearchResult, CharacterRole, CharacterSourceProvider, ImportedCharacter } from './types'

interface MalSearchResponse {
  data?: Array<{
    node: {
      id: number
      title: string
      alternative_titles?: {
        en?: string
        ja?: string
      }
      num_episodes?: number
    }
  }>
}

interface MalCharacterEntry {
  role?: string
  character?: {
    id: number
    name: string
    pictures?: Array<{ small?: string; medium?: string }>
    main_picture?: { medium?: string; large?: string }
  }
  voice_actors?: Array<{
    language?: string
    person?: { id: number; name: string }
  }>
}

interface MalCharactersResponse {
  data?: Array<MalCharacterEntry>
}

interface MalCharacterDetail {
  id: number
  name: string
  about?: string
  gender?: string
}

const MAL_API = 'https://api.myanimelist.net/v2'

function normalizeRole(value?: string | null): CharacterRole {
  const raw = (value ?? '').toUpperCase()
  if (raw === 'MAIN') return 'main'
  if (raw === 'SUPPORTING') return 'supporting'
  if (raw === 'BACKGROUND') return 'background'
  return 'unknown'
}

function normalizeGender(value?: string | null): string | undefined {
  if (!value) return undefined
  const raw = value.toLowerCase()
  if (raw.includes('female')) return 'Female'
  if (raw.includes('male')) return 'Male'
  if (raw.includes('nonbinary') || raw.includes('non-binary')) return 'Nonbinary'
  return undefined
}

function splitName(full: string): { first?: string; last?: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { first: parts[0] }
  return {
    first: parts[0],
    last: parts.slice(1).join(' '),
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function requestMal(
  url: string,
  clientId: string,
  apiRequest?: (args: { url: string; method?: string; headers?: Record<string, string>; timeoutMs?: number }) => Promise<{ ok: boolean; status: number; statusText: string; body: string; error?: { message: string } }>,
): Promise<string> {
  const headers = { 'X-MAL-CLIENT-ID': clientId }
  if (apiRequest) {
    const result = await apiRequest({ url, method: 'GET', headers, timeoutMs: 20000 })
    if (!result.ok) {
      throw new Error(result.error?.message || `MAL HTTP ${result.status}`)
    }
    return result.body
  }

  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`MAL HTTP ${response.status}`)
  return response.text()
}

export function mapMalCharacterToImported(
  entry: MalCharacterEntry,
  animeId: string,
  animeTitle: string,
  detail?: MalCharacterDetail,
): ImportedCharacter | null {
  const character = entry.character
  if (!character?.id || !character.name) return null
  const nameParts = splitName(character.name)
  const voice = entry.voice_actors?.[0]
  const imageUrl = character.main_picture?.large
    || character.main_picture?.medium
    || character.pictures?.[0]?.medium
    || character.pictures?.[0]?.small
    || undefined
  const description = detail?.about ? stripHtml(detail.about) : undefined
  const gender = normalizeGender(detail?.gender)
  return {
    source: 'mal',
    sourceAnimeId: animeId,
    sourceCharacterId: String(character.id),
    animeTitle,
    nameFull: character.name,
    nameFirst: nameParts.first,
    nameLast: nameParts.last,
    role: normalizeRole(entry.role),
    gender,
    imageUrl,
    voiceActorName: voice?.person?.name,
    voiceActorId: voice?.person?.id ? String(voice.person.id) : undefined,
    voiceActorLanguage: voice?.language,
    description,
    raw: { entry, detail },
  }
}

export function createMalProvider(args: {
  clientId?: string
  apiRequest?: (args: { url: string; method?: string; headers?: Record<string, string>; timeoutMs?: number }) => Promise<{ ok: boolean; status: number; statusText: string; body: string; error?: { message: string } }>
}): CharacterSourceProvider {
  const searchCache = new Map<string, AnimeSearchResult[]>()
  const characterCache = new Map<string, ImportedCharacter[]>()

  return {
    id: 'mal',
    label: 'MyAnimeList',
    isConfigured: () => {
      if (!args.clientId) return { ok: false, message: 'MAL API: brak Client ID (ustaw w konfiguracji API).' }
      return { ok: true }
    },
    searchAnime: async (query: string): Promise<AnimeSearchResult[]> => {
      const key = query.trim().toLowerCase()
      if (!key) return []
      if (searchCache.has(key)) return searchCache.get(key) as AnimeSearchResult[]
      if (!args.clientId) throw new Error('MAL API: brak Client ID.')

      const url = `${MAL_API}/anime?q=${encodeURIComponent(query)}&limit=8&fields=title,alternative_titles,num_episodes`
      const body = await requestMal(url, args.clientId, args.apiRequest)
      const parsed = JSON.parse(body) as MalSearchResponse
      const results = (parsed.data ?? []).map(item => ({
        id: String(item.node.id),
        title: item.node.title || item.node.alternative_titles?.en || item.node.alternative_titles?.ja || `Anime #${item.node.id}`,
        seasonLabel: item.node.num_episodes ? `${item.node.num_episodes} odc` : 'brak danych',
        source: 'mal' as const,
        raw: item,
      }))
      searchCache.set(key, results)
      return results
    },
    getCharactersForAnime: async ({ animeId, animeTitle }): Promise<ImportedCharacter[]> => {
      const cacheKey = `${animeId}`
      if (characterCache.has(cacheKey)) return characterCache.get(cacheKey) as ImportedCharacter[]
      if (!args.clientId) throw new Error('MAL API: brak Client ID.')

      const url = `${MAL_API}/anime/${encodeURIComponent(animeId)}/characters`
      const body = await requestMal(url, args.clientId, args.apiRequest)
      const parsed = JSON.parse(body) as MalCharactersResponse
      const entries = parsed.data ?? []

      const details = new Map<number, MalCharacterDetail>()
      for (const entry of entries) {
        const characterId = entry.character?.id
        if (!characterId) continue
        try {
          const detailUrl = `${MAL_API}/characters/${encodeURIComponent(String(characterId))}?fields=about,gender`
          const detailBody = await requestMal(detailUrl, args.clientId, args.apiRequest)
          details.set(characterId, JSON.parse(detailBody) as MalCharacterDetail)
        } catch {
          // Detail fetch optional; ignore individual failures.
        }
      }

      const imported = entries
        .map(entry => mapMalCharacterToImported(entry, animeId, animeTitle, entry.character?.id ? details.get(entry.character.id) : undefined))
        .filter((item): item is ImportedCharacter => Boolean(item))

      characterCache.set(cacheKey, imported)
      return imported
    },
  }
}
