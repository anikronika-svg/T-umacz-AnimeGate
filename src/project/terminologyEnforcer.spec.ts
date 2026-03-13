import { describe, expect, it } from 'vitest'
import { enforceProjectTerminology } from './terminologyEnforcer'

describe('terminologyEnforcer', () => {
  const terms = {
    relics: 'relikty',
    artifact: 'artefakt',
  }

  it('replaces english leaks with canonical terms', () => {
    expect(enforceProjectTerminology('Find the relics.', terms)).toBe('Find the relikty.')
  })

  it('keeps Polish inflection intact for already inflected variants', () => {
    expect(enforceProjectTerminology('Te relikwie to artefakty.', terms)).toBe('Te relikwie to artefakty.')
    expect(enforceProjectTerminology('Brak relikwii i artefaktów.', terms)).toBe('Brak relikwii i artefaktów.')
    expect(enforceProjectTerminology('Sam artefakt jest ważny.', terms)).toBe('Sam artefakt jest ważny.')
  })

  it('preserves ASS tags and markers', () => {
    const input = '{\\i1}relics{\\i0} \\N artefaktów'
    expect(enforceProjectTerminology(input, terms)).toBe('{\\i1}relikty{\\i0} \\N artefaktów')
  })
})
