import { stripAssFormattingForTranslation } from './assTranslationPreprocessor'
import { normalizeSemanticWhitespace } from './subtitleTextSanitizer'

export function normalizeTerminologyKey(value: string): string {
  return normalizeSemanticWhitespace(stripAssFormattingForTranslation(value))
    .replace(/[!?。！？…]+$/u, '')
    .trim()
    .toLocaleLowerCase()
}

export function resolveTerminologyMatch(
  sourceRawOrPlain: string,
  terms: Record<string, string>,
): string | null {
  const key = normalizeTerminologyKey(sourceRawOrPlain)
  if (!key) return null
  return terms[key] ?? null
}
