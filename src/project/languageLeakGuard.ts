import { stripAssFormattingForTranslation } from './assTranslationPreprocessor'
import { normalizeSemanticWhitespace } from './subtitleTextSanitizer'
import { enforceProjectTerminology } from './terminologyEnforcer'

export interface LanguageLeakDetection {
  englishTokens: string[]
  polishTokens: string[]
  mixed: boolean
}

export interface LanguageLeakGuardResult {
  value: string
  requiresManualCheck: boolean
  detection: LanguageLeakDetection
  fixed: boolean
}

const TOKEN_PATTERN = /[\p{L}][\p{L}'’-]*/gu
const POLISH_DIACRITICS_PATTERN = /[ąćęłńóśżź]/iu

const STRONG_ENGLISH_TOKENS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'from', 'by', 'at',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'not', 'no',
  'yes', 'this', 'that', 'these', 'those', 'here', 'there', 'now', 'then', 'please', 'thanks',
  'sorry', 'hello', 'hi', 'hey', 'okay', 'ok', 'wait', 'go', 'run', 'stop', 'come', 'find',
  'take', 'give', 'kill', 'master', 'episode', 'rabbit', 'relic', 'relics', 'artifact', 'artifacts',
])

const POLISH_STOPWORDS = new Set([
  'i', 'nie', 'tak', 'że', 'się', 'to', 'na', 'do', 'w', 'z', 'za', 'pod', 'przez', 'jest', 'są',
  'był', 'była', 'było', 'byli', 'jestem', 'jesteś', 'jest', 'jesteśmy', 'jesteście',
  'może', 'ty', 'ja', 'my', 'wy', 'oni', 'ona', 'ono', 'ten', 'ta', 'to', 'te', 'tam', 'tu',
])

function extractTokens(value: string): string[] {
  const semantic = normalizeSemanticWhitespace(stripAssFormattingForTranslation(value))
  if (!semantic) return []
  return semantic.match(TOKEN_PATTERN) ?? []
}

function isPolishToken(token: string, extraPolish: Set<string>): boolean {
  const lower = token.toLocaleLowerCase()
  return POLISH_DIACRITICS_PATTERN.test(lower) || POLISH_STOPWORDS.has(lower) || extraPolish.has(lower)
}

function isEnglishToken(token: string): boolean {
  const lower = token.toLocaleLowerCase()
  return STRONG_ENGLISH_TOKENS.has(lower)
}

export function detectLanguageLeak(value: string, options?: { terms?: Record<string, string> }): LanguageLeakDetection {
  const tokens = extractTokens(value)
  if (tokens.length === 0) {
    return { englishTokens: [], polishTokens: [], mixed: false }
  }

  const extraPolish = new Set<string>()
  if (options?.terms) {
    Object.values(options.terms).forEach(term => {
      term
        .split(/\s+/g)
        .map(token => token.trim().toLocaleLowerCase())
        .filter(Boolean)
        .forEach(token => extraPolish.add(token))
    })
  }

  const englishTokens = tokens.filter(isEnglishToken)
  const polishTokens = tokens.filter(token => isPolishToken(token, extraPolish))

  const mixed = englishTokens.length > 0 && polishTokens.length > 0
  return { englishTokens, polishTokens, mixed }
}

export function guardLanguageLeaks(
  value: string,
  options?: { terms?: Record<string, string> },
): LanguageLeakGuardResult {
  const detection = detectLanguageLeak(value, options)
  if (detection.englishTokens.length === 0) {
    return { value, requiresManualCheck: false, detection, fixed: false }
  }

  let fixedValue = value
  let fixed = false
  if (options?.terms && Object.keys(options.terms).length > 0) {
    const enforced = enforceProjectTerminology(value, options.terms)
    if (enforced !== value) {
      fixedValue = enforced
      fixed = true
    }
  }

  const detectionAfter = fixed ? detectLanguageLeak(fixedValue, options) : detection
  const requiresManualCheck = detectionAfter.englishTokens.length > 0 || detectionAfter.mixed

  return {
    value: fixedValue,
    requiresManualCheck,
    detection: detectionAfter,
    fixed,
  }
}
