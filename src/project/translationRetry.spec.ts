import { describe, expect, it } from 'vitest'
import { isEmptyTranslation, runProviderChain } from './translationRetry'

describe('translationRetry', () => {
  it('detects empty translation', () => {
    expect(isEmptyTranslation('')).toBe(true)
    expect(isEmptyTranslation('   ')).toBe(true)
    expect(isEmptyTranslation(null)).toBe(true)
    expect(isEmptyTranslation(undefined)).toBe(true)
    expect(isEmptyTranslation('ok')).toBe(false)
  })

  it('retries on empty response and succeeds', async () => {
    let calls = 0
    const result = await runProviderChain(['openai'], async () => {
      calls += 1
      if (calls === 1) return '   '
      return 'Dobrze.'
    }, {
      maxRetries: 2,
      shouldRetry: () => true,
    })
    expect(result.value).toBe('Dobrze.')
    expect(result.retries).toBeGreaterThan(0)
  })

  it('falls back to next provider when primary fails', async () => {
    const result = await runProviderChain(['primary', 'fallback'], async (provider) => {
      if (provider === 'primary') throw new Error('fail')
      return 'OK'
    }, {
      maxRetries: 0,
      shouldRetry: () => false,
    })
    expect(result.value).toBe('OK')
    expect(result.provider).toBe('fallback')
    expect(result.fallbacks).toBeGreaterThan(0)
  })

  it('marks skip without retries', async () => {
    let calls = 0
    const result = await runProviderChain(['skipme', 'ok'], async (provider) => {
      calls += 1
      if (provider === 'skipme') throw new Error('missing-api-key')
      return 'Tak'
    }, {
      maxRetries: 2,
      shouldRetry: () => true,
      shouldSkip: (error) => error instanceof Error && error.message === 'missing-api-key',
    })
    expect(result.value).toBe('Tak')
    expect(calls).toBe(2)
  })
})
