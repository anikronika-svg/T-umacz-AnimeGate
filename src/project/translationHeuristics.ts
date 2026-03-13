import { stripAssFormattingForTranslation } from './assTranslationPreprocessor'

export type UntranslatedLineKind = 'translate' | 'copy' | 'warn' | 'glossary'

export interface GlossaryEntryLike {
  source: string
  preferred: string
  alternatives?: string
  active?: boolean
}

export interface UntranslatedLineClassification {
  kind: UntranslatedLineKind
  reason: string
  preferred?: string
}

const COMMON_TRANSLATABLE = new Set([
  'ok', 'okay', 'yes', 'no', 'hey', 'hello', 'hi', 'thanks', 'thank', 'sorry', 'please', 'maybe',
  'sure', 'alright', 'all', 'right', 'fine', 'well', 'good', 'bad', 'red', 'blue', 'green', 'black',
  'white', 'go', 'run', 'stop', 'wait', 'auntie', 'uncle', 'mom', 'dad', 'sir', 'maam', 'mr', 'mrs',
  'ms', 'miss',
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
  'field', 'sphere', 'fist', 'claw', 'dance', 'wave', 'nova', 'gate',
])

function normalizeInput(value: string): string {
  return stripAssFormattingForTranslation(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeGlossaryKey(value: string): string {
  return normalizeInput(value)
    .replace(/^[\"'“”‘’]+|[\"'“”‘’]+$/g, '')
    .replace(/[!?。！？…]+$/u, '')
    .trim()
    .toLocaleLowerCase()
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

function resolveGlossaryMatch(value: string, glossary: GlossaryEntryLike[] = []): GlossaryEntryLike | null {
  if (!glossary.length) return null
  const normalized = normalizeGlossaryKey(value)
  if (!normalized) return null
  for (const entry of glossary) {
    if (entry.active === false) continue
    const sourceKey = normalizeGlossaryKey(entry.source)
    if (sourceKey && sourceKey === normalized) return entry
    if (entry.alternatives) {
      const alternatives = entry.alternatives
        .split('|')
        .map(item => normalizeGlossaryKey(item))
        .filter(Boolean)
      if (alternatives.includes(normalized)) return entry
    }
  }
  return null
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[!?。！？…]+$/u, '').trim()
}

export function classifyUntranslatedLine(
  sourceRawOrPlain: string,
  options?: { glossary?: GlossaryEntryLike[] },
): UntranslatedLineClassification {
  const semantic = normalizeInput(sourceRawOrPlain)
  if (!semantic) {
    return { kind: 'translate', reason: 'empty' }
  }

  const glossaryMatch = resolveGlossaryMatch(semantic, options?.glossary)
  if (glossaryMatch) {
    return { kind: 'glossary', reason: 'glossary', preferred: glossaryMatch.preferred }
  }

  const cleaned = stripTrailingPunctuation(semantic)
  const words = extractWords(cleaned)
  if (!words.length) {
    return { kind: 'translate', reason: 'no-words' }
  }
  const lower = words.map(word => word.toLocaleLowerCase())
  if (lower.some(word => COMMON_TRANSLATABLE.has(word))) {
    return { kind: 'translate', reason: 'common-word' }
  }
  if (lower.some(word => COMMON_VERBS.has(word))) {
    return { kind: 'translate', reason: 'verb' }
  }
  if (words.length > 4) {
    return { kind: 'translate', reason: 'long-line' }
  }

  const allProperLike = words.every(isProperLikeWord)
  const hasTitleLike = words.some(isTitleLikeWord)
  const hasSuffix = lower.some(word => PROPER_NOUN_SUFFIXES.has(word))
  const hasTechniqueCue = lower.some(word => TECHNIQUE_WORDS.has(word))
  const hasAcronym = words.some(word => word.length >= 2 && word === word.toLocaleUpperCase())

  if (hasAcronym) {
    return { kind: 'copy', reason: 'acronym' }
  }
  if (hasSuffix || hasTechniqueCue) {
    return { kind: 'copy', reason: 'suffix-or-technique' }
  }
  if (allProperLike && words.length >= 2) {
    return { kind: 'copy', reason: 'multiword-proper' }
  }

  if (words.length === 1) {
    const word = words[0]
    if (word.length <= 3) {
      return { kind: 'translate', reason: 'short-single' }
    }
    if (word === word.toLocaleUpperCase()) {
      return { kind: 'copy', reason: 'single-acronym' }
    }
    if (isTitleLikeWord(word)) {
      return { kind: 'copy', reason: 'single-proper' }
    }
  }

  if (!allProperLike && hasTitleLike && words.length <= 3) {
    return { kind: 'warn', reason: 'mixed-case-ambiguous' }
  }

  return { kind: 'translate', reason: 'default' }
}

export function isNonTranslatableProperNounLine(sourceRawOrPlain: string): boolean {
  return classifyUntranslatedLine(sourceRawOrPlain).kind === 'copy'
}
