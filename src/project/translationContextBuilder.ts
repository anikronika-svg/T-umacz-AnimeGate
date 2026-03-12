import { buildContinuationContextFromPreviousLine, stripAssFormattingForTranslation } from './assTranslationPreprocessor'
import { normalizeSemanticWhitespace } from './subtitleTextSanitizer'

export interface TranslationLineContextHints {
  previousLineContinuation: string
  nextLineHint: string
}

const CONTINUATION_END_PATTERN = /(,|，|、|…|\.\.\.|:|;|—|-)\s*$/u

function buildNextLineHintFromCurrentAndNext(currentRaw: string, nextRaw: string): string {
  const currentSemantic = normalizeSemanticWhitespace(stripAssFormattingForTranslation(currentRaw))
  if (!currentSemantic) return ''
  if (!CONTINUATION_END_PATTERN.test(currentSemantic)) return ''

  const nextSemantic = normalizeSemanticWhitespace(stripAssFormattingForTranslation(nextRaw))
  if (!nextSemantic) return ''
  return nextSemantic
}

export function buildTranslationLineContextHints(
  rows: Array<{ sourceRaw: string; source: string }>,
  rowIndex: number,
): TranslationLineContextHints {
  const current = rows[rowIndex]
  if (!current) {
    return { previousLineContinuation: '', nextLineHint: '' }
  }

  const previous = rowIndex > 0 ? rows[rowIndex - 1] : null
  const next = rowIndex + 1 < rows.length ? rows[rowIndex + 1] : null

  const previousLineContinuation = previous
    ? buildContinuationContextFromPreviousLine(previous.sourceRaw || previous.source)
    : ''

  const nextLineHint = next
    ? buildNextLineHintFromCurrentAndNext(current.sourceRaw || current.source, next.sourceRaw || next.source)
    : ''

  return {
    previousLineContinuation,
    nextLineHint,
  }
}
