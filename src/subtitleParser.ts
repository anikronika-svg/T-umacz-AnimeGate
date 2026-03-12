// TL_SEP: bezkolizyjny separator trybu tlumaczenia (nie moze wystapic w tekscie napisow)
export const TL_SEP = '\x01'
const TLMODE_STYLE_NAME = 'TLmode'
const TLMODE_STYLE_HEADER = 'TLMode Style: TLmode'
const TLMODE_ENABLED_HEADER = 'TLMode: Yes'
const TLMODE_STYLE_FALLBACK = 'Style: TLmode,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1'

export interface ParsedSubtitleRow {
  id: number
  pl: 'done' | 'draft' | 'empty'
  start: string
  end: string
  style: string
  character: string
  // source: czysty tekst (bez tagow, \N zamienione na \n) — do wyswietlania i dopasowania pamieci
  source: string
  // sourceRaw: oryginalny tekst z pliku (z tagami ASS i \N) — do tłumaczenia z zachowaniem tagow
  sourceRaw: string
  // target: przetłumaczony tekst; \n odpowiada \N w pliku ASS (przez toAssText przy zapisie)
  target: string
}

interface SubtitleLineMapEntry {
  rowId: number
  mode: 'single' | 'paired'
  sourceLineIndex: number
  sourceParts: string[]
  sourceTextRaw: string
  targetLineIndex?: number
  targetParts?: string[]
}

export interface ParsedSubtitleFile {
  rows: ParsedSubtitleRow[]
  lines: string[]
  map: SubtitleLineMapEntry[]
}

function splitAssDialogue(content: string): string[] {
  const parts: string[] = []
  let current = ''
  let commas = 0

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i]
    if (ch === ',' && commas < 9) {
      parts.push(current)
      current = ''
      commas += 1
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts
}

function toAssText(value: string): string {
  return value.replace(/\r?\n/g, '\\N')
}

function buildDialogueLine(parts: string[], textRaw: string): string {
  return `Dialogue: ${parts.join(',')},${textRaw}`
}

// cleanText: do wyswietlania i pamieci tlumaczen
// \N -> \n (prawdziwy znak nowej linii) — zachowuje podzial na linie w round-trip
// tagi {...} — usuniete (nie sa potrzebne w UI ani do dopasowania pamieci)
function cleanText(value: string): string {
  return value
    .replace(/\\N/g, '\n')
    .replace(/\{[^}]*\}/g, '')
    .trim()
}

function splitTlModeDialogue(rawDialogue: string): { sourceRaw: string; targetRaw: string } {
  // Nowy format: separator \x01 (bezkolizyjny)
  const newIdx = rawDialogue.indexOf(TL_SEP)
  if (newIdx >= 0) {
    return {
      sourceRaw: rawDialogue.slice(0, newIdx),
      targetRaw: rawDialogue.slice(newIdx + TL_SEP.length),
    }
  }
  // Backward compat: stary format " | "
  const legacyIdx = rawDialogue.indexOf(' | ')
  if (legacyIdx >= 0) {
    return {
      sourceRaw: rawDialogue.slice(0, legacyIdx),
      targetRaw: rawDialogue.slice(legacyIdx + 3),
    }
  }
  return { sourceRaw: rawDialogue, targetRaw: '' }
}

interface ParsedDialogueLine {
  lineIndex: number
  parts: string[]
  style: string
  start: string
  end: string
  character: string
  textRaw: string
}

function parseDialogueLine(line: string, lineIndex: number): ParsedDialogueLine | null {
  const trimmed = line.trim()
  if (!trimmed || !trimmed.startsWith('Dialogue:')) return null
  const payload = trimmed.slice('Dialogue:'.length).trim()
  const parts = splitAssDialogue(payload)
  if (parts.length < 10) return null

  return {
    lineIndex,
    parts,
    style: parts[3]?.trim() ?? 'Default',
    start: parts[1]?.trim() ?? '',
    end: parts[2]?.trim() ?? '',
    character: parts[4]?.trim() ?? '',
    textRaw: parts[9] ?? '',
  }
}

function canTreatAsTlModePair(left: ParsedDialogueLine, right: ParsedDialogueLine): boolean {
  if (left.style !== TLMODE_STYLE_NAME) return false
  if (right.style === TLMODE_STYLE_NAME) return false
  // Para tlmode: 2 linie Dialog z tym samym timingiem i metadanymi (poza stylem i tekstem)
  for (const idx of [0, 1, 2, 4, 5, 6, 7, 8]) {
    if ((left.parts[idx] ?? '').trim() !== (right.parts[idx] ?? '').trim()) {
      return false
    }
  }
  return true
}

function ensureTlModeHeaders(lines: string[]): void {
  const hasStyleHeader = lines.some(line => line.trim().toLowerCase() === TLMODE_STYLE_HEADER.toLowerCase())
  const hasEnabledHeader = lines.some(line => line.trim().toLowerCase() === TLMODE_ENABLED_HEADER.toLowerCase())
  if (hasStyleHeader && hasEnabledHeader) return

  const scriptInfoIndex = lines.findIndex(line => line.trim().toLowerCase() === '[script info]')
  if (scriptInfoIndex < 0) return
  const stylesIndex = lines.findIndex(line => line.trim().toLowerCase() === '[v4+ styles]' || line.trim().toLowerCase() === '[v4 styles]')
  const insertAt = stylesIndex > scriptInfoIndex ? stylesIndex : lines.length

  const toInsert: string[] = []
  if (!hasStyleHeader) toInsert.push(TLMODE_STYLE_HEADER)
  if (!hasEnabledHeader) toInsert.push(TLMODE_ENABLED_HEADER)
  lines.splice(insertAt, 0, ...toInsert)
}

