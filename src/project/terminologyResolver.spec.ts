import { describe, expect, it } from 'vitest'
import { resolveTerminologyMatch } from './terminologyResolver'

describe('terminologyResolver', () => {
  it('matches exact terms case-insensitively', () => {
    const terms = {
      'hunter guild': 'Gildia Łowców',
      'red flame': 'Czerwony Płomień',
    }
    expect(resolveTerminologyMatch('Hunter Guild', terms)).toBe('Gildia Łowców')
    expect(resolveTerminologyMatch('Red Flame', terms)).toBe('Czerwony Płomień')
  })

  it('ignores trailing punctuation', () => {
    const terms = { 'hunter guild': 'Gildia Łowców' }
    expect(resolveTerminologyMatch('Hunter Guild!', terms)).toBe('Gildia Łowców')
  })
})
