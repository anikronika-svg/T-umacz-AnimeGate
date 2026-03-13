import { stripAssFormattingForTranslation } from './assTranslationPreprocessor'
import { normalizeSemanticWhitespace } from './subtitleTextSanitizer'
import { enforceProjectTerminology } from './terminologyEnforcer'

export type TranslationQualityIssueType =
  | 'untranslated-fragment'
  | 'terminology-inconsistent'
  | 'grammar-anomaly'
  | 'repetition'

export interface TranslationQualityIssue {
  type: TranslationQualityIssueType
  message: string
}

export interface TranslationQualityResult {
  requiresManualCheck: boolean
  confidence: number
  issues: TranslationQualityIssue[]
}

const ENGLISH_TOKEN_PATTERN = /\b[A-Za-z][A-Za-z'’-]{2,}\b/g
const REPEATED_WORD_PATTERN = /\b([\p{L}]{2,})\s+\1\b/iu

const GRAMMAR_ANOMALY_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\bbyła\s+takiej\b/iu, message: 'Niepoprawna zgoda przymiotnika.' },
  { pattern: /\bzgodnie\s+z\s+instrukcjami\b/iu, message: 'Sztywna kalką MT.' },
]

function findEnglishFragments(text: string): string[] {
  const matches = text.match(ENGLISH_TOKEN_PATTERN)
  if (!matches) return []
  return matches.filter(word => word.length >= 3)
}

function findGrammarAnomalies(text: string): string[] {
  const issues: string[] = []
  GRAMMAR_ANOMALY_PATTERNS.forEach(rule => {
    if (rule.pattern.test(text)) issues.push(rule.message)
  })
  return issues
}

function hasRepetition(text: string): boolean {
  return REPEATED_WORD_PATTERN.test(text)
}

export function validateTranslationQuality(
  sourceRawOrPlain: string,
  translated: string,
  options?: { terms?: Record<string, string> },
): TranslationQualityResult {
  const sourceSemantic = normalizeSemanticWhitespace(stripAssFormattingForTranslation(sourceRawOrPlain))
  const semantic = normalizeSemanticWhitespace(stripAssFormattingForTranslation(translated))
  const issues: TranslationQualityIssue[] = []

  if (!semantic) {
    return { requiresManualCheck: false, confidence: 1, issues }
  }

  const sourceEnglish = sourceSemantic ? findEnglishFragments(sourceSemantic).map(word => word.toLocaleLowerCase()) : []
  const englishFragments = findEnglishFragments(semantic).filter(word => !sourceEnglish.includes(word.toLocaleLowerCase()))
  if (englishFragments.length > 0) {
    issues.push({
      type: 'untranslated-fragment',
      message: `Wykryto nieprzetlumaczone fragmenty: ${englishFragments.slice(0, 3).join(', ')}`,
    })
  }

  if (options?.terms && Object.keys(options.terms).length > 0) {
    const enforced = enforceProjectTerminology(translated, options.terms)
    if (enforced !== translated) {
      issues.push({
        type: 'terminology-inconsistent',
        message: 'Niespojne terminy projektu (terminy nie sa w formie kanonicznej).',
      })
    }
  }

  const grammarIssues = findGrammarAnomalies(semantic)
  grammarIssues.forEach(message => {
    issues.push({ type: 'grammar-anomaly', message })
  })

  if (hasRepetition(semantic)) {
    issues.push({ type: 'repetition', message: 'Powtorzenie tego samego slowa obok siebie.' })
  }

  let confidence = 1
  issues.forEach(issue => {
    switch (issue.type) {
      case 'untranslated-fragment':
        confidence -= 0.3
        break
      case 'terminology-inconsistent':
        confidence -= 0.25
        break
      case 'grammar-anomaly':
        confidence -= 0.15
        break
      case 'repetition':
        confidence -= 0.1
        break
      default:
        confidence -= 0.1
        break
    }
  })
  confidence = Math.max(0, Math.min(1, confidence))

  const requiresManualCheck = confidence < 0.7 || issues.some(issue => issue.type === 'untranslated-fragment')

  return { requiresManualCheck, confidence, issues }
}