function ensureTlModeStyle(lines: string[]): void {
  const hasTlModeStyle = lines.some(line => /^Style:\s*TLmode,/i.test(line.trim()))
  if (hasTlModeStyle) return

  const stylesIndex = lines.findIndex(line => line.trim().toLowerCase() === '[v4+ styles]' || line.trim().toLowerCase() === '[v4 styles]')
  if (stylesIndex < 0) return
  const eventsIndex = lines.findIndex((line, index) => index > stylesIndex && line.trim().toLowerCase() === '[events]')
  const sectionEnd = eventsIndex >= 0 ? eventsIndex : lines.length

  let insertAt = stylesIndex + 1
  let templateStyleLine: string | null = null

  for (let index = stylesIndex + 1; index < sectionEnd; index += 1) {
    const trimmed = lines[index].trim()
    if (/^Format:/i.test(trimmed)) {
      insertAt = index + 1
      continue
    }
    if (/^Style:/i.test(trimmed)) {
      templateStyleLine = lines[index]
      if (insertAt <= stylesIndex + 1) insertAt = index
      break
    }
  }

  if (templateStyleLine) {
    const match = templateStyleLine.match(/^(\s*Style:\s*)([^,]+)(,.*)$/i)
    if (match) {
      lines.splice(insertAt, 0, `${match[1]}${TLMODE_STYLE_NAME}${match[3]}`)
      return
    }
  }

  lines.splice(insertAt, 0, TLMODE_STYLE_FALLBACK)
}

export function parseAssOrSsa(content: string): ParsedSubtitleFile {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/)
  const rows: ParsedSubtitleRow[] = []
  const map: SubtitleLineMapEntry[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const parsed = parseDialogueLine(lines[lineIndex], lineIndex)
    if (!parsed) continue

    const nextParsed = parseDialogueLine(lines[lineIndex + 1] ?? '', lineIndex + 1)
    if (nextParsed && canTreatAsTlModePair(parsed, nextParsed)) {
      const rowId = rows.length + 1
      const sourceRaw = parsed.textRaw
      const targetRaw = nextParsed.textRaw
      const source = cleanText(sourceRaw)
      const target = cleanText(targetRaw)
      if (!source.trim()) {
        lineIndex += 1
        continue
      }

      rows.push({
        id: rowId,
        pl: target ? 'done' : 'empty',
        start: parsed.start,
        end: parsed.end,
        style: nextParsed.style,
        character: nextParsed.character || parsed.character,
        source,
        sourceRaw,
        target,
      })
      map.push({
        rowId,
        mode: 'paired',
        sourceLineIndex: parsed.lineIndex,
        sourceParts: parsed.parts.slice(0, 9),
        sourceTextRaw: sourceRaw,
        targetLineIndex: nextParsed.lineIndex,
        targetParts: nextParsed.parts.slice(0, 9),
      })

      lineIndex += 1
      continue
    }

    const { sourceRaw, targetRaw } = splitTlModeDialogue(parsed.textRaw)
    const source = cleanText(sourceRaw)
    const target = cleanText(targetRaw)
    if (!source.trim()) continue

    const rowId = rows.length + 1
    rows.push({
      id: rowId,
      pl: target ? 'done' : 'empty',
      start: parsed.start,
      end: parsed.end,
      style: parsed.style === TLMODE_STYLE_NAME ? 'Default' : parsed.style,
      character: parsed.character,
      source,
      sourceRaw,
      target,
    })
    map.push({
      rowId,
      mode: 'single',
      sourceLineIndex: parsed.lineIndex,
      sourceParts: parsed.parts.slice(0, 9),
      sourceTextRaw: sourceRaw,
    })
  }

  return { rows, lines, map }
}

export function buildAssOrSsaContent(
  parsedFile: ParsedSubtitleFile,
  rows: Array<{ id: number; source: string; sourceRaw?: string; target: string; style?: string }>,
): string {
  const nextLines = [...parsedFile.lines]
  const rowsById = new Map(rows.map(row => [row.id, row]))

  const sortedEntries = [...parsedFile.map].sort((a, b) => b.sourceLineIndex - a.sourceLineIndex)

  sortedEntries.forEach(entry => {
    const row = rowsById.get(entry.rowId)
    if (!row) return

    const sourceRaw = row.sourceRaw ?? entry.sourceTextRaw
    const translatedRaw = toAssText(row.target.trim())

    if (entry.mode === 'paired' && entry.targetLineIndex !== undefined && entry.targetParts) {
      const sourceParts = [...entry.sourceParts]
      sourceParts[3] = TLMODE_STYLE_NAME
      const targetParts = [...entry.targetParts]
      targetParts[3] = row.style || targetParts[3] || 'Default'
      nextLines[entry.sourceLineIndex] = buildDialogueLine(sourceParts, sourceRaw)
      nextLines[entry.targetLineIndex] = buildDialogueLine(targetParts, translatedRaw)
      return
    }

    const sourceParts = [...entry.sourceParts]
    sourceParts[3] = TLMODE_STYLE_NAME
    const targetParts = [...entry.sourceParts]
    targetParts[3] = row.style || targetParts[3] || 'Default'
    nextLines[entry.sourceLineIndex] = buildDialogueLine(sourceParts, sourceRaw)
    nextLines.splice(entry.sourceLineIndex + 1, 0, buildDialogueLine(targetParts, translatedRaw))
  })

  ensureTlModeHeaders(nextLines)
  ensureTlModeStyle(nextLines)

  return nextLines.join('\n')
}
