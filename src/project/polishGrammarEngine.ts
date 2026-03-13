import { tokenizeAssForTranslation } from './assTranslationPreprocessor'

type GrammarRule = {
  pattern: RegExp
  replace: string | ((substring: string, ...args: string[]) => string)
}

const GRAMMAR_RULES: GrammarRule[] = [
  {
    pattern: /żeby\s+tam\s+była\s+takiej\s+dziury/giu,
    replace: 'żeby tam była taka dziura',
  },
  {
    pattern: /żeby\s+była\s+takiej\s+dziury/giu,
    replace: 'żeby była taka dziura',
  },
  {
    pattern: /odkąd\s+tu\s+przybył(em|am)\s+zgodnie\s+z\s+instrukcjami/giu,
    replace: 'odkąd tu przybył$1 na polecenie',
  },
]

function applyGrammarRules(text: string): string {
  let next = text
  GRAMMAR_RULES.forEach(rule => {
    next = next.replace(rule.pattern, rule.replace as string)
  })
  return next
}

export function polishGrammarEngine(value: string): string {
  const tokens = tokenizeAssForTranslation(value)
  if (!tokens.length) return value
  return tokens
    .map(token => (token.type === 'text' ? applyGrammarRules(token.value) : token.value))
    .join('')
}
