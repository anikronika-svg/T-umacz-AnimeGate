import { describe, expect, it } from 'vitest'
import {
  buildContinuationContextFromPreviousLine,
  hasAssTechnicalMarkers,
  hasTranslatableAssText,
  stripAssFormattingForTranslation,
  tokenizeAssForTranslation,
} from './assTranslationPreprocessor'

describe('assTranslationPreprocessor', () => {
  it('ignores ASS tags and \\N markers in translatable chunks', () => {
    const tokensA = tokenizeAssForTranslation('\\Ncreate')
    expect(tokensA).toEqual([
      { type: 'tag', value: '\\N' },
      { type: 'text', value: 'create' },
    ])

    const tokensB = tokenizeAssForTranslation('{\\an8}Hello')
    expect(tokensB).toEqual([
      { type: 'tag', value: '{\\an8}' },
      { type: 'text', value: 'Hello' },
    ])

    const tokensC = tokenizeAssForTranslation('{\\i1}Please{\\i0} wait')
    expect(tokensC).toEqual([
      { type: 'tag', value: '{\\i1}' },
      { type: 'text', value: 'Please' },
      { type: 'tag', value: '{\\i0}' },
      { type: 'text', value: ' wait' },
    ])
  })

  it('strips only technical ASS formatting for semantic preprocessing', () => {
    expect(stripAssFormattingForTranslation('\\NTino')).toBe(' Tino')
    expect(stripAssFormattingForTranslation('{\\an8}Hello')).toBe('Hello')
    expect(stripAssFormattingForTranslation('{\\i1}Please{\\i0} wait')).toBe('Please wait')
  })

  it('detects translatable text and technical markers', () => {
    expect(hasTranslatableAssText('\\Ncreate')).toBe(true)
    expect(hasTranslatableAssText('{\\i1}{\\i0}')).toBe(false)
    expect(hasAssTechnicalMarkers('plain text')).toBe(false)
    expect(hasAssTechnicalMarkers('{\\an8}Hello')).toBe(true)
  })

  it('builds continuation context only for line-ending continuation punctuation', () => {
    expect(buildContinuationContextFromPreviousLine('He was crying,')).toBe('He was crying,')
    expect(buildContinuationContextFromPreviousLine('He was crying...')).toBe('He was crying...')
    expect(buildContinuationContextFromPreviousLine('{\\an8}He was crying,')).toBe('He was crying,')
    expect(buildContinuationContextFromPreviousLine('He was crying.')).toBe('')
    expect(buildContinuationContextFromPreviousLine('She looked away!')).toBe('')
  })

  it('handles hard edge ASS marker lines without false translatable chunks', () => {
    expect(hasTranslatableAssText('{\\an8}\\N{\\i1}{\\i0}')).toBe(false)
    expect(stripAssFormattingForTranslation('{\\an8}\\N{\\i1}{\\i0}')).toBe(' ')
    expect(tokenizeAssForTranslation('{\\an8}\\N{\\i1}{\\i0}').every(token => token.type === 'tag')).toBe(true)
  })

  it('normalizes continuation safely for lines with mixed tags and irregular whitespace', () => {
    expect(stripAssFormattingForTranslation('{\\i1}Please{\\i0}   wait')).toBe('Please   wait')
    expect(buildContinuationContextFromPreviousLine('{\\an8}  Even now,   ')).toBe('Even now,')
    expect(buildContinuationContextFromPreviousLine('{\\an8}To chyba...')).toBe('To chyba...')
  })
})
