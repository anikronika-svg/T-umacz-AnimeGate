import { parseAssOrSsa } from '../subtitleParser'
import { hasTranslatableAssText, stripAssFormattingForTranslation } from './assTranslationPreprocessor'
import { normalizeSemanticWhitespace } from './subtitleTextSanitizer'
import { detectLanguageLeak } from './languageLeakGuard'
import { validateTranslationQuality } from './translationQualityValidator'
import {
  type DialoguePatternEntry,
  type TranslationMemoryDatasetEntry,
  buildDialoguePatternsFromEntries,
  normalizeDatasetText,
} from './translationMemoryDataset'

export interface TranslationMemoryImportOptions {
  series?: string | null
  episode?: string | null
  groupName?: string | null
  quality?: 'trusted' | 'low-confidence'
  origin?: string
  sourceQuality?: 'reviewed_manual' | 'trusted_professional_import' | 'project_runtime_memory' | 'machine_generated_analysis_only'
}

export interface TranslationMemoryImportResult {
  entries: TranslationMemoryDatasetEntry[]
  trusted: number
  usable: number
  lowConfidence: number
  rejected: number
  totalPairs: number
  patterns: DialoguePatternEntry[]
}

function subtitleTimeToSeconds(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return 0
  const parts = trimmed.split(':')
  if (parts.length < 2) return Number(trimmed) || 0
  const secondsPart = parts.pop() ?? '0'
  const minutesPart = parts.pop() ?? '0'
  const hoursPart = parts.pop() ?? '0'
  const seconds = Number(secondsPart.replace(',', '.')) || 0
  const minutes = Number(minutesPart) || 0
  const hours = Number(hoursPart) || 0
  return hours * 3600 + minutes * 60 + seconds
}

function normalizeForAnalysis(value: string): string {
  return normalizeSemanticWhitespace(stripAssFormattingForTranslation(value))
}

function wordCount(value: string): number {
  if (!value.trim()) return 0
  return value.trim().split(/\s+/).length
}

function looksLikeTechnicalLine(value: string): boolean {
  const stripped = normalizeForAnalysis(value).replace(/[\p{P}\p{S}]+/gu, '').trim()
  if (!stripped) return true
  return false
}

function shouldRejectLongLine(text: string, durationSec: number): boolean {
  const length = text.length
  const words = wordCount(text)
  if (durationSec >= 10 && (length > 180 || words > 30)) return true
  if (length > 260 || words > 45) return true
  return false
}

function hasObviousTypoPattern(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/\b(i|że|ze|a|na|do|w|z|od|po)\s+\1\b/iu.test(trimmed)) return true
  if (/[A-Za-ząćęłńóśźż]{3,}\d{2,}/u.test(trimmed)) return true
  if (/(.)\1{3,}/u.test(trimmed)) return true
  return false
}

