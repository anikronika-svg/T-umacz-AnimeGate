import type { CharacterGender } from '../translationStyle'

const TECHNICAL_CHARACTER_SUFFIXES = new Set([
  'm',
  'f',
  'male',
  'female',
  'whisper',
  'whispers',
  'thought',
  'thinks',
  'thinking',
  'monologue',
  'narration',
  'narrator',
  'inner',
  'voice',
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

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function stripCharacterTechnicalMetadata(value: string): string {
  const withoutBrackets = value
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!withoutBrackets) return ''

  const words = withoutBrackets.split(' ').filter(Boolean)
  while (words.length > 1) {
    const last = normalizeToken(words[words.length - 1] ?? '')
    if (!TECHNICAL_CHARACTER_SUFFIXES.has(last)) break
    words.pop()
  }

  return words.join(' ').trim()
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
  options?: { preferKnownGender?: boolean },
): T | null {
  const trimmed = characterName.trim()
  if (!trimmed) return null

  const normalized = normalizeCharacterName(trimmed)
  const alias = normalizeCharacterAlias(trimmed)
  const aliasTokens = tokenizeAlias(trimmed)
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
