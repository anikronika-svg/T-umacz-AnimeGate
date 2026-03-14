import { describe, expect, it } from 'vitest'
import { normalizeLlmOutput } from './llmOutputNormalizer'

describe('normalizeLlmOutput', () => {
  it('strips code fences', () => {
    const input = '```text\nTo jest test.\n```'
    expect(normalizeLlmOutput(input)).toBe('To jest test.')
  })

  it('removes leading labels', () => {
    expect(normalizeLlmOutput('Translation: To jest dobrze.')).toBe('To jest dobrze.')
    expect(normalizeLlmOutput('Polish - Dobrze.')).toBe('Dobrze.')
  })

  it('strips wrapping quotes', () => {
    expect(normalizeLlmOutput('"To jest test."')).toBe('To jest test.')
  })
})
