import { describe, expect, it } from 'vitest'
import { isNonTranslatableProperNounLine } from './translationHeuristics'

describe('translationHeuristics', () => {
  it('detects proper noun / special term lines', () => {
    expect(isNonTranslatableProperNounLine('Arena Rex!')).toBe(true)
    expect(isNonTranslatableProperNounLine('Shadow Burst!')).toBe(true)
    expect(isNonTranslatableProperNounLine('Tino!')).toBe(true)
    expect(isNonTranslatableProperNounLine('Grand Palace')).toBe(true)
  })

  it('does not match normal sentences', () => {
    expect(isNonTranslatableProperNounLine('He was crying, quietly, alone.')).toBe(false)
    expect(isNonTranslatableProperNounLine('She looked away.')).toBe(false)
    expect(isNonTranslatableProperNounLine('{\\an8}Please wait.')).toBe(false)
  })
})
