import { stripAssFormattingForTranslation } from './assTranslationPreprocessor'
import { normalizeSemanticWhitespace } from './subtitleTextSanitizer'

export type DatasetQuality = 'trusted' | 'usable' | 'low-confidence'
export type SourceQuality =
  | 'reviewed_manual'
  | 'trusted_professional_import'
  | 'project_runtime_memory'
  | 'machine_generated_analysis_only'

export interface TranslationMemoryDatasetEntry {
  id: string
  series?: string | null
  episode?: string | null
  source: string
  target: string
  sourceNormalized: string
  targetNormalized: string
  character?: string | null
  speakerRaw?: string | null
  quality: DatasetQuality
  sourceQuality: SourceQuality
  origin: string
  groupName?: string | null
  createdAt: string
  reviewed: boolean
  sourceRaw?: string | null
  targetRaw?: string | null
}

export interface TranslationMemoryDataset {
  entries: TranslationMemoryDatasetEntry[]
}

export interface DialoguePatternEntry {
  source: string
  target: string
  sourceNormalized: string
  targetNormalized: string
  count: number
  lastSeen: string
}

export interface DialoguePatternDataset {
  entries: DialoguePatternEntry[]
}

export function normalizeDatasetText(value: string): string {
  return normalizeSemanticWhitespace(stripAssFormattingForTranslation(value))
    .replace(/[!?。！？…]+$/u, '')
    .trim()
    .toLocaleLowerCase()
}

export function mergeDatasetEntries(
  existing: TranslationMemoryDatasetEntry[],
  incoming: TranslationMemoryDatasetEntry[],
): TranslationMemoryDatasetEntry[] {
  const out: TranslationMemoryDatasetEntry[] = []
  const seen = new Set<string>()
  const makeKey = (entry: TranslationMemoryDatasetEntry): string =>
    [
      entry.sourceNormalized,
      entry.targetNormalized,
      entry.series ?? '',
      entry.episode ?? '',
      entry.groupName ?? '',
    ].join('::')

  existing.forEach(entry => {
    const key = makeKey(entry)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(entry)
  })
  incoming.forEach(entry => {
    const key = makeKey(entry)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(entry)
  })
  return out
}

export function buildDialoguePatternsFromEntries(
  entries: TranslationMemoryDatasetEntry[],
  options?: { maxLength?: number },
): DialoguePatternEntry[] {
  const maxLength = options?.maxLength ?? 80
  const map = new Map<string, DialoguePatternEntry>()
  entries.forEach(entry => {
    if (!entry.sourceNormalized || !entry.targetNormalized) return
    if (entry.sourceNormalized.length > maxLength || entry.targetNormalized.length > maxLength) return
    const key = `${entry.sourceNormalized}::${entry.targetNormalized}`
    const existing = map.get(key)
    if (existing) {
      existing.count += 1
      existing.lastSeen = entry.createdAt
      return
    }
    map.set(key, {
      source: entry.source.trim(),
      target: entry.target.trim(),
      sourceNormalized: entry.sourceNormalized,
      targetNormalized: entry.targetNormalized,
      count: 1,
      lastSeen: entry.createdAt,
    })
  })
  return [...map.values()].sort((a, b) => b.count - a.count)
}
