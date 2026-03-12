import { normalizeSemanticWhitespace } from './subtitleTextSanitizer'

export type SubtitleToken =
  | { type: 'text'; value: string }
  | { type: 'tag'; value: string }

const ASS_TOKEN_PATTERN = /(\{[^{}]*\}|\\N|\\n|\\h)/g
const ASS_TAG_PATTERN = /\{[^{}]*\}/g
const ASS_BREAK_PATTERN = /\\[Nn]/g
const ASS_HARD_SPACE_PATTERN = /\\h/g

const CONTINUATION_END_PATTERN = /(,|，|、|…|\.\.\.|:|;|—|-)\s*$/u
const TERMINAL_END_PATTERN = /[.!?！？。]\s*$/u

export function tokenizeAssForTranslation(value: string): SubtitleToken[] {
  const tokens: SubtitleToken[] = []
  ASS_TOKEN_PATTERN.lastIndex = 0
  let last = 0
  let match: RegExpExecArray | null

  while ((match = ASS_TOKEN_PATTERN.exec(value)) !== null) {
    if (match.index > last) {
      tokens.push({ type: 'text', value: value.slice(last, match.index) })
    }
    tokens.push({ type: 'tag', value: match[0] })
    last = ASS_TOKEN_PATTERN.lastIndex
  }

  if (last < value.length) {
    tokens.push({ type: 'text', value: value.slice(last) })
  }

  return tokens
}

export function stripAssFormattingForTranslation(value: string): string {
  return value
    .replace(ASS_TAG_PATTERN, '')
    .replace(ASS_BREAK_PATTERN, ' ')
    .replace(ASS_HARD_SPACE_PATTERN, ' ')
}

export function hasAssTechnicalMarkers(value: string): boolean {
  ASS_TOKEN_PATTERN.lastIndex = 0
  return ASS_TOKEN_PATTERN.test(value)
}

export function hasTranslatableAssText(value: string): boolean {
  return tokenizeAssForTranslation(value).some(token => token.type === 'text' && token.value.trim().length > 0)
}

export function buildContinuationContextFromPreviousLine(previousLineRaw: string): string {
  const semantic = normalizeSemanticWhitespace(stripAssFormattingForTranslation(previousLineRaw))
  if (!semantic) return ''
  if (!CONTINUATION_END_PATTERN.test(semantic)) return ''
  const endsWithEllipsis = /(…|\.{3})\s*$/u.test(semantic)
  if (TERMINAL_END_PATTERN.test(semantic) && !endsWithEllipsis) return ''
  return semantic
}
