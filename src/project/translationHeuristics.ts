import { stripAssFormattingForTranslation } from './assTranslationPreprocessor'

const COMMON_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'with', 'in', 'on', 'at', 'from',
])

const COMMON_VERBS = new Set([
  'is', 'are', 'was', 'were', 'be', 'been', 'am', 'have', 'has', 'had', 'do', 'does', 'did',
  'go', 'goes', 'went', 'come', 'comes', 'came', 'look', 'looks', 'looked', 'say', 'says', 'said',
  'make', 'makes', 'made', 'take', 'takes', 'took', 'see', 'sees', 'saw', 'know', 'knows', 'knew',
])

function normalizeInput(value: string): string {
  return stripAssFormattingForTranslation(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractWords(value: string): string[] {
  const words = value.match(/[\p{L}][\p{L}'’-]*/gu)
  return words ?? []
}

function isTitleLikeWord(word: string): boolean {
  if (word.length < 2) return false
  const first = word[0]
  const rest = word.slice(1)
  return first === first.toLocaleUpperCase() && rest === rest.toLocaleLowerCase()
}

function isLikelyProperTermWord(word: string): boolean {
  const lower = word.toLocaleLowerCase()
  if (COMMON_STOPWORDS.has(lower)) return false
  if (COMMON_VERBS.has(lower)) return false
  if (word.length === 1) return false
  return isTitleLikeWord(word) || word === word.toLocaleUpperCase()
}

export function isNonTranslatableProperNounLine(sourceRawOrPlain: string): boolean {
  const semantic = normalizeInput(sourceRawOrPlain)
  if (!semantic) return false

  // Keep heuristic conservative: very short title-like shout/name lines.
  const words = extractWords(semantic)
  if (!words.length) return false
  if (words.length > 4) return false

  const trailingPunctuationStripped = semantic.replace(/[!?。！？…]+$/u, '').trim()
  if (!trailingPunctuationStripped) return false

  const hasVerb = words.some(word => COMMON_VERBS.has(word.toLocaleLowerCase()))
  if (hasVerb) return false

  const likelyTermWords = words.filter(isLikelyProperTermWord)
  if (likelyTermWords.length !== words.length) return false

  const hasStrongCue = /[!?]$/u.test(semantic)
    || words.length === 1
    || words.every(word => isTitleLikeWord(word) || word === word.toLocaleUpperCase())

  return hasStrongCue
}
