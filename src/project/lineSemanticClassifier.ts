import { stripAssFormattingForTranslation } from './assTranslationPreprocessor'

export type LineSemanticType =
  | 'NORMAL_DIALOG'
  | 'PROPER_NOUN'
  | 'WORLD_TERM'
  | 'INTERJECTION'
  | 'SHORT_REPLY'
  | 'UNCERTAIN'

export interface LineSemanticClassification {
  type: LineSemanticType
  reason: string
}

const INTERJECTION_WORDS = new Set([
  'hey', 'eh', 'ah', 'oh', 'huh', 'hmm', 'hm', 'ugh', 'wow', 'yo',
])

const SHORT_REPLY_WORDS = new Set([
  'ok', 'okay', 'yes', 'no', 'maybe', 'right', 'sure', 'fine', 'well', 'alright',
])

const COMMON_TRANSLATABLE = new Set([
  'red', 'blue', 'green', 'black', 'white', 'go', 'run', 'stop', 'wait',
  'hello', 'hi', 'thanks', 'thank', 'sorry', 'please', 'auntie', 'uncle',
  'mom', 'dad', 'sir', 'maam', 'mr', 'mrs', 'ms', 'miss',
  'master', 'episode', 'rabbit', 'kill',
])

const COMMON_VERBS = new Set([
  'is', 'are', 'was', 'were', 'be', 'been', 'am', 'have', 'has', 'had', 'do', 'does', 'did',
  'go', 'goes', 'went', 'come', 'comes', 'came', 'look', 'looks', 'looked', 'say', 'says', 'said',
  'make', 'makes', 'made', 'take', 'takes', 'took', 'see', 'sees', 'saw', 'know', 'knows', 'knew',
  'can', 'could', 'will', 'would', 'should', 'shall', 'may', 'might', 'must', 'let', 'lets',
])

const PROPER_NOUN_SUFFIXES = new Set([
  'guild', 'academy', 'temple', 'kingdom', 'empire', 'order', 'clan', 'corp', 'corporation',
  'company', 'school', 'palace', 'tower', 'castle', 'forest', 'city', 'island', 'mountain', 'river',
  'lake', 'sea', 'port', 'gate', 'district', 'arena', 'spire', 'sanctum', 'cathedral', 'bastion',
  'fort', 'fortress', 'station', 'laboratory', 'lab', 'project', 'protocol', 'division', 'unit',
  'squad', 'brigade', 'circle', 'ring', 'council', 'federation', 'union', 'covenant', 'alliance',
  'legion', 'regiment', 'knights', 'knight',
])

const TECHNIQUE_WORDS = new Set([
  'burst', 'strike', 'slash', 'blade', 'arrow', 'shot', 'storm', 'flare', 'blast', 'seal', 'barrier',
  'field', 'sphere', 'fist', 'claw', 'dance', 'wave', 'nova', 'gate', 'flame',
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

function isProperLikeWord(word: string): boolean {
  if (word.length < 2) return false
  return isTitleLikeWord(word) || word === word.toLocaleUpperCase()
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[!?。！？…]+$/u, '').trim()
}

export function classifyLineSemantic(sourceRawOrPlain: string): LineSemanticClassification {
  const semantic = normalizeInput(sourceRawOrPlain)
  if (!semantic) return { type: 'NORMAL_DIALOG', reason: 'empty' }

  const cleaned = stripTrailingPunctuation(semantic)
  const words = extractWords(cleaned)
  if (!words.length) return { type: 'NORMAL_DIALOG', reason: 'no-words' }

  const lower = words.map(word => word.toLocaleLowerCase())
  if (lower.every(word => INTERJECTION_WORDS.has(word)) && words.length <= 2) {
    return { type: 'INTERJECTION', reason: 'interjection' }
  }
  if (lower.every(word => SHORT_REPLY_WORDS.has(word)) && words.length <= 2) {
    return { type: 'SHORT_REPLY', reason: 'short-reply' }
  }
  if (lower.some(word => COMMON_VERBS.has(word))) {
    return { type: 'NORMAL_DIALOG', reason: 'verb' }
  }
  if (words.length > 4) {
    return { type: 'NORMAL_DIALOG', reason: 'long-line' }
  }

  const allProperLike = words.every(isProperLikeWord)
  const hasTitleLike = words.some(isTitleLikeWord)
  const hasSuffix = lower.some(word => PROPER_NOUN_SUFFIXES.has(word))
  const hasTechniqueCue = lower.some(word => TECHNIQUE_WORDS.has(word))
  const hasAcronym = words.some(word => word.length >= 2 && word === word.toLocaleUpperCase())

  if (hasAcronym) return { type: 'PROPER_NOUN', reason: 'acronym' }
  if ((hasSuffix || hasTechniqueCue) && words.length >= 2) {
    return { type: 'WORLD_TERM', reason: 'world-term-cue' }
  }
  if (lower.some(word => COMMON_TRANSLATABLE.has(word))) {
    return { type: 'NORMAL_DIALOG', reason: 'common-word' }
  }
  if (allProperLike && words.length >= 2) return { type: 'PROPER_NOUN', reason: 'multiword-proper' }

  if (words.length === 1) {
    const word = words[0]
    if (word.length <= 3) return { type: 'NORMAL_DIALOG', reason: 'short-single' }
    if (isTitleLikeWord(word)) return { type: 'PROPER_NOUN', reason: 'single-proper' }
  }

  if (!allProperLike && hasTitleLike && words.length <= 3) {
    return { type: 'UNCERTAIN', reason: 'mixed-case-ambiguous' }
  }

  return { type: 'NORMAL_DIALOG', reason: 'default' }
}
