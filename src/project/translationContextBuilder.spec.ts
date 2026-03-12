import { describe, expect, it } from 'vitest'
import { buildTranslationLineContextHints } from './translationContextBuilder'

describe('translationContextBuilder', () => {
  it('uses previous line context when previous ends with comma', () => {
    const rows = [
      { sourceRaw: 'He was crying,', source: 'He was crying,' },
      { sourceRaw: 'quietly, alone.', source: 'quietly, alone.' },
    ]

    const hints = buildTranslationLineContextHints(rows, 1)
    expect(hints.previousLineContinuation).toBe('He was crying,')
  })

  it('does not force previous context after terminal punctuation', () => {
    const rows = [
      { sourceRaw: 'He was crying.', source: 'He was crying.' },
      { sourceRaw: 'She looked away.', source: 'She looked away.' },
    ]

    const hints = buildTranslationLineContextHints(rows, 1)
    expect(hints.previousLineContinuation).toBe('')
  })

  it('provides next-line hint when current line is likely truncated', () => {
    const rows = [
      { sourceRaw: 'The leader of the invincible party,', source: 'The leader of the invincible party,' },
      { sourceRaw: 'Arena Rex!', source: 'Arena Rex!' },
    ]

    const hints = buildTranslationLineContextHints(rows, 0)
    expect(hints.nextLineHint).toBe('Arena Rex!')
  })
})
