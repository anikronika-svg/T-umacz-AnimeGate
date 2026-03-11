export interface CharacterAssignmentSuggestionRow {
  id: number
  start: string
  end: string
  style: string
  character: string
}

export interface CharacterAssignmentSuggestion {
  name: string
  score: number
  reasons: string[]
}

export interface BuildCharacterAssignmentSuggestionsInput {
  rows: CharacterAssignmentSuggestionRow[]
  selectedLineId: number
  availableCharacters: string[]
  recentCharacterHistory: string[]
  lastUsedCharacter: string
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function subtitleTimeToSeconds(value: string): number {
  const match = value.trim().match(/^(\d+):([0-5]\d):([0-5]\d)(?:[.,](\d{1,3}))?$/)
  if (!match) return 0
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)
  const fraction = Number((match[4] ?? '0').padEnd(3, '0').slice(0, 3))
  return hours * 3600 + minutes * 60 + seconds + fraction / 1000
}

export function buildCharacterAssignmentSuggestions(
  input: BuildCharacterAssignmentSuggestionsInput,
): CharacterAssignmentSuggestion[] {
  const availableByKey = new Map<string, string>()
  input.availableCharacters.forEach(name => {
    const trimmed = name.trim()
    const key = normalizeName(trimmed)
    if (!trimmed || !key || availableByKey.has(key)) return
    availableByKey.set(key, trimmed)
  })
  if (availableByKey.size === 0) return []

  const index = input.rows.findIndex(row => row.id === input.selectedLineId)
  if (index < 0) return []

  const selectedRow = input.rows[index]
  const selectedStart = subtitleTimeToSeconds(selectedRow.start)
  const selectedEnd = subtitleTimeToSeconds(selectedRow.end)
  const selectedCenter = (selectedStart + selectedEnd) / 2

  const scoreByKey = new Map<string, number>()
  const reasonsByKey = new Map<string, string[]>()
  const frequencyByKey = new Map<string, number>()

  const pushScore = (rawName: string, score: number, reason: string): void => {
    const key = normalizeName(rawName)
    if (!key || !availableByKey.has(key)) return
    scoreByKey.set(key, (scoreByKey.get(key) ?? 0) + score)
    const reasons = reasonsByKey.get(key) ?? []
    reasons.push(reason)
    reasonsByKey.set(key, reasons.slice(0, 4))
  }

  input.rows.forEach(row => {
    const key = normalizeName(row.character)
    if (!key || !availableByKey.has(key)) return
    frequencyByKey.set(key, (frequencyByKey.get(key) ?? 0) + 1)
  })

  for (let i = index - 1; i >= 0; i -= 1) {
    const row = input.rows[i]
    const candidate = row.character.trim()
    if (!candidate) continue
    const distance = index - i
    if (distance === 1) {
      pushScore(candidate, 44, 'Poprzednia linia')
    } else if (distance <= 6) {
      pushScore(candidate, Math.max(10, 34 - distance * 4), `Bliski kontekst (${distance} wstecz)`)
    }
    break
  }

  for (let i = index + 1; i < input.rows.length; i += 1) {
    const row = input.rows[i]
    const candidate = row.character.trim()
    if (!candidate) continue
    const distance = i - index
    if (distance === 1) {
      pushScore(candidate, 30, 'Nastepna linia')
    } else if (distance <= 6) {
      pushScore(candidate, Math.max(8, 24 - distance * 3), `Bliski kontekst (${distance} dalej)`)
    }
    break
  }

  input.rows.forEach((row, rowIndex) => {
    const candidate = row.character.trim()
    if (!candidate || row.id === input.selectedLineId) return
    const lineDistance = Math.abs(rowIndex - index)
    if (lineDistance > 4) return
    if (row.style.trim() && row.style.trim() === selectedRow.style.trim()) {
      pushScore(candidate, Math.max(4, 18 - lineDistance * 3), 'Ten sam styl linii')
    }
  })

  input.rows.forEach(row => {
    const candidate = row.character.trim()
    if (!candidate || row.id === input.selectedLineId) return
    const rowCenter = (subtitleTimeToSeconds(row.start) + subtitleTimeToSeconds(row.end)) / 2
    const delta = Math.abs(rowCenter - selectedCenter)
    if (delta > 14) return
    const closeness = Math.max(0, 1 - delta / 14)
    const score = Math.round(closeness * 14)
    if (score > 0) {
      pushScore(candidate, score, 'Bliskosc czasowa sceny')
    }
  })

  const recent = input.recentCharacterHistory
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 6)
  recent.forEach((name, idx) => {
    const boost = Math.max(5, 18 - idx * 3)
    pushScore(name, boost, `Ostatnio uzywana (${idx + 1})`)
  })

  if (input.lastUsedCharacter.trim()) {
    pushScore(input.lastUsedCharacter, 16, 'Ostatnio kliknieta postac')
  }

  if (scoreByKey.size === 0) {
    frequencyByKey.forEach((count, key) => {
      scoreByKey.set(key, count * 4)
      reasonsByKey.set(key, ['Najczesciej przypisywana'])
    })
  }

  const suggestions = [...scoreByKey.entries()]
    .map(([key, score]) => ({
      name: availableByKey.get(key) ?? key,
      score,
      reasons: reasonsByKey.get(key) ?? [],
      frequency: frequencyByKey.get(key) ?? 0,
    }))
    .sort((a, b) => b.score - a.score || b.frequency - a.frequency || a.name.localeCompare(b.name, 'pl', { sensitivity: 'base' }))
    .slice(0, 3)
    .map(({ name, score, reasons }) => ({ name, score, reasons }))

  return suggestions
}
