import { describe, expect, it } from 'vitest'
import { classifyUntranslatedLine, isNonTranslatableProperNounLine } from './translationHeuristics'

describe('translationHeuristics', () => {
  it('classifies short normal lines as translatable', () => {
    expect(classifyUntranslatedLine('Okay!').kind).toBe('translate')
    expect(classifyUntranslatedLine('Hey!').kind).toBe('translate')
    expect(classifyUntranslatedLine('Red').kind).toBe('translate')
    expect(classifyUntranslatedLine('Hello, Uncle!').kind).toBe('translate')
    expect(classifyUntranslatedLine('Yes, Auntie!').kind).toBe('translate')
    expect(classifyUntranslatedLine('Master!').kind).toBe('translate')
    expect(classifyUntranslatedLine('Episode 15').kind).toBe('translate')
    expect(classifyUntranslatedLine('Rabbit!').kind).toBe('translate')
    expect(classifyUntranslatedLine('Kill.').kind).toBe('translate')
  })

  it('classifies clear proper nouns and special terms as copy', () => {
    expect(classifyUntranslatedLine('Yokohama').kind).toBe('copy')
    expect(classifyUntranslatedLine('Shadow Burst!').kind).toBe('copy')
    expect(classifyUntranslatedLine('Grand Palace').kind).toBe('copy')
  })

  it('warns on ambiguous mixed-case short lines', () => {
    expect(classifyUntranslatedLine('Magic sword').kind).toBe('warn')
  })

  it('respects glossary matches', () => {
    const glossary = [{ source: 'Yokohama', preferred: 'Yokohama', alternatives: '', active: true }]
    expect(classifyUntranslatedLine('Yokohama', { glossary }).kind).toBe('glossary')
  })

  it('keeps legacy helper aligned with classifier', () => {
    expect(isNonTranslatableProperNounLine('Arena Rex!')).toBe(true)
    expect(isNonTranslatableProperNounLine('Shadow Burst!')).toBe(true)
    expect(isNonTranslatableProperNounLine('Tino!')).toBe(true)
    expect(isNonTranslatableProperNounLine('Grand Palace')).toBe(true)
    expect(isNonTranslatableProperNounLine('He was crying, quietly, alone.')).toBe(false)
    expect(isNonTranslatableProperNounLine('{\\an8}Please wait.')).toBe(false)
  })
})
