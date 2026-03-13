import { describe, expect, it } from 'vitest'
import { classifyLineSemantic } from './lineSemanticClassifier'

describe('lineSemanticClassifier', () => {
  it('classifies normal dialog lines', () => {
    expect(classifyLineSemantic('Okay!').type).toBe('SHORT_REPLY')
    expect(classifyLineSemantic('Hey!').type).toBe('INTERJECTION')
    expect(classifyLineSemantic('Red').type).toBe('NORMAL_DIALOG')
    expect(classifyLineSemantic('Hello, Uncle!').type).toBe('NORMAL_DIALOG')
    expect(classifyLineSemantic('Yes, Auntie!').type).toBe('NORMAL_DIALOG')
    expect(classifyLineSemantic('Master!').type).toBe('NORMAL_DIALOG')
    expect(classifyLineSemantic('Episode 15').type).toBe('NORMAL_DIALOG')
    expect(classifyLineSemantic('Rabbit!').type).toBe('NORMAL_DIALOG')
    expect(classifyLineSemantic('Kill.').type).toBe('NORMAL_DIALOG')
  })

  it('classifies proper nouns and world terms', () => {
    expect(classifyLineSemantic('Yokohama').type).toBe('PROPER_NOUN')
    expect(classifyLineSemantic('Hunter Guild').type).toBe('WORLD_TERM')
    expect(classifyLineSemantic('Red Flame').type).toBe('WORLD_TERM')
    expect(classifyLineSemantic('Shadow Burst!').type).toBe('WORLD_TERM')
  })

  it('classifies interjections and short replies', () => {
    expect(classifyLineSemantic('Ah!').type).toBe('INTERJECTION')
    expect(classifyLineSemantic('Huh?').type).toBe('INTERJECTION')
    expect(classifyLineSemantic('Yes').type).toBe('SHORT_REPLY')
    expect(classifyLineSemantic('No').type).toBe('SHORT_REPLY')
  })

  it('flags uncertain mixed-case short phrases', () => {
    expect(classifyLineSemantic('Magic sword').type).toBe('UNCERTAIN')
  })
})
