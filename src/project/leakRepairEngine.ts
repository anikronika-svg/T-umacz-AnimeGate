import { tokenizeAssForTranslation } from './assTranslationPreprocessor'
import { enforceProjectTerminology } from './terminologyEnforcer'
import type { LanguageLeakDetection } from './languageLeakGuard'
import type { TranslationQualityIssue, TranslationQualityIssueType } from './translationQualityValidator'

export type LeakRepairMode = 'safe_replace' | 'controlled_retry' | 'skipped'

export interface LeakRepairMetadata {
  repairAttempted: boolean
  repairMode: LeakRepairMode
  repairReason: string
  repairSucceeded: boolean
}

export interface LeakRepairDiagnostics {
  value: string
  issues: TranslationQualityIssue[]
  leakDetection: LanguageLeakDetection
  requiresManualCheck: boolean
}

export interface LeakRepairInput {
  sourceRawOrPlain: string
  target: string
  issues: TranslationQualityIssue[]
  leakDetection: LanguageLeakDetection
  terms?: Record<string, string>
  glossary?: Array<{ source: string; preferred: string; active?: boolean }>
  postProcess: (value: string) => LeakRepairDiagnostics
  retryTranslate?: (repairPromptHint: string) => Promise<LeakRepairDiagnostics>
}

export interface LeakRepairResult extends LeakRepairDiagnostics {
  metadata: LeakRepairMetadata
}

const SAFE_SINGLE_WORD_MAP: Record<string, string> = {
  hey: 'Hej',
  hi: 'Cześć',
  yes: 'Tak',
  no: 'Nie',
  ok: 'OK',
  okay: 'OK',
}

const SAFE_ISSUES: TranslationQualityIssueType[] = [
  'english-leak',
  'mixed-language',
  'terminology-inconsistent',
  'grammar-anomaly',
]

function normalizeToken(value: string): string {
  return value.trim().replace(/[.!?…]+$/u, '')
}

function applyGlossaryExact(value: string, glossary: Array<{ source: string; preferred: string; active?: boolean }>): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const punctuationMatch = trimmed.match(/[.!?…]+$/u)
  const punctuation = punctuationMatch?.[0] ?? ''
  const base = trimmed.replace(/[.!?…]+$/u, '').trim()
  if (!base) return null
  const normalized = base.toLocaleLowerCase()
  const entry = glossary.find(item => item.active !== false && item.source.trim().toLocaleLowerCase() === normalized)
  if (!entry) return null
  return `${entry.preferred}${punctuation}`
}

function applySafeSingleWordReplacement(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^([\p{L}'’-]+)([.!?…]+)?$/u)
  if (!match) return null
  const word = match[1]?.toLocaleLowerCase()
  if (!word || !(word in SAFE_SINGLE_WORD_MAP)) return null
  const replacement = SAFE_SINGLE_WORD_MAP[word]
  const punctuation = match[2] ?? ''
  return `${replacement}${punctuation}`
}

function replaceInAssText(value: string, replacement: string): string {
  const tokens = tokenizeAssForTranslation(value)
  if (!tokens.length) return value
  let replaced = false
  const next = tokens.map(token => {
    if (token.type === 'tag' || replaced) return token.value
    const text = token.value
    const match = text.match(/^[\s]*([\p{L}'’-]+)([.!?…]+)?[\s]*$/u)
    if (!match) return text
    replaced = true
    const leading = text.slice(0, text.indexOf(match[1]))
    const trailing = text.slice(text.indexOf(match[1]) + match[1].length + (match[2]?.length ?? 0))
    return `${leading}${replacement}${trailing}`
  })
  return next.join('')
}

function applySafeRepairs(
  value: string,
  terms?: Record<string, string>,
  glossary?: Array<{ source: string; preferred: string; active?: boolean }>,
): { value: string; reason: string } | null {
  if (terms && Object.keys(terms).length > 0) {
    const enforced = enforceProjectTerminology(value, terms)
    if (enforced !== value) {
      return { value: enforced, reason: 'terminology-enforced' }
    }
  }

  if (glossary && glossary.length > 0) {
    const glossaryReplacement = applyGlossaryExact(value, glossary)
    if (glossaryReplacement) {
      return { value: replaceInAssText(value, glossaryReplacement), reason: 'glossary-exact' }
    }
  }

  const singleWordReplacement = applySafeSingleWordReplacement(value)
  if (singleWordReplacement) {
    return { value: replaceInAssText(value, singleWordReplacement), reason: 'safe-single-word' }
  }

  return null
}

function hasCriticalIssues(issues: TranslationQualityIssue[]): boolean {
  return issues.some(issue => SAFE_ISSUES.includes(issue.type))
}

function isAcceptableRepair(diagnostics: LeakRepairDiagnostics): boolean {
  if (diagnostics.leakDetection.englishTokens.length > 0) return false
  if (diagnostics.leakDetection.mixed) return false
  return !diagnostics.issues.some(issue => (
    issue.type === 'english-leak'
    || issue.type === 'mixed-language'
    || issue.type === 'terminology-inconsistent'
    || issue.type === 'grammar-anomaly'
  ))
}

export async function leakRepairEngine(input: LeakRepairInput): Promise<LeakRepairResult> {
  if (!hasCriticalIssues(input.issues)) {
    return {
      value: input.target,
      issues: input.issues,
      leakDetection: input.leakDetection,
      requiresManualCheck: true,
      metadata: {
        repairAttempted: false,
        repairMode: 'skipped',
        repairReason: 'no-critical-issues',
        repairSucceeded: false,
      },
    }
  }

  const safeCandidate = applySafeRepairs(input.target, input.terms, input.glossary)
  if (safeCandidate) {
    const diagnostics = input.postProcess(safeCandidate.value)
    if (isAcceptableRepair(diagnostics)) {
      return {
        ...diagnostics,
        metadata: {
          repairAttempted: true,
          repairMode: 'safe_replace',
          repairReason: safeCandidate.reason,
          repairSucceeded: true,
        },
      }
    }
  }

  if (input.retryTranslate) {
    const diagnostics = await input.retryTranslate(
      'Repair pass: output must be fully Polish. Preserve meaning, brevity, emotional tone, ASS tags, and terminology. Do not mix languages.',
    )
    if (isAcceptableRepair(diagnostics)) {
      return {
        ...diagnostics,
        metadata: {
          repairAttempted: true,
          repairMode: 'controlled_retry',
          repairReason: 'retry-accepted',
          repairSucceeded: true,
        },
      }
    }
    return {
      ...diagnostics,
      metadata: {
        repairAttempted: true,
        repairMode: 'controlled_retry',
        repairReason: 'retry-rejected',
        repairSucceeded: false,
      },
    }
  }

  return {
    value: input.target,
    issues: input.issues,
    leakDetection: input.leakDetection,
    requiresManualCheck: true,
    metadata: {
      repairAttempted: false,
      repairMode: 'skipped',
      repairReason: 'no-retry-available',
      repairSucceeded: false,
    },
  }
}
