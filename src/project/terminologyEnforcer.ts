import { tokenizeAssForTranslation } from './assTranslationPreprocessor'

interface TerminologyEntry {
  source: string
  target: string
  sourcePattern: RegExp
  targetPattern: RegExp
  stemPattern?: RegExp
  stem: string
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildWordRegex(pattern: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'giu')
}

function preserveCase(template: string, sample: string): string {
  if (!sample) return template
  const isAllCaps = sample.toUpperCase() === sample && sample.toLowerCase() !== sample
  if (isAllCaps) return template.toUpperCase()
  const isCapitalized = sample[0]?.toUpperCase() === sample[0] && sample.slice(1).toLowerCase() === sample.slice(1)
  if (isCapitalized) return template[0]?.toUpperCase() + template.slice(1)
  return template
}

function deriveStem(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length < 5) return trimmed
  return trimmed.replace(/(ami|ach|owie|owej|owego|owie|owie|ów|om|em|ie|a|e|y|i|u|ę|ą)$/iu, '')
}

function buildStemRegex(stem: string): RegExp | undefined {
  if (!stem || stem.length < 4) return undefined
  const suffixes = '(?:y|i|a|e|ę|ą|u|em|om|ami|ach|ów|ie|ego|owi)?'
  return new RegExp(`(?<![\\p{L}\\p{N}])(${escapeRegex(stem)})(${suffixes})(?![\\p{L}\\p{N}])`, 'giu')
}

function buildEntries(terms: Record<string, string>): TerminologyEntry[] {
  return Object.entries(terms)
    .map(([source, target]) => {
      const sourceValue = source.trim()
      const targetValue = target.trim()
      if (!sourceValue || !targetValue) return null
      const stem = deriveStem(targetValue)
      return {
        source: sourceValue,
        target: targetValue,
        sourcePattern: buildWordRegex(escapeRegex(sourceValue)),
        targetPattern: buildWordRegex(escapeRegex(targetValue)),
        stemPattern: buildStemRegex(stem),
        stem,
      } satisfies TerminologyEntry
    })
    .filter((entry): entry is TerminologyEntry => Boolean(entry))
}

function enforceInText(text: string, entries: TerminologyEntry[]): string {
  if (!entries.length) return text
  let next = text

  entries.forEach(entry => {
    next = next.replace(entry.sourcePattern, match => preserveCase(entry.target, match))
  })

  entries.forEach(entry => {
    if (!entry.stemPattern) return
    next = next.replace(entry.stemPattern, (_match, stemMatch: string, suffix: string) => {
      const replacement = `${entry.stem}${suffix ?? ''}`
      return preserveCase(replacement, stemMatch)
    })
  })

  return next
}

export function enforceProjectTerminology(
  value: string,
  terms: Record<string, string>,
): string {
  const entries = buildEntries(terms)
  if (!entries.length) return value
  const tokens = tokenizeAssForTranslation(value)
  if (!tokens.length) return value
  return tokens
    .map(token => (token.type === 'text' ? enforceInText(token.value, entries) : token.value))
    .join('')
}
