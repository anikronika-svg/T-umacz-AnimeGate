import { stripAssFormattingForTranslation } from './assTranslationPreprocessor'
import { normalizeSemanticWhitespace } from './subtitleTextSanitizer'

export interface DialogueContext {
  previousLines: string[]
  nextLines: string[]
}

function normalizeLine(value: string): string {
  return normalizeSemanticWhitespace(stripAssFormattingForTranslation(value))
}

export function buildDialogueContext(
  rows: Array<{ sourceRaw: string; source: string }>,
  rowIndex: number,
  options?: { previousLines?: number; nextLines?: number },
): DialogueContext {
  const prevCount = Math.max(0, options?.previousLines ?? 2)
  const nextCount = Math.max(0, options?.nextLines ?? 1)

  const previousLines: string[] = []
  const nextLines: string[] = []

  for (let i = rowIndex - prevCount; i < rowIndex; i += 1) {
    if (i < 0 || i >= rows.length) continue
    const line = normalizeLine(rows[i].sourceRaw || rows[i].source)
    if (line) previousLines.push(line)
  }

  for (let i = rowIndex + 1; i <= rowIndex + nextCount; i += 1) {
    if (i < 0 || i >= rows.length) continue
    const line = normalizeLine(rows[i].sourceRaw || rows[i].source)
    if (line) nextLines.push(line)
  }

  return { previousLines, nextLines }
}
