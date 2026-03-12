import { describe, expect, it } from 'vitest'
import { parseBulkCharacterNotes } from './bulkCharacterNotesParser'

describe('parseBulkCharacterNotes', () => {
  const characters = [
    { id: 1, name: 'Itaru Hashida' },
    { id: 2, name: 'Kurisu Makise' },
    { id: 3, name: 'Mayuri Shiina' },
    { id: 4, name: 'Rintarou Okabe' },
  ]

  it('splits pasted wall text into character note sections', () => {
    const raw = [
      'Itaru Hashida',
      'To glosny, otwarty i zartobliwy typ.',
      '',
      'Kurisu Makise',
      'Bardzo inteligentna i logiczna.',
      '',
      'Okabe Rintarou',
      'Ekscentryczny i teatralny.',
    ].join('\n')

    const parsed = parseBulkCharacterNotes(raw, characters)

    expect(parsed.matched).toHaveLength(3)
    expect(parsed.matched.find(item => item.characterName === 'Itaru Hashida')?.notes).toContain('zartobliwy')
    expect(parsed.matched.find(item => item.characterName === 'Kurisu Makise')?.notes).toContain('logiczna')
    expect(parsed.matched.find(item => item.characterName === 'Rintarou Okabe')?.notes).toContain('teatralny')
  })

  it('reports unmatched sections when header is unknown', () => {
    const raw = [
      'Unknown Character',
      'Opis nierozpoznanej postaci.',
      '',
      'Mayuri',
      'Lagodna i ciepla.',
    ].join('\n')

    const parsed = parseBulkCharacterNotes(raw, characters)
    expect(parsed.matched).toHaveLength(1)
    expect(parsed.matched[0].characterName).toBe('Mayuri Shiina')
    expect(parsed.unmatchedSections.length).toBeGreaterThanOrEqual(1)
  })
})
