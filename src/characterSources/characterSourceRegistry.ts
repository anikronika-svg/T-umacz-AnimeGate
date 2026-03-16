import type { CharacterSourceId, CharacterSourceProvider } from './types'
import { createAniListProvider } from './anilistProvider'
import { createMalProvider } from './malProvider'

export function buildCharacterSourceProvider(
  sourceId: CharacterSourceId,
  deps: {
    malClientId?: string
    apiRequest?: (args: { url: string; method?: string; headers?: Record<string, string>; timeoutMs?: number }) => Promise<{ ok: boolean; status: number; statusText: string; body: string; error?: { message: string } }>
  },
): CharacterSourceProvider {
  if (sourceId === 'mal') {
    return createMalProvider({ clientId: deps.malClientId, apiRequest: deps.apiRequest })
  }
  return createAniListProvider()
}
