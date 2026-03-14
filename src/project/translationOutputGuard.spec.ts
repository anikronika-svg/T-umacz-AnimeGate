import { describe, expect, it } from 'vitest'
import { guardTranslationOutput } from './translationOutputGuard'

describe('translationOutputGuard', () => {
  it('blocks identical source passthrough', () => {
    const result = guardTranslationOutput('Hello there.', 'Hello there.')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('source-passthrough')
  })

  it('blocks identical passthrough even for polish text', () => {
    const result = guardTranslationOutput('To nie jest żart.', 'To nie jest żart.')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('source-passthrough')
  })

  it('blocks english output even if not identical', () => {
    const result = guardTranslationOutput('Hello there.', 'No problem.')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('english-blocked')
  })

  it('allows normal polish output', () => {
    const result = guardTranslationOutput('Hello there.', 'Nie ma sprawy.')
    expect(result.ok).toBe(true)
  })

  it('blocks mixed output with english leak', () => {
    const result = guardTranslationOutput('Hello there.', 'Nie ma problemu, sorry.')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('mixed-blocked')
  })

  it('allows polish output even when source is english', () => {
    const result = guardTranslationOutput('Find the relics.', 'Znajdź relikty.')
    expect(result.ok).toBe(true)
  })
})
