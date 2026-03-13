import { tokenizeAssForTranslation } from './assTranslationPreprocessor'
import { normalizeSemanticWhitespace } from './subtitleTextSanitizer'

export interface ReadabilityTuneResult {
  value: string
  tuned: boolean
  reason: string
}

const FILLER_PATTERNS: Array<{ pattern: RegExp; replace: string }> = [
  { pattern: /(?<![\p{L}])w zasadzie(?![\p{L}])/giu, replace: '' },
  { pattern: /(?<![\p{L}])tak naprawdę(?![\p{L}])/giu, replace: '' },
  { pattern: /(?<![\p{L}])po prostu(?![\p{L}])/giu, replace: '' },
  { pattern: /(?<![\p{L}])jakby(?![\p{L}])/giu, replace: '' },
  { pattern: /(?<![\p{L}])nie jestem w stanie(?![\p{L}])/giu, replace: 'nie mogę' },
  { pattern: /(?<![\p{L}])z tego powodu(?![\p{L}])/giu, replace: 'dlatego' },
  { pattern: /(?<![\p{L}])w tej chwili(?![\p{L}])/giu, replace: 'teraz' },
]

function tuneTextChunk(value: string): { value: string; changed: boolean } {
  const original = value
  let next = value
  FILLER_PATTERNS.forEach(rule => {
    next = next.replace(rule.pattern, rule.replace)
  })
  next = next.replace(/\s{2,}/g, ' ')
  const leading = next.match(/^\s*/)?.[0] ?? ''
  let core = next.slice(leading.length)
  core = core.replace(/^\s+/, '')
  if (core && /^[A-ZĄĆĘŁŃÓŚŻŹ]/.test(original.trim())) {
    core = core[0]?.toUpperCase() + core.slice(1)
  }
  next = `${leading}${core}`
  return { value: next, changed: next !== original }
}

function shouldSkip(value: string): boolean {
  const semantic = normalizeSemanticWhitespace(value)
  if (!semantic) return true
  if (semantic.length <= 18) return true
  const words = semantic.split(/\s+/).filter(Boolean)
  return words.length <= 3
}

export function tuneSubtitleReadability(
  value: string,
  opts?: { allow?: boolean },
): ReadabilityTuneResult {
  if (opts?.allow === false) {
    return { value, tuned: false, reason: 'skipped-by-policy' }
  }
  const tokens = tokenizeAssForTranslation(value)
  if (!tokens.length) return { value, tuned: false, reason: 'empty' }

  if (shouldSkip(value)) {
    return { value, tuned: false, reason: 'short-line' }
  }

  let changed = false
  const next = tokens.map(token => {
    if (token.type === 'tag') return token.value
    const tuned = tuneTextChunk(token.value)
    if (tuned.changed) changed = true
    return tuned.value
  }).join('')
  const normalized = next
    .replace(/\s+\{/g, '{')
    .replace(/\\N\s+/g, '\\N')
    .replace(/\s{2,}/g, ' ')

  if (!changed) {
    return { value, tuned: false, reason: 'no-change' }
  }

  const normalizedBefore = normalizeSemanticWhitespace(value)
  const normalizedAfter = normalizeSemanticWhitespace(normalized)
  if (normalizedAfter.length > normalizedBefore.length + 6) {
    return { value, tuned: false, reason: 'would-expand' }
  }

  return { value: normalized, tuned: true, reason: 'readability-tuned' }
}
