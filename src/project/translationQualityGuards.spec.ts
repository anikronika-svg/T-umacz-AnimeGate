import { describe, expect, it } from 'vitest'
import { tokenizeAssForTranslation } from './assTranslationPreprocessor'
import {
  buildChunkContextHints,
  isOverAggressiveShortLineRewrite,
  isShortSubtitleUtterance,
  stabilizeTonePunctuation,
} from './translationQualityGuards'

describe('translationQualityGuards', () => {
  it('detects short subtitle utterances conservatively', () => {
    expect(isShortSubtitleUtterance('Run!')).toBe(true)
    expect(isShortSubtitleUtterance('\\NNo way')).toBe(true)
    expect(isShortSubtitleUtterance('I will protect everyone today.')).toBe(false)
  })

  it('flags over-expanded rewrites for short lines', () => {
    expect(isOverAggressiveShortLineRewrite('Run!', 'Biegnijcie teraz natychmiast wszyscy szybko do wyjścia!')).toBe(true)
    expect(isOverAggressiveShortLineRewrite('Run!', 'Uciekaj!')).toBe(false)
  })

  it('stabilizes end punctuation to preserve tone cues', () => {
    expect(stabilizeTonePunctuation('What?', 'Co.')).toBe('Co?')
    expect(stabilizeTonePunctuation('No!', 'Nie.')).toBe('Nie!')
    expect(stabilizeTonePunctuation('Fine.', 'Dobrze.')).toBe('Dobrze.')
  })

  it('builds chunk-level semantic hints around ASS tags', () => {
    const tokens = tokenizeAssForTranslation('{\\i1}I guess{\\i0} we should go')
    const firstHints = buildChunkContextHints(tokens, 1)
    expect(firstHints.previousChunkHint).toBe('')
    expect(firstHints.nextChunkHint).toBe('we should go')

    const secondHints = buildChunkContextHints(tokens, 3)
    expect(secondHints.previousChunkHint).toBe('I guess')
    expect(secondHints.nextChunkHint).toBe('')
  })
})
