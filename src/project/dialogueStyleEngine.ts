import { stripAssFormattingForTranslation, tokenizeAssForTranslation } from './assTranslationPreprocessor'
import { normalizeSemanticWhitespace } from './subtitleTextSanitizer'

type StyleRule = {
  pattern: RegExp
  replace: (match: RegExpMatchArray) => string
}

const STYLE_RULES: StyleRule[] = [
  {
    pattern: /Denerwuje mnie to odkąd tu przybył(em|am)([.!?…])?/iu,
    replace: match => `Odkąd tu przybył${match[1]}, coś mi tu nie pasuje${match[2] ?? '.'}`,
  },
  {
    pattern: /Co o tym s[aą]dzisz\?/iu,
    replace: () => 'Jak myślisz?',
  },
]

function shouldSkipShortLine(value: string): boolean {
  const semantic = normalizeSemanticWhitespace(stripAssFormattingForTranslation(value))
  if (!semantic) return true
  const words = semantic.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0
  return words <= 3
}

function applyStyleRules(text: string): string {
  let next = text
  STYLE_RULES.forEach(rule => {
    next = next.replace(rule.pattern, (...args) => rule.replace(args as unknown as RegExpMatchArray))
  })
  return next
}

export function dialogueStyleEngine(value: string): string {
  if (shouldSkipShortLine(value)) return value
  const tokens = tokenizeAssForTranslation(value)
  if (!tokens.length) return value
  return tokens
    .map(token => (token.type === 'text' ? applyStyleRules(token.value) : token.value))
    .join('')
}
