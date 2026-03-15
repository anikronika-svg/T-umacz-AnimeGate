export interface StyleLibraryEntry {
  id: string
  label: string
  summary: string
  rules: string[]
  examples: string[]
}

export type StyleLibraryMap = Record<string, StyleLibraryEntry>

export const DEFAULT_STYLE_LIBRARY: StyleLibraryMap = {
  dialog: {
    id: 'dialog',
    label: 'Dialog naturalny',
    summary: 'Prefer natural, spoken Polish subtitles with short, readable phrasing.',
    rules: [
      'Prefer short, spoken constructions',
      'Avoid rigid literal calques',
      'Keep punctuation tone',
      'Do not expand very short lines',
    ],
    examples: [
      'Dziekuje ci bardzo. -> Dzieki.',
      'Nie sadze, zeby to bylo mozliwe. -> Nie wydaje mi sie, zeby to bylo mozliwe.',
    ],
  },
  tsundere: {
    id: 'tsundere',
    label: 'Tsundere',
    summary: 'Slightly sharp, defensive, with small emotional cracks. Keep it natural and short.',
    rules: [
      'Use mild sharpness or defensiveness',
      'Do not overdo slang',
      'Keep lines short and readable',
    ],
    examples: [
      'Dziekuje ci bardzo. -> Tch... dzieki.',
      'Nie chce. -> Nie, nie chce.',
    ],
  },
  arogancki: {
    id: 'arogancki',
    label: 'Arogancki',
    summary: 'Elevated, confident, slightly condescending register. No parody.',
    rules: [
      'Use elevated but clear wording',
      'Avoid slang and filler',
      'Keep confidence and distance',
    ],
    examples: [
      'Dziekuje ci bardzo. -> Hmm. W porzadku.',
      'Nie sadze. -> Nie sadze, bys mial racje.',
    ],
  },
  formalny: {
    id: 'formalny',
    label: 'Formalny',
    summary: 'Polite, orderly, formal speech. Avoid slang and reduce emotional exaggeration.',
    rules: [
      'Use polite forms',
      'Avoid slang and contractions',
      'Keep clarity and brevity',
    ],
    examples: [
      'Dziekuje ci bardzo. -> Dziekuje.',
      'Co robisz? -> Co pan/pani robi?',
    ],
  },
}

export function parseStyleLibraryEntry(content: string, fallbackId: string): StyleLibraryEntry | null {
  try {
    const parsed = JSON.parse(content) as Partial<StyleLibraryEntry>
    const id = typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id.trim() : fallbackId
    const label = typeof parsed.label === 'string' && parsed.label.trim() ? parsed.label.trim() : fallbackId
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
    const rules = Array.isArray(parsed.rules)
      ? parsed.rules.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean)
      : []
    const examples = Array.isArray(parsed.examples)
      ? parsed.examples.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean)
      : []

    if (!summary && rules.length === 0 && examples.length === 0) return null

    return {
      id,
      label,
      summary,
      rules,
      examples,
    }
  } catch {
    return null
  }
}

export function formatStyleLibraryEntry(entry: StyleLibraryEntry): string {
  const parts: string[] = []
  parts.push(`Style profile: ${entry.label} (${entry.id})`)
  if (entry.summary) parts.push(`Summary: ${entry.summary}`)
  if (entry.rules.length) parts.push(`Rules: ${entry.rules.join(' | ')}`)
  if (entry.examples.length) parts.push(`Examples: ${entry.examples.slice(0, 6).join(' | ')}`)
  return parts.join('\n')
}

export function mergeStyleLibraries(base: StyleLibraryMap, incoming: StyleLibraryMap): StyleLibraryMap {
  return { ...base, ...incoming }
}
