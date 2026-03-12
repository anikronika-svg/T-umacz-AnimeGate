import { stripAssFormattingForTranslation, type SubtitleToken } from './assTranslationPreprocessor'
import { normalizeSemanticWhitespace } from './subtitleTextSanitizer'

export interface ChunkContextHints {
  previousChunkHint: string
  nextChunkHint: string
}

function semanticWordsCount(value: string): number {
  const semantic = normalizeSemanticWhitespace(stripAssFormattingForTranslation(value))
  if (!semantic) return 0
  const words = semantic.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)
  return words?.length ?? 0
}

export function isShortSubtitleUtterance(sourceRawOrPlain: string): boolean {
  const semantic = normalizeSemanticWhitespace(stripAssFormattingForTranslation(sourceRawOrPlain))
  if (!semantic) return false
  const words = semanticWordsCount(semantic)
  if (words <= 2) return true
  if (words === 3 && semantic.length <= 18) return true
  return false
}

export function isOverAggressiveShortLineRewrite(sourceRawOrPlain: string, translated: string): boolean {
  if (!isShortSubtitleUtterance(sourceRawOrPlain)) return false
  const sourceWords = semanticWordsCount(sourceRawOrPlain)
  const translatedWords = semanticWordsCount(translated)
  if (sourceWords <= 0 || translatedWords <= 0) return false
  return translatedWords >= sourceWords + 5
}

export function stabilizeTonePunctuation(sourceRawOrPlain: string, translated: string): string {
  const sourceSemantic = normalizeSemanticWhitespace(stripAssFormattingForTranslation(sourceRawOrPlain))
  const trimmed = translated.trim()
  if (!sourceSemantic || !trimmed) return translated

  const sourceTerminal = sourceSemantic.match(/[!?…]+$/u)?.[0] ?? ''
  const translatedTerminal = trimmed.match(/[.!?…]+$/u)?.[0] ?? ''
  if (!sourceTerminal) return translated
  if (translatedTerminal === sourceTerminal) return translated

  const keepQuestion = sourceTerminal.includes('?')
  const keepExclamation = sourceTerminal.includes('!')
  const desired = keepQuestion && keepExclamation ? '?!' : keepQuestion ? '?' : keepExclamation ? '!' : sourceTerminal
  const rewrittenCore = trimmed.replace(/[.!?…]+$/u, '')
  return `${rewrittenCore}${desired}`
}

function semanticChunk(value: string): string {
  return normalizeSemanticWhitespace(stripAssFormattingForTranslation(value))
}

export function buildChunkContextHints(tokens: SubtitleToken[], index: number): ChunkContextHints {
  if (!tokens[index] || tokens[index].type !== 'text') {
    return { previousChunkHint: '', nextChunkHint: '' }
  }

  let previousChunkHint = ''
  for (let i = index - 1; i >= 0; i -= 1) {
    if (tokens[i].type !== 'text') continue
    const semantic = semanticChunk(tokens[i].value)
    if (semantic) {
      previousChunkHint = semantic
      break
    }
  }

  let nextChunkHint = ''
  for (let i = index + 1; i < tokens.length; i += 1) {
    if (tokens[i].type !== 'text') continue
    const semantic = semanticChunk(tokens[i].value)
    if (semantic) {
      nextChunkHint = semantic
      break
    }
  }

  return { previousChunkHint, nextChunkHint }
}
