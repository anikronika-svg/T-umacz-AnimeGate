import { describe, expect, it } from 'vitest'
import { mergeTranslationMemoryEntries, resolveTranslationMemoryEntry, resolveTranslationMemoryWithPriority } from './translationMemoryEngine'

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

  it('resolves memory with priority ordering', () => {
    const reviewed = [{ source: 'Hello', target: 'Siema', usageCount: 5 }]
    const project = [{ source: 'Hello', target: 'Cześć', usageCount: 10 }]
    const global = [{ source: 'Hello', target: 'Witaj', usageCount: 1 }]
    const match = resolveTranslationMemoryWithPriority('Hello', [reviewed, project, global])
    expect(match?.target).toBe('Siema')
  })
})
