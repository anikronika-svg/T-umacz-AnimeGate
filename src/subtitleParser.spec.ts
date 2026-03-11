import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildAssOrSsaContent, parseAssOrSsa } from './subtitleParser'

const here = path.dirname(fileURLToPath(import.meta.url))

function readFixture(name: string): string {
  return readFileSync(path.join(here, 'test', 'fixtures', 'ass', `${name}.ass`), 'utf-8')
}

function roundTrip(content: string): {
  first: ReturnType<typeof parseAssOrSsa>
  serialized: string
  second: ReturnType<typeof parseAssOrSsa>
} {
  const first = parseAssOrSsa(content)
  const serialized = buildAssOrSsaContent(
    first,
    first.rows.map(row => ({
      id: row.id,
      source: row.source,
      sourceRaw: row.sourceRaw,
      target: row.target,
      style: row.style,
    })),
  )
  const second = parseAssOrSsa(serialized)
  return { first, serialized, second }
}

describe('subtitleParser round-trip ASS', () => {
  it.each(['basic', 'tags', 'newline', 'tlmode'])('%s: parse -> serialize -> parse keeps row/sourceRaw consistency', fixtureName => {
    const content = readFixture(fixtureName)
    const { first, second } = roundTrip(content)

    expect(second.rows).toHaveLength(first.rows.length)
    expect(second.rows.map(row => row.sourceRaw)).toEqual(first.rows.map(row => row.sourceRaw))
    expect(second.rows.map(row => row.start)).toEqual(first.rows.map(row => row.start))
    expect(second.rows.map(row => row.end)).toEqual(first.rows.map(row => row.end))
  })

  it('preserves ASS tags in sourceRaw and keeps plain text in source', () => {
    const { first, second } = roundTrip(readFixture('tags'))
    const initialRow = first.rows[0]
    const reparsedRow = second.rows[0]

    expect(initialRow.sourceRaw).toContain('{\\an8}')
    expect(initialRow.sourceRaw).toContain('{\\i1}')
    expect(initialRow.sourceRaw).toContain('\\N')
    expect(initialRow.source).toBe('Top line\nBottom line')

    expect(reparsedRow.sourceRaw).toBe(initialRow.sourceRaw)
    expect(reparsedRow.source).toBe(initialRow.source)
  })

  it('preserves \\N markers through round-trip and keeps sourceRaw intact', () => {
    const { first, second, serialized } = roundTrip(readFixture('newline'))
    const initialRow = first.rows[0]
    const reparsedRow = second.rows[0]

    expect(initialRow.sourceRaw).toBe('One\\NTwo\\NThree')
    expect(initialRow.source).toBe('One\nTwo\nThree')

    expect(serialized).toContain('One\\NTwo\\NThree')
    expect(reparsedRow.sourceRaw).toBe('One\\NTwo\\NThree')
    expect(reparsedRow.source).toBe('One\nTwo\nThree')
  })

  it('keeps TLmode pair semantics after round-trip', () => {
    const { first, second } = roundTrip(readFixture('tlmode'))

    expect(first.map[0]?.mode).toBe('paired')
    expect(second.map[0]?.mode).toBe('paired')
    expect(second.rows[0]?.sourceRaw).toBe(first.rows[0]?.sourceRaw)
    expect(second.rows[0]?.target).toBe(first.rows[0]?.target)
  })
})
