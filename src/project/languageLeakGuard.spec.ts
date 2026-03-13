import { describe, expect, it } from 'vitest'
import { guardLanguageLeaks } from './languageLeakGuard'

describe('languageLeakGuard', () => {
  it('flags mixed language output', () => {
    const result = guardLanguageLeaks('Find the relikty.', { terms: { relics: 'relikty' } })
    expect(result.requiresManualCheck).toBe(true)
    expect(result.detection.mixed).toBe(true)
    expect(result.detection.englishTokens.length).toBeGreaterThan(0)
  })

  it('flags english leaks', () => {
    const result = guardLanguageLeaks('This relic is dangerous.')
    expect(result.requiresManualCheck).toBe(true)
    expect(result.detection.englishTokens.length).toBeGreaterThan(0)
  })

  it('does not flag clean Polish lines', () => {
    const result = guardLanguageLeaks('Znajdź relikty.')
    expect(result.requiresManualCheck).toBe(false)
  })

  it('preserves ASS tags', () => {
    const result = guardLanguageLeaks('{\\i1}relics{\\i0}', { terms: { relics: 'relikty' } })
    expect(result.value).toBe('{\\i1}relikty{\\i0}')
  })

  it('avoids false alarms for short proper nouns', () => {
    const result = guardLanguageLeaks('Yokohama.')
    expect(result.requiresManualCheck).toBe(false)
  })
})
