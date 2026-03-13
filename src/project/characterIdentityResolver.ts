import type { CharacterGender } from '../translationStyle'
import {
  normalizeCharacterAlias,
  normalizeCharacterName,
  parseCharacterSpeaker,
  resolveCharacterByName,
  type ParsedCharacterSpeaker,
} from './characterNameMatching'

export interface IdentityAliasAssignment {
  rawCharacter: string
  resolvedCharacterName: string
}

export interface CharacterIdentityResult<T> {
  speaker: ParsedCharacterSpeaker
  character: T | null
  canonicalName: string | null
}

function isKnownGender(value: unknown): boolean {
  return value === 'Female' || value === 'Male'
}

function tokenizeAlias(value: string): string[] {
  return normalizeCharacterAlias(value).split(' ').filter(Boolean)
}

function getCandidateTokens(name: string): string[] {
  return tokenizeAlias(name)
}

function findPreferredSingleTokenMatch<T extends { name: string; gender?: CharacterGender | string }>(
  token: string,
  characters: T[],
): T | null {
  const matches = characters.filter(item => {
    const tokens = getCandidateTokens(item.name)
    if (tokens.length < 2) return false
    return tokens.includes(token)
  })
  if (!matches.length) return null

  const withKnownGender = matches.filter(item => isKnownGender(item.gender))
  if (withKnownGender.length === 1) return withKnownGender[0]
  if (withKnownGender.length > 1) {
    return withKnownGender.sort((a, b) => a.name.length - b.name.length)[0]
  }
  return matches.sort((a, b) => a.name.length - b.name.length)[0]
}

export function buildIdentityAliasMap(assignments: IdentityAliasAssignment[]): Map<string, string> {
  const map = new Map<string, string>()
  assignments.forEach(assignment => {
    const canonical = assignment.resolvedCharacterName?.trim()
    if (!canonical) return
    const alias = normalizeCharacterAlias(assignment.rawCharacter || '')
    if (alias && !map.has(alias)) {
      map.set(alias, canonical)
    }
    const normalized = normalizeCharacterName(assignment.rawCharacter || '')
    if (normalized && !map.has(normalized)) {
      map.set(normalized, canonical)
    }
  })
  return map
}

export function resolveCharacterIdentity<T extends { name: string; gender?: CharacterGender | string }>(
  rawCharacter: string,
  characters: T[],
  aliasMap?: Map<string, string>,
): CharacterIdentityResult<T> {
  const speaker = parseCharacterSpeaker(rawCharacter ?? '')
  const baseName = speaker.baseName?.trim() || rawCharacter?.trim() || ''
  if (!baseName) {
    return { speaker, character: null, canonicalName: null }
  }

  const match = resolveCharacterByName(baseName, characters, { preferKnownGender: true, aliasMap })
    ?? resolveCharacterByName(baseName, characters, { aliasMap })

  const tokens = tokenizeAlias(baseName)
  if (tokens.length === 1) {
    const token = tokens[0]
    if (!match || !isKnownGender(match.gender)) {
      const preferred = findPreferredSingleTokenMatch(token, characters)
      if (preferred) {
        return { speaker, character: preferred, canonicalName: preferred.name }
      }
    }
  }

  return { speaker, character: match, canonicalName: match?.name ?? null }
}

export function resolveCharacterNameOrRaw<T extends { name: string; gender?: CharacterGender | string }>(
  rawCharacter: string,
  characters: T[],
  aliasMap?: Map<string, string>,
): string {
  return resolveCharacterIdentity(rawCharacter, characters, aliasMap).canonicalName ?? rawCharacter
}

export function shouldCreatePlaceholderCharacter<T extends { name: string; gender?: CharacterGender | string }>(
  rawCharacter: string,
  characters: T[],
  aliasMap?: Map<string, string>,
): boolean {
  return !resolveCharacterIdentity(rawCharacter, characters, aliasMap).character
}
