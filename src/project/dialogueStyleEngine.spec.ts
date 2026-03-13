import { describe, expect, it } from 'vitest'
import { dialogueStyleEngine } from './dialogueStyleEngine'

describe('dialogueStyleEngine', () => {
  it('rewrites literal phrases into natural dialogue', () => {
    expect(dialogueStyleEngine('Denerwuje mnie to odkąd tu przybyłem.'))
      .toBe('Odkąd tu przybyłem, coś mi tu nie pasuje.')
    expect(dialogueStyleEngine('Co o tym sądzisz?')).toBe('Jak myślisz?')
  })

  it('does not expand very short lines', () => {
    expect(dialogueStyleEngine('Hej!')).toBe('Hej!')
  })

  it('preserves ASS tags', () => {
    const input = '{\\an8}Co o tym sądzisz?'
    expect(dialogueStyleEngine(input)).toBe('{\\an8}Jak myślisz?')
  })
})
