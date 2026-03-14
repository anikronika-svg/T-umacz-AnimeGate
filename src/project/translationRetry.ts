export type ProviderAttemptStatus = 'start' | 'success' | 'error' | 'retry' | 'fallback' | 'skipped'

export interface ProviderAttemptLog {
  provider: string
  attempt: number
  status: ProviderAttemptStatus
  responseLength?: number
  errorMessage?: string
}

export interface ProviderChainResult {
  value: string
  provider: string
  attempts: number
  retries: number
  fallbacks: number
  latencyMs: number
}

export function isEmptyTranslation(value: string | null | undefined): boolean {
  if (!value) return true
  return value.trim().length === 0
}

export async function runProviderChain(
  providers: string[],
  translate: (provider: string) => Promise<string>,
  opts: {
    maxRetries: number
    shouldRetry: (error: unknown) => boolean
    shouldSkip?: (error: unknown) => boolean
    onAttempt?: (log: ProviderAttemptLog) => void
  },
): Promise<ProviderChainResult> {
  const { maxRetries, shouldRetry, shouldSkip, onAttempt } = opts
  let lastError: unknown = null
  let retries = 0
  let fallbacks = 0
  let totalAttempts = 0

  for (let providerIndex = 0; providerIndex < providers.length; providerIndex += 1) {
    const provider = providers[providerIndex]
    const providerStart = Date.now()
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      totalAttempts += 1
      onAttempt?.({ provider, attempt: attempt + 1, status: 'start' })
      try {
        const translated = await translate(provider)
        if (isEmptyTranslation(translated)) {
          const error = new Error('empty-response')
          onAttempt?.({ provider, attempt: attempt + 1, status: 'error', responseLength: 0, errorMessage: 'empty-response' })
          if (!shouldRetry(error) || attempt >= maxRetries) {
            lastError = error
            break
          }
          retries += 1
          onAttempt?.({ provider, attempt: attempt + 1, status: 'retry', errorMessage: 'empty-response' })
          continue
        }
        onAttempt?.({ provider, attempt: attempt + 1, status: 'success', responseLength: translated.length })
        return {
          value: translated,
          provider,
          attempts: totalAttempts,
          retries,
          fallbacks,
          latencyMs: Date.now() - providerStart,
        }
      } catch (error) {
        if (shouldSkip?.(error)) {
          onAttempt?.({ provider, attempt: attempt + 1, status: 'skipped', errorMessage: error instanceof Error ? error.message : String(error) })
          lastError = error
          break
        }
        onAttempt?.({ provider, attempt: attempt + 1, status: 'error', responseLength: 0, errorMessage: error instanceof Error ? error.message : String(error) })
        if (!shouldRetry(error) || attempt >= maxRetries) {
          lastError = error
          break
        }
        retries += 1
        onAttempt?.({ provider, attempt: attempt + 1, status: 'retry', errorMessage: error instanceof Error ? error.message : String(error) })
      }
    }
    if (providerIndex < providers.length - 1) {
      fallbacks += 1
      onAttempt?.({ provider, attempt: 0, status: 'fallback' })
    }
  }

  throw (lastError instanceof Error ? lastError : new Error('translation-failed'))
}
