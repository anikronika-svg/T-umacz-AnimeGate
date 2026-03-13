import { describe, expect, it } from 'vitest'
import { mergeTranslationMemoryEntries, resolveTranslationMemoryEntry } from './translationMemoryEngine'

describe('translationMemoryEngine', () => {
  it('resolves memory entry by normalized key', () => {
    const entries = [
      { source: 'Hello!', target: 'Cześć!', projectId: 'P1', usageCount: 2 },
    ]
    const match = resolveTranslationMemoryEntry(entries, 'hello', 'P1')
    expect(match?.target).toBe('Cześć!')
  })

  it('merges entries without duplicates', () => {
    const existing = [
      { source: 'Run', target: 'Biegnij', projectId: 'P1' },
    ]
    const incoming = [
      { source: 'Run', target: 'Biegnij', projectId: 'P1' },
      { source: 'Stop', target: 'Stój', projectId: 'P1' },
    ]
    const merged = mergeTranslationMemoryEntries(existing, incoming, 'P1')
    expect(merged.length).toBe(2)
  })
})
