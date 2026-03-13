import { describe, expect, it } from 'vitest'
import { tuneSubtitleReadability } from './subtitleReadabilityTuner'

describe('subtitleReadabilityTuner', () => {
  it('shortens overly literal long line', () => {
    const input = 'W tej chwili tak naprawdę nie jestem w stanie tego zrobić.'
    const result = tuneSubtitleReadability(input)
    expect(result.value).toBe('Teraz nie mogę tego zrobić.')
    expect(result.tuned).toBe(true)
  })

  it('preserves short line', () => {
    const input = 'Dzięki!'
    const result = tuneSubtitleReadability(input)
    expect(result.value).toBe(input)
    expect(result.tuned).toBe(false)
  })

  it('preserves ASS tags', () => {
    const input = '{\\i1}W tej chwili tak naprawdę{\\i0} nie mogę.'
    const result = tuneSubtitleReadability(input)
    expect(result.value).toBe('{\\i1}Teraz{\\i0} nie mogę.')
  })

  it('preserves \\N markers', () => {
    const input = 'W tej chwili\\Ntak naprawdę nie mogę.'
    const result = tuneSubtitleReadability(input)
    expect(result.value).toBe('Teraz\\Nnie mogę.')
  })

  it('avoids over-stylization', () => {
    const input = 'To była naprawdę dobra decyzja.'
    const result = tuneSubtitleReadability(input)
    expect(result.tuned).toBe(false)
  })
})