export function importTranslationMemoryFromAssPair(
  sourceContent: string,
  targetContent: string,
  options: TranslationMemoryImportOptions = {},
): TranslationMemoryImportResult {
  const sourceFile = parseAssOrSsa(sourceContent)
  const targetFile = parseAssOrSsa(targetContent)
  const entries: TranslationMemoryDatasetEntry[] = []
  let trusted = 0
  let usable = 0
  let lowConfidence = 0
  let rejected = 0
  let totalPairs = 0

  let targetIndex = 0
  const targetRows = targetFile.rows
  const now = new Date().toISOString()

  sourceFile.rows.forEach(sourceRow => {
    totalPairs += 1
    const sourceStart = subtitleTimeToSeconds(sourceRow.start)
    const sourceEnd = subtitleTimeToSeconds(sourceRow.end)
    const sourceDuration = Math.max(0, sourceEnd - sourceStart)

    let matchedRow: typeof targetRows[number] | null = null
    while (targetIndex < targetRows.length) {
      const candidate = targetRows[targetIndex]
      const candidateStart = subtitleTimeToSeconds(candidate.start)
      const candidateEnd = subtitleTimeToSeconds(candidate.end)
      const startDiff = Math.abs(candidateStart - sourceStart)
      const endDiff = Math.abs(candidateEnd - sourceEnd)
      if (startDiff <= 0.6 && endDiff <= 0.6) {
        matchedRow = candidate
        targetIndex += 1
        break
      }
      if (candidateStart < sourceStart - 0.6) {
        targetIndex += 1
        continue
      }
      break
    }

    if (!matchedRow) {
      rejected += 1
      return
    }

    const sourceRaw = sourceRow.sourceRaw || ''
    const targetRaw = (matchedRow.target && matchedRow.target.trim())
      ? matchedRow.target
      : (matchedRow.sourceRaw || '')
    if (!hasTranslatableAssText(sourceRaw) || looksLikeTechnicalLine(sourceRaw)) {
      rejected += 1
      return
    }
    if (!hasTranslatableAssText(targetRaw) || looksLikeTechnicalLine(targetRaw)) {
      rejected += 1
      return
    }

    const sourceClean = normalizeForAnalysis(sourceRaw)
    const targetClean = normalizeForAnalysis(targetRaw)
    if (!sourceClean || !targetClean) {
      rejected += 1
      return
    }

    if (shouldRejectLongLine(sourceClean, sourceDuration)) {
      rejected += 1
      return
    }

    const sourceNormalized = normalizeDatasetText(sourceRaw)
    const targetNormalized = normalizeDatasetText(targetRaw)
    if (!sourceNormalized || !targetNormalized) {
      rejected += 1
      return
    }

    const lengthRatio = targetNormalized.length / Math.max(1, sourceNormalized.length)
    const startDiff = Math.abs(subtitleTimeToSeconds(matchedRow.start) - sourceStart)
    const endDiff = Math.abs(subtitleTimeToSeconds(matchedRow.end) - sourceEnd)
    const leakDetection = detectLanguageLeak(targetRaw, { terms: {} })
    const qualityResult = validateTranslationQuality(sourceRaw, targetRaw, { terms: {} })
    const hasLeak = leakDetection.englishTokens.length > 0
    const hasMixed = leakDetection.mixed
    const hasGrammar = qualityResult.issues.some(issue => issue.type === 'grammar-anomaly')
    const hasRepetition = qualityResult.issues.some(issue => issue.type === 'repetition')
    const hasTerminology = qualityResult.issues.some(issue => issue.type === 'terminology-inconsistent')
    const hasTypo = hasObviousTypoPattern(targetClean)

    let quality: 'trusted' | 'usable' | 'low-confidence' | 'rejected' = options.quality ?? 'trusted'

    if (lengthRatio > 3.5 || lengthRatio < 0.3) quality = 'rejected'
    if (startDiff > 0.9 || endDiff > 0.9) quality = 'rejected'

    if (quality !== 'rejected') {
      if (lengthRatio > 2.6 || lengthRatio < 0.4) quality = 'low-confidence'
      if (startDiff > 0.4 || endDiff > 0.4) quality = 'low-confidence'
      if (sourceNormalized === targetNormalized) quality = 'low-confidence'
      if (hasLeak || hasMixed) quality = 'low-confidence'
      if (hasGrammar || hasRepetition || hasTerminology || hasTypo) {
        quality = qualityResult.confidence >= 0.75 ? 'usable' : 'low-confidence'
      }
      if (qualityResult.confidence < 0.55) quality = 'low-confidence'
    }

    if (quality === 'rejected') {
      rejected += 1
      return
    }
    if (quality === 'trusted') trusted += 1
    if (quality === 'usable') usable += 1
    if (quality === 'low-confidence') lowConfidence += 1

    entries.push({
      id: `${now}-${entries.length + 1}`,
      series: options.series ?? null,
      episode: options.episode ?? null,
      source: sourceClean,
      target: targetClean,
      sourceNormalized,
      targetNormalized,
      character: matchedRow.character || sourceRow.character || null,
      speakerRaw: sourceRow.character || matchedRow.character || null,
      quality: quality as 'trusted' | 'usable' | 'low-confidence',
      sourceQuality: options.sourceQuality ?? 'machine_generated_analysis_only',
      origin: options.origin ?? 'imported_parallel_subs',
      groupName: options.groupName ?? null,
      createdAt: now,
      reviewed: false,
      sourceRaw,
      targetRaw,
    })
  })

  const patterns = buildDialoguePatternsFromEntries(entries.filter(entry => entry.quality === 'trusted'))
  return { entries, trusted, usable, lowConfidence, rejected, totalPairs, patterns }
}
