import { describe, expect, it } from 'vitest'
import { normalizeSemanticWhitespace, sanitizeTranslationChunk } from './subtitleTextSanitizer'

describe('subtitleTextSanitizer', () => {
  it('normalizes semantic whitespace', () => {
    expect(normalizeSemanticWhitespace('  Please\n\t wait   now  ')).toBe('Please wait now')
  })

  it('keeps edge spacing around sanitized chunks', () => {
    expect(sanitizeTranslationChunk(' wait')).toBe(' wait')
    expect(sanitizeTranslationChunk('wait ')).toBe('wait ')
    expect(sanitizeTranslationChunk('  wait   now  ')).toBe(' wait now ')
  })
})
