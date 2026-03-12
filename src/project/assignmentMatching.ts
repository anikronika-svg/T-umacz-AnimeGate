import { normalizeCharacterAlias, parseCharacterSpeaker } from './characterNameMatching'

export interface ProjectLineAssignment {
  lineId: number
  rawCharacter: string
  resolvedCharacterName: string
  speakerModeTag?: string
  lineKey?: string
}

export interface AssignmentRowInput {
  id: number
  start: string
  end: string
  style: string
  sourceRaw: string
  character: string
}

function normalizeForKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\\N/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildLineKey(row: Pick<AssignmentRowInput, 'start' | 'end' | 'style' | 'sourceRaw'>): string {
  const source = normalizeForKey(row.sourceRaw).slice(0, 180)
  const style = normalizeForKey(row.style)
  return `${row.start}|${row.end}|${style}|${source}`
}

export function buildProjectLineAssignments(
  rows: AssignmentRowInput[],
  resolveCharacterName: (rawCharacter: string) => string,
): ProjectLineAssignment[] {
  return rows
    .filter(row => row.character.trim().length > 0)
    .map(row => {
      const parsedSpeaker = parseCharacterSpeaker(row.character)
      return {
        lineId: row.id,
        rawCharacter: row.character,
        resolvedCharacterName: resolveCharacterName(parsedSpeaker.baseName || row.character),
        speakerModeTag: parsedSpeaker.modeTagRaw || undefined,
        lineKey: buildLineKey(row),
      }
    })
}

export function applyProjectLineAssignments<T extends AssignmentRowInput>(
  rows: T[],
  assignments: ProjectLineAssignment[],
): { rows: T[]; applied: number } {
  if (!assignments.length || !rows.length) return { rows, applied: 0 }

  const byLineKey = new Map<string, string>()
  const aliasVotes = new Map<string, Map<string, number>>()

  assignments.forEach(item => {
    const resolved = item.resolvedCharacterName?.trim()
    if (!resolved) return

    if (item.lineKey) {
      byLineKey.set(item.lineKey, resolved)
    }

    const alias = normalizeCharacterAlias(item.rawCharacter)
    if (!alias) return
    const votes = aliasVotes.get(alias) ?? new Map<string, number>()
    votes.set(resolved, (votes.get(resolved) ?? 0) + 1)
    aliasVotes.set(alias, votes)
  })

  const aliasResolved = new Map<string, string>()
  aliasVotes.forEach((votes, alias) => {
    let bestName = ''
    let bestScore = -1
    votes.forEach((score, name) => {
      if (score > bestScore) {
        bestName = name
        bestScore = score
      }
    })
    if (bestName) aliasResolved.set(alias, bestName)
  })

  let applied = 0
  const nextRows = rows.map(row => {
    const lineMatch = byLineKey.get(buildLineKey(row))
    const aliasMatch = aliasResolved.get(normalizeCharacterAlias(row.character))
    const resolved = lineMatch ?? aliasMatch
    if (!resolved || resolved === row.character) return row
    applied += 1
    return { ...row, character: resolved }
  })

  return { rows: nextRows, applied }
}
