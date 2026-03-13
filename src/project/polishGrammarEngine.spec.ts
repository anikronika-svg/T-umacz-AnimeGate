import { describe, expect, it } from 'vitest'
import { polishGrammarEngine } from './polishGrammarEngine'

describe('polishGrammarEngine', () => {
  it('fixes known MT grammar patterns', () => {
    expect(polishGrammarEngine('żeby tam była takiej dziury')).toBe('żeby tam była taka dziura')
    expect(polishGrammarEngine('odkąd tu przybyłem zgodnie z instrukcjami')).toBe('odkąd tu przybyłem na polecenie')
  })

  it('preserves ASS tags while applying fixes', () => {
    const input = '{\\i1}żeby tam była takiej dziury{\\i0}'
    expect(polishGrammarEngine(input)).toBe('{\\i1}żeby tam była taka dziura{\\i0}')
  })
})
