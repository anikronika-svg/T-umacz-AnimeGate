import { stripAssFormattingForTranslation } from './assTranslationPreprocessor'
import { normalizeSemanticWhitespace } from './subtitleTextSanitizer'

export interface TranslationMemoryEntryLike {
  source: string
  target: string
  character?: string
  projectId?: string
  usageCount?: number
}

export function normalizeMemoryKey(value: string): string {
  return normalizeSemanticWhitespace(stripAssFormattingForTranslation(value))
    .replace(/[!?。！？…]+$/u, '')
    .trim()
    .toLocaleLowerCase()
}

export function resolveTranslationMemoryEntry(
  entries: TranslationMemoryEntryLike[],
  source: string,
  projectId: string,
): TranslationMemoryEntryLike | null {
  const key = normalizeMemoryKey(source)
  if (!key) return null
  const matches = entries.filter(entry => entry.projectId === projectId && normalizeMemoryKey(entry.source) === key)
  if (!matches.length) return null
  return matches.sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))[0]
}

export function resolveTranslationMemoryWithPriority(
  source: string,
  priorityLists: TranslationMemoryEntryLike[][],
): TranslationMemoryEntryLike | null {
  const key = normalizeMemoryKey(source)
  if (!key) return null
  for (const entries of priorityLists) {
    if (!entries.length) continue
    const matches = entries.filter(entry => normalizeMemoryKey(entry.source) === key)
    if (!matches.length) continue
    return matches.sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))[0]
  }
  return null
}

export function mergeTranslationMemoryEntries(
  existing: TranslationMemoryEntryLike[],
  incoming: TranslationMemoryEntryLike[],
  projectId: string,
): TranslationMemoryEntryLike[] {
  const out: TranslationMemoryEntryLike[] = []
  const seen = new Set<string>()
  const addEntry = (entry: TranslationMemoryEntryLike): void => {
    const key = `${normalizeMemoryKey(entry.source)}::${normalizeMemoryKey(entry.target)}::${entry.projectId ?? projectId}`
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(entry)
  }
  existing.forEach(addEntry)
  incoming.forEach(addEntry)
  return out
}
