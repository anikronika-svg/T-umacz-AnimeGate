import { stripAssFormattingForTranslation } from './assTranslationPreprocessor'
import { classifyLineSemantic } from './lineSemanticClassifier'

export type UntranslatedLineKind = 'translate' | 'copy' | 'warn' | 'glossary'

export interface GlossaryEntryLike {
  source: string
  preferred: string
  alternatives?: string
  active?: boolean
}

export interface UntranslatedLineClassification {
  kind: UntranslatedLineKind
  reason: string
  preferred?: string
}

function normalizeInput(value: string): string {
  return stripAssFormattingForTranslation(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeGlossaryKey(value: string): string {
  return normalizeInput(value)
    .replace(/^[\"'“”‘’]+|[\"'“”‘’]+$/g, '')
    .replace(/[!?。！？…]+$/u, '')
    .trim()
    .toLocaleLowerCase()
}

function resolveGlossaryMatch(value: string, glossary: GlossaryEntryLike[] = []): GlossaryEntryLike | null {
  if (!glossary.length) return null
  const normalized = normalizeGlossaryKey(value)
  if (!normalized) return null
  for (const entry of glossary) {
    if (entry.active === false) continue
    const sourceKey = normalizeGlossaryKey(entry.source)
    if (sourceKey && sourceKey === normalized) return entry
    if (entry.alternatives) {
      const alternatives = entry.alternatives
        .split('|')
        .map(item => normalizeGlossaryKey(item))
        .filter(Boolean)
      if (alternatives.includes(normalized)) return entry
    }
  }
  return null
}

export function classifyUntranslatedLine(
  sourceRawOrPlain: string,
  options?: { glossary?: GlossaryEntryLike[] },
): UntranslatedLineClassification {
  const semantic = normalizeInput(sourceRawOrPlain)
  if (!semantic) {
    return { kind: 'translate', reason: 'empty' }
  }

  const glossaryMatch = resolveGlossaryMatch(semantic, options?.glossary)
  if (glossaryMatch) {
    return { kind: 'glossary', reason: 'glossary', preferred: glossaryMatch.preferred }
  }
  const classification = classifyLineSemantic(semantic)
  if (classification.type === 'PROPER_NOUN' || classification.type === 'WORLD_TERM') {
    return { kind: 'copy', reason: classification.reason }
  }
  if (classification.type === 'UNCERTAIN') {
    return { kind: 'warn', reason: classification.reason }
  }
  return { kind: 'translate', reason: classification.reason }
}

export function isNonTranslatableProperNounLine(sourceRawOrPlain: string): boolean {
  return classifyUntranslatedLine(sourceRawOrPlain).kind === 'copy'
}
