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

  it('strips <think> blocks (deepseek-r1)', () => {
    const input = '<think>\nThe user wants me to translate this from Japanese to Polish.\nLet me think...\n</think>\nPoczekaj chwilę!'
    expect(normalizeLlmOutput(input)).toBe('Poczekaj chwilę!')
  })

  it('strips <think> block when entire output is thinking + translation', () => {
    const input = '<think>analyze</think>Dokąd idziesz?'
    expect(normalizeLlmOutput(input)).toBe('Dokąd idziesz?')
  })

  it('strips "Here is the translation:" preamble', () => {
    expect(normalizeLlmOutput('Here is the translation: Nie mogę uwierzyć.')).toBe('Nie mogę uwierzyć.')
    expect(normalizeLlmOutput("Here's the Polish translation: Chodźmy razem!")).toBe('Chodźmy razem!')
  })

  it('strips multi-line preamble when first line ends with colon', () => {
    const input = 'Here is the Polish subtitle:\nTo jest prawda.'
    expect(normalizeLlmOutput(input)).toBe('To jest prawda.')
  })

  it('strips trailing note annotations', () => {
    expect(normalizeLlmOutput('Poczekaj! [note: kept short for readability]')).toBe('Poczekaj!')
    expect(normalizeLlmOutput('Chodź. (note: informal register)')).toBe('Chodź.')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeLlmOutput('')).toBe('')
    expect(normalizeLlmOutput('   ')).toBe('')
  })

  it('returns empty string when only <think> block', () => {
    expect(normalizeLlmOutput('<think>all thinking, no output</think>')).toBe('')
  })

  it('preserves clean Polish translation unchanged', () => {
    const clean = 'Nie mogę w to uwierzyć!'
    expect(normalizeLlmOutput(clean)).toBe(clean)
  })
})
