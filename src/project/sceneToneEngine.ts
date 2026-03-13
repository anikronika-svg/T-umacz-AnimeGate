import { stripAssFormattingForTranslation } from './assTranslationPreprocessor'
import { normalizeSemanticWhitespace } from './subtitleTextSanitizer'
import { classifyLineSemantic } from './lineSemanticClassifier'

export type SceneTone =
  | 'tense'
  | 'comedic'
  | 'dramatic'
  | 'calm'
  | 'mysterious'
  | 'action'
  | 'emotional'
  | 'reflective'
  | 'neutral'

export interface SceneToneResult {
  summary: string
  tone: SceneTone
  applied: boolean
}

export interface SceneToneInputLine {
  source: string
  sourceRaw?: string
  character?: string
}

function semanticText(value: string): string {
  return normalizeSemanticWhitespace(stripAssFormattingForTranslation(value))
}

function detectToneSignals(line: string): Record<SceneTone, number> {
  const scores: Record<SceneTone, number> = {
    tense: 0,
    comedic: 0,
    dramatic: 0,
    calm: 0,
    mysterious: 0,
    action: 0,
    emotional: 0,
    reflective: 0,
    neutral: 0,
  }

  const normalized = line.toLowerCase()
  const exclamations = (line.match(/!/g) ?? []).length
  const ellipses = (line.match(/\.{3}|…/g) ?? []).length
  const questions = (line.match(/\?/g) ?? []).length

  if (exclamations >= 2) scores.action += 2
  if (exclamations >= 1) scores.action += 1
  if (exclamations >= 1) scores.tense += 1
  if (questions >= 1) scores.mysterious += 1
  if (ellipses >= 1) scores.reflective += 1

  if (/\b(haha|hehe|lol|żart|żarty|śmiej|ha!|komedia)\b/i.test(normalized)) {
    scores.comedic += 2
  }
  if (/\b(uciekaj|atak|biegnij|szybko|teraz|ostrożnie|uważaj|do broni|run|hurry|now)\b/i.test(normalized)) {
    scores.action += 2
  }
  if (/\b(kocham|nienawidz|boli|tęskn|przeprasz|wybacz)\b/i.test(normalized)) {
    scores.emotional += 2
  }
  if (/\b(cisza|spokój|wycisz|odpoczn|spokojnie)\b/i.test(normalized)) {
    scores.calm += 2
  }
  if (/\b(tajemnic|sekret|zagadka|mroczn|dziwn)\b/i.test(normalized)) {
    scores.mysterious += 2
  }
  if (/\b(za późno|nie damy rady|koniec|katastrof)\b/i.test(normalized)) {
    scores.dramatic += 2
  }

  const semantic = classifyLineSemantic(normalized)
  if (semantic.type === 'INTERJECTION') scores.action += 1
  if (semantic.type === 'SHORT_REPLY') scores.tense += 1

  return scores
}

function summarizeTone(tone: SceneTone): string {
  switch (tone) {
    case 'tense':
      return 'Scene tone: tense. Keep lines tight and focused, less softness.'
    case 'comedic':
      return 'Scene tone: comedic. Keep a light, playful rhythm while staying subtitle-safe.'
    case 'dramatic':
      return 'Scene tone: dramatic. Allow stronger emotional phrasing without melodrama.'
    case 'calm':
      return 'Scene tone: calm. Use softer, composed delivery.'
    case 'mysterious':
      return 'Scene tone: mysterious. Slightly restrained, suggestive phrasing.'
    case 'action':
      return 'Scene tone: action. Short, urgent, energetic delivery.'
    case 'emotional':
      return 'Scene tone: emotional. Warm, expressive but controlled.'
    case 'reflective':
      return 'Scene tone: reflective. Softer, internal cadence.'
    default:
      return 'Scene tone: neutral. Keep natural subtitle cadence.'
  }
}

function pickDominantTone(scores: Record<SceneTone, number>): SceneTone {
  const ordered: SceneTone[] = ['action', 'tense', 'emotional', 'dramatic', 'comedic', 'mysterious', 'reflective', 'calm']
  let best: SceneTone = 'neutral'
  let bestScore = 0
  ordered.forEach(tone => {
    const score = scores[tone]
    if (score > bestScore) {
      bestScore = score
      best = tone
    }
  })
  return bestScore > 0 ? best : 'neutral'
}

export function buildSceneToneSummary(
  lines: SceneToneInputLine[],
  index: number,
  opts?: { speakerModeTag?: string; characterVoiceSummary?: string },
): SceneToneResult {
  const windowStart = Math.max(0, index - 2)
  const windowEnd = Math.min(lines.length - 1, index + 1)
  const windowLines = lines.slice(windowStart, windowEnd + 1)

  const aggregateScores: Record<SceneTone, number> = {
    tense: 0,
    comedic: 0,
    dramatic: 0,
    calm: 0,
    mysterious: 0,
    action: 0,
    emotional: 0,
    reflective: 0,
    neutral: 0,
  }

  windowLines.forEach(line => {
    const text = semanticText(line.sourceRaw || line.source)
    if (!text) return
    const scores = detectToneSignals(text)
    Object.keys(scores).forEach(key => {
      const tone = key as SceneTone
      aggregateScores[tone] += scores[tone]
    })
  })

  const speakerTag = opts?.speakerModeTag?.toUpperCase() ?? ''
  if (speakerTag.includes('M') || speakerTag.includes('N')) {
    aggregateScores.reflective += 2
  }

  if (opts?.characterVoiceSummary?.includes('energetic')) {
    aggregateScores.action += 1
  }
  if (opts?.characterVoiceSummary?.includes('calm')) {
    aggregateScores.calm += 1
  }

  const tone = pickDominantTone(aggregateScores)
  return {
    tone,
    summary: summarizeTone(tone),
    applied: tone !== 'neutral',
  }
}
