import type { CharacterGender } from '../translationStyle'

const TECHNICAL_CHARACTER_SUFFIXES = new Set([
  'n',
  'm',
  'f',
  'male',
  'female',
  'narracja',
  'narratora',
  'narrator',
  'mysli',
  'myśli',
  'monolog',
  'narration',
  'thought',
  'thinking',
  'inner',
  'voice',
  'whisper',
  'whispers',
  'off',
  'bg',
  'background',
  'crowd',
  'echo',
  'sfx',
  'fx',
  'alt',
  'ver',
  'version',
])

export type SpeakerModeTag = 'narration' | 'thought' | 'other' | null

export interface ParsedCharacterSpeaker {
  raw: string
  baseName: string
  modeTagRaw: string
  modeTag: SpeakerModeTag
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function stripCharacterTechnicalMetadata(value: string): string {
  const parsed = parseCharacterSpeaker(value)
  const withoutBrackets = parsed.baseName

  if (!withoutBrackets) return ''

  const words = withoutBrackets.split(' ').filter(Boolean)
  while (words.length > 1) {
    const last = normalizeToken(words[words.length - 1] ?? '')
    if (!TECHNICAL_CHARACTER_SUFFIXES.has(last)) break
    words.pop()
  }

  return words.join(' ').trim()
}

function normalizeModeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

function classifySpeakerModeTag(value: string): SpeakerModeTag {
  const token = normalizeModeToken(value)
  if (!token) return null
  if (token === 'n' || token.startsWith('narr') || token === 'narrator') return 'narration'
  if (token === 'm' || token.startsWith('mysl') || token.startsWith('thought') || token.startsWith('think')) return 'thought'
  return 'other'
}

export function parseCharacterSpeaker(value: string): ParsedCharacterSpeaker {
  const raw = value ?? ''
  const trimmed = raw.trim()
  if (!trimmed) {
    return {
      raw,
      baseName: '',
      modeTagRaw: '',
      modeTag: null,
    }
  }

  const bracketMatch = trimmed.match(/^(.*?)(?:\s*[\(\[\{]\s*([^\)\]\}]+)\s*[\)\]\}])\s*$/u)
  const baseName = (
    bracketMatch?.[1]
      ? bracketMatch[1]
      : trimmed
  )
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const modeTagRaw = (bracketMatch?.[2] ?? '').trim()

  return {
    raw,
    baseName,
    modeTagRaw,
    modeTag: classifySpeakerModeTag(modeTagRaw),
  }
}

export function normalizeCharacterName(value: string): string {
  return stripCharacterTechnicalMetadata(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

export function normalizeCharacterAlias(value: string): string {
  return stripCharacterTechnicalMetadata(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeAlias(value: string): string[] {
  return normalizeCharacterAlias(value).split(' ').filter(Boolean)
}

function isKnownGender(value: unknown): boolean {
  return value === 'Female' || value === 'Male'
}

export function resolveCharacterByName<T extends { name: string; gender?: CharacterGender | string }>(
  characterName: string,
  characters: T[],
  options?: { preferKnownGender?: boolean; aliasMap?: Map<string, string> },
): T | null {
  const parsed = parseCharacterSpeaker(characterName)
  const trimmed = parsed.baseName.trim()
  if (!trimmed) return null

  const normalized = normalizeCharacterName(trimmed)
  const alias = normalizeCharacterAlias(trimmed)
  const aliasTokens = tokenizeAlias(trimmed)
  const mappedCanonical = options?.aliasMap?.get(alias) ?? options?.aliasMap?.get(normalized)
  if (mappedCanonical) {
    const mappedMatch = characters.find(item => normalizeCharacterName(item.name) === normalizeCharacterName(mappedCanonical))
    if (mappedMatch) return mappedMatch
  }
  const reversedAlias = aliasTokens.length > 1 ? [...aliasTokens].reverse().join(' ') : ''

  type Candidate = { item: T; score: number }
  const scored: Candidate[] = characters.map(item => {
    const candidateNormalized = normalizeCharacterName(item.name)
    const candidateAlias = normalizeCharacterAlias(item.name)
    const candidateTokens = tokenizeAlias(item.name)
    let score = 0

    if (candidateNormalized && candidateNormalized === normalized) score += 500
    if (candidateAlias && candidateAlias === alias) score += 420
    if (reversedAlias && candidateAlias === reversedAlias) score += 390

    if (aliasTokens.length === 1) {
      const token = aliasTokens[0]
      if (candidateTokens.includes(token)) score += 300
      if (candidateTokens[0] === token) score += 40
      if (candidateTokens[candidateTokens.length - 1] === token) score += 35
    } else if (aliasTokens.length > 1) {
      const allTokensMatch = aliasTokens.every(token => candidateTokens.includes(token))
      if (allTokensMatch) score += 280
      if (candidateTokens[0] === aliasTokens[0]) score += 35
      if (candidateTokens[candidateTokens.length - 1] === aliasTokens[aliasTokens.length - 1]) score += 35
    }

    if (
      candidateAlias
      && alias
      && (
        candidateAlias.startsWith(`${alias} `)
        || candidateAlias.endsWith(` ${alias}`)
        || candidateAlias.includes(` ${alias} `)
        || alias.startsWith(`${candidateAlias} `)
        || alias.endsWith(` ${candidateAlias}`)
      )
    ) {
      score += 120
    }

    if (options?.preferKnownGender && isKnownGender(item.gender)) {
      score += 10
    }

    return { item, score }
  })

  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  const second = scored[1]
  if (!best || best.score < 120) return null
  if (second && second.score === best.score) return null
  return best.item
}
