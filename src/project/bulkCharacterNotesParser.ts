import { resolveCharacterByName } from './characterNameMatching'

export interface BulkCharacterNotesCharacter {
  id: number
  name: string
}

export interface BulkCharacterNotesMatch {
  characterId: number
  characterName: string
  header: string
  notes: string
}

export interface BulkCharacterNotesUnmatchedSection {
  header: string
  notes: string
}

export interface BulkCharacterNotesParseResult {
  matched: BulkCharacterNotesMatch[]
  unmatchedSections: BulkCharacterNotesUnmatchedSection[]
  totalSections: number
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function isHeaderCandidate(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (trimmed.length > 80) return false
  if (/[.!?;:]$/u.test(trimmed)) return false
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (!words.length || words.length > 6) return false
  return true
}

function flushSection(
  matches: BulkCharacterNotesMatch[],
  unmatched: BulkCharacterNotesUnmatchedSection[],
  header: string | null,
  matchedCharacter: BulkCharacterNotesCharacter | null,
  buffer: string[],
): void {
  if (!header) return
  const notes = buffer.join('\n').trim()
  if (!notes) return
  if (matchedCharacter) {
    matches.push({
      characterId: matchedCharacter.id,
      characterName: matchedCharacter.name,
      header,
      notes,
    })
    return
  }
  unmatched.push({ header, notes })
}

export function parseBulkCharacterNotes(
  rawText: string,
  characters: BulkCharacterNotesCharacter[],
): BulkCharacterNotesParseResult {
  const text = normalizeLineBreaks(rawText).trim()
  if (!text) {
    return { matched: [], unmatchedSections: [], totalSections: 0 }
  }

  const lines = text.split('\n')
  const matched: BulkCharacterNotesMatch[] = []
  const unmatchedSections: BulkCharacterNotesUnmatchedSection[] = []

  let currentHeader: string | null = null
  let currentCharacter: BulkCharacterNotesCharacter | null = null
  let currentBuffer: string[] = []

  lines.forEach(line => {
    const trimmed = line.trim()

    if (isHeaderCandidate(trimmed)) {
      const resolved = resolveCharacterByName(trimmed, characters)
      if (resolved) {
        flushSection(matched, unmatchedSections, currentHeader, currentCharacter, currentBuffer)
        currentHeader = trimmed
        currentCharacter = resolved
        currentBuffer = []
        return
      }

      if (currentHeader && !currentCharacter) {
        // Continue collecting currently unmatched section.
        currentBuffer.push(line)
        return
      }

      if (!currentHeader) {
        currentHeader = trimmed
        currentCharacter = null
        currentBuffer = []
        return
      }
    }

    if (!currentHeader) {
      // Text before first recognized header becomes unmatched preface.
      currentHeader = '(nierozpoznana sekcja)'
      currentCharacter = null
      currentBuffer = []
    }

    currentBuffer.push(line)
  })

  flushSection(matched, unmatchedSections, currentHeader, currentCharacter, currentBuffer)

  const dedupedByCharacter = new Map<number, BulkCharacterNotesMatch>()
  matched.forEach(item => {
    const existing = dedupedByCharacter.get(item.characterId)
    if (!existing) {
      dedupedByCharacter.set(item.characterId, item)
      return
    }
    dedupedByCharacter.set(item.characterId, {
      ...existing,
      notes: `${existing.notes}\n\n${item.notes}`.trim(),
    })
  })

  return {
    matched: [...dedupedByCharacter.values()],
    unmatchedSections,
    totalSections: [...dedupedByCharacter.values()].length + unmatchedSections.length,
  }
}
