export type CharacterSourceId = 'anilist' | 'mal'

export type CharacterRole = 'main' | 'supporting' | 'background' | 'unknown'

export interface AnimeSearchResult {
  id: string
  title: string
  seasonLabel?: string
  source: CharacterSourceId
  raw?: unknown
}

export interface ImportedCharacter {
  source: CharacterSourceId
  sourceAnimeId: string
  sourceCharacterId: string
  animeTitle: string
  nameFull: string
  nameFirst?: string
  nameLast?: string
  nameNative?: string
  role?: CharacterRole
  gender?: string
  imageUrl?: string
  voiceActorName?: string
  voiceActorLanguage?: string
  voiceActorId?: string
  description?: string
  raw?: unknown
}

export interface CharacterSourceProvider {
  id: CharacterSourceId
  label: string
  isConfigured: () => { ok: boolean; message?: string }
  searchAnime: (query: string) => Promise<AnimeSearchResult[]>
  getCharactersForAnime: (args: { animeId: string; animeTitle: string }) => Promise<ImportedCharacter[]>
}
