import { useCallback, useMemo, useState } from 'react'
import type { AnimeSearchResult, CharacterSourceId, CharacterSourceProvider, ImportedCharacter } from '../characterSources/types'

interface UseCharacterImportStepArgs {
  provider: CharacterSourceProvider
  characterSourceId: CharacterSourceId
  onProjectMetaUpdate?: (meta: { title: string; anilistId: number | null; characterSource?: CharacterSourceId }) => void
}

interface UseCharacterImportStepResult {
  search: string
  setSearch: (value: string) => void
  searchResults: AnimeSearchResult[]
  selectedAnime: AnimeSearchResult | null
  selectedAnimeCast: ImportedCharacter[]
  isSearching: boolean
  isLoadingCast: boolean
  searchError: string
  reset: () => void
  searchAnime: () => Promise<void>
  loadCast: (anime: AnimeSearchResult) => Promise<void>
}

export function useCharacterImportStep({
  provider,
  characterSourceId,
  onProjectMetaUpdate,
}: UseCharacterImportStepArgs): UseCharacterImportStepResult {
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<AnimeSearchResult[]>([])
  const [selectedAnime, setSelectedAnime] = useState<AnimeSearchResult | null>(null)
  const [selectedAnimeCast, setSelectedAnimeCast] = useState<ImportedCharacter[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingCast, setIsLoadingCast] = useState(false)
  const [searchError, setSearchError] = useState('')

  const reset = useCallback(() => {
    setSearch('')
    setSearchResults([])
    setSelectedAnime(null)
    setSelectedAnimeCast([])
    setIsSearching(false)
    setIsLoadingCast(false)
    setSearchError('')
  }, [])

  const loadCast = useCallback(async (anime: AnimeSearchResult): Promise<void> => {
    try {
      setIsLoadingCast(true)
      setSearchError('')
      const cast = await provider.getCharactersForAnime({ animeId: anime.id, animeTitle: anime.title })
      setSelectedAnime(anime)
      setSelectedAnimeCast(cast)
      onProjectMetaUpdate?.({
        title: anime.title,
        anilistId: characterSourceId === 'anilist' ? Number(anime.id) : null,
        characterSource: characterSourceId,
      })
      if (!cast.length) {
        setSearchError(`Nie znaleziono postaci w wybranym zrodle (${provider.label}).`)
      }
    } catch (error) {
      setSelectedAnime(anime)
      setSelectedAnimeCast([])
      setSearchError(error instanceof Error ? error.message : `Nie udalo sie pobrac postaci z ${provider.label}.`)
    } finally {
      setIsLoadingCast(false)
    }
  }, [provider, characterSourceId, onProjectMetaUpdate])

  const searchAnime = useCallback(async (): Promise<void> => {
    const query = search.trim()
    if (!query) {
      setSearchResults([])
      setSelectedAnime(null)
      setSelectedAnimeCast([])
      setSearchError('')
      return
    }

    try {
      const configStatus = provider.isConfigured()
      if (!configStatus.ok) {
        setSearchResults([])
        setSelectedAnime(null)
        setSelectedAnimeCast([])
        setSearchError(configStatus.message || 'Wybrane API nie jest skonfigurowane.')
        return
      }
      setIsSearching(true)
      setSearchError('')
      const results = await provider.searchAnime(query)
      setSearchResults(results)
      if (!results.length) {
        setSelectedAnime(null)
        setSelectedAnimeCast([])
        setSearchError('Brak wynikow dla podanej nazwy anime.')
      }
    } catch (error) {
      setSearchResults([])
      setSelectedAnime(null)
      setSelectedAnimeCast([])
      setSearchError(error instanceof Error ? error.message : `Nie udalo sie pobrac wynikow z ${provider.label}.`)
    } finally {
      setIsSearching(false)
    }
  }, [search, provider])

  return useMemo(() => ({
    search,
    setSearch,
    searchResults,
    selectedAnime,
    selectedAnimeCast,
    isSearching,
    isLoadingCast,
    searchError,
    reset,
    searchAnime,
    loadCast,
  }), [search, searchResults, selectedAnime, selectedAnimeCast, isSearching, isLoadingCast, searchError, reset, searchAnime, loadCast])
}
