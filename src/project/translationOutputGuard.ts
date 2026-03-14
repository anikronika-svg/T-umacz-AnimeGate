import { stripAssFormattingForTranslation } from './assTranslationPreprocessor'
import { normalizeSemanticWhitespace } from './subtitleTextSanitizer'
import { detectLanguageLeak } from './languageLeakGuard'

export interface TranslationOutputGuardResult {
  ok: boolean
  reason?: 'source-passthrough' | 'english-blocked' | 'mixed-blocked'
  englishLeakDetected: boolean
  sameAsSource: boolean
  targetPreview: string
}

function normalizeForComparison(value: string): string {
  return normalizeSemanticWhitespace(stripAssFormattingForTranslation(value))
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function guardTranslationOutput(
  sourceText: string,
  targetText: string,
  options?: { terms?: Record<string, string> },
): TranslationOutputGuardResult {
  const sourceNorm = normalizeForComparison(sourceText)
  const targetNorm = normalizeForComparison(targetText)
  const sameAsSource = sourceNorm.length > 0 && sourceNorm === targetNorm
  const leak = detectLanguageLeak(targetText, options)
  const englishLeakDetected = leak.englishTokens.length > 0

  if (sameAsSource && englishLeakDetected) {
    return {
      ok: false,
      reason: 'source-passthrough',
      englishLeakDetected: true,
      sameAsSource: true,
      targetPreview: targetText.slice(0, 120),
    }
  }

  if (englishLeakDetected && !leak.mixed) {
    return {
      ok: false,
      reason: 'english-blocked',
      englishLeakDetected: true,
      sameAsSource,
      targetPreview: targetText.slice(0, 120),
    }
  }

  if (leak.mixed && englishLeakDetected) {
    return {
      ok: false,
      reason: 'mixed-blocked',
      englishLeakDetected: true,
      sameAsSource,
      targetPreview: targetText.slice(0, 120),
    }
  }

  if (sameAsSource) {
    return {
      ok: false,
      reason: 'source-passthrough',
      englishLeakDetected: false,
      sameAsSource: true,
      targetPreview: targetText.slice(0, 120),
    }
  }

  return {
    ok: true,
    englishLeakDetected,
    sameAsSource,
    targetPreview: targetText.slice(0, 120),
  }
}
