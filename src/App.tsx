import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  CHARACTER_ARCHETYPES,
  GLOBAL_STYLE_OPTIONS,
  TRANSLATION_STYLES,
  buildTranslationStyleContext,
  createProjectStyleSettings,
  createDefaultProfile,
  getArchetypeLabel,
  getArchetypeToneRule,
  getStyleLabel,
  loadProjectStyleSettings,
  resolveEffectiveStyle,
  saveProjectStyleSettings,
  type CharacterArchetypeId,
  type CharacterGender,
  type CharacterStyleAssignment,
  type ProjectTranslationStyleSettings,
  type TranslationStyleId,
} from './translationStyle'
import { getAnimeCharactersForSeries, searchAnimeByTitle, type AniListAnimeResult, type AniListCharacter } from './anilist'
import { buildAssOrSsaContent, parseAssOrSsa, type ParsedSubtitleFile } from './subtitleParser'
import { useUpdaterStatus, type UpdaterStatus } from './hooks/useUpdaterStatus'
import {
  PROJECT_SCHEMA_VERSION,
  buildDiskProjectConfig as mapAppStateToProjectConfig,
  hydrateStateFromDiskProject,
  type DiskProjectConfigV1,
} from './project/projectMapper'
import {
  CHARACTER_TYPE_OPTIONS,
  getCharacterSubtypeById,
  mapLegacyArchetypeToCharacterType,
  normalizeCharacterTypeSelection,
} from './project/characterArchetypes'
import { buildCharacterArchetypePrompt } from './project/characterArchetypePrompt'
import {
  applyProjectLineAssignments,
  buildProjectLineAssignments,
  type ProjectLineAssignment,
} from './project/assignmentMatching'
import {
  buildCharacterAssignmentSuggestions,
  type CharacterAssignmentSuggestion,
} from './project/characterAssignmentSuggestions'
import {
  normalizeCharacterAlias as normalizeCharacterAliasByRules,
  normalizeCharacterName as normalizeCharacterNameByRules,
  resolveCharacterByName,
  stripCharacterTechnicalMetadata,
} from './project/characterNameMatching'
import { analyzeCharacterProfileFromAniList } from './project/characterProfileAnalysis'
import { mergeCharacterNotesAnalysisIntoProfile } from './project/characterNotesAnalysis'
import {
  buildContinuationContextFromPreviousLine,
  hasAssTechnicalMarkers,
  hasTranslatableAssText,
  stripAssFormattingForTranslation,
  tokenizeAssForTranslation,
  type SubtitleToken as AssSubtitleToken,
} from './project/assTranslationPreprocessor'
import { isNonTranslatableProperNounLine } from './project/translationHeuristics'
import { CharacterNotesModal, type BulkNotesApplyMode } from './components/CharacterNotesModal'
import {
  CharacterAssignmentGrid,
  type CharacterAssignmentGridItem,
} from './components/CharacterAssignmentGrid'

const C = {
  bg0: '#1e1e2e',
  bg1: '#181825',
  bg2: '#2a2b3d',
  bg3: '#383a52',
  surface: '#25263a',
  accent: '#89b4fa',
  accentG: '#a6e3a1',
  accentY: '#f9e2af',
  accentR: '#f38ba8',
  text: '#cdd6f4',
  textDim: '#6c7086',
  border: '#3d3f53',
  borderB: '#2e2f42',
}

const DEFAULT_PROJECT_ID = 'AnimeGate_EP01'
const SERIES_PROJECTS_STORAGE_KEY = 'animegate.series-projects.v1'

// Klucze per-projekt — zapobiega mieszaniu danych miedzy projektami serii.
function videoConfigKey(projectId: string): string {
  return `animegate-video-${projectId}`
}
function charImageCacheKey(projectId: string): string {
  return `animegate-character-images-${projectId}`
}

interface VideoProjectConfig {
  videoPath: string | null
  videoCollapsed: boolean
  videoHeight: number
  autoPlayOnLineClick: boolean
  preRollSec: number
  postRollSec: number
}

interface WaveformData {
  filePath: string
  sampleRate: number
  peaks: number[]
  duration: number
  fromCache: boolean
}

interface WaveformSelection {
  lineId: number
  startSec: number
  endSec: number
}

interface SeriesProjectMeta {
  id: string
  title: string
  anilistId: number | null
  preferredModelId: string
  sourceLang: string
  targetLang: string
  lastUpdated: string
}

const ACTIVE_DISK_PROJECT_STORAGE_KEY = 'animegate.active-disk-project.v1'

interface ActiveDiskProject {
  projectId: string
  title: string
  projectDir: string
  configPath: string
}

function sanitizeProjectId(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '')
    .slice(0, 64)
}

function loadSeriesProjectsCatalog(): SeriesProjectMeta[] {
  const fallback: SeriesProjectMeta[] = [{
    id: DEFAULT_PROJECT_ID,
    title: 'Nagieko no Bourei wa Intai shitai',
    anilistId: null,
    preferredModelId: DEFAULT_TRANSLATION_MODEL_ID,
    sourceLang: 'en',
    targetLang: 'pl',
    lastUpdated: new Date().toISOString(),
  }]

  try {
    const raw = localStorage.getItem(SERIES_PROJECTS_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as SeriesProjectMeta[]
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback
    const normalized = parsed
      .filter(item => item && typeof item.id === 'string' && typeof item.title === 'string')
      .map(item => ({
        id: sanitizeProjectId(item.id) || DEFAULT_PROJECT_ID,
        title: item.title.trim() || 'Bez nazwy',
        anilistId: Number.isFinite(item.anilistId) ? item.anilistId : null,
        preferredModelId: item.preferredModelId || DEFAULT_TRANSLATION_MODEL_ID,
        sourceLang: item.sourceLang || 'en',
        targetLang: item.targetLang || 'pl',
        lastUpdated: item.lastUpdated || new Date().toISOString(),
      }))
    return normalized.length > 0 ? normalized : fallback
  } catch {
    return fallback
  }
}

function saveSeriesProjectsCatalog(catalog: SeriesProjectMeta[]): void {
  localStorage.setItem(SERIES_PROJECTS_STORAGE_KEY, JSON.stringify(catalog))
}

function saveActiveDiskProject(project: ActiveDiskProject | null): void {
  if (!project) {
    localStorage.removeItem(ACTIVE_DISK_PROJECT_STORAGE_KEY)
    return
  }
  localStorage.setItem(ACTIVE_DISK_PROJECT_STORAGE_KEY, JSON.stringify(project))
}

interface DialogRow {
  id: number
  pl: string
  start: string
  end: string
  style: string
  character: string
  // source: czysty tekst (bez tagow ASS, \N -> \n) — do wyswietlania i dopasowan pamieci
  source: string
  // sourceRaw: oryginalny tekst z pliku z tagami i \N — wejscie do translateSubtitleLinePreservingTags
  sourceRaw: string
  target: string
  requiresManualCheck?: boolean
}

interface TranslationRequestContext {
  characterName: string
  gender: CharacterGender
  effectiveStyle: TranslationStyleId
  effectiveStyleSource: 'character' | 'global'
  archetype: CharacterArchetypeId
  archetypeLabel: string
  archetypeToneRule: string
  characterTypeId: string
  characterTypeLabel: string
  characterSubtypeId: string
  characterSubtypeLabel: string
  characterSubtypePrompt: string
  characterUserNotes: string
  speakingTraits: string
  characterNote: string
  styleContext: string
  previousLineContinuation: string
}

type TranslatorFn = (
  text: string,
  source: string,
  target: string,
  signal: AbortSignal,
  context: TranslationRequestContext,
) => Promise<string>

interface TranslationAttemptResult {
  translated: string
  requiresManualCheck: boolean
}

const DEFAULT_TRANSLATION_BATCH_SIZE = 20
const DEFAULT_DELAY_BETWEEN_BATCHES_MS = 1800

const BASE_PROJECT_CHARACTERS: Omit<CharacterStyleAssignment, 'style' | 'profile'>[] = [
  { id: 1, name: 'Haruto', gender: 'Male', avatarColor: '#4f8ad6' },
  { id: 2, name: 'Yuki', gender: 'Female', avatarColor: '#d781b9' },
  { id: 3, name: 'Sensei', gender: 'Male', avatarColor: '#87a64c' },
  { id: 4, name: 'Liz Smart', gender: 'Female', avatarColor: '#e0897e' },
  { id: 5, name: 'Ark Rodin', gender: 'Male', avatarColor: '#8bb8de' },
  { id: 6, name: 'Killiam', gender: 'Unknown', avatarColor: '#9f8a69' },
  { id: 7, name: 'Kechachakka Munk', gender: 'Unknown', avatarColor: '#b07d7d' },
  { id: 8, name: 'Gark Welter', gender: 'Male', avatarColor: '#5f90bf' },
  { id: 9, name: 'Mary Auden', gender: 'Female', avatarColor: '#c7b270' },
  { id: 10, name: 'Rodrick Atolm', gender: 'Male', avatarColor: '#7f95c2' },
  { id: 11, name: 'Sitri Smart', gender: 'Female', avatarColor: '#d29cbf' },
  { id: 12, name: 'Kaina Nosu', gender: 'Female', avatarColor: '#cc7a8f' },
]

type MemoryTab = 'browse' | 'glossary' | 'projects'

interface MemoryEntry {
  id: number
  source: string
  target: string
  character: string
  projectId: string
  createdAt: string
  usageCount: number
  note?: string
}

interface SuggestionViewModel {
  id: number
  source: string
  target: string
  character: string
  projectId: string
  usageCount: number
  score: number
  quality: 'exact' | 'high' | 'medium' | 'low'
  qualityLabel: string
}

interface GlossaryEntry {
  id: number
  source: string
  preferred: string
  alternatives: string
  note: string
  projectId: string
  active: boolean
}

interface MemoryProjectMeta {
  id: string
  name: string
  lastUpdated: string
}

interface MemoryStore {
  projects: MemoryProjectMeta[]
  entries: MemoryEntry[]
  glossary: GlossaryEntry[]
}

type CorrectionEngineMode = 'local' | 'ai'

interface CorrectionCandidate {
  lineId: number
  actor: string
  gender: CharacterGender
  before: string
  after: string
}

interface ActorCorrectionStats {
  actor: string
  gender: CharacterGender
  lineCount: number
  toCorrect: number
}

const INITIAL_MEMORY: MemoryStore = {
  projects: [
    { id: 'AnimeGate_EP01', name: 'Nagieki no Bourei wa Intai shitai', lastUpdated: '2026-03-09' },
    { id: 'AnimeGate_EP02', name: 'Nagieki no Bourei wa Intai shitai EP02', lastUpdated: '2026-03-02' },
    { id: 'Global', name: 'Global (fallback)', lastUpdated: '2026-02-27' },
  ],
  entries: [
    { id: 1, source: 'ちょっと待って！どこへ行くの？', target: 'Poczekaj chwilę! Dokąd idziesz?', character: 'Haruto', projectId: 'AnimeGate_EP01', createdAt: '2026-03-09', usageCount: 7 },
    { id: 2, source: 'これは夢じゃないよ。本当のことだ。', target: 'To nie jest sen. To prawda.', character: 'Yuki', projectId: 'AnimeGate_EP01', createdAt: '2026-03-08', usageCount: 4 },
    { id: 3, source: '一緒に行こう！', target: 'Chodźmy razem!', character: 'Haruto', projectId: 'AnimeGate_EP01', createdAt: '2026-03-08', usageCount: 3 },
    { id: 4, source: 'Master.', target: 'Mistrz.', character: 'Tino', projectId: 'AnimeGate_EP02', createdAt: '2026-03-02', usageCount: 2 },
  ],
  glossary: [
    { id: 1, source: 'merchant', preferred: 'kupiec', alternatives: 'sprzedawca|handlarz', note: 'używaj kupiec w świecie fantasy', projectId: 'AnimeGate_EP01', active: true },
    { id: 2, source: 'knight', preferred: 'rycerz', alternatives: '', note: '', projectId: 'AnimeGate_EP01', active: true },
    { id: 3, source: 'master', preferred: 'mistrz', alternatives: 'pan', note: 'zależnie od relacji postaci', projectId: 'AnimeGate_EP02', active: true },
  ],
}

const MALE_TO_FEMALE: Array<[RegExp, string]> = [
  [/\bzrobiłem\b/gi, 'zrobiłam'],
  [/\bposzedłem\b/gi, 'poszłam'],
  [/\bbyłem\b/gi, 'byłam'],
  [/\bwidziałem\b/gi, 'widziałam'],
  [/\bmiałem\b/gi, 'miałam'],
  [/\bchciałem\b/gi, 'chciałam'],
  [/\bmogłem\b/gi, 'mogłam'],
  [/\bpowinienem\b/gi, 'powinnam'],
  [/\bmusiałem\b/gi, 'musiałam'],
  [/\bczułem\b/gi, 'czułam'],
  [/\bpowiedziałem\b/gi, 'powiedziałam'],
  [/\bmyślałem\b/gi, 'myślałam'],
  [/\bsłyszałem\b/gi, 'słyszałam'],
]

const FEMALE_TO_MALE: Array<[RegExp, string]> = [
  [/\bzrobiłam\b/gi, 'zrobiłem'],
  [/\bposzłam\b/gi, 'poszedłem'],
  [/\bbyłam\b/gi, 'byłem'],
  [/\bwidziałam\b/gi, 'widziałem'],
  [/\bmiałam\b/gi, 'miałem'],
  [/\bchciałam\b/gi, 'chciałem'],
  [/\bmogłam\b/gi, 'mogłem'],
  [/\bpowinnam\b/gi, 'powinienem'],
  [/\bmusiałam\b/gi, 'musiałem'],
  [/\bczułam\b/gi, 'czułem'],
  [/\bpowiedziałam\b/gi, 'powiedziałem'],
  [/\bmyślałam\b/gi, 'myślałem'],
  [/\bsłyszałam\b/gi, 'słyszałem'],
]

function preserveCaseLike(source: string, replacement: string): string {
  if (!source) return replacement
  if (source[0] === source[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1)
  }
  return replacement
}

function applyWordReplacements(text: string, replacements: Array<[RegExp, string]>): string {
  let next = text
  replacements.forEach(([pattern, replacement]) => {
    next = next.replace(pattern, match => preserveCaseLike(match, replacement))
  })
  return next
}

function normalizePolishForStyleMatch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function applyWholeLineStyleRewrite(text: string, rewrites: Array<[RegExp, string]>): string {
  const normalized = normalizePolishForStyleMatch(text)
  for (const [pattern, replacement] of rewrites) {
    if (pattern.test(normalized)) return replacement
  }
  return text
}

const FORMAL_STYLE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/nie martw(?:\s+si(?:e|ę))/giu, 'proszę się nie martwić'],
  [/powinno by(?:c|ć)\s+dobrze/giu, 'powinno być w porządku'],
  [/przypadkowo/giu, 'nieumyślnie'],
  [/czy mog(?:e|ę)\s+pozna(?:c|ć)\s+p(?:a|ą)nskie\s+imi(?:e|ę)/giu, 'czy mogę poznać Pańskie imię'],
  [/\bdzi(?:e|ę)ki\b/gi, 'dziękuję'],
  [/\b(?:ok|okej)\b/gi, 'dobrze'],
  [/\bspoko\b/gi, 'w porządku'],
  [/\bjasne\b/gi, 'oczywiście'],
  [/\bbo\b/gi, 'ponieważ'],
  [/\bwi(?:e|ę)c\b/gi, 'zatem'],
  [/\bhej\b/gi, 'witaj'],
  [/(?<![\p{L}\p{N}])pa(?![\p{L}\p{N}])/giu, 'do widzenia'],
]

const LESS_FORMAL_STYLE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/nie martw(?:\s+si(?:e|ę))/giu, 'spokojnie'],
  [/powinno by(?:c|ć)\s+dobrze/giu, 'będzie okej'],
  [/przypadkowo/giu, 'przez przypadek'],
  [/czy mog(?:e|ę)\s+pozna(?:c|ć)\s+p(?:a|ą)nskie\s+imi(?:e|ę)/giu, 'mogę poznać twoje imię'],
  [/potrzebowaliby(?:s|ś)my/giu, 'trzeba by było'],
  [/\bdzi(?:e|ę)kuj(?:e|ę)\b/gi, 'dzięki'],
  [/\bponiewa(?:z|ż)\b/gi, 'bo'],
  [/\bzatem\b/gi, 'więc'],
  [/\bjednakze\b/gi, 'ale'],
  [/\boczywiscie\b/gi, 'jasne'],
]

const CASUAL_STYLE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/zajmiemy\s+si(?:e|ę)\s+nimi/giu, 'ogarniemy ich'],
  [/nie martw(?:\s+si(?:e|ę))/giu, 'spokojnie'],
  [/powinno by(?:c|ć)\s+dobrze/giu, 'będzie spoko'],
  [/przypadkowo/giu, 'przez przypadek'],
  [/czy mog(?:e|ę)\s+pozna(?:c|ć)\s+p(?:a|ą)nskie\s+imi(?:e|ę)/giu, 'mogę poznać twoje imię'],
  [/potrzebowaliby(?:s|ś)my/giu, 'trzeba by było'],
  [/\bdzi(?:e|ę)kuj(?:e|ę)\b/gi, 'dzięki'],
  [/\bprzepraszam\b/gi, 'sorry'],
  [/\boczywiscie\b/gi, 'jasne'],
  [/\bponiewa(?:z|ż)\b/gi, 'bo'],
  [/\bzatem\b/gi, 'więc'],
  [/\bto nie problem\b/gi, 'spoko'],
  [/\bnie martw sie\b/gi, 'spokojnie'],
  [/\bdo widzenia\b/gi, 'na razie'],
  [/\bw porz(?:a|ą)dku\b/gi, 'ok'],
  [/\brozumiem\b/gi, 'kumam'],
]

const FORMAL_SHORT_LINE_REWRITES: Array<[RegExp, string]> = [
  [/^(?:ok|okej|dobrze)[.!?]*$/, 'Oczywiście.'],
  [/^rozumiem[.!?]*$/, 'Rozumiem.'],
  [/^juz, juz[.!?]*$/, 'Proszę spokojnie.'],
  [/^(?:hej|czesc)[.!?]*$/, 'Witaj.'],
  [/^oh, tino\\. idziesz na zakupy\\?$/, 'Och, Tino. Czy idziesz na zakupy?'],
  [/^dziekuje(?: panu| pani)?[.!?]*$/, 'Dziękuję.'],
  [/^na razie[.!?]*$/, 'Do widzenia.'],
]

const LESS_FORMAL_SHORT_LINE_REWRITES: Array<[RegExp, string]> = [
  [/^(?:ok|okej|dobrze)[.!?]*$/, 'Jasne.'],
  [/^rozumiem[.!?]*$/, 'Jasne.'],
  [/^juz, juz[.!?]*$/, 'Spokojnie.'],
  [/^oh, tino\\. idziesz na zakupy\\?$/, 'Oh, Tino, idziesz na zakupy?'],
  [/^dziekuje(?: panu| pani)?[.!?]*$/, 'Dzięki.'],
  [/^witaj[.!?]*$/, 'Hej.'],
]

const CASUAL_SHORT_LINE_REWRITES: Array<[RegExp, string]> = [
  [/^(?:ok|okej|dobrze)[.!?]*$/, 'Spoko!'],
  [/^rozumiem[.!?]*$/, 'Kumam.'],
  [/^juz, juz[.!?]*$/, 'Spokojnie, spokojnie.'],
  [/^oh, tino\\. idziesz na zakupy\\?$/, 'Ej, Tino, idziesz na zakupy?'],
  [/^dziekuje(?: panu| pani)?[.!?]*$/, 'Dzięki!'],
  [/^do widzenia[.!?]*$/, 'Na razie!'],
  [/^(?:witaj|czesc)[.!?]*$/, 'Hej!'],
]

const ARCHETYPE_WORD_REPLACEMENTS: Record<CharacterArchetypeId, Array<[RegExp, string]>> = {
  default: [],
  tsundere: [
    [/^oh,\s*tino\.\s*idziesz na zakupy\?$/giu, 'No, Tino. Idziesz na zakupy?'],
    [/^mama jest dziś zajęta,\s*więc pomagam\.$/giu, 'Mama jest dziś zajęta, więc pomagam, i tyle.'],
    [/^uważaj,\s*aby nie zostać zbyt późno\.$/giu, 'Uważaj, żeby nie wrócić za późno.'],
    [/^takich,\s*którzy nie wahają się popełniać przestępstw\.$/giu, 'Takich, co bez wahania popełniają przestępstwa.'],
    [/^po zakończeniu zakupów,\s*upewnij się,\s*że przychodzisz prosto\s*[-—]?$/giu, 'Po zakupach wróć prosto, dobra?'],
    [/^\s*dziękuję,\s*/giu, 'Tch... dzięki, '],
    [/\bdzieki\b/giu, 'dobra, dzięki'],
    [/dziękuję/giu, 'dzięki'],
    [/nie martw(?:\s+si(?:e|ę))/giu, 'spokojnie, poradzę sobie'],
    [/rozumiem,\s*ale/giu, 'wiem, ale...'],
    [/\baby\b/giu, 'żeby'],
    [/(?<![\p{L}\p{N}])spoko(?![\p{L}\p{N}])/giu, 'no jasne'],
    [/(?<![\p{L}\p{N}])ok(?![\p{L}\p{N}])/giu, 'dobra'],
  ],
  formal_knight: [
    [/^oh,\s*tino\.\s*idziesz na zakupy\?$/giu, 'Och, Tino. Czy wybierasz się na zakupy?'],
    [/^mama jest dziś zajęta,\s*więc pomagam\.$/giu, 'Matka jest dziś zajęta, zatem służę pomocą.'],
    [/^uważaj,\s*aby nie zostać zbyt późno\.$/giu, 'Proszę uważać, aby nie wrócić zbyt późno.'],
    [/^takich,\s*którzy nie wahają się popełniać przestępstw\.$/giu, 'Takich, którzy bez wahania popełniają czyny przestępcze.'],
    [/^po zakończeniu zakupów,\s*upewnij się,\s*że przychodzisz prosto\s*[-—]?$/giu, 'Po zakończeniu zakupów proszę wrócić bez zbędnej zwłoki.'],
    [/^\s*dziękuję,\s*/giu, 'Dziękuję uprzejmie, '],
    [/nie martw(?:\s+si(?:e|ę))/giu, 'proszę się nie obawiać'],
    [/ogarniemy ich/giu, 'zajmiemy się nimi'],
    [/ogarniemy/giu, 'zajmiemy się tym'],
    [/(?<![\p{L}\p{N}])spoko(?![\p{L}\p{N}])/giu, 'w porządku'],
    [/(?<![\p{L}\p{N}])ale(?![\p{L}\p{N}])/giu, 'jednak'],
    [/zrobię/giu, 'wykonam'],
    [/teraz/giu, 'niezwłocznie'],
    [/(?<![\p{L}\p{N}])ok(?![\p{L}\p{N}])/giu, 'dobrze'],
  ],
  child: [
    [/^oh,\s*tino\.\s*idziesz na zakupy\?$/giu, 'Hej, Tino, idziesz na zakupy?'],
    [/^mama jest dziś zajęta,\s*więc pomagam\.$/giu, 'Mama jest dziś zajęta, więc jej pomagam.'],
    [/^uważaj,\s*aby nie zostać zbyt późno\.$/giu, 'Uważaj, żeby nie wracać za późno.'],
    [/^takich,\s*którzy nie wahają się popełniać przestępstw\.$/giu, 'Takich, co robią złe rzeczy bez zastanowienia.'],
    [/^po zakończeniu zakupów,\s*upewnij się,\s*że przychodzisz prosto\s*[-—]?$/giu, 'Po zakupach wróć od razu, dobrze?'],
    [/nie martw(?:\s+si(?:e|ę))/giu, 'nie bój się'],
    [/przez przypadek/giu, 'niechcący'],
    [/nieumyślnie/giu, 'niechcący'],
    [/rozumiem,\s*ale/giu, 'aha, ale'],
    [/^\s*dziękuję,\s*/giu, 'Dzięki, '],
    [/\baby\b/giu, 'żeby'],
    [/którzy/giu, 'co'],
    [/(?<![\p{L}\p{N}])spoko(?![\p{L}\p{N}])/giu, 'dobra'],
    [/w porządku/giu, 'okej'],
  ],
  elderly_man: [
    [/^oh,\s*tino\.\s*idziesz na zakupy\?$/giu, 'Och, Tino, wybierasz się na zakupy?'],
    [/^mama jest dziś zajęta,\s*więc pomagam\.$/giu, 'Mama jest dziś zajęta, więc trzeba jej pomóc.'],
    [/^uważaj,\s*aby nie zostać zbyt późno\.$/giu, 'Uważaj, żeby nie wracać zbyt późno.'],
    [/^takich,\s*którzy nie wahają się popełniać przestępstw\.$/giu, 'Takich, którzy bez wahania dopuszczają się przestępstw.'],
    [/^po zakończeniu zakupów,\s*upewnij się,\s*że przychodzisz prosto\s*[-—]?$/giu, 'Po zakupach wróć prosto do domu, dobrze?'],
    [/^\s*dziękuję,\s*/giu, 'Dziękuję ci, '],
    [/(?<![\p{L}\p{N}])spoko(?![\p{L}\p{N}])/giu, 'spokojnie'],
    [/(?<![\p{L}\p{N}])ok(?![\p{L}\p{N}])/giu, 'dobrze'],
    [/ogarniemy ich/giu, 'zajmiemy się nimi'],
    [/nie martw(?:\s+si(?:e|ę))/giu, 'spokojnie, wszystko się ułoży'],
    [/\baby\b/giu, 'żeby'],
    [/teraz/giu, 'od razu'],
  ],
  calm_girl: [
    [/\bsorry\b/giu, 'przepraszam'],
    [/\bok\b/giu, 'w porządku'],
    [/\bkumam\b/giu, 'rozumiem'],
  ],
  energetic_girl: [
    [/\brozumiem\b/giu, 'jasne, rozumiem'],
    [/\bdziękuję\b/giu, 'super, dzięki'],
    [/\bw porządku\b/giu, 'świetnie'],
  ],
  cold_professional: [
    [/\bproszę się nie martwić\b/giu, 'bez obaw'],
    [/\bspokojnie\b/giu, 'to pod kontrolą'],
    [/\boch,\s*/giu, ''],
  ],
  arrogant_noble: [
    [/\bspoko\b/giu, 'to oczywiste'],
    [/\bnie martw(?:\s+si(?:e|ę))\b/giu, 'nie kłopocz się'],
    [/\bprzez przypadek\b/giu, 'mimowolnie'],
  ],
  shy: [
    [/\brobimy\b/giu, 'spróbujemy'],
    [/\bzajmiemy się\b/giu, 'postaramy się zająć'],
    [/\bnie martw(?:\s+si(?:e|ę))\b/giu, 'proszę, nie martw się'],
  ],
  comic_slacker: [
    [/\bprzepraszam\b/giu, 'sorry'],
    [/\bnie martw(?:\s+si(?:e|ę))\b/giu, 'luz, będzie dobrze'],
    [/\bzajmiemy się nimi\b/giu, 'ogarniemy temat'],
  ],
}

const ARCHETYPE_SHORT_LINE_REWRITES: Record<CharacterArchetypeId, Array<[RegExp, string]>> = {
  default: [],
  tsundere: [
    [/^dziekuje[.!?]*$/giu, 'Tch... dzięki.'],
    [/^rozumiem[.!?]*$/giu, 'Wiem.'],
  ],
  formal_knight: [
    [/^dzieki[.!?]*$/giu, 'Dziękuję uprzejmie.'],
    [/^spoko[.!?]*$/giu, 'W porządku.'],
    [/^ok,\s*jesli trzeba,\s*zrobie to teraz[.!?]*$/giu, 'Dobrze. Jeśli zajdzie potrzeba, wykonam to niezwłocznie.'],
  ],
  child: [
    [/^dziekuje[.!?]*$/giu, 'Dzięki!'],
    [/^rozumiem[.!?]*$/giu, 'Aha!'],
    [/^ok,\s*jesli trzeba,\s*zrobie to teraz[.!?]*$/giu, 'Dobra, jak trzeba, zrobię to teraz!'],
  ],
  elderly_man: [
    [/^spoko[.!?]*$/giu, 'Spokojnie.'],
    [/^ok[.!?]*$/giu, 'Dobrze.'],
    [/^ok,\s*jesli trzeba,\s*zrobie to teraz[.!?]*$/giu, 'Dobrze, jeśli trzeba, zrobię to od razu.'],
  ],
  calm_girl: [
    [/^ok[.!?]*$/giu, 'W porządku.'],
    [/^kumam[.!?]*$/giu, 'Rozumiem.'],
  ],
  energetic_girl: [
    [/^ok[.!?]*$/giu, 'Jasne!'],
    [/^rozumiem[.!?]*$/giu, 'Dobra, ogarniam!'],
  ],
  cold_professional: [
    [/^dziękuję[.!?]*$/giu, 'Przyjąłem.'],
    [/^rozumiem[.!?]*$/giu, 'Przyjąłem do wiadomości.'],
  ],
  arrogant_noble: [
    [/^ok[.!?]*$/giu, 'Naturalnie.'],
    [/^dziękuję[.!?]*$/giu, 'Jak należy.'],
  ],
  shy: [
    [/^ok[.!?]*$/giu, 'Dobrze...'],
    [/^rozumiem[.!?]*$/giu, 'Chyba rozumiem...'],
  ],
  comic_slacker: [
    [/^ok[.!?]*$/giu, 'No jasne!'],
    [/^rozumiem[.!?]*$/giu, 'No kumam, kumam.'],
  ],
}

function applyArchetypeLocally(text: string, context: TranslationRequestContext): string {
  const shortRewrites = ARCHETYPE_SHORT_LINE_REWRITES[context.archetype] ?? []
  const wordReplacements = ARCHETYPE_WORD_REPLACEMENTS[context.archetype] ?? []
  const withShort = applyWholeLineStyleRewrite(text, shortRewrites)
  let next = applyWordReplacements(withShort, wordReplacements)

  const traits = normalizePolishForStyleMatch(context.speakingTraits)
  if (traits.includes('zadzior') && !/!/u.test(next)) next = `${next}!`
  if (traits.includes('spokoj') && /!/u.test(next)) next = next.replace(/!+/gu, '.')
  if (traits.includes('nieśmia') || traits.includes('niesmia')) {
    if (!/[.?!]$/u.test(next)) next = `${next}...`
    else next = next.replace(/[.?!]+$/u, '...')
  }

  return next
}

function applyTranslationStyleLocally(
  text: string,
  targetLang: string,
  context: TranslationRequestContext,
): string {
  if (!text.trim()) return text
  if (targetLang.toLowerCase() !== 'pl') return text

  let styled = text
  if (context.effectiveStyle === 'formal') {
    const rewritten = applyWholeLineStyleRewrite(styled, FORMAL_SHORT_LINE_REWRITES)
    styled = applyWordReplacements(rewritten, FORMAL_STYLE_REPLACEMENTS)
  } else if (context.effectiveStyle === 'less_formal') {
    const rewritten = applyWholeLineStyleRewrite(styled, LESS_FORMAL_SHORT_LINE_REWRITES)
    styled = applyWordReplacements(rewritten, LESS_FORMAL_STYLE_REPLACEMENTS)
  } else if (context.effectiveStyle === 'casual') {
    const rewritten = applyWholeLineStyleRewrite(styled, CASUAL_SHORT_LINE_REWRITES)
    styled = applyWordReplacements(rewritten, CASUAL_STYLE_REPLACEMENTS)
  }

  return applyArchetypeLocally(styled, context)
}

function applyGenderCorrectionLocally(text: string, gender: CharacterGender): string {
  if (!text.trim()) return text
  if (gender === 'Unknown') return text

  const quoteRegex = /("[^"]*"|'[^']*')/g
  const chunks = text.split(quoteRegex)
  const rules = gender === 'Female' ? MALE_TO_FEMALE : FEMALE_TO_MALE

  return chunks
    .map((chunk, index) => {
      if (index % 2 === 1) return chunk
      let next = chunk
      rules.forEach(([pattern, replacement]) => {
        next = next.replace(pattern, match => preserveCaseLike(match, replacement))
      })
      return next
    })
    .join('')
}

const BASE_BTN: React.CSSProperties = {
  background: C.bg3,
  border: `1px solid ${C.border}`,
  borderRadius: 3,
  color: C.text,
  cursor: 'pointer',
  padding: '0 9px',
  fontSize: 12,
  height: 22,
  lineHeight: '22px',
}

const BASE_SEL: React.CSSProperties = {
  background: '#232532',
  border: `1px solid ${C.border}`,
  color: C.text,
  height: 22,
  fontSize: 11,
  padding: '0 4px',
  outline: 'none',
}

function GenderBadge({ gender }: { gender: CharacterGender | undefined }): React.ReactElement {
  const icon = gender === 'Female' ? '♀' : gender === 'Male' ? '♂' : '?'
  const color = gender === 'Female' ? '#f26ca7' : gender === 'Male' ? '#4ea2ff' : C.textDim
  return (
    <span style={{ color, fontWeight: 700, fontSize: 13, display: 'block', textAlign: 'center', lineHeight: 1 }}>
      {icon}
    </span>
  )
}

function Sep(): React.ReactElement {
  return <div style={{ width: 1, height: 16, background: C.border, margin: '0 2px' }} />
}

function genderLabel(gender: CharacterGender): string {
  if (gender === 'Female') return 'Kobieta'
  if (gender === 'Male') return 'Mezczyzna'
  return 'Unknown'
}

function genderColor(gender: CharacterGender): string {
  if (gender === 'Female') return '#f7a4d4'
  if (gender === 'Male') return '#89b4fa'
  return C.textDim
}

function normalizeCharacterName(value: string): string {
  return normalizeCharacterNameByRules(value)
}

function normalizeCharacterAlias(value: string): string {
  return normalizeCharacterAliasByRules(value)
}

function buildImageCacheFromCharacters(
  characters: Array<{ name: string; imageUrl?: string | null }>,
): Record<string, string> {
  const out: Record<string, string> = {}
  characters.forEach(character => {
    const key = normalizeCharacterName(character.name)
    const imageUrl = character.imageUrl?.trim() ?? ''
    if (!key || !imageUrl) return
    out[key] = imageUrl
  })
  return out
}

function resolveGenderForCharacterName(
  characterName: string,
  characters: Array<{ name: string; gender: CharacterGender }>,
): CharacterGender {
  const match = resolveCharacterForLineName(characterName, characters)
  return match?.gender ?? 'Unknown'
}

function resolveCharacterForLineName<T extends { name: string; gender: CharacterGender }>(
  characterName: string,
  characters: T[],
): T | null {
  return resolveCharacterByName(characterName, characters, { preferKnownGender: true })
    ?? resolveCharacterByName(characterName, characters)
}

function numericIdFromName(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return Math.abs(hash) + 100000
}

// Lokalnie wykryte postacie (z pliku ASS) dostaja ujemne ID,
// zeby nigdy nie kolidowac z dodatnimi ID z AniList.
function localIdFromName(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return -(Math.abs(hash) + 1)
}

function normalizedText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function stripAssFormatting(value: string): string {
  return stripAssFormattingForTranslation(value)
}

type SubtitleToken = AssSubtitleToken

function tokenizeSubtitleText(value: string): SubtitleToken[] {
  return tokenizeAssForTranslation(value)
}

function bigrams(value: string): string[] {
  if (value.length < 2) return value ? [value] : []
  const parts: string[] = []
  for (let i = 0; i < value.length - 1; i += 1) parts.push(value.slice(i, i + 2))
  return parts
}

function textSimilarityPercent(a: string, b: string): number {
  const left = normalizedText(a)
  const right = normalizedText(b)
  if (!left || !right) return 0
  if (left === right) return 100
  if (left.includes(right) || right.includes(left)) return 86

  const leftBigrams = bigrams(left)
  const rightBigrams = bigrams(right)
  if (!leftBigrams.length || !rightBigrams.length) return 0

  const rightCount = new Map<string, number>()
  rightBigrams.forEach(token => rightCount.set(token, (rightCount.get(token) ?? 0) + 1))

  let overlap = 0
  leftBigrams.forEach(token => {
    const count = rightCount.get(token) ?? 0
    if (count > 0) {
      overlap += 1
      rightCount.set(token, count - 1)
    }
  })

  const score = (2 * overlap) / (leftBigrams.length + rightBigrams.length)
  return Math.max(0, Math.min(100, Math.round(score * 100)))
}

function qualityFromScore(score: number): SuggestionViewModel['quality'] {
  if (score >= 100) return 'exact'
  if (score >= 80) return 'high'
  if (score >= 60) return 'medium'
  return 'low'
}

function qualityLabel(score: number): string {
  if (score >= 100) return 'Dokladne 100%'
  if (score >= 80) return `Wysokie ${score}%`
  if (score >= 60) return `Srednie ${score}%`
  return `Niskie (${score}%)`
}

function qualityColor(quality: SuggestionViewModel['quality']): string {
  if (quality === 'exact') return C.accentG
  if (quality === 'high') return '#8ad1ff'
  if (quality === 'medium') return C.accentY
  return C.accentR
}

function subtitleTimeToSeconds(value: string): number {
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d+):(\d{2}):(\d{2})([.,](\d{1,3}))?$/)
  if (!match) return 0
  const hours = Number(match[1] ?? '0')
  const minutes = Number(match[2] ?? '0')
  const seconds = Number(match[3] ?? '0')
  const fractionRaw = (match[5] ?? '0').padEnd(3, '0').slice(0, 3)
  const fraction = Number(fractionRaw) / 1000
  return hours * 3600 + minutes * 60 + seconds + fraction
}

function secondsToSubtitleTime(value: number): string {
  const safe = Math.max(0, value)
  const centiseconds = Math.round(safe * 100)
  const hours = Math.floor(centiseconds / 360000)
  const minutes = Math.floor((centiseconds % 360000) / 6000)
  const seconds = Math.floor((centiseconds % 6000) / 100)
  const cs = centiseconds % 100
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function formatClockTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const full = Math.floor(seconds)
  const h = Math.floor(full / 3600)
  const m = Math.floor((full % 3600) / 60)
  const s = full % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function toFileVideoUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const url = new URL('file:///')
  url.pathname = normalized.startsWith('/') ? normalized : `/${normalized}`
  return url.toString()
}

function loadVideoProjectConfig(projectId: string): VideoProjectConfig {
  try {
    const raw = localStorage.getItem(videoConfigKey(projectId))
    if (!raw) {
      return {
        videoPath: null,
        videoCollapsed: true,
        videoHeight: 230,
        autoPlayOnLineClick: false,
        preRollSec: 0.3,
        postRollSec: 0.3,
      }
    }
    const parsed = JSON.parse(raw) as Partial<VideoProjectConfig>
    return {
      videoPath: parsed.videoPath ?? null,
      videoCollapsed: parsed.videoCollapsed ?? true,
      videoHeight: Math.min(460, Math.max(160, parsed.videoHeight ?? 230)),
      autoPlayOnLineClick: parsed.autoPlayOnLineClick ?? false,
      preRollSec: Math.min(5, Math.max(0, parsed.preRollSec ?? 0.3)),
      postRollSec: Math.min(5, Math.max(0, parsed.postRollSec ?? 0.3)),
    }
  } catch {
    return {
      videoPath: null,
      videoCollapsed: true,
      videoHeight: 230,
      autoPlayOnLineClick: false,
      preRollSec: 0.3,
      postRollSec: 0.3,
    }
  }
}

function parseGlossaryText(content: string, projectId: string, startId: number): GlossaryEntry[] {
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith('#'))

  if (!lines.length) return []

  const entries: GlossaryEntry[] = []
  let nextId = startId

  const isCsv = lines[0].toLowerCase().includes('source;preferred')

  if (isCsv) {
    for (let i = 1; i < lines.length; i += 1) {
      const [source, preferred, alternatives = '', note = ''] = lines[i].split(';').map(v => v.trim())
      if (!source || !preferred) continue
      entries.push({ id: nextId++, source, preferred, alternatives, note, projectId, active: true })
    }
    return entries
  }

  lines.forEach(line => {
    const [left, right] = line.split('=').map(v => v.trim())
    if (!left || !right) return
    const [preferred, ...rest] = right.split('|').map(v => v.trim()).filter(Boolean)
    if (!preferred) return
    entries.push({
      id: nextId++,
      source: left,
      preferred,
      alternatives: rest.join('|'),
      note: '',
      projectId,
      active: true,
    })
  })

  return entries
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(href)
}


interface ActionBarProps {
  onOpenFile: () => void
  onSaveFile: () => void
  onOpenApi: () => void
  onOpenCharacters: () => void
  onOpenMemory: () => void
  onOpenGenderCorrection: () => void
  onTranslateAll: () => void
  onTranslateSelected: () => void
  onStopTranslate: () => void
  isTranslating: boolean
  selectedCount: number
  sourceLang: string
  targetLang: string
  onChangeSourceLang: (lang: string) => void
  onChangeTargetLang: (lang: string) => void
  selectedModelId: string
  onChangeModelId: (modelId: string) => void
  modelOptions: Array<{ id: string; label: string }>
}

function ActionBar({
  onOpenFile,
  onSaveFile,
  onTranslateAll,
  onTranslateSelected,
  onStopTranslate,
  isTranslating,
  selectedCount,
  sourceLang,
  targetLang,
  onChangeSourceLang,
  onChangeTargetLang,
  selectedModelId,
  onChangeModelId,
  modelOptions,
}: ActionBarProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 30, background: '#1f2029', borderBottom: `1px solid ${C.border}`, padding: '0 8px', overflowX: 'auto' }}>
      <button style={BASE_BTN} onClick={onOpenFile}>Otworz</button>
      <button style={BASE_BTN} onClick={onSaveFile}>Zapisz</button>
      <Sep />
      <select style={{ ...BASE_SEL, width: 124 }} value="tlmode" onChange={() => undefined}>
        <option value="tlmode">Tryb zapisu: tlmode</option>
      </select>
      <select style={{ ...BASE_SEL, width: 210 }} value={selectedModelId} onChange={e => onChangeModelId(e.currentTarget.value)}>
        {modelOptions.map(option => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
      <span style={{ fontSize: 11, color: C.textDim }}>z:</span>
      <select style={{ ...BASE_SEL, width: 58 }} value={sourceLang} onChange={e => onChangeSourceLang(e.currentTarget.value)}>
        <option value="en">en</option>
        <option value="ja">ja</option>
        <option value="zh">zh</option>
        <option value="ko">ko</option>
        <option value="de">de</option>
        <option value="fr">fr</option>
        <option value="es">es</option>
        <option value="it">it</option>
        <option value="pt">pt</option>
        <option value="ru">ru</option>
        <option value="tr">tr</option>
      </select>
      <span style={{ fontSize: 11, color: C.textDim }}>→</span>
      <select style={{ ...BASE_SEL, width: 58 }} value={targetLang} onChange={e => onChangeTargetLang(e.currentTarget.value)}>
        <option value="pl">pl</option>
        <option value="en">en</option>
        <option value="ja">ja</option>
        <option value="de">de</option>
      </select>
      <Sep />
      <button
        style={{ ...BASE_BTN, background: '#1976c2', borderColor: '#2b8bd8', color: '#fff', fontWeight: 700, opacity: isTranslating ? 0.7 : 1 }}
        onClick={onTranslateAll}
        disabled={isTranslating}
      >
        ▶ Tlumacz wszystko
      </button>
      <button
        style={{ ...BASE_BTN, opacity: isTranslating || selectedCount < 1 ? 0.7 : 1 }}
        onClick={onTranslateSelected}
        disabled={isTranslating || selectedCount < 1}
      >
        Zaznaczone ({selectedCount})
      </button>
      <button
        style={{ ...BASE_BTN, borderColor: isTranslating ? '#e59f2a' : C.border, color: isTranslating ? '#ffd68d' : C.text }}
        onClick={onStopTranslate}
        disabled={!isTranslating}
      >
        Stop
      </button>
    </div>
  )
}

function LeftSidebar({
  onOpenApi,
  onOpenCharacters,
  onOpenMemory,
  onOpenGenderCorrection,
  onLoadVideo,
  videoRef,
  videoSrc,
  videoError,
  videoCurrentTime,
  videoDuration,
  onLoadedMetadata,
  onDurationChange,
  onTimeUpdate,
  onVideoError,
  onToggleVideoExpanded,
  projectOptions,
  currentProjectId,
  onSelectProjectId,
  onOpenProjectStep,
  onLoadProject,
  hasActiveProject,
  assignmentCharacters,
  selectedLineCount,
  activeAssignmentCharacter,
  assignmentSuggestions,
  onAssignCharacter,
  onClearCharacterAssignment,
  activeDiskProjectTitle,
  loadedFileName,
}: {
  onOpenApi: () => void
  onOpenCharacters: () => void
  onOpenMemory: () => void
  onOpenGenderCorrection: () => void
  onLoadVideo: () => void
  videoRef: React.RefObject<HTMLVideoElement>
  videoSrc: string | null
  videoError: string
  videoCurrentTime: number
  videoDuration: number
  onLoadedMetadata: () => void
  onDurationChange: () => void
  onTimeUpdate: () => void
  onVideoError: () => void
  onToggleVideoExpanded: () => void
  projectOptions: SeriesProjectMeta[]
  currentProjectId: string
  onSelectProjectId: (projectId: string) => void
  onOpenProjectStep: () => void
  onLoadProject: () => void
  hasActiveProject: boolean
  assignmentCharacters: CharacterAssignmentGridItem[]
  selectedLineCount: number
  activeAssignmentCharacter: string
  assignmentSuggestions: CharacterAssignmentSuggestion[]
  onAssignCharacter: (characterName: string) => void
  onClearCharacterAssignment: () => void
  activeDiskProjectTitle: string
  loadedFileName: string
}): React.ReactElement {
  return (
    <div style={{ width: 290, minWidth: 290, borderRight: `1px solid ${C.border}`, background: '#1a1b23', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: 8 }}>
        <div style={{ height: 220, border: `1px solid ${C.borderB}`, background: '#090a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
              onLoadedMetadata={onLoadedMetadata}
              onDurationChange={onDurationChange}
              onTimeUpdate={onTimeUpdate}
              onError={onVideoError}
            />
          ) : (
            <div style={{ fontSize: 11, color: C.textDim, textAlign: 'center', padding: 8 }}>
              Brak wideo
            </div>
          )}
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: C.textDim, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <span>{videoSrc ? 'Podglad wideo' : 'Podglad nieaktywny'}</span>
          <span>{formatClockTime(videoCurrentTime)} / {formatClockTime(videoDuration)}</span>
        </div>
        <button
          style={{ ...BASE_BTN, marginTop: 4, width: '100%', height: 24 }}
          onClick={onToggleVideoExpanded}
          disabled={!videoSrc}
          title={videoSrc ? 'Powiekszony podglad z napisami kontekstowymi' : 'Najpierw zaladuj wideo'}
        >
          Powieksz podglad
        </button>
        {videoError && (
          <div style={{ marginTop: 4, fontSize: 10, color: C.accentR, maxHeight: 36, overflow: 'auto' }}>{videoError}</div>
        )}
      </div>

      <CharacterAssignmentGrid
        projectLoaded={hasActiveProject}
        characters={assignmentCharacters}
        selectedLineCount={selectedLineCount}
        activeCharacterName={activeAssignmentCharacter}
        suggestions={assignmentSuggestions}
        onAssignCharacter={onAssignCharacter}
        onClearAssignment={onClearCharacterAssignment}
      />

      <div style={{ borderBottom: `1px solid ${C.border}`, padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <button style={BASE_BTN} onClick={onOpenApi}>API</button>
        <button style={BASE_BTN} onClick={onOpenCharacters}>Postacie</button>
        <button style={BASE_BTN} onClick={onOpenMemory}>Pamiec</button>
        <button style={BASE_BTN} onClick={onOpenGenderCorrection}>Koryguj plec</button>
        <button style={{ ...BASE_BTN, gridColumn: '1 / -1', background: '#2d4b7d', borderColor: '#3f7ed2' }} onClick={onLoadVideo}>Dodaj wideo</button>
      </div>

      <div style={{ borderBottom: `1px solid ${C.border}`, padding: 8, display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 11, color: C.textDim }}>Projekt</div>
        <select
          style={{ ...BASE_SEL, width: '100%' }}
          value={currentProjectId}
          onChange={e => onSelectProjectId(e.currentTarget.value)}
        >
          {projectOptions.map(project => (
            <option key={project.id} value={project.id}>{project.title}</option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: C.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          TM: <span style={{ color: C.accentY }}>{activeDiskProjectTitle}</span>
        </div>
        <div style={{ fontSize: 11, color: C.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Plik: {loadedFileName}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button style={{ ...BASE_BTN, borderColor: '#2b8bd8', color: C.accent }} onClick={onOpenProjectStep}>Krok 0</button>
          <button style={BASE_BTN} onClick={onLoadProject}>Wczytaj</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, borderTop: `1px solid ${C.borderB}`, background: '#171922' }} />
    </div>
  )
}

function ProjectBar({
  loadedFileName,
  loadedVideoName,
  onLoadVideo,
  projectOptions,
  currentProjectId,
  onSelectProjectId,
  onCreateProject,
  onLoadProject,
  onOpenProjectStep,
  activeDiskProjectTitle,
}: {
  loadedFileName: string
  loadedVideoName: string
  onLoadVideo: () => void
  projectOptions: SeriesProjectMeta[]
  currentProjectId: string
  onSelectProjectId: (projectId: string) => void
  onCreateProject: () => void
  onLoadProject: () => void
  onOpenProjectStep: () => void
  activeDiskProjectTitle: string
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 28, background: '#1a1b23', borderBottom: `1px solid ${C.border}`, padding: '0 8px' }}>
      <span style={{ fontSize: 11, color: C.textDim }}>Projekt TM:</span>
      <select
        style={{ ...BASE_SEL, width: 280 }}
        value={currentProjectId}
        onChange={e => onSelectProjectId(e.currentTarget.value)}
      >
        {projectOptions.map(project => (
          <option key={project.id} value={project.id}>{project.title}</option>
        ))}
      </select>
      <button style={BASE_BTN} onClick={onCreateProject}>+ Nowy projekt</button>
      <button style={BASE_BTN} onClick={onLoadProject}>Wczytaj projekt</button>
      <button style={{ ...BASE_BTN, borderColor: '#2b8bd8', color: C.accent }} onClick={onOpenProjectStep}>Krok 0: Projekt</button>
      <button style={{ ...BASE_BTN, opacity: 0.4, cursor: 'not-allowed' }} disabled title="Funkcja w przygotowaniu">Importuj .ass do TM</button>
      <button style={BASE_BTN} onClick={onLoadVideo}>Zaladuj wideo</button>
      <button style={{ ...BASE_BTN, opacity: 0.4, cursor: 'not-allowed' }} disabled title="Funkcja w przygotowaniu">Analizuj styl</button>
      <span style={{ marginLeft: 10, fontSize: 11, color: C.accentY }}>Aktywny projekt dyskowy: {activeDiskProjectTitle}</span>
      <span style={{ marginLeft: 10, fontSize: 11, color: C.textDim }}>Plik: {loadedFileName}</span>
      <span style={{ marginLeft: 8, fontSize: 11, color: C.textDim }}>Wideo: {loadedVideoName}</span>
    </div>
  )
}

function ProjectStepZeroModal({
  open,
  newTitle,
  newBaseDir,
  openDir,
  statusMessage,
  onChangeNewTitle,
  onPickNewBaseDir,
  onCreate,
  onPickOpenDir,
  onOpenExisting,
  onClose,
}: {
  open: boolean
  newTitle: string
  newBaseDir: string
  openDir: string
  statusMessage: string
  onChangeNewTitle: (value: string) => void
  onPickNewBaseDir: () => void
  onCreate: () => void
  onPickOpenDir: () => void
  onOpenExisting: () => void
  onClose: () => void
}): React.ReactElement | null {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,10,15,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <div style={{ width: 1120, maxWidth: '96vw', background: '#171a26', border: `1px solid ${C.border}`, boxShadow: '0 14px 50px rgba(0,0,0,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ color: C.accent, fontWeight: 700 }}>Krok 0: Projekt</div>
          <button style={BASE_BTN} onClick={onClose}>Zamknij</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12, padding: 12 }}>
          <div style={{ border: `1px solid ${C.border}`, padding: 12, background: '#1e2131', minHeight: 274, display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: C.accentY, fontWeight: 700, marginBottom: 8 }}>Nowy projekt</div>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 6 }}>Tytul projektu:</div>
            <input
              value={newTitle}
              onChange={e => onChangeNewTitle(e.currentTarget.value)}
              placeholder="np. Nageki no Bourei"
              style={{ width: '100%', height: 30, padding: '0 8px', background: '#22253a', border: `1px solid ${C.border}`, color: C.text }}
            />
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 8, marginBottom: 6 }}>Folder bazowy:</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={BASE_BTN} onClick={onPickNewBaseDir}>Wybierz folder</button>
              <div style={{ flex: 1, fontSize: 11, color: C.textDim, alignSelf: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {newBaseDir || 'Nie wybrano folderu'}
              </div>
            </div>
            <div style={{ marginTop: 'auto', paddingTop: 12 }}>
              <button style={{ ...BASE_BTN, background: '#1f6fb0', borderColor: '#2b8bd8', color: '#fff', fontWeight: 700 }} onClick={onCreate}>Utworz i przejdz do Kroku 1</button>
            </div>
          </div>

          <div style={{ border: `1px solid ${C.border}`, padding: 12, background: '#1e2131', minHeight: 274, display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: C.accentY, fontWeight: 700, marginBottom: 8 }}>Otwórz istniejący projekt</div>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 6 }}>Plik projektu (lub folder):</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={BASE_BTN} onClick={onPickOpenDir}>Wybierz projekt</button>
              <div style={{ flex: 1, fontSize: 11, color: C.textDim, alignSelf: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {openDir || 'Nie wybrano projektu'}
              </div>
            </div>
            <div style={{ marginTop: 'auto', paddingTop: 12 }}>
              <button style={{ ...BASE_BTN, background: '#1f6fb0', borderColor: '#2b8bd8', color: '#fff', fontWeight: 700 }} onClick={onOpenExisting}>Wczytaj istniejacy projekt</button>
            </div>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '7px 12px', fontSize: 11, color: C.textDim, background: '#131623' }}>
          {statusMessage || 'Krok 0 jest wymagany przed pełnym użyciem Kroków 1-3.'}
        </div>
      </div>
    </div>
  )
}

function updaterColorForPhase(phase: UpdaterStatus['phase']): string {
  if (phase === 'error') return C.accentR
  if (phase === 'update-available' || phase === 'download-progress' || phase === 'download-started') return C.accentY
  if (phase === 'update-downloaded') return C.accentG
  return C.textDim
}

function UpdateStatusBar({
  status,
  isSupported,
  onCheck,
  onDownload,
  onInstall,
}: {
  status: UpdaterStatus
  isSupported: boolean
  onCheck: () => void
  onDownload: () => void
  onInstall: () => void
}): React.ReactElement {
  const canCheck = isSupported && status.phase !== 'checking-for-update' && status.phase !== 'download-progress' && status.phase !== 'installing'
  const canDownload = isSupported && status.phase === 'update-available'
  const canInstall = isSupported && status.phase === 'update-downloaded'
  const statusText = status.phase === 'download-progress' && typeof status.percent === 'number'
    ? `${status.message} (${status.percent.toFixed(1)}%)`
    : status.message

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, padding: '4px 8px', fontSize: 11, color: C.textDim, background: '#171920', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: updaterColorForPhase(status.phase), minWidth: 430, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        Aktualizacje: {statusText}
      </span>
      <button style={{ ...BASE_BTN, opacity: canCheck ? 1 : 0.5 }} disabled={!canCheck} onClick={onCheck}>Sprawdz</button>
      <button style={{ ...BASE_BTN, opacity: canDownload ? 1 : 0.5 }} disabled={!canDownload} onClick={onDownload}>Pobierz</button>
      <button style={{ ...BASE_BTN, opacity: canInstall ? 1 : 0.5 }} disabled={!canInstall} onClick={onInstall}>Instaluj</button>
    </div>
  )
}

function EditorPanel({
  row,
  onChangeTarget,
}: {
  row: DialogRow | undefined
  onChangeTarget: (lineId: number, target: string) => void
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 126, borderTop: `1px solid ${C.border}` }}>
      <div style={{ height: 20, display: 'flex', alignItems: 'center', padding: '0 8px', background: '#1d1f2a', borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.accent, fontWeight: 700 }}>
        Edycja linii
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 8, flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>Oryginal (tylko do odczytu):</div>
          <textarea readOnly value={row?.source ?? ''} style={{ flex: 1, background: '#23252f', border: `1px solid ${C.border}`, color: C.text, padding: 8, resize: 'none' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>Tlumaczenie (edytuj tutaj):</div>
          <textarea
            value={row?.target ?? ''}
            onChange={e => { if (row) onChangeTarget(row.id, e.currentTarget.value) }}
            style={{ flex: 1, background: '#30323a', border: `1px solid #1f99d9`, color: C.text, padding: 8, resize: 'none' }}
          />
        </div>
      </div>

    </div>
  )
}

interface SuggestionsPanelProps {
  row: DialogRow | undefined
  suggestions: SuggestionViewModel[]
  selectedSuggestionIndex: number
  onSelectSuggestionIndex: (index: number) => void
  onApplySelectedSuggestion: () => void
  onSkip: () => void
  projectNameById: Map<string, string>
}

function SuggestionsPanel({
  row,
  suggestions,
  selectedSuggestionIndex,
  onSelectSuggestionIndex,
  onApplySelectedSuggestion,
  onSkip,
  projectNameById,
}: SuggestionsPanelProps): React.ReactElement {
  const listRef = useRef<HTMLDivElement | null>(null)
  const best = suggestions[0]

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!suggestions.length) return
      onSelectSuggestionIndex(Math.min(selectedSuggestionIndex + 1, suggestions.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!suggestions.length) return
      onSelectSuggestionIndex(Math.max(selectedSuggestionIndex - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      onApplySelectedSuggestion()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onSkip()
    }
  }

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, background: '#15161d', display: 'flex', flexDirection: 'column', minHeight: 140 }}>
      <div style={{ height: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', borderBottom: `1px solid ${C.border}`, background: '#171822' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.textDim }}>
          <span style={{ color: C.accent }}>📎 Pamiec tlumaczen</span>
          <span>
            Znaleziono {suggestions.length} sugestie/sugestii
            {best ? ` (najlepsza: ${best.qualityLabel} | projekt: ${projectNameById.get(best.projectId) ?? best.projectId}${best.character ? ` | postac: ${best.character}` : ''})` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={BASE_BTN} onClick={onSkip}>Pomin</button>
          <button style={BASE_BTN} onClick={onApplySelectedSuggestion} disabled={!suggestions.length}>Uzyj sugestii</button>
        </div>
      </div>
      <div
        ref={listRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', outline: 'none' }}
      >
        {!suggestions.length && (
          <div style={{ border: `1px solid ${C.border}`, padding: '8px 10px', fontSize: 12, color: C.textDim }}>
            Brak sugestii dla tej linii.
          </div>
        )}
        {suggestions.map((item, index) => {
          const isSelected = index === selectedSuggestionIndex
          return (
            <div
              key={`${item.id}-${index}`}
              onClick={() => {
                onSelectSuggestionIndex(index)
                listRef.current?.focus()
              }}
              onDoubleClick={onApplySelectedSuggestion}
              style={{
                border: `1px solid ${isSelected ? '#1f99d9' : C.border}`,
                background: isSelected ? '#1f2635' : '#1a1c27',
                padding: '6px 8px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <strong style={{ color: C.text }}>#{index + 1}</strong>
                <strong style={{ color: qualityColor(item.quality) }}>{item.qualityLabel}</strong>
                <span style={{ color: C.textDim }}>[{projectNameById.get(item.projectId) ?? item.projectId}]</span>
                <span style={{ color: C.textDim }}>{item.character || '-'}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 13, color: C.text }}>{item.target}</div>
            </div>
          )
        })}
      </div>
      <div style={{ height: 20, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 11, color: C.textDim }}>
        {row ? 'Klik: zaznacz | Dwuklik: uzyj | Strzalki + Enter: uzyj | Esc: pomin' : ''}
      </div>
    </div>
  )
}

interface VideoPanelProps {
  videoRef: React.RefObject<HTMLVideoElement>
  collapsed: boolean
  fileName: string
  src: string | null
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  playbackRate: number
  autoPlayOnLineClick: boolean
  preRollSec: number
  postRollSec: number
  height: number
  onToggleCollapsed: () => void
  onPlayPause: () => void
  onStop: () => void
  onSeekRelative: (delta: number) => void
  onSeekAbsolute: (nextTime: number) => void
  onVolume: (next: number) => void
  onMuted: (next: boolean) => void
  onRate: (next: number) => void
  onAutoPlayOnLineClick: (next: boolean) => void
  onPreRoll: (next: number) => void
  onPostRoll: (next: number) => void
  onHeight: (next: number) => void
  onLoadVideo: () => void
  errorMessage: string
  onLoadedMetadata: () => void
  onDurationChange: () => void
  onTimeUpdate: () => void
  onVideoError: () => void
}

function VideoPanel(props: VideoPanelProps): React.ReactElement {
  const {
    videoRef,
    collapsed,
    fileName,
    src,
    currentTime,
    duration,
    volume,
    muted,
    playbackRate,
    autoPlayOnLineClick,
    preRollSec,
    postRollSec,
    height,
    onToggleCollapsed,
    onPlayPause,
    onStop,
    onSeekRelative,
    onSeekAbsolute,
    onVolume,
    onMuted,
    onRate,
    onAutoPlayOnLineClick,
    onPreRoll,
    onPostRoll,
    onHeight,
    onLoadVideo,
    errorMessage,
    onLoadedMetadata,
    onDurationChange,
    onTimeUpdate,
    onVideoError,
  } = props

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, background: '#11131a' }}>
      <div style={{ height: 26, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', borderBottom: `1px solid ${C.border}`, background: '#171a24' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.textDim }}>
          <strong style={{ color: C.accent }}>Podglad wideo</strong>
          <span>{fileName}</span>
          {!!errorMessage && <span style={{ color: C.accentR }}>{errorMessage}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button style={BASE_BTN} onClick={onLoadVideo}>Dodaj wideo</button>
          <button style={BASE_BTN} onClick={onToggleCollapsed}>{collapsed ? 'Rozwin' : 'Zwin'}</button>
        </div>
      </div>
      {!collapsed && (
        <div style={{ padding: 8, display: 'grid', gridTemplateRows: `${height}px auto`, gap: 8 }}>
          <div style={{ border: `1px solid ${C.border}`, background: '#000', position: 'relative' }}>
            {src ? (
              <video
                ref={videoRef}
                src={src}
                style={{ width: '100%', height: '100%', display: 'block' }}
                onLoadedMetadata={onLoadedMetadata}
                onDurationChange={onDurationChange}
                onTimeUpdate={onTimeUpdate}
                onError={onVideoError}
              />
            ) : (
              <div style={{ color: C.textDim, fontSize: 12, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                Brak zaladowanego wideo
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="range"
              min={0}
              max={Math.max(1, duration)}
              step={0.01}
              value={Math.min(currentTime, Math.max(1, duration))}
              onChange={e => onSeekAbsolute(Number(e.currentTarget.value))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={BASE_BTN} onClick={() => onSeekRelative(-2)}>« 2s</button>
                <button style={BASE_BTN} onClick={onPlayPause}>Play/Pauza</button>
                <button style={BASE_BTN} onClick={onStop}>Stop</button>
                <button style={BASE_BTN} onClick={() => onSeekRelative(2)}>2s »</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textDim }}>
                <span>{formatClockTime(currentTime)} / {formatClockTime(duration)}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Glosnosc
                  <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => onVolume(Number(e.currentTarget.value))} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={muted} onChange={e => onMuted(e.currentTarget.checked)} />
                  Wycisz
                </label>
                <select style={{ ...BASE_SEL, width: 84 }} value={String(playbackRate)} onChange={e => onRate(Number(e.currentTarget.value))}>
                  {[0.5, 1, 1.25, 1.5].map(rate => <option key={rate} value={String(rate)}>{rate.toFixed(2)}x</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: C.textDim, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={autoPlayOnLineClick} onChange={e => onAutoPlayOnLineClick(e.currentTarget.checked)} />
                Auto play po kliknieciu linii
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Przed linia (s)
                <input style={{ ...BASE_SEL, width: 56 }} type="number" min={0} max={5} step={0.1} value={preRollSec} onChange={e => onPreRoll(Number(e.currentTarget.value || 0))} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Po linii (s)
                <input style={{ ...BASE_SEL, width: 56 }} type="number" min={0} max={5} step={0.1} value={postRollSec} onChange={e => onPostRoll(Number(e.currentTarget.value || 0))} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Wysokosc panelu
                <input type="range" min={160} max={460} step={10} value={height} onChange={e => onHeight(Number(e.currentTarget.value))} />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface WaveformPanelProps {
  waveform: WaveformData | null
  loading: boolean
  error: string
  currentTime: number
  selected: WaveformSelection | null
  onSeek: (seconds: number) => void
  onChangeLineTiming: (lineId: number, startSec: number, endSec: number) => void
  onAutoSnapStart: () => void
  onAutoSnapEnd: () => void
  onAutoSnapLine: () => void
  onAutoSnapSelected: () => void
  onAutoSnapAll: () => void
}

function WaveformPanel({
  waveform,
  loading,
  error,
  currentTime,
  selected,
  onSeek,
  onChangeLineTiming,
  onAutoSnapStart,
  onAutoSnapEnd,
  onAutoSnapLine,
  onAutoSnapSelected,
  onAutoSnapAll,
}: WaveformPanelProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [scrollSec, setScrollSec] = useState(0)
  const [dragging, setDragging] = useState<null | 'start' | 'end'>(null)

  const duration = waveform?.duration ?? 0
  const viewDuration = Math.max(1.2, duration / Math.max(1, zoom))
  const maxScroll = Math.max(0, duration - viewDuration)
  const clampedScroll = Math.max(0, Math.min(maxScroll, scrollSec))
  const samplesPerSecond = waveform?.sampleRate ?? 0

  useEffect(() => {
    if (!waveform || !selected) return
    const center = (selected.startSec + selected.endSec) / 2
    const next = Math.max(0, Math.min(maxScroll, center - viewDuration / 2))
    setScrollSec(next)
  }, [selected?.lineId, waveform?.filePath, zoom])

  useEffect(() => {
    setScrollSec(prev => Math.max(0, Math.min(maxScroll, prev)))
  }, [maxScroll])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width <= 0 || height <= 0) return
    canvas.width = Math.floor(width * window.devicePixelRatio)
    canvas.height = Math.floor(height * window.devicePixelRatio)
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    ctx.fillStyle = '#12141d'
    ctx.fillRect(0, 0, width, height)

    if (!waveform || waveform.peaks.length === 0 || samplesPerSecond <= 0 || duration <= 0) {
      ctx.fillStyle = '#6c7086'
      ctx.font = '12px sans-serif'
      ctx.fillText(loading ? 'Generowanie waveformu...' : 'Brak waveformu audio', 10, 20)
      return
    }

    const viewStartSample = Math.max(0, Math.floor(clampedScroll * samplesPerSecond))
    const viewEndSample = Math.min(waveform.peaks.length - 1, Math.ceil((clampedScroll + viewDuration) * samplesPerSecond))
    const samplesInView = Math.max(1, viewEndSample - viewStartSample + 1)
    const samplesPerPx = samplesInView / width
    const midY = height / 2

    ctx.strokeStyle = '#2d6ea7'
    ctx.lineWidth = 1
    for (let x = 0; x < width; x += 1) {
      const start = Math.floor(viewStartSample + x * samplesPerPx)
      const end = Math.min(viewEndSample, Math.floor(start + samplesPerPx))
      let peak = 0
      for (let i = start; i <= end; i += 1) {
        peak = Math.max(peak, waveform.peaks[i] ?? 0)
      }
      const amp = Math.max(1, peak * (height * 0.46))
      ctx.beginPath()
      ctx.moveTo(x + 0.5, midY - amp)
      ctx.lineTo(x + 0.5, midY + amp)
      ctx.stroke()
    }

    if (selected) {
      const xStart = ((selected.startSec - clampedScroll) / viewDuration) * width
      const xEnd = ((selected.endSec - clampedScroll) / viewDuration) * width
      const left = Math.max(0, Math.min(width, xStart))
      const right = Math.max(0, Math.min(width, xEnd))
      if (right > left) {
        ctx.fillStyle = 'rgba(128, 197, 255, 0.18)'
        ctx.fillRect(left, 0, right - left, height)
      }
      ctx.strokeStyle = '#7fc5ff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(left + 0.5, 0)
      ctx.lineTo(left + 0.5, height)
      ctx.moveTo(right + 0.5, 0)
      ctx.lineTo(right + 0.5, height)
      ctx.stroke()
    }

    const currentX = ((currentTime - clampedScroll) / viewDuration) * width
    if (currentX >= 0 && currentX <= width) {
      ctx.strokeStyle = '#f9e2af'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(currentX + 0.5, 0)
      ctx.lineTo(currentX + 0.5, height)
      ctx.stroke()
    }
  }, [waveform, currentTime, selected, loading, clampedScroll, viewDuration, samplesPerSecond, duration])

  const pixelToSec = (clientX: number): number => {
    const canvas = canvasRef.current
    if (!canvas) return 0
    const rect = canvas.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left))
    const ratio = rect.width <= 0 ? 0 : x / rect.width
    return Math.max(0, Math.min(duration, clampedScroll + ratio * viewDuration))
  }

  const onCanvasMouseDown = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!selected || !waveform) {
      onSeek(pixelToSec(event.clientX))
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const startX = ((selected.startSec - clampedScroll) / viewDuration) * rect.width
    const endX = ((selected.endSec - clampedScroll) / viewDuration) * rect.width
    const x = event.clientX - rect.left
    const handleThreshold = 7
    if (Math.abs(x - startX) <= handleThreshold) {
      setDragging('start')
      return
    }
    if (Math.abs(x - endX) <= handleThreshold) {
      setDragging('end')
      return
    }
    onSeek(pixelToSec(event.clientX))
  }

  const onCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!dragging || !selected) return
    const sec = pixelToSec(event.clientX)
    const minGap = 0.08
    if (dragging === 'start') {
      const nextStart = Math.max(0, Math.min(selected.endSec - minGap, sec))
      onChangeLineTiming(selected.lineId, nextStart, selected.endSec)
      return
    }
    const nextEnd = Math.min(duration, Math.max(selected.startSec + minGap, sec))
    onChangeLineTiming(selected.lineId, selected.startSec, nextEnd)
  }

  const onCanvasMouseUp = (): void => {
    setDragging(null)
  }

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, background: '#12151e' }}>
      <div style={{ height: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, color: C.textDim }}>
          Waveform audio {waveform ? `(sr=${waveform.sampleRate}Hz${waveform.fromCache ? ', cache' : ''})` : ''}
          {selected ? ` | Linia ${selected.lineId} | ${secondsToSubtitleTime(selected.startSec)} -> ${secondsToSubtitleTime(selected.endSec)} | dl=${(selected.endSec - selected.startSec).toFixed(2)}s` : ''}
          {error ? ` | ${error}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={BASE_BTN} onClick={() => setZoom(prev => Math.min(32, prev * 1.5))}>Zoom +</button>
          <button style={BASE_BTN} onClick={() => setZoom(prev => Math.max(1, prev / 1.5))}>Zoom -</button>
          <button style={BASE_BTN} onClick={onAutoSnapStart} disabled={!selected}>Snap start</button>
          <button style={BASE_BTN} onClick={onAutoSnapEnd} disabled={!selected}>Snap end</button>
          <button style={BASE_BTN} onClick={onAutoSnapLine} disabled={!selected}>Snap linia</button>
          <button style={BASE_BTN} onClick={onAutoSnapSelected}>Snap zaznaczone</button>
          <button style={BASE_BTN} onClick={onAutoSnapAll}>Snap caly plik</button>
        </div>
      </div>
      <div style={{ padding: 8 }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: 120, display: 'block', border: `1px solid ${C.border}`, cursor: dragging ? 'col-resize' : 'crosshair', background: '#12141d' }}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onMouseLeave={onCanvasMouseUp}
        />
        <input
          type="range"
          min={0}
          max={Math.max(0, maxScroll)}
          step={Math.max(0.001, viewDuration / 600)}
          value={clampedScroll}
          onChange={e => setScrollSec(Number(e.currentTarget.value))}
          style={{ width: '100%', marginTop: 6 }}
        />
      </div>
    </div>
  )
}

interface MemoryModalProps {
  open: boolean
  currentProjectId: string
  store: MemoryStore
  onClose: () => void
  onChange: (next: MemoryStore) => void
}

function MemoryModal({ open, currentProjectId, store, onClose, onChange }: MemoryModalProps): React.ReactElement | null {
  const [tab, setTab] = useState<MemoryTab>('browse')
  const [selectedProjectId, setSelectedProjectId] = useState(currentProjectId)
  const [query, setQuery] = useState('')
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null)
  const [selectedGlossaryFile, setSelectedGlossaryFile] = useState<File | null>(null)
  const [glossaryDraft, setGlossaryDraft] = useState({ source: '', preferred: '', alternatives: '', note: '' })

  useEffect(() => {
    if (open) {
      setSelectedProjectId(currentProjectId)
      setTab('browse')
      setQuery('')
      setSelectedEntryId(null)
      setSelectedGlossaryFile(null)
    }
  }, [open, currentProjectId])

  if (!open) return null

  const projectOptions = [{ id: 'all', name: '(wszystkie)' }, ...store.projects]

  const filteredEntries = store.entries
    .filter(entry => selectedProjectId === 'all' || entry.projectId === selectedProjectId)
    .filter(entry => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        entry.source.toLowerCase().includes(q)
        || entry.target.toLowerCase().includes(q)
        || entry.character.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => b.usageCount - a.usageCount)

  const filteredGlossary = store.glossary
    .filter(entry => selectedProjectId === 'all' || entry.projectId === selectedProjectId)
    .filter(entry => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return entry.source.toLowerCase().includes(q) || entry.preferred.toLowerCase().includes(q)
    })

  const projectStats = store.projects.map(project => ({
    ...project,
    memoryCount: store.entries.filter(entry => entry.projectId === project.id).length,
    glossaryCount: store.glossary.filter(entry => entry.projectId === project.id).length,
  }))

  const addGlossaryEntry = (): void => {
    if (!glossaryDraft.source.trim() || !glossaryDraft.preferred.trim() || selectedProjectId === 'all') return
    const nextId = (store.glossary.at(-1)?.id ?? 0) + 1
    onChange({
      ...store,
      glossary: [
        ...store.glossary,
        {
          id: nextId,
          source: glossaryDraft.source.trim(),
          preferred: glossaryDraft.preferred.trim(),
          alternatives: glossaryDraft.alternatives.trim(),
          note: glossaryDraft.note.trim(),
          projectId: selectedProjectId,
          active: true,
        },
      ],
    })
    setGlossaryDraft({ source: '', preferred: '', alternatives: '', note: '' })
  }

  const importGlossaryFile = async (): Promise<void> => {
    if (!selectedGlossaryFile || selectedProjectId === 'all') return
    const content = await selectedGlossaryFile.text()
    const nextId = (store.glossary.at(-1)?.id ?? 0) + 1
    const imported = parseGlossaryText(content, selectedProjectId, nextId)
    if (!imported.length) return
    onChange({ ...store, glossary: [...store.glossary, ...imported] })
    setSelectedGlossaryFile(null)
  }

  const exportProject = (projectId: string): void => {
    const payload = {
      project: store.projects.find(project => project.id === projectId),
      memory: store.entries.filter(entry => entry.projectId === projectId),
      glossary: store.glossary.filter(entry => entry.projectId === projectId),
      exportedAt: new Date().toISOString(),
    }
    downloadTextFile(`${projectId}.memory.json`, JSON.stringify(payload, null, 2))
  }

  const exportBackup = (): void => {
    downloadTextFile('animegate-memory-backup.json', JSON.stringify(store, null, 2))
  }

  const importProjectJson = async (file: File): Promise<void> => {
    const content = await file.text()
    const parsed = JSON.parse(content) as Partial<MemoryStore> & { memory?: MemoryEntry[]; project?: MemoryProjectMeta }
    const incomingEntries = parsed.entries ?? parsed.memory ?? []
    const incomingGlossary = parsed.glossary ?? []
    const incomingProjects = parsed.projects ?? (parsed.project ? [parsed.project as MemoryProjectMeta] : [])

    const mergedProjects = [...store.projects]
    incomingProjects.forEach(project => {
      if (!mergedProjects.some(item => item.id === project.id)) mergedProjects.push(project)
    })
    onChange({
      projects: mergedProjects,
      entries: [...store.entries, ...incomingEntries],
      glossary: [...store.glossary, ...incomingGlossary],
    })
  }

  const cloneProjectMemory = (): void => {
    if (selectedProjectId === 'all') return
    const source = store.projects.find(project => project.id === selectedProjectId)
    if (!source) return
    const newId = window.prompt('Nowe ID projektu (np. AnimeGate_EP03):')
    if (!newId) return
    const newName = window.prompt('Nazwa nowego projektu:', `${source.name} (clone)`) || `${source.name} (clone)`
    if (store.projects.some(project => project.id === newId)) return

    const entryOffset = (store.entries.at(-1)?.id ?? 0) + 1
    const glossaryOffset = (store.glossary.at(-1)?.id ?? 0) + 1
    const clonedEntries = store.entries
      .filter(entry => entry.projectId === source.id)
      .map((entry, index) => ({ ...entry, id: entryOffset + index, projectId: newId, usageCount: 0 }))
    const clonedGlossary = store.glossary
      .filter(entry => entry.projectId === source.id)
      .map((entry, index) => ({ ...entry, id: glossaryOffset + index, projectId: newId }))

    onChange({
      projects: [...store.projects, { id: newId, name: newName, lastUpdated: new Date().toISOString().slice(0, 10) }],
      entries: [...store.entries, ...clonedEntries],
      glossary: [...store.glossary, ...clonedGlossary],
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,12,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002 }}>
      <div style={{ width: 'min(1600px, 98vw)', height: '92vh', background: '#1b1d27', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, height: 34, alignItems: 'flex-end', paddingLeft: 8 }}>
          <button style={{ ...BASE_BTN, height: 28, background: tab === 'browse' ? '#2d4b7d' : C.bg3 }} onClick={() => setTab('browse')}>Przegladaj</button>
          <button style={{ ...BASE_BTN, height: 28, background: tab === 'glossary' ? '#2d4b7d' : C.bg3 }} onClick={() => setTab('glossary')}>Glosariusz</button>
          <button style={{ ...BASE_BTN, height: 28, background: tab === 'projects' ? '#2d4b7d' : C.bg3 }} onClick={() => setTab('projects')}>Projekty i import</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderBottom: `1px solid ${C.border}` }}>
          <span>Szukaj:</span>
          <input value={query} onChange={e => setQuery(e.currentTarget.value)} style={{ width: 230, height: 24, background: '#2b2d35', border: `1px solid ${C.border}`, color: C.text, padding: '0 6px' }} />
          <span>Projekt:</span>
          <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.currentTarget.value)} style={{ ...BASE_SEL, width: 220 }}>
            {projectOptions.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <button style={{ ...BASE_BTN, marginLeft: 'auto' }} onClick={() => setQuery('')}>Odswiez</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 8 }}>
          {tab === 'browse' && (
            <div style={{ border: `1px solid ${C.border}`, background: '#21232d' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1.25fr 140px 210px 70px', padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700 }}>
                <span>Oryginal</span><span>Tlumaczenie</span><span>Postac</span><span>Projekt</span><span>Uzyc</span>
              </div>
              <div style={{ maxHeight: '58vh', overflow: 'auto' }}>
                {filteredEntries.map(entry => (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedEntryId(entry.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.25fr 1.25fr 140px 210px 70px',
                      padding: '4px 8px',
                      borderBottom: `1px solid ${C.borderB}`,
                      background: selectedEntryId === entry.id ? '#2a3552' : 'transparent',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.source}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.target}</span>
                    <span>{entry.character}</span>
                    <span>{store.projects.find(project => project.id === entry.projectId)?.name ?? entry.projectId}</span>
                    <span>{entry.usageCount}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11, color: C.textDim }}>Pokazano: {filteredEntries.length}</span>
                <button
                  style={BASE_BTN}
                  onClick={() => {
                    if (!selectedEntryId) return
                    onChange({ ...store, entries: store.entries.filter(entry => entry.id !== selectedEntryId) })
                    setSelectedEntryId(null)
                  }}
                >
                  Usun zaznaczony
                </button>
              </div>
            </div>
          )}

          {tab === 'glossary' && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="file" accept=".txt,.csv" onChange={e => setSelectedGlossaryFile(e.currentTarget.files?.[0] ?? null)} />
                <button style={BASE_BTN} onClick={() => { void importGlossaryFile() }} disabled={!selectedGlossaryFile || selectedProjectId === 'all'}>Importuj glosariusz</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 6 }}>
                <input placeholder="Fraza zrodlowa" value={glossaryDraft.source} onChange={e => setGlossaryDraft(prev => ({ ...prev, source: e.currentTarget.value }))} style={{ ...BASE_SEL, height: 26 }} />
                <input placeholder="Preferowane tlumaczenie" value={glossaryDraft.preferred} onChange={e => setGlossaryDraft(prev => ({ ...prev, preferred: e.currentTarget.value }))} style={{ ...BASE_SEL, height: 26 }} />
                <input placeholder="Alternatywy (|)" value={glossaryDraft.alternatives} onChange={e => setGlossaryDraft(prev => ({ ...prev, alternatives: e.currentTarget.value }))} style={{ ...BASE_SEL, height: 26 }} />
                <input placeholder="Notatka" value={glossaryDraft.note} onChange={e => setGlossaryDraft(prev => ({ ...prev, note: e.currentTarget.value }))} style={{ ...BASE_SEL, height: 26 }} />
                <button style={BASE_BTN} onClick={addGlossaryEntry} disabled={selectedProjectId === 'all'}>Dodaj</button>
              </div>
              <div style={{ border: `1px solid ${C.border}`, background: '#21232d' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 100px 70px', padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700 }}>
                  <span>Zrodlo</span><span>Preferowane</span><span>Alternatywy</span><span>Notatka</span><span>Projekt</span><span>Aktywne</span>
                </div>
                <div style={{ maxHeight: '52vh', overflow: 'auto' }}>
                  {filteredGlossary.map(entry => (
                    <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 100px 70px', padding: '4px 8px', borderBottom: `1px solid ${C.borderB}`, fontSize: 12 }}>
                      <span>{entry.source}</span>
                      <span>{entry.preferred}</span>
                      <span>{entry.alternatives}</span>
                      <span>{entry.note}</span>
                      <span>{entry.projectId}</span>
                      <input
                        type="checkbox"
                        checked={entry.active}
                        onChange={() => onChange({
                          ...store,
                          glossary: store.glossary.map(item => item.id === entry.id ? { ...item, active: !item.active } : item),
                        })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'projects' && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ border: `1px solid ${C.border}`, background: '#21232d' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 120px 120px 160px auto', padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700 }}>
                  <span>Projekt</span><span>Pamiec</span><span>Glosariusz</span><span>Aktualizacja</span><span>Akcje</span>
                </div>
                {projectStats.map(project => (
                  <div key={project.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 120px 120px 160px auto', padding: '6px 8px', borderBottom: `1px solid ${C.borderB}`, fontSize: 12, alignItems: 'center' }}>
                    <span>{project.name}</span>
                    <span>{project.memoryCount}</span>
                    <span>{project.glossaryCount}</span>
                    <span>{project.lastUpdated}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={BASE_BTN} onClick={() => exportProject(project.id)}>Eksport</button>
                      <button
                        style={BASE_BTN}
                        onClick={() => {
                          const input = document.createElement('input')
                          input.type = 'file'
                          input.accept = '.json'
                          input.onchange = () => {
                            const file = input.files?.[0]
                            if (file) void importProjectJson(file)
                          }
                          input.click()
                        }}
                      >
                        Import
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={BASE_BTN} onClick={cloneProjectMemory}>Klonuj ustawienia projektu</button>
                <button style={BASE_BTN} onClick={exportBackup}>Backup</button>
                <button
                  style={BASE_BTN}
                  onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = '.json'
                    input.onchange = async () => {
                      const file = input.files?.[0]
                      if (!file) return
                      const content = await file.text()
                      const parsed = JSON.parse(content) as MemoryStore
                      if (parsed.projects && parsed.entries && parsed.glossary) onChange(parsed)
                    }
                    input.click()
                  }}
                >
                  Przywroc backup
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: `1px solid ${C.border}`, padding: 8 }}>
          <button style={BASE_BTN} onClick={onClose}>Zamknij</button>
        </div>
      </div>
    </div>
  )
}

interface GenderCorrectionModalProps {
  open: boolean
  rows: DialogRow[]
  characters: CharacterStyleAssignment[]
  onClose: () => void
  onApply: (changes: Array<{ lineId: number; after: string }>) => void
}

function GenderCorrectionModal({ open, rows, characters, onClose, onApply }: GenderCorrectionModalProps): React.ReactElement | null {
  const [mode, setMode] = useState<CorrectionEngineMode>('local')
  const [candidates, setCandidates] = useState<CorrectionCandidate[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (open) {
      setMode('local')
      setCandidates([])
      setSelectedIds(new Set())
    }
  }, [open])

  if (!open) return null

  const resolveGender = (name: string): CharacterGender => resolveGenderForCharacterName(name, characters)
  const resolveCharacterName = (name: string): string | null => resolveCharacterForLineName(name, characters)?.name ?? null
  const translatedLinesCount = rows.filter(row => row.target.trim()).length
  const actorsAssigned = characters.filter(character => character.gender !== 'Unknown').length
  const actorsTotal = characters.length
  const actorsMissingGender = actorsTotal - actorsAssigned

  const actorStats: ActorCorrectionStats[] = characters.map(character => {
    const lineCount = rows.filter(row => resolveCharacterName(row.character) === character.name && row.target.trim()).length
    const toCorrect = candidates.filter(candidate => candidate.actor === character.name).length
    return {
      actor: character.name,
      gender: character.gender,
      lineCount,
      toCorrect,
    }
  }).sort((a, b) => b.lineCount - a.lineCount)

  const runAnalysis = (): void => {
    const detected: CorrectionCandidate[] = []
    rows.forEach(row => {
      if (!row.target.trim() || !row.character) return
      const gender = resolveGender(row.character)
      if (gender === 'Unknown') return
      const corrected = applyGenderCorrectionLocally(row.target, gender)
      const resolvedActor = resolveCharacterName(row.character) ?? row.character
      if (corrected !== row.target) {
        detected.push({
          lineId: row.id,
          actor: resolvedActor,
          gender,
          before: row.target,
          after: corrected,
        })
      }
    })
    setCandidates(detected)
    setSelectedIds(new Set(detected.map(item => item.lineId)))
  }

  const applySelected = (): void => {
    const selected = candidates
      .filter(candidate => selectedIds.has(candidate.lineId))
      .map(candidate => ({ lineId: candidate.lineId, after: candidate.after }))
    if (!selected.length) return
    onApply(selected)
  }

  const applyAll = (): void => {
    const all = candidates.map(candidate => ({ lineId: candidate.lineId, after: candidate.after }))
    if (!all.length) return
    onApply(all)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,12,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1003 }}>
      <div style={{ width: 'min(1280px, 98vw)', maxHeight: '92vh', background: '#1b1d27', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontWeight: 700 }}>Korekta płci - Asystent</span>
          <button style={BASE_BTN} onClick={onClose}>X</button>
        </div>

        <div style={{ padding: 8, overflow: 'auto', display: 'grid', gap: 8 }}>
          <div style={{ border: `1px solid ${C.border}`, background: '#20232e', padding: 8 }}>
            <div style={{ color: C.accent, fontWeight: 700, marginBottom: 6 }}>Analiza pliku</div>
            <div style={{ display: 'grid', gap: 2, fontSize: 15 }}>
              <div>Linie z tłumaczeniem: <strong>{translatedLinesCount}</strong></div>
              <div>Aktorzy z przypisaną płcią: <strong>{actorsAssigned} / {actorsTotal}</strong></div>
              <div>Linie z formami do korekty: <strong>{candidates.length}</strong>{candidates.length === 0 ? ' (brak form czasu przeszłego)' : ''}</div>
            </div>
            {actorsMissingGender > 0 && (
              <div style={{ marginTop: 8, color: C.accentY, fontWeight: 700 }}>
                {actorsMissingGender} aktorów bez przypisanej płci - otwórz Postacie i ustaw płeć.
              </div>
            )}
          </div>

          <div style={{ border: `1px solid ${C.border}`, background: '#20232e', padding: 8 }}>
            <div style={{ color: C.accent, fontWeight: 700, marginBottom: 6 }}>Aktorzy</div>
            <div style={{ border: `1px solid ${C.border}`, background: '#1b1d27' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 90px 110px', padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700 }}>
                <span>Aktor</span><span>Płeć</span><span>Linii</span><span>Do korekty</span>
              </div>
              <div style={{ maxHeight: 170, overflow: 'auto' }}>
                {actorStats.map(stat => (
                  <div key={stat.actor} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 90px 110px', padding: '4px 8px', borderBottom: `1px solid ${C.borderB}`, fontSize: 12 }}>
                    <span>{stat.actor}</span>
                    <span style={{ color: genderColor(stat.gender) }}>{genderLabel(stat.gender)}</span>
                    <span>{stat.lineCount}</span>
                    <span>{stat.toCorrect || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ border: `1px solid ${C.border}`, background: '#20232e', padding: 8 }}>
            <div style={{ color: C.accent, fontWeight: 700, marginBottom: 6 }}>Silnik korekty</div>
            <label style={{ display: 'block', marginBottom: 4 }}>
              <input type="radio" checked={mode === 'local'} onChange={() => setMode('local')} /> Lokalny (bez internetu, bez klucza)
            </label>
            <label style={{ display: 'block' }}>
              <input type="radio" checked={mode === 'ai'} onChange={() => setMode('ai')} /> Claude API (lepsza jakość, wymaga klucza)
            </label>
            {mode === 'ai' && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.textDim }}>
                Tryb AI jest gotowy pod integrację klucza; obecnie działa fallback lokalny dla podglądu.
              </div>
            )}
          </div>

          <div style={{ border: `1px solid ${C.border}`, background: '#20232e', padding: 8 }}>
            <div style={{ color: C.accent, fontWeight: 700, marginBottom: 6 }}>Podgląd zmian</div>
            <div style={{ border: `1px solid ${C.border}`, background: '#1b1d27' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '44px 130px 1fr 1fr', padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700 }}>
                <span>✔</span><span>Aktor</span><span>Przed korektą</span><span>Po korekcie</span>
              </div>
              <div style={{ maxHeight: 210, overflow: 'auto' }}>
                {candidates.map(candidate => (
                  <div key={candidate.lineId} style={{ display: 'grid', gridTemplateColumns: '44px 130px 1fr 1fr', padding: '5px 8px', borderBottom: `1px solid ${C.borderB}`, fontSize: 12, gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(candidate.lineId)}
                      onChange={() => {
                        setSelectedIds(prev => {
                          const next = new Set(prev)
                          if (next.has(candidate.lineId)) next.delete(candidate.lineId)
                          else next.add(candidate.lineId)
                          return next
                        })
                      }}
                    />
                    <span>{candidate.actor}</span>
                    <span>{candidate.before}</span>
                    <span style={{ color: C.accentY }}>{candidate.after}</span>
                  </div>
                ))}
                {candidates.length === 0 && <div style={{ padding: 8, color: C.textDim, fontSize: 12 }}>Brak kandydatów. Uruchom analizę.</div>}
              </div>
            </div>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${C.border}`, padding: 8, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={BASE_BTN} onClick={runAnalysis}>Uruchom analizę</button>
          <button style={BASE_BTN} onClick={applySelected}>Popraw zaznaczone</button>
          <button style={{ ...BASE_BTN, background: '#0a6fb5', borderColor: '#1199f5', color: '#fff', fontWeight: 700 }} onClick={applyAll}>Popraw wszystko</button>
          <button style={BASE_BTN} onClick={onClose}>Anuluj</button>
        </div>
      </div>
    </div>
  )
}

interface ApiProvider {
  id: string
  title: string
  placeholder: string
  modelOptions?: string[]
  pricing: 'free' | 'free_tier' | 'paid'
  pricingNote: string
}

const CLAUDE_LOCKED_MODEL = 'claude-4.5-haiku'

type ApiConfig = Record<string, string>
const API_CONFIG_STORAGE_KEY = `animegate.api-config.${DEFAULT_PROJECT_ID}.v1`

const API_PROVIDERS: ApiProvider[] = [
  { id: 'libre', title: 'LibreTranslate', placeholder: 'Libre key (lub puste dla self-host)', modelOptions: ['libre-default'], pricing: 'free', pricingNote: 'Darmowe przy self-host; publiczne instancje zwykle limitowane.' },
  { id: 'mymemory', title: 'MyMemory Translation API', placeholder: 'API key (opcjonalny)', modelOptions: ['mymemory-default'], pricing: 'free', pricingNote: 'Darmowe limity, klucz opcjonalny dla wyższych limitów.' },
  { id: 'groq', title: 'Groq', placeholder: 'gsk_...', modelOptions: ['llama-3.3-70b-versatile', 'deepseek-r1-distill-llama-70b'], pricing: 'free_tier', pricingNote: 'Darmowy tier z limitami.' },
  { id: 'gemini', title: 'Google Gemini', placeholder: 'AIza...', modelOptions: ['gemini-2.0-flash', 'gemini-1.5-pro'], pricing: 'free_tier', pricingNote: 'Darmowy tier przez AI Studio (limity).' },
  { id: 'openrouter', title: 'OpenRouter', placeholder: 'sk-or-v1-...', modelOptions: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku'], pricing: 'free_tier', pricingNote: 'Część modeli ma darmowe limity.' },
  { id: 'together', title: 'Together AI', placeholder: 'together_...', modelOptions: ['meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'], pricing: 'free_tier', pricingNote: 'Zwykle kredyty startowe / trial.' },
  { id: 'mistral', title: 'Mistral AI', placeholder: 'mistral-...', modelOptions: ['mistral-small-latest', 'mistral-large-latest'], pricing: 'free_tier', pricingNote: 'Zwykle trial / limity startowe.' },
  { id: 'cohere', title: 'Cohere', placeholder: 'co-...', modelOptions: ['command-r', 'command-r-plus'], pricing: 'free_tier', pricingNote: 'Zwykle trial / limity testowe.' },
  { id: 'deepl', title: 'DeepL API', placeholder: '...:fx', modelOptions: ['deepl-default'], pricing: 'free_tier', pricingNote: 'Plan Free dostępny, ale limitowany.' },
  { id: 'google', title: 'Google Translate API v2', placeholder: 'AIza...', modelOptions: ['google-v2'], pricing: 'paid', pricingNote: 'Usługa płatna (billing Google Cloud).' },
  { id: 'claude', title: 'Claude AI', placeholder: 'sk-ant-api...', modelOptions: [CLAUDE_LOCKED_MODEL], pricing: 'paid', pricingNote: 'Zablokowane na najtańszy model Claude Haiku.' },
  { id: 'openai', title: 'OpenAI ChatGPT', placeholder: 'sk-proj-...', modelOptions: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o'], pricing: 'paid', pricingNote: 'API rozliczane usage-based.' },
  { id: 'azure', title: 'Azure OpenAI', placeholder: 'Azure key...', modelOptions: ['gpt-4o-mini', 'gpt-4o'], pricing: 'paid', pricingNote: 'Usługa płatna (Azure billing).' },
  { id: 'papago', title: 'Naver Papago', placeholder: 'Papago key...', pricing: 'paid', pricingNote: 'Zależnie od planu Naver Cloud.' },
  { id: 'yandex', title: 'Yandex Translate', placeholder: 'Yandex key...', pricing: 'paid', pricingNote: 'Zależnie od planu Yandex Cloud.' },
]

const TRANSLATION_MODEL_OPTIONS: Array<{ id: string; label: string }> = API_PROVIDERS
  .flatMap(provider => (provider.modelOptions ?? []).map(model => ({
    id: `${provider.id}:${model}`,
    label: `Silnik: ${provider.id} / ${model}`,
  })))

const DEFAULT_TRANSLATION_MODEL_ID =
  TRANSLATION_MODEL_OPTIONS.find(option => option.id.startsWith('libre:'))?.id
  ?? TRANSLATION_MODEL_OPTIONS.find(option => option.id.startsWith('mymemory:'))?.id
  ?? TRANSLATION_MODEL_OPTIONS[0]?.id
  ?? 'deepl:deepl-default'

function createEmptyApiConfig(): ApiConfig {
  return Object.fromEntries(API_PROVIDERS.map(provider => [provider.id, '']))
}

function normalizeApiConfig(values?: Partial<ApiConfig> | null): ApiConfig {
  const next = createEmptyApiConfig()
  API_PROVIDERS.forEach(provider => {
    next[provider.id] = (values?.[provider.id] ?? '').trim()
  })
  return next
}

function loadApiConfig(): ApiConfig {
  try {
    const raw = localStorage.getItem(API_CONFIG_STORAGE_KEY)
    if (!raw) return createEmptyApiConfig()
    const parsed = JSON.parse(raw) as Partial<ApiConfig>
    return normalizeApiConfig(parsed)
  } catch {
    return createEmptyApiConfig()
  }
}

function saveApiConfig(values: ApiConfig): void {
  localStorage.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify(normalizeApiConfig(values)))
}

function ApiModal({
  open,
  values,
  onChangeValues,
  onClose,
  onSave,
  onTestProvider,
  testStatusByProvider,
  saveStatus,
}: {
  open: boolean
  values: ApiConfig
  onChangeValues: (next: ApiConfig) => void
  onClose: () => void
  onSave: () => void
  onTestProvider: (providerId: string) => void
  testStatusByProvider: Record<string, string>
  saveStatus: string
}): React.ReactElement | null {
  if (!open) return null

  const freeProviders = API_PROVIDERS.filter(provider => provider.pricing === 'free' || provider.pricing === 'free_tier')
  const paidProviders = API_PROVIDERS.filter(provider => provider.pricing === 'paid')

  const renderProvider = (provider: ApiProvider): React.ReactElement => (
    <div key={provider.id} style={{ border: `1px solid ${C.border}`, background: '#242633', padding: 8 }}>
      <div style={{ color: '#2ca8ff', fontWeight: 700, marginBottom: 6 }}>{provider.title}</div>
      <input
        type="password"
        placeholder={provider.placeholder}
        value={values[provider.id] ?? ''}
        onChange={e => onChangeValues({ ...values, [provider.id]: e.currentTarget.value })}
        style={{ width: '100%', height: 24, background: '#2b2d35', border: `1px solid ${C.border}`, color: C.text, padding: '0 6px' }}
      />
      <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <button style={BASE_BTN} onClick={() => onTestProvider(provider.id)}>Test polaczenia</button>
        <span style={{ fontSize: 11, color: testStatusByProvider[provider.id]?.startsWith('OK') ? C.accentG : C.textDim }}>
          {testStatusByProvider[provider.id] ?? 'Brak testu'}
        </span>
      </div>
      {provider.modelOptions && provider.modelOptions.length > 0 && (
        <div style={{ marginTop: 5, fontSize: 11, color: C.textDim }}>
          Modele: {provider.modelOptions.join(' | ')}
        </div>
      )}
      <div style={{ marginTop: 4, fontSize: 11, color: provider.pricing === 'paid' ? '#f7a0a0' : '#9dd39b' }}>
        {provider.pricing === 'free' ? 'Darmowe' : provider.pricing === 'free_tier' ? 'Darmowy tier' : 'Płatne'}: {provider.pricingNote}
      </div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,12,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ width: 'min(860px, 98vw)', maxHeight: '90vh', background: '#1d1f2a', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 30, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 10px', fontWeight: 700 }}>API</div>
        {saveStatus ? (
          <div style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 10px', fontSize: 12, color: saveStatus.startsWith('OK') ? C.accentG : C.accentY }}>
            {saveStatus}
          </div>
        ) : null}
        <div style={{ padding: 10, overflow: 'auto', display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#9dd39b', fontWeight: 700 }}>Darmowe / darmowy tier</div>
          {freeProviders.map(renderProvider)}
          <div style={{ fontSize: 12, color: '#f7a0a0', fontWeight: 700, marginTop: 4 }}>Płatne</div>
          {paidProviders.map(renderProvider)}
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, padding: 10, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={{ ...BASE_BTN, height: 30 }} onClick={onClose}>Anuluj</button>
          <button style={{ ...BASE_BTN, height: 30, background: '#0a6fb5', borderColor: '#1199f5', color: '#fff', fontWeight: 700 }} onClick={onSave}>Zapisz</button>
        </div>
      </div>
    </div>
  )
}

type CharacterStep = 'step1' | 'step2' | 'step3'

interface CharacterModalProps {
  open: boolean
  settings: ProjectTranslationStyleSettings
  rows: DialogRow[]
  projectId: string
  projectMeta: { title: string; anilistId: number | null } | null
  onClose: () => void
  onSave: (next: ProjectTranslationStyleSettings) => void
  onProjectMetaUpdate?: (meta: { title: string; anilistId: number | null }) => void
}

function CharacterModal({ open, settings, rows, projectId, projectMeta, onClose, onSave, onProjectMetaUpdate }: CharacterModalProps): React.ReactElement | null {
  const [step, setStep] = useState<CharacterStep>('step1')
  const [draft, setDraft] = useState<ProjectTranslationStyleSettings>(settings)
  const [isCharacterNotesOpen, setCharacterNotesOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<AniListAnimeResult[]>([])
  const [selectedAnime, setSelectedAnime] = useState<AniListAnimeResult | null>(null)
  const [selectedAnimeCast, setSelectedAnimeCast] = useState<AniListCharacter[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingCast, setIsLoadingCast] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [workerCast, setWorkerCast] = useState<AniListCharacter[]>([])
  const [selectedAniCastIds, setSelectedAniCastIds] = useState<Set<number>>(new Set())
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<number>>(new Set())
  const [imageCacheByName, setImageCacheByName] = useState<Record<string, string>>({})
  const [brokenImageKeys, setBrokenImageKeys] = useState<Set<string>>(new Set())
  const [step2ShowUnknownOnly, setStep2ShowUnknownOnly] = useState(true)
  // step3Unlocked: true tylko po jawnym kliknieciu "Przejdz do Kroku 3" z Kroku 2
  const [step3Unlocked, setStep3Unlocked] = useState(false)
  const wasOpenRef = useRef(false)

  const characterKeyFromNameRole = (name: string, role?: string | null): string => {
    const normalizedRole = (role ?? '').trim().toLowerCase() || 'unknown'
    return `name:${normalizeCharacterName(name)}|role:${normalizedRole}`
  }

  const dedupeAniListCast = (list: AniListCharacter[]): AniListCharacter[] => {
    const byKey = new Map<string, AniListCharacter>()
    list.forEach(item => {
      const normalizedName = normalizeCharacterName(item.name)
      const key = normalizedName ? `name:${normalizedName}` : `id:${item.id}`
      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, { ...item })
        return
      }
      byKey.set(key, {
        ...existing,
        id: existing.id || item.id,
        name: existing.name || item.name,
        imageUrl: existing.imageUrl || item.imageUrl,
        roleLabel: existing.roleLabel === 'Unknown' ? item.roleLabel : existing.roleLabel,
        gender: existing.gender === 'Unknown' && item.gender !== 'Unknown' ? item.gender : existing.gender,
        description: existing.description.length >= item.description.length ? existing.description : item.description,
        descriptionShort: existing.descriptionShort.length >= item.descriptionShort.length ? existing.descriptionShort : item.descriptionShort,
        personalityTraits: [...new Set([...(existing.personalityTraits ?? []), ...(item.personalityTraits ?? [])])].slice(0, 8),
        inferredArchetype: existing.inferredArchetype !== 'default' ? existing.inferredArchetype : item.inferredArchetype,
        inferredStyle: existing.inferredStyle ?? item.inferredStyle ?? null,
        inferredMannerOfAddress: existing.inferredMannerOfAddress || item.inferredMannerOfAddress,
        inferredPolitenessLevel: existing.inferredPolitenessLevel || item.inferredPolitenessLevel,
        inferredVocabularyType: existing.inferredVocabularyType || item.inferredVocabularyType,
        inferredTemperament: existing.inferredTemperament || item.inferredTemperament,
      })
    })
    return [...byKey.values()]
  }

  const dedupeAssignments = (list: CharacterStyleAssignment[]): CharacterStyleAssignment[] => {
    const byKey = new Map<string, CharacterStyleAssignment>()
    list.forEach(item => {
      const normalizedName = normalizeCharacterName(item.name)
      const key = normalizedName ? `name:${normalizedName}` : characterKeyFromNameRole(item.name, item.anilistRole)
      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, item)
        return
      }
      const mergedProfile = {
        ...existing.profile,
        characterTypeId: existing.profile.characterTypeId || item.profile.characterTypeId || '',
        characterSubtypeId: existing.profile.characterSubtypeId || item.profile.characterSubtypeId || '',
        characterUserNotes: existing.profile.characterUserNotes.trim() || item.profile.characterUserNotes.trim() || '',
        speakingTraits: existing.profile.speakingTraits.trim() || item.profile.speakingTraits.trim() || '',
        characterNote: existing.profile.characterNote.trim() || item.profile.characterNote.trim() || '',
        anilistDescription: existing.profile.anilistDescription.trim() || item.profile.anilistDescription.trim() || '',
      }
      byKey.set(key, {
        ...existing,
        name: existing.name || item.name,
        anilistCharacterId: existing.anilistCharacterId ?? item.anilistCharacterId ?? null,
        anilistRole: existing.anilistRole || item.anilistRole,
        imageUrl: existing.imageUrl || item.imageUrl || null,
        gender: existing.gender === 'Unknown' && item.gender !== 'Unknown' ? item.gender : existing.gender,
        avatarColor: existing.avatarColor || item.avatarColor,
        style: existing.style ?? item.style ?? null,
        profile: mergedProfile,
      })
    })
    return [...byKey.values()]
  }

  const normalizeDraftCharacters = (list: CharacterStyleAssignment[]): CharacterStyleAssignment[] => dedupeAssignments(list)

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setStep('step1')
      setDraft({
        ...settings,
        characters: normalizeDraftCharacters(
          settings.characters.map(character => ({
            ...character,
            profile: mergeCharacterNotesAnalysisIntoProfile(
              character.profile,
              character.profile.characterUserNotes,
            ),
          })),
        ),
      })
      setSearch('')
      setSearchResults([])
      // Step 1 is a session workspace: always start clean until user performs a search.
      setSelectedAnime(null)
      setSelectedAnimeCast([])
      setIsSearching(false)
      setIsLoadingCast(false)
      setSearchError('')
      setSelectedAniCastIds(new Set())
      setSelectedWorkerIds(new Set())
      setBrokenImageKeys(new Set())
      setStep2ShowUnknownOnly(true)
      setStep3Unlocked(false)
      const fromSettings = buildImageCacheFromCharacters(settings.characters)
      try {
        const raw = localStorage.getItem(charImageCacheKey(projectId))
        const fromStorage = raw ? (JSON.parse(raw) as Record<string, string>) : {}
        setImageCacheByName({ ...fromSettings, ...fromStorage })
      } catch {
        setImageCacheByName(fromSettings)
      }
      // Keep persisted project data in draft/settings only.
      // Worker cast on Step 1 is a temporary session state and starts empty.
      setWorkerCast([])
    }
    wasOpenRef.current = open
  }, [open, settings, rows, projectMeta])

  useEffect(() => {
    localStorage.setItem(charImageCacheKey(projectId), JSON.stringify(imageCacheByName))
  }, [imageCacheByName, projectId])

  const applyGenderForCharacter = (characterName: string, gender: CharacterGender): void => {
    const key = normalizeCharacterName(characterName)
    setWorkerCast(prev => prev.map(cast => (
      normalizeCharacterName(cast.name) === key
        ? { ...cast, gender }
        : cast
    )))
    setDraft(prev => ({
      ...prev,
      characters: prev.characters.map(character => (
        normalizeCharacterName(character.name) === key
          ? { ...character, gender }
          : character
      )),
    }))
  }

  const step2CastRows = useMemo(
    () => (
      step2ShowUnknownOnly
        ? workerCast.filter(item => {
          const current = draft.characters.find(character => normalizeCharacterName(character.name) === normalizeCharacterName(item.name))
          const effectiveGender = current?.gender ?? item.gender
          return effectiveGender === 'Unknown'
        })
        : workerCast
    ),
    [workerCast, draft.characters, step2ShowUnknownOnly],
  )

  const detectedCharacters = useMemo(() => {
    const byName = new Map<string, { name: string; lineCount: number }>()
    rows.forEach(row => {
      const rawName = row.character.trim()
      const name = stripCharacterTechnicalMetadata(rawName)
      if (!name) return
      const key = normalizeCharacterName(name)
      const current = byName.get(key)
      byName.set(key, { name, lineCount: (current?.lineCount ?? 0) + 1 })
    })
    return [...byName.values()].sort((a, b) => b.lineCount - a.lineCount || a.name.localeCompare(b.name))
  }, [rows])

  const buildPrefilledProfile = (
    existingProfile: CharacterStyleAssignment['profile'] | undefined,
    cast: AniListCharacter,
  ): CharacterStyleAssignment['profile'] => {
    const base = existingProfile ?? createDefaultProfile()
    const analyzed = analyzeCharacterProfileFromAniList(cast)
    const nextTraits = base.speakingTraits.trim()
      ? base.speakingTraits
      : analyzed.speakingTraits ?? ''
    const nextNote = base.characterNote.trim()
      ? base.characterNote
      : analyzed.characterNote ?? ''
    const nextSummary = base.personalitySummary.trim()
      ? base.personalitySummary
      : analyzed.personalitySummary ?? ''
    const nextAniListDescription = base.anilistDescription.trim()
      ? base.anilistDescription
      : analyzed.anilistDescription ?? ''
    const nextArchetype = base.archetype !== 'default'
      ? base.archetype
      : cast.inferredArchetype
    const fallbackTypeFromLegacy = mapLegacyArchetypeToCharacterType(nextArchetype)
    const normalizedTypeSelection = normalizeCharacterTypeSelection(
      base.characterTypeId || fallbackTypeFromLegacy.typeId,
      base.characterSubtypeId || fallbackTypeFromLegacy.subtypeId,
    )
    const nextMannerOfAddress = base.mannerOfAddress.trim()
      ? base.mannerOfAddress
      : analyzed.mannerOfAddress ?? ''
    const nextPolitenessLevel = base.politenessLevel.trim()
      ? base.politenessLevel
      : analyzed.politenessLevel ?? ''
    const nextVocabularyType = base.vocabularyType.trim()
      ? base.vocabularyType
      : analyzed.vocabularyType ?? ''
    const nextTemperament = base.temperament.trim()
      ? base.temperament
      : analyzed.temperament ?? ''

    const mergedProfile = {
      ...base,
      archetype: nextArchetype,
      characterTypeId: normalizedTypeSelection.typeId,
      characterSubtypeId: normalizedTypeSelection.subtypeId,
      characterUserNotes: base.characterUserNotes,
      speakingTraits: nextTraits,
      characterNote: nextNote,
      personalitySummary: nextSummary,
      anilistDescription: nextAniListDescription,
      mannerOfAddress: nextMannerOfAddress,
      politenessLevel: nextPolitenessLevel,
      vocabularyType: nextVocabularyType,
      temperament: nextTemperament,
    }
    return mergeCharacterNotesAnalysisIntoProfile(mergedProfile, mergedProfile.characterUserNotes)
  }

  useEffect(() => {
    if (!open) return
    if (!workerCast.length) return
    setDraft(prev => {
      const previousByAniListId = new Map(
        prev.characters
          .filter(character => Number.isFinite(character.anilistCharacterId))
          .map(character => [character.anilistCharacterId as number, character]),
      )
      const previousByNameRole = new Map(
        prev.characters.map(character => [
          characterKeyFromNameRole(character.name, character.anilistRole),
          character,
        ]),
      )
      // Fallback lookup po samej nazwie — lapie auto-wykryte postacie (bez anilistCharacterId)
      const previousByName = new Map(
        prev.characters.map(character => [normalizeCharacterName(character.name), character]),
      )
      const nextCharacters = workerCast.map(cast => {
        const existing = previousByAniListId.get(cast.id)
          ?? previousByNameRole.get(characterKeyFromNameRole(cast.name, cast.roleLabel))
          ?? previousByName.get(normalizeCharacterName(cast.name))
        const gender = cast.gender !== 'Unknown'
          ? cast.gender
          : (existing?.gender ?? 'Unknown')

        const prefilledProfile = buildPrefilledProfile(existing?.profile, cast)

        return {
          id: existing?.id ?? cast.id ?? numericIdFromName(cast.name),
          name: cast.name,
          anilistCharacterId: cast.id,
          anilistRole: cast.roleLabel,
          imageUrl: existing?.imageUrl ?? cast.imageUrl ?? null,
          gender,
          avatarColor: existing?.avatarColor ?? cast.avatarColor ?? '#4f8ad6',
          style: existing?.style ?? cast.inferredStyle ?? null,
          profile: prefilledProfile,
        } satisfies CharacterStyleAssignment
      })
      // Source of truth dla Kroku 3: finalna, zmergowana baza robocza z Kroku 1/2.
      return { ...prev, characters: normalizeDraftCharacters(nextCharacters) }
    })
  }, [open, workerCast])

  if (!open) return null

  const applyGlobalToAll = (): void => {
    setDraft(prev => ({
      ...prev,
      characters: normalizeDraftCharacters(prev.characters.map(character => ({ ...character, style: prev.globalStyle }))),
    }))
  }

  const handleChangeCharacterUserNotes = (characterId: number, notes: string): void => {
    setDraft(prev => ({
      ...prev,
      characters: prev.characters.map(character => (
        character.id === characterId
          ? {
            ...character,
            profile: mergeCharacterNotesAnalysisIntoProfile(character.profile, notes),
          }
          : character
      )),
    }))
  }

  const handleApplyBulkCharacterUserNotes = (
    entries: Array<{ characterId: number; notes: string }>,
    mode: BulkNotesApplyMode,
  ): { applied: number; skipped: number } => {
    const byId = new Map(entries.map(item => [item.characterId, item.notes.trim()]))
    let applied = 0
    let skipped = 0
    setDraft(prev => ({
      ...prev,
      characters: prev.characters.map(character => {
        const incoming = byId.get(character.id)?.trim()
        if (!incoming) return character
        const existing = character.profile.characterUserNotes.trim()
        let nextNotes = existing

        if (mode === 'overwrite_all') {
          nextNotes = incoming
        } else if (mode === 'fill_empty_only') {
          if (!existing) nextNotes = incoming
          else skipped += 1
        } else {
          if (!existing) nextNotes = incoming
          else if (!existing.includes(incoming)) nextNotes = `${existing}\n\n${incoming}`.trim()
          else skipped += 1
        }

        if (nextNotes === existing) return character
        applied += 1
        return {
          ...character,
          profile: mergeCharacterNotesAnalysisIntoProfile(character.profile, nextNotes),
        }
      }),
    }))
    return { applied, skipped }
  }

  const handleLoadCast = async (anime: AniListAnimeResult): Promise<void> => {
    try {
      setIsLoadingCast(true)
      setSearchError('')
      const cast = await getAnimeCharactersForSeries(anime.id)
      const dedupedCast = dedupeAniListCast(cast)
      setSelectedAnime(anime)
      setSelectedAnimeCast(dedupedCast)
      onProjectMetaUpdate?.({ title: anime.title, anilistId: anime.id })
      setSelectedAniCastIds(new Set())
      setImageCacheByName(prev => {
        const next = { ...prev }
        dedupedCast.forEach(character => {
          const key = normalizeCharacterName(character.name)
          if (character.imageUrl) next[key] = character.imageUrl
        })
        return next
      })
      if (!dedupedCast.length) {
        setSearchError('Nie znaleziono postaci dla calej serii (sezony/coury) w AniList.')
      }
    } catch (error) {
      setSelectedAnime(anime)
      setSelectedAnimeCast([])
      setSearchError(error instanceof Error ? error.message : 'Nie udalo sie pobrac postaci z AniList.')
    } finally {
      setIsLoadingCast(false)
    }
  }

  const handleSearchAniList = async (): Promise<void> => {
    const query = search.trim()
    if (!query) {
      setSearchResults([])
      setSelectedAnime(null)
      setSelectedAnimeCast([])
      setSearchError('')
      return
    }

    try {
      setIsSearching(true)
      setSearchError('')
      const results = await searchAnimeByTitle(query)
      setSearchResults(results)
      if (!results.length) {
        setSelectedAnime(null)
        setSelectedAnimeCast([])
        setSearchError('Brak wynikow dla podanej nazwy anime.')
      } else {
        await handleLoadCast(results[0])
      }
    } catch (error) {
      setSearchResults([])
      setSelectedAnime(null)
      setSelectedAnimeCast([])
      setSearchError(error instanceof Error ? error.message : 'Nie udalo sie pobrac wynikow AniList.')
    } finally {
      setIsSearching(false)
    }
  }

  const importCharactersFromSelectedAnime = (): void => {
    if (!workerCast.length) return
    setStep('step2')
  }

  const addCastToWorkerByIds = (ids: Set<number>): void => {
    if (!ids.size) return
    setImageCacheByName(prev => {
      const next = { ...prev }
      selectedAnimeCast.forEach(cast => {
        if (!ids.has(cast.id)) return
        if (cast.imageUrl) next[normalizeCharacterName(cast.name)] = cast.imageUrl
      })
      return next
    })
    setWorkerCast(prev => {
      const byName = new Map(prev.map((item, idx) => [normalizeCharacterName(item.name), { item, idx }]))
      const next: AniListCharacter[] = [...prev]
      selectedAnimeCast.forEach(cast => {
        if (!ids.has(cast.id)) return
        const key = normalizeCharacterName(cast.name)
        const found = byName.get(key)
        if (found) {
          const { item: existing, idx } = found
          // Immutable update — nie mutujemy obiektow z prev
          next[idx] = {
            ...existing,
            gender: existing.gender === 'Unknown' && cast.gender !== 'Unknown' ? cast.gender : existing.gender,
            roleLabel: existing.roleLabel === 'Unknown' && cast.roleLabel !== 'Unknown' ? cast.roleLabel : existing.roleLabel,
            imageUrl: existing.imageUrl || cast.imageUrl || null,
            description: cast.description.length > existing.description.length ? cast.description : existing.description,
            descriptionShort: cast.descriptionShort.length > existing.descriptionShort.length ? cast.descriptionShort : existing.descriptionShort,
            personalityTraits: cast.personalityTraits.length > 0
              ? [...new Set([...(existing.personalityTraits ?? []), ...cast.personalityTraits])].slice(0, 6)
              : existing.personalityTraits,
          }
          byName.set(key, { item: next[idx], idx })
          return
        }
        const newIdx = next.length
        next.push(cast)
        byName.set(key, { item: cast, idx: newIdx })
      })
      return dedupeAniListCast(next)
    })
  }

  const addSelectedCastToWorker = (): void => {
    addCastToWorkerByIds(selectedAniCastIds)
  }

  const selectAllAniCast = (): void => {
    setSelectedAniCastIds(new Set(selectedAnimeCast.map(cast => cast.id)))
  }

  const clearAniCastSelection = (): void => {
    setSelectedAniCastIds(new Set())
  }

  const addAllCastToWorker = (): void => {
    addCastToWorkerByIds(new Set(selectedAnimeCast.map(cast => cast.id)))
  }

  const removeSelectedWorker = (): void => {
    if (!selectedWorkerIds.size) return
    setWorkerCast(prev => prev.filter(item => !selectedWorkerIds.has(item.id)))
    setSelectedWorkerIds(new Set())
  }

  const clearAllWorkerCast = (): void => {
    setWorkerCast([])
    setSelectedWorkerIds(new Set())
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1001, background: 'rgba(8,8,12,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
      <div style={{ width: 'min(1200px, 98vw)', maxHeight: '94vh', background: '#1b1d27', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 32, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px' }}>
          <span style={{ fontWeight: 700 }}>Postacie AniList - przypisywanie do linii</span>
          <button style={{ ...BASE_BTN, height: 24 }} onClick={onClose}>X</button>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: 8, borderBottom: `1px solid ${C.border}` }}>
          <button style={{ ...BASE_BTN, background: step === 'step1' ? '#2d4b7d' : C.bg3 }} onClick={() => setStep('step1')}>Krok 1</button>
          <button
            style={{ ...BASE_BTN, background: step === 'step2' ? '#2d4b7d' : C.bg3, opacity: workerCast.length === 0 ? 0.4 : 1 }}
            onClick={() => setStep('step2')}
            disabled={workerCast.length === 0}
          >Krok 2</button>
          <button
            style={{ ...BASE_BTN, background: step === 'step3' ? '#2d4b7d' : C.bg3, opacity: !step3Unlocked ? 0.4 : 1 }}
            onClick={() => setStep('step3')}
            disabled={!step3Unlocked}
          >Krok 3 Styl tlumaczenia</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 10 }}>
          {step === 'step1' && (
            <>
              <div style={{ color: C.accent, fontWeight: 700, marginBottom: 8 }}>Wyszukaj anime w AniList (API)</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.currentTarget.value)}
                  placeholder="Nazwa anime..."
                  style={{ flex: 1, height: 28, background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: '0 8px' }}
                />
                <button style={{ ...BASE_BTN, height: 28 }} onClick={() => { void handleSearchAniList() }} disabled={isSearching}>
                  {isSearching ? 'Szukam...' : 'Szukaj'}
                </button>
              </div>
              {searchError && <div style={{ fontSize: 12, color: C.accentR, marginBottom: 8 }}>{searchError}</div>}
              <div style={{ display: 'grid', gap: 6 }}>
                {searchResults.map(anime => (
                  <button
                    key={anime.id}
                    onClick={() => { void handleLoadCast(anime) }}
                    style={{
                      ...BASE_BTN,
                      height: 28,
                      textAlign: 'left',
                      background: anime.id === selectedAnime?.id ? '#2d4b7d' : '#26293a',
                      borderColor: anime.id === selectedAnime?.id ? '#3f7ed2' : C.border,
                    }}
                  >
                    {anime.title} ({anime.seasonLabel})
                  </button>
                ))}
              </div>
              {!searchResults.length && !isSearching && !searchError && (
                <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
                  Wpisz tytul i kliknij `Szukaj`, aby pobrac anime z API AniList.
                </div>
              )}
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, minHeight: 420 }}>
                <div style={{ border: `1px solid ${C.border}`, background: '#212432', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, color: C.accent, fontWeight: 700, fontSize: 12 }}>
                    Postacie z AniList {selectedAnime ? `- ${selectedAnime.title}` : ''}
                  </div>
                  <div style={{ padding: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 12, color: C.textDim }}>Zaladowano: {selectedAnimeCast.length}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={BASE_BTN} onClick={() => { if (selectedAnime) void handleLoadCast(selectedAnime) }} disabled={!selectedAnime || isLoadingCast}>Odswiez cast</button>
                      <button style={BASE_BTN} onClick={selectAllAniCast} disabled={!selectedAnimeCast.length}>Zaznacz wszystko</button>
                      <button style={BASE_BTN} onClick={clearAniCastSelection} disabled={!selectedAniCastIds.size}>Wyczysc zaznaczenie</button>
                      <button style={{ ...BASE_BTN, background: '#176fb0', borderColor: '#2f8cd3', color: '#fff' }} onClick={addSelectedCastToWorker} disabled={!selectedAniCastIds.size}>Dodaj zaznaczone →</button>
                      <button style={{ ...BASE_BTN, background: '#0a6fb5', borderColor: '#1199f5', color: '#fff' }} onClick={addAllCastToWorker} disabled={!selectedAnimeCast.length}>Dodaj wszystkie →</button>
                    </div>
                  </div>
                  <div style={{ padding: 8, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 8 }}>
                    {selectedAnimeCast.map(cast => {
                      const picked = selectedAniCastIds.has(cast.id)
                      return (
                        <button
                          key={cast.id}
                          onClick={() => setSelectedAniCastIds(prev => {
                            const next = new Set(prev)
                            if (next.has(cast.id)) next.delete(cast.id)
                            else next.add(cast.id)
                            return next
                          })}
                          style={{
                            border: `1px solid ${picked ? '#2496e3' : C.border}`,
                            background: picked ? '#243952' : '#252837',
                            padding: 6,
                            textAlign: 'left',
                            color: C.text,
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ height: 92, border: `1px solid ${C.borderB}`, background: '#12131b', overflow: 'hidden', marginBottom: 6 }}>
                            {cast.imageUrl
                              ? <img src={cast.imageUrl} alt={cast.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <div style={{ width: '100%', height: '100%', background: cast.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700 }}>{cast.name.slice(0, 1)}</div>}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{cast.name}</div>
                          <div style={{ fontSize: 11, color: C.textDim }}>{cast.roleLabel}</div>
                          <div style={{ fontSize: 11, color: genderColor(cast.gender), marginTop: 2 }}>{genderLabel(cast.gender)}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div style={{ border: `1px solid ${C.border}`, background: '#212432', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, color: C.accent, fontWeight: 700, fontSize: 12 }}>
                    Aktorzy (lista do przypisywania)
                  </div>
                  <div style={{ padding: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 12, color: C.textDim }}>W bazie: {workerCast.length}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={BASE_BTN} onClick={removeSelectedWorker} disabled={!selectedWorkerIds.size}>Usun zaznaczone</button>
                      <button style={BASE_BTN} onClick={clearAllWorkerCast} disabled={!workerCast.length}>Wyczysc wszystko</button>
                      <button
                        style={{ ...BASE_BTN, background: '#0a6fb5', borderColor: '#1199f5', color: '#fff', fontWeight: 700 }}
                        onClick={importCharactersFromSelectedAnime}
                        disabled={!workerCast.length}
                      >
                        Przejdz do Kroku 2
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '42px 1fr 110px 110px', gap: 8, padding: '6px 8px', fontSize: 11, color: C.textDim, borderBottom: `1px solid ${C.border}` }}>
                    <span>#</span><span>Postac / Aktor</span><span>Rola</span><span>Plec</span>
                  </div>
                  <div style={{ overflow: 'auto', flex: 1 }}>
                    {workerCast.map((cast, index) => {
                      const selected = selectedWorkerIds.has(cast.id)
                      return (
                        <div
                          key={cast.id}
                          onClick={() => setSelectedWorkerIds(prev => {
                            const next = new Set(prev)
                            if (next.has(cast.id)) next.delete(cast.id)
                            else next.add(cast.id)
                            return next
                          })}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '42px 1fr 110px 110px',
                            gap: 8,
                            padding: '6px 8px',
                            borderBottom: `1px solid ${C.borderB}`,
                            cursor: 'pointer',
                            background: selected ? '#243952' : 'transparent',
                          }}
                        >
                          <span style={{ fontSize: 11, color: C.textDim }}>{index + 1}</span>
                          <span style={{ fontSize: 12 }}>{cast.name}</span>
                          <span style={{ fontSize: 11, color: C.textDim }}>{cast.roleLabel}</span>
                          <span style={{ fontSize: 11, color: genderColor(cast.gender) }}>{genderLabel(cast.gender)}</span>
                        </div>
                      )
                    })}
                    {!workerCast.length && <div style={{ padding: 10, fontSize: 12, color: C.textDim }}>Dodaj postacie z lewej strony, aby zbudowac baze robocza.</div>}
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 'step2' && (
            <>
              <div style={{ color: C.accent, fontWeight: 700, marginBottom: 8 }}>Krok 2 - automatyczna weryfikacja plci na bazie z Kroku 1</div>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>
                Program bierze gotowa liste postaci z Kroku 1 i uzupelnia dane automatycznie.
                Tam, gdzie nie ma pewnosci, zostaje <strong>Unknown</strong>.
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: C.textDim }}>
                  Unknown: {step2CastRows.length} / {workerCast.length}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    style={{ ...BASE_BTN, height: 26, background: step2ShowUnknownOnly ? '#2d4b7d' : '#383a52', borderColor: step2ShowUnknownOnly ? '#3f7ed2' : C.border }}
                    onClick={() => setStep2ShowUnknownOnly(prev => !prev)}
                  >
                    {step2ShowUnknownOnly ? 'Pokaz wszystkie' : 'Tylko Unknown'}
                  </button>
                </div>
              </div>
              <div style={{ border: `1px solid ${C.border}`, background: '#222432' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '42px 1fr 110px 130px 130px', gap: 8, padding: '6px 8px', fontSize: 11, color: C.textDim, borderBottom: `1px solid ${C.border}` }}>
                  <span>#</span>
                  <span>Postac (z bazy Kroku 1)</span>
                  <span>Linii</span>
                  <span>Plec z AniList</span>
                  <span>Plec</span>
                </div>
                <div style={{ maxHeight: 360, overflow: 'auto' }}>
                  {step2CastRows.map((item, index) => {
                    const current = draft.characters.find(character => normalizeCharacterName(character.name) === normalizeCharacterName(item.name)) ?? item
                    const lineCount = detectedCharacters.find(character => normalizeCharacterName(character.name) === normalizeCharacterName(item.name))?.lineCount ?? 0
                    return (
                      <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '42px 1fr 110px 130px 130px', gap: 8, padding: '6px 8px', borderBottom: `1px solid ${C.borderB}`, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: C.textDim }}>{index + 1}</span>
                        <span style={{ fontSize: 12 }}>{item.name}</span>
                        <span style={{ fontSize: 11, color: C.textDim }}>{lineCount}</span>
                        <span style={{ fontSize: 11, color: genderColor(item.gender) }}>{genderLabel(item.gender)}</span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                          <button
                            style={{
                              ...BASE_BTN,
                              height: 24,
                              padding: 0,
                              background: current.gender === 'Male' ? '#2d4b7d' : '#383a52',
                              borderColor: current.gender === 'Male' ? '#3f7ed2' : C.border,
                            }}
                            onClick={() => applyGenderForCharacter(item.name, 'Male')}
                          >
                            M
                          </button>
                          <button
                            style={{
                              ...BASE_BTN,
                              height: 24,
                              padding: 0,
                              background: current.gender === 'Female' ? '#2d4b7d' : '#383a52',
                              borderColor: current.gender === 'Female' ? '#3f7ed2' : C.border,
                            }}
                            onClick={() => applyGenderForCharacter(item.name, 'Female')}
                          >
                            K
                          </button>
                          <button
                            style={{
                              ...BASE_BTN,
                              height: 24,
                              padding: 0,
                              background: current.gender === 'Unknown' ? '#2d4b7d' : '#383a52',
                              borderColor: current.gender === 'Unknown' ? '#3f7ed2' : C.border,
                            }}
                            onClick={() => applyGenderForCharacter(item.name, 'Unknown')}
                          >
                            N
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {step2CastRows.length === 0 && (
                    <div style={{ padding: 10, color: C.textDim, fontSize: 12 }}>
                      {workerCast.length === 0
                        ? 'Brak bazy postaci. Wroc do Kroku 1 i dodaj postacie z AniList.'
                        : 'Brak postaci z Unknown dla aktualnego filtra.'}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10 }}>
                <button style={{ ...BASE_BTN, height: 30 }} onClick={() => setStep('step1')}>Wroc do Kroku 1</button>
                <button
                  style={{ ...BASE_BTN, height: 30, minWidth: 210, background: '#2d4b7d', borderColor: '#3f7ed2' }}
                  onClick={() => setCharacterNotesOpen(true)}
                >
                  Profil / notatki postaci
                </button>
                <button
                  style={{ ...BASE_BTN, height: 30, justifySelf: 'end', background: '#2d4b7d', borderColor: '#3f7ed2' }}
                  onClick={() => {
                    setDraft(prev => ({ ...prev, characters: normalizeDraftCharacters(prev.characters) }))
                    setStep('step3')
                    setStep3Unlocked(true)
                  }}
                >
                  Przejdz do Kroku 3
                </button>
              </div>
            </>
          )}

          {step === 'step3' && (
            <>
              <div style={{ border: `1px solid ${C.border}`, background: '#202330', padding: 10, marginBottom: 10 }}>
                <div style={{ color: C.accent, fontWeight: 700, marginBottom: 8 }}>Globalny styl tlumaczenia</div>
                {GLOBAL_STYLE_OPTIONS.map(styleId => (
                  <label key={styleId} style={{ display: 'block', fontSize: 12, marginBottom: 5 }}>
                    <input
                      type="radio"
                      checked={draft.globalStyle === styleId}
                      onChange={() => setDraft(prev => ({ ...prev, globalStyle: styleId }))}
                      style={{ marginRight: 7 }}
                    />
                    {getStyleLabel(styleId)}
                  </label>
                ))}
                <button style={{ ...BASE_BTN, marginTop: 8, height: 30, background: '#1476bd', borderColor: '#1999ef', color: '#fff', fontWeight: 700 }} onClick={applyGlobalToAll}>Ustaw dla wszystkich postaci</button>
              </div>

              <div style={{ color: C.accent, fontWeight: 700, marginBottom: 8 }}>Osobne ustawienia dla postaci</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 8 }}>
                {normalizeDraftCharacters(draft.characters).map(character => (
                  <div key={character.id} style={{ border: `1px solid ${C.border}`, background: '#242633', padding: 8 }}>
                    {(() => {
                      const key = normalizeCharacterName(character.name)
                      const imageFromWorker = workerCast.find(item => normalizeCharacterName(item.name) === key)?.imageUrl ?? null
                      const imageUrl = imageFromWorker || character.imageUrl || imageCacheByName[key] || null
                      const broken = brokenImageKeys.has(key)
                      return (
                        <div style={{ height: 78, border: `1px solid ${C.borderB}`, background: '#151722', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {imageUrl && !broken ? (
                            <img
                              src={imageUrl}
                              alt={character.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={() => {
                                setBrokenImageKeys(prev => {
                                  const next = new Set(prev)
                                  next.add(key)
                                  return next
                                })
                              }}
                            />
                          ) : (
                            <div style={{ width: '100%', height: '100%', background: character.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700 }}>
                              {character.name.slice(0, 1)}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700 }}>{character.name}</div>
                    <div style={{ fontSize: 11, color: genderColor(character.gender), marginBottom: 6 }}>{genderLabel(character.gender)}</div>
                    <select
                      value={character.style ?? ''}
                      onChange={e => {
                        const nextStyle = (e.currentTarget.value as TranslationStyleId) || null
                        setDraft(prev => ({ ...prev, characters: prev.characters.map(item => item.id === character.id ? { ...item, style: nextStyle } : item) }))
                      }}
                      style={{ width: '100%', height: 22, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 11 }}
                    >
                      <option value="">Globalny ({getStyleLabel(draft.globalStyle)})</option>
                      {TRANSLATION_STYLES.map(style => <option key={style.id} value={style.id}>{style.label}</option>)}
                    </select>
                    <select
                      value={character.profile.characterTypeId || ''}
                      onChange={e => {
                        const selectedTypeId = e.currentTarget.value
                        const normalized = normalizeCharacterTypeSelection(selectedTypeId, '')
                        setDraft(prev => ({
                          ...prev,
                          characters: prev.characters.map(item => (
                            item.id === character.id
                              ? {
                                ...item,
                                profile: {
                                  ...item.profile,
                                  characterTypeId: normalized.typeId,
                                  characterSubtypeId: normalized.subtypeId,
                                },
                              }
                              : item
                          )),
                        }))
                      }}
                      style={{ marginTop: 4, width: '100%', height: 22, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 11 }}
                    >
                      <option value="">Typ charakteru (opcjonalnie)</option>
                      {CHARACTER_TYPE_OPTIONS.map(type => (
                        <option key={type.id} value={type.id}>{type.label}</option>
                      ))}
                    </select>
                    <select
                      value={character.profile.characterSubtypeId || ''}
                      onChange={e => {
                        const selectedSubtypeId = e.currentTarget.value
                        const normalized = normalizeCharacterTypeSelection(character.profile.characterTypeId || '', selectedSubtypeId)
                        setDraft(prev => ({
                          ...prev,
                          characters: prev.characters.map(item => (
                            item.id === character.id
                              ? {
                                ...item,
                                profile: {
                                  ...item.profile,
                                  characterTypeId: normalized.typeId,
                                  characterSubtypeId: normalized.subtypeId,
                                },
                              }
                              : item
                          )),
                        }))
                      }}
                      style={{ marginTop: 4, width: '100%', height: 22, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 11 }}
                      disabled={!character.profile.characterTypeId}
                    >
                      <option value="">
                        {character.profile.characterTypeId ? 'Podtyp charakteru' : 'Najpierw wybierz typ'}
                      </option>
                      {(CHARACTER_TYPE_OPTIONS.find(type => type.id === character.profile.characterTypeId)?.subtypes ?? []).map(subtype => (
                        <option key={subtype.id} value={subtype.id}>{subtype.label}</option>
                      ))}
                    </select>
                    <select
                      value={character.profile.archetype}
                      onChange={e => {
                        const nextArchetype = e.currentTarget.value as CharacterArchetypeId
                        setDraft(prev => ({
                          ...prev,
                          characters: prev.characters.map(item => (
                            item.id === character.id
                              ? { ...item, profile: { ...item.profile, archetype: nextArchetype } }
                              : item
                          )),
                        }))
                      }}
                      style={{ marginTop: 4, width: '100%', height: 22, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 11 }}
                    >
                      {CHARACTER_ARCHETYPES.map(archetype => (
                        <option key={archetype.id} value={archetype.id}>{archetype.label}</option>
                      ))}
                    </select>
                    <input
                      value={character.profile.speakingTraits}
                      onChange={e => setDraft(prev => ({
                        ...prev,
                        characters: prev.characters.map(item => item.id === character.id ? { ...item, profile: { ...item.profile, speakingTraits: e.currentTarget.value } } : item),
                      }))}
                      placeholder="Cechy mówienia (opcjonalnie)"
                      style={{ marginTop: 4, width: '100%', height: 22, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 10, padding: '0 4px' }}
                    />
                    <input
                      value={character.profile.characterNote}
                      onChange={e => setDraft(prev => ({
                        ...prev,
                        characters: prev.characters.map(item => item.id === character.id ? { ...item, profile: { ...item.profile, characterNote: e.currentTarget.value } } : item),
                      }))}
                      placeholder="Opis charakteru"
                      style={{ marginTop: 4, width: '100%', height: 22, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 10, padding: '0 4px' }}
                    />
                    <textarea
                      value={character.profile.characterUserNotes}
                      onChange={e => setDraft(prev => ({
                        ...prev,
                        characters: prev.characters.map(item => item.id === character.id
                          ? { ...item, profile: mergeCharacterNotesAnalysisIntoProfile(item.profile, e.currentTarget.value) }
                          : item),
                      }))}
                      placeholder="Notatki użytkownika (Krok 2)"
                      rows={3}
                      style={{ marginTop: 4, width: '100%', background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 10, padding: '4px 6px', resize: 'vertical' }}
                    />
                    <input
                      value={character.profile.personalitySummary}
                      onChange={e => setDraft(prev => ({
                        ...prev,
                        characters: prev.characters.map(item => item.id === character.id ? { ...item, profile: { ...item.profile, personalitySummary: e.currentTarget.value } } : item),
                      }))}
                      placeholder="Podsumowanie osobowosci"
                      style={{ marginTop: 4, width: '100%', height: 22, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 10, padding: '0 4px' }}
                    />
                    <input
                      value={character.profile.mannerOfAddress}
                      onChange={e => setDraft(prev => ({
                        ...prev,
                        characters: prev.characters.map(item => item.id === character.id ? { ...item, profile: { ...item.profile, mannerOfAddress: e.currentTarget.value } } : item),
                      }))}
                      placeholder="Sposob zwracania sie"
                      style={{ marginTop: 4, width: '100%', height: 22, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 10, padding: '0 4px' }}
                    />
                    <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      <input
                        value={character.profile.politenessLevel}
                        onChange={e => setDraft(prev => ({
                          ...prev,
                          characters: prev.characters.map(item => item.id === character.id ? { ...item, profile: { ...item.profile, politenessLevel: e.currentTarget.value } } : item),
                        }))}
                        placeholder="Formalnosc"
                        style={{ width: '100%', height: 22, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 10, padding: '0 4px' }}
                      />
                      <input
                        value={character.profile.temperament}
                        onChange={e => setDraft(prev => ({
                          ...prev,
                          characters: prev.characters.map(item => item.id === character.id ? { ...item, profile: { ...item.profile, temperament: e.currentTarget.value } } : item),
                        }))}
                        placeholder="Temperament"
                        style={{ width: '100%', height: 22, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 10, padding: '0 4px' }}
                      />
                    </div>
                    <input
                      value={character.profile.vocabularyType}
                      onChange={e => setDraft(prev => ({
                        ...prev,
                        characters: prev.characters.map(item => item.id === character.id ? { ...item, profile: { ...item.profile, vocabularyType: e.currentTarget.value } } : item),
                      }))}
                      placeholder="Typ slownictwa"
                      style={{ marginTop: 4, width: '100%', height: 22, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 10, padding: '0 4px' }}
                    />
                    <textarea
                      value={character.profile.anilistDescription}
                      onChange={e => setDraft(prev => ({
                        ...prev,
                        characters: prev.characters.map(item => item.id === character.id ? { ...item, profile: { ...item.profile, anilistDescription: e.currentTarget.value } } : item),
                      }))}
                      placeholder="Opis AniList"
                      rows={2}
                      style={{ marginTop: 4, width: '100%', background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 10, padding: '4px 6px', resize: 'vertical' }}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${C.border}`, padding: 10, display: 'flex', justifyContent: 'space-between' }}>
          <button style={{ ...BASE_BTN, height: 30 }} onClick={onClose}>Zamknij bez zapisywania</button>
          <button
            style={{ ...BASE_BTN, height: 30, background: '#0a6fb5', borderColor: '#1199f5', color: '#fff', fontWeight: 700 }}
            onClick={() => onSave({
              ...draft,
              characters: normalizeDraftCharacters(draft.characters),
              updatedAt: new Date().toISOString(),
            })}
          >
            Zapisz reczne ustawienia postaci
          </button>
        </div>
        <CharacterNotesModal
          open={isCharacterNotesOpen}
          characters={normalizeDraftCharacters(draft.characters).map(character => ({
            id: character.id,
            name: character.name,
            notes: character.profile.characterUserNotes,
          }))}
          onClose={() => setCharacterNotesOpen(false)}
          onChangeNotes={handleChangeCharacterUserNotes}
          onApplyBulkNotes={handleApplyBulkCharacterUserNotes}
        />
      </div>
    </div>
  )
}
function LinesView({
  rows,
  hasActiveProject,
  selectedId,
  selectedIds,
  translatingLineId,
  onSelect,
  onActivateLine,
  getGenderForCharacter,
}: {
  rows: DialogRow[]
  hasActiveProject: boolean
  selectedId: number
  selectedIds: Set<number>
  translatingLineId: number | null
  onSelect: (id: number, opts?: { additive?: boolean; range?: boolean }) => void
  onActivateLine: (id: number) => void
  getGenderForCharacter: (characterName: string) => CharacterGender | undefined
}): React.ReactElement {
  const listRef = useRef<HTMLDivElement | null>(null)
  const col = '30px 34px 94px 94px 78px 122px 1fr 1fr'
  const headers = ['⚥', '#', 'Start', 'Koniec', 'Styl', 'Postac', 'Oryginal', 'Tlumaczenie']

  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const rowEl = container.querySelector<HTMLElement>(`[data-line-id="${selectedId}"]`)
    if (!rowEl) return
    rowEl.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ height: 20, display: 'flex', alignItems: 'center', padding: '0 8px', background: '#1d1f2a', borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.accent, fontWeight: 700 }}>
        Lista dialogow
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: col, background: C.bg2, borderBottom: `1px solid ${C.border}`, padding: '0 8px', height: 24, alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {headers.map(h => (
          <span key={h} style={{ fontSize: 11, color: C.textDim, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {h}
          </span>
        ))}
      </div>
      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {rows.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.textDim, fontSize: 13 }}>
            {hasActiveProject ? 'Brak wczytanego pliku napisow. Otworz plik ASS, aby zobaczyc dialogi.' : 'Wczytaj lub utworz projekt, aby zobaczyc liste dialogow.'}
          </div>
        )}
        {rows.map(row => {
          const active = row.id === selectedId
          const marked = selectedIds.has(row.id)
          const translating = translatingLineId === row.id
          return (
            <div
              key={row.id}
              data-line-id={row.id}
              onClick={event => onSelect(row.id, { additive: event.ctrlKey || event.metaKey, range: event.shiftKey })}
              onDoubleClick={() => onActivateLine(row.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: col,
                gap: 4,
                padding: '0 8px',
                height: 22,
                alignItems: 'center',
                borderBottom: `1px solid ${C.borderB}`,
                cursor: 'pointer',
                background: translating
                  ? '#344226'
                  : row.requiresManualCheck
                    ? '#3b2f1f'
                  : active
                    ? '#33406a'
                    : marked
                      ? '#282a44'
                      : 'transparent',
                borderLeft: translating
                  ? `3px solid ${C.accentG}`
                  : row.requiresManualCheck
                    ? `3px solid ${C.accentY}`
                    : active
                      ? `3px solid ${C.accent}`
                      : '3px solid transparent',
                boxShadow: active ? 'inset 0 0 0 1px rgba(137,180,250,0.35)' : 'none',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.bg3 }}
              onMouseLeave={e => {
                if (!active && !marked && !translating) e.currentTarget.style.background = 'transparent'
                if (marked && !active && !translating) e.currentTarget.style.background = '#282a44'
                if (translating) e.currentTarget.style.background = '#344226'
              }}
            >
              <span><GenderBadge gender={getGenderForCharacter(row.character)} /></span>
              <span style={{ fontSize: 11, color: C.textDim }}>{row.id}</span>
              <span style={{ fontSize: 11, color: C.textDim, fontVariantNumeric: 'tabular-nums' }}>{row.start}</span>
              <span style={{ fontSize: 11, color: C.textDim, fontVariantNumeric: 'tabular-nums' }}>{row.end}</span>
              <span style={{ fontSize: 11, color: C.accent }}>{row.style}</span>
              <span style={{ fontSize: 11, color: row.character ? C.accentY : C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.character || ''}</span>
              <span style={{ fontSize: 12, color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.source}</span>
              <span style={{ fontSize: 12, color: row.requiresManualCheck ? C.accentY : (row.target ? C.text : C.textDim), fontStyle: row.target ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.requiresManualCheck ? '⚠ ' : ''}
                {row.target || ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function App(): React.ReactElement {
  const initialVideoConfig = useMemo(() => {
    const initProjectId = loadSeriesProjectsCatalog()[0]?.id ?? DEFAULT_PROJECT_ID
    return loadVideoProjectConfig(initProjectId)
  }, [])
  const [seriesProjects, setSeriesProjects] = useState<SeriesProjectMeta[]>(() => loadSeriesProjectsCatalog())
  const [currentProjectId, setCurrentProjectId] = useState<string>(() => loadSeriesProjectsCatalog()[0]?.id ?? DEFAULT_PROJECT_ID)
  const [projectPickerId, setProjectPickerId] = useState<string>(() => loadSeriesProjectsCatalog()[0]?.id ?? DEFAULT_PROJECT_ID)
  const [rowsData, setRowsData] = useState<DialogRow[]>([])
  const [selectedId, setSelectedId] = useState(0)
  const [selectedLineIds, setSelectedLineIds] = useState<Set<number>>(new Set())
  const [isTranslating, setIsTranslating] = useState(false)
  const [translatingLineId, setTranslatingLineId] = useState<number | null>(null)
  const [loadedFileName, setLoadedFileName] = useState('Brak pliku')
  const [loadedFilePath, setLoadedFilePath] = useState<string | null>(null)
  const [loadedSubtitleFile, setLoadedSubtitleFile] = useState<ParsedSubtitleFile | null>(null)
  const [videoPath, setVideoPath] = useState<string | null>(initialVideoConfig.videoPath)
  const [videoCollapsed, setVideoCollapsed] = useState(initialVideoConfig.videoCollapsed)
  const [videoHeight, setVideoHeight] = useState(initialVideoConfig.videoHeight)
  const [autoPlayOnLineClick, setAutoPlayOnLineClick] = useState(initialVideoConfig.autoPlayOnLineClick)
  const [preRollSec, setPreRollSec] = useState(initialVideoConfig.preRollSec)
  const [postRollSec, setPostRollSec] = useState(initialVideoConfig.postRollSec)
  const [videoCurrentTime, setVideoCurrentTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [videoPaused, setVideoPaused] = useState(true)
  const [videoVolume, setVideoVolume] = useState(1)
  const [videoMuted, setVideoMuted] = useState(false)
  const [videoPlaybackRate, setVideoPlaybackRate] = useState(1)
  const [videoError, setVideoError] = useState('')
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null)
  const [waveformLoading, setWaveformLoading] = useState(false)
  const [waveformError, setWaveformError] = useState('')
  const [isApiOpen, setApiOpen] = useState(false)
  const [isCharactersOpen, setCharactersOpen] = useState(false)
  const [isMemoryOpen, setMemoryOpen] = useState(false)
  const [isGenderCorrectionOpen, setGenderCorrectionOpen] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [selectedModelId, setSelectedModelId] = useState(DEFAULT_TRANSLATION_MODEL_ID)
  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => loadApiConfig())
  const [persistedApiConfig, setPersistedApiConfig] = useState<ApiConfig>(() => loadApiConfig())
  const [apiSaveStatus, setApiSaveStatus] = useState('')
  const [apiTestStatusByProvider, setApiTestStatusByProvider] = useState<Record<string, string>>({})
  const [translationLogs, setTranslationLogs] = useState<string[]>([])
  const [sourceLang, setSourceLang] = useState('en')
  const [targetLang, setTargetLang] = useState('pl')
  const [styleSettings, setStyleSettings] = useState<ProjectTranslationStyleSettings>(() => createProjectStyleSettings(currentProjectId, []))
  const [memoryStore, setMemoryStore] = useState<MemoryStore>(INITIAL_MEMORY)
  const [activeDiskProject, setActiveDiskProject] = useState<ActiveDiskProject | null>(null)
  const [projectLineAssignments, setProjectLineAssignments] = useState<ProjectLineAssignment[]>([])
  const [activeAssignmentCharacter, setActiveAssignmentCharacter] = useState('')
  const [recentCharacterHistory, setRecentCharacterHistory] = useState<string[]>([])
  const [assignmentImageCacheByName, setAssignmentImageCacheByName] = useState<Record<string, string>>({})
  const [isProjectStepOpen, setProjectStepOpen] = useState<boolean>(true)
  const [projectStepStatus, setProjectStepStatus] = useState('Wybierz lub utworz projekt, aby zapisac ustawienia na dysku.')
  const [newProjectTitle, setNewProjectTitle] = useState('')
  const [newProjectBaseDir, setNewProjectBaseDir] = useState('')
  const [openProjectPath, setOpenProjectPath] = useState('')
  const {
    status: updaterStatus,
    isSupported: isUpdaterSupported,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  } = useUpdaterStatus()
  const stopTranslationRef = useRef(false)
  const activeTranslationAbortRef = useRef<AbortController | null>(null)
  const providerCooldownUntilRef = useRef<number>(0)
  const rowsDataRef = useRef<DialogRow[]>(rowsData)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const lastLineSyncFromVideoRef = useRef<number | null>(null)
  const pauseAtAfterLineRef = useRef<number | null>(null)
  const hydratedProjectIdRef = useRef<string | null>(null)
  const pendingDiskHydrationProjectIdRef = useRef<string | null>(null)

  useEffect(() => {
    saveActiveDiskProject(activeDiskProject)
  }, [activeDiskProject])

  useEffect(() => {
    if (!activeDiskProject) setProjectLineAssignments([])
  }, [activeDiskProject])

  useEffect(() => {
    rowsDataRef.current = rowsData
  }, [rowsData])

  useEffect(() => {
    setProjectPickerId(currentProjectId)
  }, [currentProjectId])

  useEffect(() => {
    saveSeriesProjectsCatalog(seriesProjects)
  }, [seriesProjects])

  useEffect(() => {
    if (!activeDiskProject) return
    const active = seriesProjects.find(project => project.id === currentProjectId)
    if (!active) return

    const isFirstHydrationForProject = hydratedProjectIdRef.current !== currentProjectId
    const shouldSkipCatalogHydration = pendingDiskHydrationProjectIdRef.current === currentProjectId
    if (isFirstHydrationForProject && !shouldSkipCatalogHydration) {
      setSourceLang(active.sourceLang || 'en')
      setTargetLang(active.targetLang || 'pl')
      setSelectedModelId(active.preferredModelId || DEFAULT_TRANSLATION_MODEL_ID)
      setStyleSettings(loadProjectStyleSettings(active.id, BASE_PROJECT_CHARACTERS))
      // Reload per-projekt video config (klucze rozdzielone po projectId)
      const videoCfg = loadVideoProjectConfig(active.id)
      setVideoPath(videoCfg.videoPath)
      setVideoCollapsed(videoCfg.videoCollapsed)
      setVideoHeight(videoCfg.videoHeight)
      setAutoPlayOnLineClick(videoCfg.autoPlayOnLineClick)
      setPreRollSec(videoCfg.preRollSec)
      setPostRollSec(videoCfg.postRollSec)
      hydratedProjectIdRef.current = currentProjectId
    }
    if (shouldSkipCatalogHydration) {
      pendingDiskHydrationProjectIdRef.current = null
    }

    setMemoryStore(prev => {
      if (prev.projects.some(project => project.id === active.id)) return prev
      return {
        ...prev,
        projects: [...prev.projects, { id: active.id, name: active.title, lastUpdated: active.lastUpdated.slice(0, 10) }],
      }
    })
  }, [activeDiskProject, currentProjectId, seriesProjects])

  useEffect(() => {
    // Fallback ustawiamy tylko gdy aktualnie wybrany silnik nie istnieje na liscie.
    // Dzięki temu ręczny wybór użytkownika nie jest nadpisywany przy zwykłym rerenderze.
    const isValid = TRANSLATION_MODEL_OPTIONS.some(option => option.id === selectedModelId)
    if (isValid) return
    setSelectedModelId(DEFAULT_TRANSLATION_MODEL_ID)
  }, [selectedModelId])

  const upsertSeriesProjectMeta = (
    projectId: string,
    updates: Partial<Omit<SeriesProjectMeta, 'id'>>,
  ): void => {
    setSeriesProjects(prev => {
      const now = new Date().toISOString()
      const existing = prev.find(project => project.id === projectId)
      if (!existing) {
        const created: SeriesProjectMeta = {
          id: projectId,
          title: updates.title?.trim() || projectId,
          anilistId: updates.anilistId ?? null,
          preferredModelId: updates.preferredModelId || selectedModelId,
          sourceLang: updates.sourceLang || sourceLang,
          targetLang: updates.targetLang || targetLang,
          lastUpdated: now,
        }
        return [...prev, created]
      }
      const nextTitle = (updates.title ?? existing.title).trim() || existing.id
      const nextAnilistId = updates.anilistId === undefined ? existing.anilistId : updates.anilistId
      const nextPreferredModelId = updates.preferredModelId ?? existing.preferredModelId
      const nextSourceLang = updates.sourceLang ?? existing.sourceLang
      const nextTargetLang = updates.targetLang ?? existing.targetLang

      const hasAnyChange = (
        nextTitle !== existing.title
        || nextAnilistId !== existing.anilistId
        || nextPreferredModelId !== existing.preferredModelId
        || nextSourceLang !== existing.sourceLang
        || nextTargetLang !== existing.targetLang
      )
      if (!hasAnyChange) return prev

      return prev.map(project => (
        project.id === projectId
          ? {
            ...project,
            ...updates,
            title: nextTitle,
            anilistId: nextAnilistId,
            preferredModelId: nextPreferredModelId,
            sourceLang: nextSourceLang,
            targetLang: nextTargetLang,
            lastUpdated: now,
          }
          : project
      ))
    })
  }

  useEffect(() => {
    let cancelled = false
    const loadPersistedApiConfig = async (): Promise<void> => {
      if (!window.electronAPI?.getApiConfig) return
      try {
        const raw = await window.electronAPI.getApiConfig()
        if (cancelled) return
        const normalized = normalizeApiConfig(raw)
        setApiConfig(normalized)
        setPersistedApiConfig(normalized)
        saveApiConfig(normalized)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Nieznany blad odczytu konfiguracji API'
        setApiSaveStatus(`BLAD odczytu konfiguracji API: ${message}`)
      }
    }
    void loadPersistedApiConfig()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!activeDiskProject) {
      setAssignmentImageCacheByName({})
      return
    }
    const fromSettings = buildImageCacheFromCharacters(styleSettings.characters)
    try {
      const raw = localStorage.getItem(charImageCacheKey(currentProjectId))
      const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {}
      setAssignmentImageCacheByName({ ...fromSettings, ...parsed })
    } catch {
      setAssignmentImageCacheByName(fromSettings)
    }
  }, [activeDiskProject, currentProjectId, styleSettings.updatedAt])

  const selectedRow = rowsData.find(row => row.id === selectedId)
  const detachedPreviewSourceText = stripAssFormatting(selectedRow?.sourceRaw ?? selectedRow?.source ?? '').trim()
  const detachedPreviewTargetText = stripAssFormatting(selectedRow?.target ?? '').trim()
  const assignmentCharacters = useMemo<CharacterAssignmentGridItem[]>(() => {
    if (!activeDiskProject) return []
    const deduped = new Map<string, CharacterAssignmentGridItem>()
    styleSettings.characters.forEach(character => {
      const name = character.name.trim()
      if (!name) return
      const key = normalizeCharacterName(name)
      if (!key || deduped.has(key)) return
      deduped.set(key, {
        id: character.id,
        name,
        gender: character.gender,
        role: character.anilistRole,
        avatarColor: character.avatarColor,
        imageUrl: character.imageUrl || assignmentImageCacheByName[key] || null,
      })
    })
    return [...deduped.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl', { sensitivity: 'base' }))
  }, [activeDiskProject, styleSettings.characters, assignmentImageCacheByName])
  const assignmentSuggestions = useMemo<CharacterAssignmentSuggestion[]>(() => {
    if (!activeDiskProject) return []
    return buildCharacterAssignmentSuggestions({
      rows: rowsData,
      selectedLineId: selectedId,
      availableCharacters: assignmentCharacters.map(item => item.name),
      recentCharacterHistory,
      lastUsedCharacter: activeAssignmentCharacter,
    })
  }, [activeDiskProject, rowsData, selectedId, assignmentCharacters, recentCharacterHistory, activeAssignmentCharacter])
  const activeSeriesMeta = useMemo(
    () => seriesProjects.find(project => project.id === currentProjectId) ?? null,
    [seriesProjects, currentProjectId],
  )
  useEffect(() => {
    upsertSeriesProjectMeta(currentProjectId, {
      preferredModelId: selectedModelId,
      sourceLang,
      targetLang,
    })
  }, [currentProjectId, selectedModelId, sourceLang, targetLang])

  useEffect(() => {
    if (!activeDiskProject || !window.electronAPI?.saveProjectConfig) return
    const timer = window.setTimeout(() => {
      const snapshot = buildDiskProjectConfig(
        activeDiskProject.projectDir,
        activeDiskProject.configPath,
        activeDiskProject.projectId,
        activeDiskProject.title,
      )
      void window.electronAPI.saveProjectConfig({
        projectDir: activeDiskProject.projectDir,
        config: snapshot,
      }).catch(error => {
        const message = error instanceof Error ? error.message : 'Nie udalo sie zapisac konfiguracji projektu.'
        setProjectStepStatus(`BLAD autozapisu projektu: ${message}`)
      })
    }, 900)

    return () => {
      window.clearTimeout(timer)
    }
  }, [
    activeDiskProject,
    sourceLang,
    targetLang,
    selectedModelId,
    styleSettings,
    currentProjectId,
    seriesProjects,
    rowsData,
  ])

  const videoSrc = videoPath ? toFileVideoUrl(videoPath) : null
  const loadedVideoName = videoPath ? fileNameFromPath(videoPath) : 'Brak wideo'
  const lineTimings = useMemo(
    () => rowsData.map(row => ({ id: row.id, startSec: subtitleTimeToSeconds(row.start), endSec: subtitleTimeToSeconds(row.end) })),
    [rowsData],
  )
  const lineTimingById = useMemo(() => new Map(lineTimings.map(item => [item.id, item])), [lineTimings])
  const waveformSelection = useMemo<WaveformSelection | null>(() => {
    const timing = lineTimingById.get(selectedId)
    if (!timing) return null
    return {
      lineId: selectedId,
      startSec: timing.startSec,
      endSec: Math.max(timing.endSec, timing.startSec + 0.08),
    }
  }, [selectedId, lineTimingById])
  const selectedCharacter = selectedRow?.character
    ? resolveCharacterForLineName(selectedRow.character, styleSettings.characters)
    : null
  const projectNameById = useMemo(
    () => {
      const map = new Map<string, string>()
      memoryStore.projects.forEach(project => map.set(project.id, project.name))
      seriesProjects.forEach(project => map.set(project.id, project.title))
      return map
    },
    [memoryStore.projects, seriesProjects],
  )
  const characterGenderByName = useMemo(() => {
    const map = new Map<string, CharacterGender>()
    styleSettings.characters.forEach(character => {
      map.set(normalizeCharacterName(character.name.trim()), character.gender)
    })
    return map
  }, [styleSettings.characters])

  useEffect(() => {
    if (!activeDiskProject) return
    setStyleSettings(prev => {
      const existingNames = new Set(prev.characters.map(character => normalizeCharacterName(character.name.trim())))
      const queuedNames = new Set<string>()
      const toAdd = rowsData
        .map(row => stripCharacterTechnicalMetadata(row.character))
        .filter(Boolean)
        .filter(name => {
          const normalized = normalizeCharacterName(name)
          if (existingNames.has(normalized)) return false
          if (queuedNames.has(normalized)) return false
          queuedNames.add(normalized)
          return true
        })

      if (!toAdd.length) return prev

      const appended = toAdd.map(name => ({
        id: localIdFromName(name),
        name,
        imageUrl: null,
        gender: 'Unknown' as CharacterGender,
        avatarColor: '#4f8ad6',
        style: null,
        profile: createDefaultProfile(),
      }))

      const next = { ...prev, characters: [...prev.characters, ...appended] }
      saveProjectStyleSettings(next)
      return next
    })
  }, [activeDiskProject, rowsData])

  const effectiveStyleLabel = useMemo(() => {
    if (!selectedRow?.character) return getStyleLabel(styleSettings.globalStyle)
    return getStyleLabel(resolveEffectiveStyle(styleSettings, selectedRow.character).style)
  }, [selectedRow, styleSettings])

  const styleContext = useMemo(() => {
    if (!selectedRow?.character) return ''
    return buildTranslationStyleContext(styleSettings, selectedRow.character, selectedCharacter?.gender ?? null)
  }, [selectedRow, selectedCharacter, styleSettings])
  void styleContext

  const getTranslationContextForRow = (row: DialogRow): TranslationRequestContext => {
    const matchedCharacter = resolveCharacterForLineName(row.character.trim(), styleSettings.characters)
    const normalizedName = normalizeCharacterName(row.character.trim())
    const character = matchedCharacter ?? styleSettings.characters.find(item => normalizeCharacterName(item.name) === normalizedName)
    const gender = character?.gender ?? characterGenderByName.get(normalizedName) ?? 'Unknown'
    const resolvedCharacterName = character?.name ?? row.character.trim() ?? 'Narrator'
    const effectiveStyle = resolveEffectiveStyle(styleSettings, resolvedCharacterName)
    const archetype = character?.profile.archetype ?? 'default'
    const normalizedTypeSelection = normalizeCharacterTypeSelection(
      character?.profile.characterTypeId || mapLegacyArchetypeToCharacterType(archetype).typeId,
      character?.profile.characterSubtypeId || mapLegacyArchetypeToCharacterType(archetype).subtypeId,
    )
    const typeOption = CHARACTER_TYPE_OPTIONS.find(item => item.id === normalizedTypeSelection.typeId)
    const subtypeOption = getCharacterSubtypeById(normalizedTypeSelection.typeId, normalizedTypeSelection.subtypeId)
    return {
      characterName: resolvedCharacterName,
      gender,
      effectiveStyle: effectiveStyle.style,
      effectiveStyleSource: effectiveStyle.source,
      archetype,
      archetypeLabel: getArchetypeLabel(archetype),
      archetypeToneRule: getArchetypeToneRule(archetype),
      characterTypeId: normalizedTypeSelection.typeId,
      characterTypeLabel: typeOption?.label ?? '',
      characterSubtypeId: normalizedTypeSelection.subtypeId,
      characterSubtypeLabel: subtypeOption?.label ?? '',
      characterSubtypePrompt: buildCharacterArchetypePrompt(normalizedTypeSelection.typeId, normalizedTypeSelection.subtypeId),
      characterUserNotes: character?.profile.characterUserNotes?.trim() ?? '',
      speakingTraits: character?.profile.speakingTraits?.trim() ?? '',
      characterNote: character?.profile.characterNote?.trim() ?? '',
      styleContext: resolvedCharacterName
        ? buildTranslationStyleContext(styleSettings, resolvedCharacterName, gender)
        : '',
      previousLineContinuation: '',
    }
  }

  const suggestions = useMemo<SuggestionViewModel[]>(() => {
    if (!selectedRow) return []
    return memoryStore.entries
      .map(entry => {
        const base = textSimilarityPercent(selectedRow.source, entry.source)
        if (base <= 25) return null
        const projectBoost = entry.projectId === currentProjectId ? 8 : 0
        const characterBoost = selectedRow.character && entry.character === selectedRow.character ? 7 : 0
        const usageBoost = Math.min(5, entry.usageCount)
        let score = Math.min(100, base + projectBoost + characterBoost + usageBoost)
        if (base < 100 && score >= 100) score = 99
        if (base === 100) score = 100
        const quality = qualityFromScore(score)
        return {
          id: entry.id,
          source: entry.source,
          target: entry.target,
          character: entry.character,
          projectId: entry.projectId,
          usageCount: entry.usageCount,
          score,
          quality,
          qualityLabel: qualityLabel(score),
        } satisfies SuggestionViewModel
      })
      .filter((entry): entry is SuggestionViewModel => Boolean(entry))
      .sort((a, b) => b.score - a.score || b.usageCount - a.usageCount)
      .slice(0, 5)
  }, [memoryStore.entries, selectedRow, currentProjectId])

  useEffect(() => {
    setSelectedSuggestionIndex(0)
  }, [selectedId, suggestions.length, selectedRow?.target])

  useEffect(() => {
    localStorage.setItem(videoConfigKey(currentProjectId), JSON.stringify({
      videoPath,
      videoCollapsed,
      videoHeight,
      autoPlayOnLineClick,
      preRollSec,
      postRollSec,
    } satisfies VideoProjectConfig))
  }, [currentProjectId, videoPath, videoCollapsed, videoHeight, autoPlayOnLineClick, preRollSec, postRollSec])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = videoVolume
    video.muted = videoMuted
    video.playbackRate = videoPlaybackRate
  }, [videoVolume, videoMuted, videoPlaybackRate, videoSrc])

  useEffect(() => {
    if (!videoPath || !window.electronAPI?.getVideoWaveform) {
      setWaveformData(null)
      setWaveformError('')
      setWaveformLoading(false)
      return
    }
    let cancelled = false
    setWaveformLoading(true)
    setWaveformError('')
    void window.electronAPI.getVideoWaveform({ filePath: videoPath }).then(result => {
      if (cancelled) return
      if (!result.ok) {
        setWaveformData(null)
        setWaveformError(result.error ?? 'Nie udalo sie wygenerowac waveformu.')
        return
      }
      setWaveformData({
        filePath: result.filePath,
        sampleRate: result.sampleRate,
        peaks: result.peaks,
        duration: result.duration,
        fromCache: result.fromCache,
      })
    }).catch(error => {
      if (cancelled) return
      setWaveformData(null)
      setWaveformError(error instanceof Error ? error.message : 'Blad pobierania waveformu.')
    }).finally(() => {
      if (!cancelled) setWaveformLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [videoPath])

  const saveStyles = (next: ProjectTranslationStyleSettings): void => {
    const payload = { ...next, projectId: currentProjectId }
    setStyleSettings(payload)
    saveProjectStyleSettings(payload)
    upsertSeriesProjectMeta(currentProjectId, {})
    setCharactersOpen(false)
  }

  const handleProjectMetaUpdate = (meta: { title: string; anilistId: number | null }): void => {
    const normalizedTitle = meta.title.trim()
    if (!normalizedTitle) return
    upsertSeriesProjectMeta(currentProjectId, {
      title: normalizedTitle,
      anilistId: meta.anilistId,
    })
    setMemoryStore(prev => ({
      ...prev,
      projects: prev.projects.some(project => project.id === currentProjectId)
        ? prev.projects.map(project => (
          project.id === currentProjectId
            ? { ...project, name: normalizedTitle, lastUpdated: new Date().toISOString().slice(0, 10) }
            : project
        ))
        : [...prev.projects, { id: currentProjectId, name: normalizedTitle, lastUpdated: new Date().toISOString().slice(0, 10) }],
    }))
  }

  const handleCreateSeriesProject = (): void => {
    const title = window.prompt('Tytul projektu (jeden tytul anime):')?.trim()
    if (!title) return
    const suggestedId = sanitizeProjectId(title) || `project_${Date.now()}`
    const enteredId = window.prompt('ID projektu (unikalny, bez spacji):', suggestedId)?.trim()
    if (!enteredId) return
    const projectId = sanitizeProjectId(enteredId)
    if (!projectId) return
    if (seriesProjects.some(project => project.id === projectId)) {
      appendTranslationLog(`Projekt o ID ${projectId} juz istnieje.`)
      return
    }

    const now = new Date().toISOString()
    const meta: SeriesProjectMeta = {
      id: projectId,
      title,
      anilistId: null,
      preferredModelId: selectedModelId,
      sourceLang,
      targetLang,
      lastUpdated: now,
    }
    setSeriesProjects(prev => [...prev, meta])
    setMemoryStore(prev => (
      prev.projects.some(project => project.id === projectId)
        ? prev
        : { ...prev, projects: [...prev.projects, { id: projectId, name: title, lastUpdated: now.slice(0, 10) }] }
    ))
    saveProjectStyleSettings(createProjectStyleSettings(projectId, BASE_PROJECT_CHARACTERS))
    setProjectPickerId(projectId)
    setCurrentProjectId(projectId)
    appendTranslationLog(`Utworzono projekt serii: ${title} (${projectId}).`)
  }

  const buildDiskProjectConfig = (
    projectDir: string,
    configPath: string,
    projectIdOverride?: string,
    titleOverride?: string,
  ): DiskProjectConfigV1 => {
    const projectId = projectIdOverride ?? currentProjectId
    const meta = seriesProjects.find(project => project.id === projectId)
    const title = titleOverride ?? meta?.title ?? projectId
    const lineCharacterAssignments = buildProjectLineAssignments(rowsData, rawCharacter => (
      resolveCharacterForLineName(rawCharacter, styleSettings.characters)?.name ?? rawCharacter
    ))

    return mapAppStateToProjectConfig({
      projectId,
      title,
      anilistId: meta?.anilistId ?? null,
      projectDir,
      configPath,
      sourceLang,
      targetLang,
      preferredModelId: selectedModelId,
      styleSettings,
      lineCharacterAssignments,
    })
  }

  const resetSubtitleWorkspaceState = (): void => {
    setRowsData([])
    setSelectedId(0)
    setSelectedLineIds(new Set())
    setLoadedSubtitleFile(null)
    setLoadedFileName('Brak pliku')
    setLoadedFilePath(null)
    setProjectLineAssignments([])
  }

  const hydrateFromDiskProject = (config: DiskProjectConfigV1, projectDir: string, configPath: string): void => {
    resetSubtitleWorkspaceState()
    const hydrated = hydrateStateFromDiskProject(config)
    const projectId = sanitizeProjectId(hydrated.projectId) || hydrated.projectId
    const projectTitle = hydrated.title
    const preferredModelId = hydrated.preferredModelId || DEFAULT_TRANSLATION_MODEL_ID
    const source = hydrated.sourceLang || 'en'
    const target = hydrated.targetLang || 'pl'
    const anilistId = Number.isFinite(hydrated.anilistId) ? hydrated.anilistId : null

    const nextMeta: SeriesProjectMeta = {
      id: projectId,
      title: projectTitle,
      anilistId,
      preferredModelId,
      sourceLang: source,
      targetLang: target,
      lastUpdated: new Date().toISOString(),
    }
    setSeriesProjects(prev => {
      const existing = prev.find(item => item.id === projectId)
      if (!existing) return [...prev, nextMeta]
      return prev.map(item => item.id === projectId ? { ...item, ...nextMeta } : item)
    })

    const restoredSettings: ProjectTranslationStyleSettings = {
      ...hydrated.styleSettings,
      projectId,
    }

    setSourceLang(source)
    setTargetLang(target)
    setSelectedModelId(preferredModelId)
    setStyleSettings(restoredSettings)
    saveProjectStyleSettings(restoredSettings)
    setProjectLineAssignments(
      (config.characterWorkflow?.lineCharacterAssignments ?? []).map(item => ({
        lineId: item.lineId,
        rawCharacter: item.rawCharacter,
        resolvedCharacterName: item.resolvedCharacterName,
        lineKey: item.lineKey,
      })),
    )
    // Prevent a follow-up catalog/localStorage hydration from overwriting freshly loaded disk state.
    hydratedProjectIdRef.current = projectId
    pendingDiskHydrationProjectIdRef.current = projectId
    setCurrentProjectId(projectId)
    setProjectPickerId(projectId)
    setActiveDiskProject({
      projectId,
      title: projectTitle,
      projectDir,
      configPath,
    })
    setProjectStepOpen(false)
    setProjectStepStatus(`Wczytano projekt: ${projectTitle}`)
    appendTranslationLog(`Krok 0: wczytano projekt dyskowy ${projectTitle} (${projectDir}).`)
  }

  const handlePickNewProjectBaseDir = async (): Promise<void> => {
    if (!window.electronAPI?.pickProjectDirectory) return
    const result = await window.electronAPI.pickProjectDirectory({ title: 'Wybierz folder bazowy dla nowego projektu' })
    if (result.canceled || !result.directoryPath) return
    setNewProjectBaseDir(result.directoryPath)
  }

  const handlePickOpenProjectDir = async (): Promise<void> => {
    if (window.electronAPI?.pickProjectFile) {
      const picked = await window.electronAPI.pickProjectFile({ title: 'Wybierz plik projektu (animegate-project.json)' })
      if (!picked.canceled && picked.filePath) {
        setOpenProjectPath(picked.filePath)
        return
      }
    }
    if (!window.electronAPI?.pickProjectDirectory) return
    const fallback = await window.electronAPI.pickProjectDirectory({ title: 'Wybierz folder istniejącego projektu' })
    if (fallback.canceled || !fallback.directoryPath) return
    setOpenProjectPath(fallback.directoryPath)
  }

  const openDiskProjectByPath = async (projectPath: string): Promise<void> => {
    if (!window.electronAPI?.openProject) return
    const normalizedPath = projectPath.trim()
    if (!normalizedPath) {
      setProjectStepStatus('Wybierz plik lub folder istniejącego projektu.')
      return
    }
    const result = await window.electronAPI.openProject(normalizedPath)
    hydrateFromDiskProject(result.config, result.projectDir, result.configPath)
  }

  const handleCreateDiskProject = async (): Promise<void> => {
    if (!window.electronAPI?.createProject || !window.electronAPI?.openProject) return
    const title = newProjectTitle.trim()
    if (!title) {
      setProjectStepStatus('Podaj tytul projektu.')
      return
    }
    if (!newProjectBaseDir.trim()) {
      setProjectStepStatus('Wybierz folder bazowy projektu.')
      return
    }
    const projectId = sanitizeProjectId(title) || `project_${Date.now()}`
    try {
      const initial = buildDiskProjectConfig('', '', projectId, title)
      const result = await window.electronAPI.createProject({
        title,
        projectId,
        parentDir: newProjectBaseDir,
        initialConfig: {
          ...initial,
          schemaVersion: PROJECT_SCHEMA_VERSION,
          projectId,
          title,
        },
      })
      // Verify persisted config by opening it again from disk.
      const reopened = await window.electronAPI.openProject(result.projectDir)
      hydrateFromDiskProject(reopened.config, reopened.projectDir, reopened.configPath)
      setNewProjectTitle('')
      setOpenProjectPath('')
      setCharactersOpen(true)
      setProjectStepStatus(`Utworzono i aktywowano projekt: ${title}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie utworzyc projektu.'
      setProjectStepStatus(`BLAD tworzenia projektu: ${message}`)
    }
  }

  const handleLoadDiskProjectFromButton = async (): Promise<void> => {
    if (!window.electronAPI?.openProject) return
    try {
      let selectedPath = ''
      if (window.electronAPI?.pickProjectFile) {
        const picked = await window.electronAPI.pickProjectFile({ title: 'Wybierz plik projektu (animegate-project.json)' })
        if (!picked.canceled && picked.filePath) {
          selectedPath = picked.filePath
        }
      }
      if (!selectedPath) {
        if (!window.electronAPI?.pickProjectDirectory) return
        const fallback = await window.electronAPI.pickProjectDirectory({ title: 'Wybierz folder istniejącego projektu' })
        if (fallback.canceled || !fallback.directoryPath) return
        selectedPath = fallback.directoryPath
      }
      setOpenProjectPath(selectedPath)
      await openDiskProjectByPath(selectedPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie wczytac projektu.'
      setProjectStepStatus(`BLAD wczytywania projektu: ${message}`)
      setProjectStepOpen(true)
    }
  }

  const handleOpenDiskProject = async (): Promise<void> => {
    try {
      await openDiskProjectByPath(openProjectPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie otworzyc projektu.'
      setProjectStepStatus(`BLAD otwierania projektu: ${message}`)
    }
  }

  const handleEnterProjectStep = (): void => {
    setActiveDiskProject(null)
    resetSubtitleWorkspaceState()
    setAssignmentImageCacheByName({})
    setActiveAssignmentCharacter('')
    setRecentCharacterHistory([])
    setStyleSettings(createProjectStyleSettings(currentProjectId, []))
    setProjectStepStatus('Wybierz lub utworz projekt, aby zapisac ustawienia na dysku.')
    setProjectStepOpen(true)
  }

  const handleOpenCharactersModal = (): void => {
    if (!activeDiskProject) {
      setProjectStepStatus('Najpierw wykonaj Krok 0: utworz lub otworz projekt.')
      setProjectStepOpen(true)
      return
    }
    setCharactersOpen(true)
  }

  const appendTranslationLog = (message: string): void => {
    const stamp = new Date().toLocaleTimeString()
    setTranslationLogs(prev => [`[${stamp}] ${message}`, ...prev].slice(0, 20))
  }

  const applyCharacterToSelectedLines = (characterName: string): void => {
    const normalizedCharacterName = characterName.trim()
    if (!normalizedCharacterName) return
    if (selectedLineIds.size === 0) {
      appendTranslationLog('Brak zaznaczonych linii do przypisania postaci.')
      return
    }
    setRowsData(prev => {
      const nextRows = prev.map(row => (
        selectedLineIds.has(row.id)
          ? { ...row, character: normalizedCharacterName }
          : row
      ))
      const nextAssignments = buildProjectLineAssignments(nextRows, rawCharacter => (
        resolveCharacterForLineName(rawCharacter, styleSettings.characters)?.name ?? rawCharacter
      ))
      setProjectLineAssignments(nextAssignments)
      return nextRows
    })
    setActiveAssignmentCharacter(normalizedCharacterName)
    setRecentCharacterHistory(prev => [
      normalizedCharacterName,
      ...prev.filter(item => normalizeCharacterName(item) !== normalizeCharacterName(normalizedCharacterName)),
    ].slice(0, 10))
    appendTranslationLog(`Przypisano postac "${normalizedCharacterName}" do ${selectedLineIds.size} linii.`)
  }

  const clearCharacterFromSelectedLines = (): void => {
    if (selectedLineIds.size === 0) {
      appendTranslationLog('Brak zaznaczonych linii do wyczyszczenia postaci.')
      return
    }
    setRowsData(prev => {
      const nextRows = prev.map(row => (
        selectedLineIds.has(row.id)
          ? { ...row, character: '' }
          : row
      ))
      const nextAssignments = buildProjectLineAssignments(nextRows, rawCharacter => (
        resolveCharacterForLineName(rawCharacter, styleSettings.characters)?.name ?? rawCharacter
      ))
      setProjectLineAssignments(nextAssignments)
      return nextRows
    })
    setActiveAssignmentCharacter('')
    appendTranslationLog(`Wyczyszczono przypisanie postaci dla ${selectedLineIds.size} linii.`)
  }

  useEffect(() => {
    const handleSuggestionShortcuts = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (isApiOpen || isCharactersOpen || isMemoryOpen || isGenderCorrectionOpen || isProjectStepOpen) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase() ?? ''
      const isTypingContext = tag === 'input'
        || tag === 'textarea'
        || target?.isContentEditable
      if (isTypingContext) return
      const index = event.key === '1' ? 0 : event.key === '2' ? 1 : event.key === '3' ? 2 : -1
      if (index < 0 || index >= assignmentSuggestions.length) return
      event.preventDefault()
      applyCharacterToSelectedLines(assignmentSuggestions[index].name)
    }

    window.addEventListener('keydown', handleSuggestionShortcuts)
    return () => window.removeEventListener('keydown', handleSuggestionShortcuts)
  }, [
    assignmentSuggestions,
    isApiOpen,
    isCharactersOpen,
    isMemoryOpen,
    isGenderCorrectionOpen,
    isProjectStepOpen,
    selectedLineIds,
    rowsData,
  ])

  const resolveMemoryTranslation = (row: DialogRow): string | null => {
    const exactMemory = memoryStore.entries
      .filter(entry => entry.projectId === currentProjectId && entry.source === row.source)
      .sort((a, b) => b.usageCount - a.usageCount)[0]
    if (!exactMemory?.target) return null
    if (normalizeForComparison(exactMemory.target) === normalizeForComparison(row.source)) return null
    return exactMemory.target
  }

  class ProviderError extends Error {
    code: string

    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  }

  const [providerId, ...modelParts] = selectedModelId.split(':')
  const selectedModelName = modelParts.join(':')

  const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number, externalSignal: AbortSignal): Promise<Response> => {
    const toHeaderMap = (headers?: HeadersInit): Record<string, string> => {
      if (!headers) return {}
      if (headers instanceof Headers) {
        const mapped: Record<string, string> = {}
        headers.forEach((value, key) => { mapped[key] = value })
        return mapped
      }
      if (Array.isArray(headers)) return Object.fromEntries(headers)
      return headers
    }

    const serializeBody = (body: BodyInit | null | undefined): string | undefined => {
      if (body == null) return undefined
      if (typeof body === 'string') return body
      if (body instanceof URLSearchParams) return body.toString()
      return String(body)
    }

    if (window.electronAPI?.apiRequest) {
      if (externalSignal.aborted) {
        throw new ProviderError('cancelled', 'Tlumaczenie zatrzymane przez uzytkownika.')
      }
      const result = await window.electronAPI.apiRequest({
        url,
        method: init.method ?? 'GET',
        headers: toHeaderMap(init.headers),
        body: serializeBody(init.body),
        timeoutMs,
      })
      if (externalSignal.aborted) {
        throw new ProviderError('cancelled', 'Tlumaczenie zatrzymane przez uzytkownika.')
      }
      if (result.error) {
        const details = result.error.details ? ` (${result.error.details})` : ''
        throw new ProviderError(result.error.code || 'network', `${result.error.message}${details}`)
      }
      return new Response(result.body, {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
      })
    }

    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), timeoutMs)
    const cancel = () => timeout.abort()
    externalSignal.addEventListener('abort', cancel, { once: true })
    try {
      return await fetch(url, { ...init, signal: timeout.signal })
    } catch (error) {
      if (externalSignal.aborted) {
        throw new ProviderError('cancelled', 'Tlumaczenie zatrzymane przez uzytkownika.')
      }
      if (timeout.signal.aborted) {
        throw new ProviderError('timeout', 'Przekroczono limit czasu zapytania do silnika.')
      }
      throw error
    } finally {
      clearTimeout(timer)
      externalSignal.removeEventListener('abort', cancel)
    }
  }

  const mapDeeplLang = (lang: string): string => {
    const upper = lang.toUpperCase()
    if (upper === 'EN') return 'EN'
    if (upper === 'PL') return 'PL'
    if (upper === 'DE') return 'DE'
    if (upper === 'JA') return 'JA'
    if (upper === 'FR') return 'FR'
    if (upper === 'ES') return 'ES'
    if (upper === 'IT') return 'IT'
    if (upper === 'PT') return 'PT-PT'
    if (upper === 'RU') return 'RU'
    if (upper === 'TR') return 'TR'
    throw new ProviderError('unsupported-language', `DeepL nie wspiera jezyka: ${lang}`)
  }

  const normalizeSimpleLang = (lang: string): string => lang.trim().toLowerCase()
  const resolveModelForProvider = (provider: string, override?: string): string => {
    if (override) return override
    if (provider === providerId && selectedModelName) return selectedModelName
    const providerMeta = API_PROVIDERS.find(item => item.id === provider)
    return providerMeta?.modelOptions?.[0] ?? ''
  }

  const ensureSupportedLanguagePair = (provider: string, source: string, target: string): void => {
    const src = source.toLowerCase()
    const tgt = target.toLowerCase()
    const baseSupported = new Set(['en', 'ja', 'de', 'pl', 'fr', 'es', 'it', 'pt', 'ru', 'tr', 'zh', 'ko', 'uk', 'nl', 'sv'])
    const sourceSupported = provider === 'deepl' && src === 'auto' ? true : baseSupported.has(src)
    if (!sourceSupported || !baseSupported.has(tgt)) {
      throw new ProviderError('unsupported-language-pair', `Nieobslugiwany jezyk w parze ${source}->${target}`)
    }
    if (provider === 'deepl') {
      // Mapowanie weryfikowane dodatkowo przez mapDeeplLang
      mapDeeplLang(source)
      mapDeeplLang(target)
    }
    if (provider === 'papago') {
      const papagoSupported = new Set(['ko', 'en', 'ja', 'zh', 'zh-cn', 'zh-tw', 'es', 'fr', 'vi', 'th', 'id', 'de', 'ru', 'it'])
      if (!papagoSupported.has(src) || !papagoSupported.has(tgt)) {
        throw new ProviderError('unsupported-language-pair', `Papago nie wspiera pary ${source}->${target}`)
      }
    }
  }

  const ensureProviderReady = (provider: string): string => {
    const key = (apiConfig[provider] ?? '').trim()
    const requiresKey = !['libre', 'mymemory'].includes(provider)
    if (requiresKey && !key) {
      throw new ProviderError('missing-api-key', `Brak klucza API dla providera: ${provider}`)
    }
    return key
  }

  const translateViaMyMemory = async (text: string, source: string, target: string, signal: AbortSignal): Promise<string> => {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(source)}|${encodeURIComponent(target)}`
    const response = await fetchWithTimeout(url, {}, 12000, signal)
    if (!response.ok) throw new ProviderError('http-error', `MyMemory HTTP ${response.status}`)
    const data = await response.json() as { responseData?: { translatedText?: string }; responseStatus?: number; responseDetails?: string }
    if ((data.responseStatus ?? 200) >= 400) {
      throw new ProviderError('provider-error', data.responseDetails || 'MyMemory zwrocil blad')
    }
    const translated = data.responseData?.translatedText?.trim()
    if (!translated) throw new ProviderError('empty-response', 'MyMemory zwrocil pusta odpowiedz')
    return translated
  }

  const translateViaLibre = async (text: string, source: string, target: string, signal: AbortSignal): Promise<string> => {
    const response = await fetchWithTimeout('https://translate.argosopentech.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source,
        target,
        format: 'text',
      }),
    }, 12000, signal)
    if (!response.ok) throw new ProviderError('http-error', `Libre HTTP ${response.status}`)
    const data = await response.json() as { translatedText?: string; error?: string }
    if (data.error) throw new ProviderError('provider-error', data.error)
    const translated = data.translatedText?.trim()
    if (!translated) throw new ProviderError('empty-response', 'Libre zwrocil pusta odpowiedz')
    return translated
  }

  const parseRetryAfterMs = (headerValue: string | null): number => {
    if (!headerValue) return 0
    const seconds = Number(headerValue)
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000)
    }
    const dateMs = Date.parse(headerValue)
    if (Number.isFinite(dateMs)) {
      return Math.max(0, dateMs - Date.now())
    }
    return 0
  }

  const mapStyleToDeepLFormality = (context?: TranslationRequestContext): string | null => {
    if (!context) return null
    if (targetLang.toLowerCase() !== 'pl') return null
    if (context.effectiveStyle === 'formal') return 'prefer_more'
    if (context.effectiveStyle === 'less_formal' || context.effectiveStyle === 'casual') return 'prefer_less'
    return 'default'
  }

  const translateViaDeepL = async (
    text: string,
    source: string,
    target: string,
    signal: AbortSignal,
    opts?: { sourceOverride?: string },
    context?: TranslationRequestContext,
  ): Promise<string> => {
    const key = ensureProviderReady('deepl')
    const chosenSource = opts?.sourceOverride ?? source
    const targetLang = mapDeeplLang(target)
    const body = new URLSearchParams({ text, target_lang: targetLang })
    const formality = mapStyleToDeepLFormality(context)
    if (formality) {
      body.set('formality', formality)
    }
    if (context?.previousLineContinuation) {
      body.set('context', `Previous subtitle line: ${context.previousLineContinuation}`)
    }
    if (chosenSource && chosenSource.toLowerCase() !== 'auto') {
      body.set('source_lang', mapDeeplLang(chosenSource))
    }
    const response = await fetchWithTimeout('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    }, 15000, signal)
    if (response.status === 403) throw new ProviderError('invalid-api-key', 'DeepL odrzucil klucz API (403).')
    if (response.status === 456) throw new ProviderError('quota-exceeded', 'DeepL: przekroczony limit / quota (456).')
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'))
      const suffix = retryAfterMs > 0 ? ` Retry-After: ${Math.ceil(retryAfterMs / 1000)}s.` : ''
      throw new ProviderError('rate-limit', `DeepL HTTP 429.${suffix}`)
    }
    if (!response.ok) throw new ProviderError('http-error', `DeepL HTTP ${response.status}`)
    const data = await response.json() as { translations?: Array<{ text?: string }> }
    const translated = data.translations?.[0]?.text?.trim()
    if (!translated) throw new ProviderError('empty-response', 'DeepL zwrocil pusta odpowiedz')
    return translated
  }

  const translateViaDeepLBatch = async (
    texts: string[],
    source: string,
    target: string,
    signal: AbortSignal,
    opts?: { sourceOverride?: string },
    context?: TranslationRequestContext,
  ): Promise<string[]> => {
    if (!texts.length) return []
    const key = ensureProviderReady('deepl')
    const chosenSource = opts?.sourceOverride ?? source
    const targetLang = mapDeeplLang(target)
    const body = new URLSearchParams()
    body.set('target_lang', targetLang)
    const formality = mapStyleToDeepLFormality(context)
    if (formality) {
      body.set('formality', formality)
    }
    if (chosenSource && chosenSource.toLowerCase() !== 'auto') {
      body.set('source_lang', mapDeeplLang(chosenSource))
    }
    texts.forEach(text => body.append('text', text))

    const response = await fetchWithTimeout('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    }, 20000, signal)

    if (response.status === 403) throw new ProviderError('invalid-api-key', 'DeepL odrzucil klucz API (403).')
    if (response.status === 456) throw new ProviderError('quota-exceeded', 'DeepL: przekroczony limit / quota (456).')
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'))
      const suffix = retryAfterMs > 0 ? ` Retry-After: ${Math.ceil(retryAfterMs / 1000)}s.` : ''
      throw new ProviderError('rate-limit', `DeepL HTTP 429.${suffix}`)
    }
    if (!response.ok) throw new ProviderError('http-error', `DeepL HTTP ${response.status}`)
    const data = await response.json() as { translations?: Array<{ text?: string }> }
    const out = (data.translations ?? []).map(item => item.text?.trim() ?? '')
    if (out.length !== texts.length) {
      throw new ProviderError('provider-error', `DeepL batch zwrocil ${out.length}/${texts.length} wynikow.`)
    }
    return out
  }

  const extractOpenAiLikeText = (payload: unknown): string => {
    const data = payload as { choices?: Array<{ message?: { content?: string } }> }
    return data.choices?.[0]?.message?.content?.trim() ?? ''
  }

  const styleDirective = (style: TranslationStyleId): string => {
    if (style === 'formal') {
      return 'Use a formal, polite, and orderly tone. Avoid slang. Prioritize refined phrasing.'
    }
    if (style === 'less_formal') {
      return 'Use a moderately informal, natural spoken tone. Keep it polite, but not stiff.'
    }
    if (style === 'casual') {
      return 'Use a casual, colloquial, natural tone. Avoid rigid literal phrasing.'
    }
    return 'Use a neutral, natural subtitle tone.'
  }

  const buildSystemPrompt = (source: string, target: string, context?: TranslationRequestContext): string => [
    `Translate subtitle line from ${source} to ${target}.`,
    'Return only final translation text, without notes.',
    'Prioritize natural subtitle phrasing over literal word-for-word calques.',
    'Keep subtitle readability and speaking rhythm.',
    'Style priority: manual character fields (Krok 3) > user character notes (Krok 2) > character type/subtype > saved project fields > auto analysis > character gender > global style base.',
    context?.characterName ? `Character: ${context.characterName}` : '',
    context?.gender ? `Character gender: ${context.gender}` : '',
    context?.effectiveStyle ? `Active style: ${context.effectiveStyle} (${context.effectiveStyleSource})` : '',
    context?.effectiveStyle ? `Style directive: ${styleDirective(context.effectiveStyle)}` : '',
    context?.archetypeLabel ? `Character archetype: ${context.archetypeLabel} (${context.archetype})` : '',
    context?.archetypeToneRule ? `Archetype tone rule: ${context.archetypeToneRule}` : '',
    context?.characterTypeLabel ? `Character type (PL): ${context.characterTypeLabel} (${context.characterTypeId})` : '',
    context?.characterSubtypeLabel ? `Character subtype (PL): ${context.characterSubtypeLabel} (${context.characterSubtypeId})` : '',
    context?.characterSubtypePrompt ? `Character type/subtype directive:\n${context.characterSubtypePrompt}` : '',
    context?.characterUserNotes ? `User character notes (PL): ${context.characterUserNotes}` : '',
    context?.previousLineContinuation
      ? 'Sentence continuity: previous subtitle line ends with continuation punctuation. Treat current line as continuation of the same sentence.'
      : '',
    context?.previousLineContinuation ? `Previous line context: ${context.previousLineContinuation}` : '',
    (context?.speakingTraits || context?.characterNote) ? 'Manual character fields have highest priority over type/subtype suggestions.' : '',
    context?.speakingTraits ? `Additional speaking traits: ${context.speakingTraits}` : '',
    context?.characterNote ? `Character note to respect: ${context.characterNote}` : '',
    context?.styleContext ? `Style context:\n${context.styleContext}` : '',
  ].filter(Boolean).join('\n')

  const translateViaOpenAiCompatible = async (
    endpoint: string,
    apiKey: string,
    model: string,
    text: string,
    source: string,
    target: string,
    signal: AbortSignal,
    context?: TranslationRequestContext,
    extraHeaders?: Record<string, string>,
  ): Promise<string> => {
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: buildSystemPrompt(source, target, context) },
          { role: 'user', content: text },
        ],
      }),
    }, 20000, signal)
    if (response.status === 401 || response.status === 403) throw new ProviderError('invalid-api-key', `Autoryzacja nieudana (HTTP ${response.status}).`)
    if (response.status === 429) throw new ProviderError('rate-limit', 'Przekroczony limit zapytan (429).')
    if (!response.ok) throw new ProviderError('http-error', `HTTP ${response.status}`)
    const data = await response.json()
    const translated = extractOpenAiLikeText(data)
    if (!translated) throw new ProviderError('empty-response', 'Silnik zwrocil pusta odpowiedz.')
    return translated
  }

  const translateViaOpenAi = async (text: string, source: string, target: string, signal: AbortSignal, modelOverride?: string, context?: TranslationRequestContext): Promise<string> => {
    const key = ensureProviderReady('openai')
    const model = resolveModelForProvider('openai', modelOverride) || 'gpt-4o-mini'
    return translateViaOpenAiCompatible('https://api.openai.com/v1/chat/completions', key, model, text, source, target, signal, context)
  }

  const translateViaOpenRouter = async (text: string, source: string, target: string, signal: AbortSignal, modelOverride?: string, context?: TranslationRequestContext): Promise<string> => {
    const key = ensureProviderReady('openrouter')
    const model = resolveModelForProvider('openrouter', modelOverride) || 'openai/gpt-4o-mini'
    return translateViaOpenAiCompatible(
      'https://openrouter.ai/api/v1/chat/completions',
      key,
      model,
      text,
      source,
      target,
      signal,
      context,
      { 'HTTP-Referer': 'https://animegate.local', 'X-Title': 'AnimeGate Translator' },
    )
  }

  const translateViaGroq = async (text: string, source: string, target: string, signal: AbortSignal, modelOverride?: string, context?: TranslationRequestContext): Promise<string> => {
    const key = ensureProviderReady('groq')
    const model = resolveModelForProvider('groq', modelOverride) || 'llama-3.3-70b-versatile'
    return translateViaOpenAiCompatible('https://api.groq.com/openai/v1/chat/completions', key, model, text, source, target, signal, context)
  }

  const translateViaTogether = async (text: string, source: string, target: string, signal: AbortSignal, modelOverride?: string, context?: TranslationRequestContext): Promise<string> => {
    const key = ensureProviderReady('together')
    const model = resolveModelForProvider('together', modelOverride) || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'
    return translateViaOpenAiCompatible('https://api.together.xyz/v1/chat/completions', key, model, text, source, target, signal, context)
  }

  const translateViaMistral = async (text: string, source: string, target: string, signal: AbortSignal, modelOverride?: string, context?: TranslationRequestContext): Promise<string> => {
    const key = ensureProviderReady('mistral')
    const model = resolveModelForProvider('mistral', modelOverride) || 'mistral-small-latest'
    return translateViaOpenAiCompatible('https://api.mistral.ai/v1/chat/completions', key, model, text, source, target, signal, context)
  }

  const translateViaClaude = async (text: string, source: string, target: string, signal: AbortSignal, context?: TranslationRequestContext): Promise<string> => {
    const key = ensureProviderReady('claude')
    const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_LOCKED_MODEL,
        max_tokens: 1024,
        temperature: 0.1,
        system: buildSystemPrompt(source, target, context),
        messages: [{ role: 'user', content: text }],
      }),
    }, 20000, signal)
    if (response.status === 401 || response.status === 403) throw new ProviderError('invalid-api-key', `Claude: autoryzacja nieudana (HTTP ${response.status}).`)
    if (response.status === 429) throw new ProviderError('rate-limit', 'Claude: przekroczony limit zapytan (429).')
    if (!response.ok) throw new ProviderError('http-error', `Claude HTTP ${response.status}`)
    const data = await response.json() as { content?: Array<{ type?: string; text?: string }> }
    const translated = data.content?.find(part => part.type === 'text')?.text?.trim() ?? ''
    if (!translated) throw new ProviderError('empty-response', 'Claude zwrocil pusta odpowiedz')
    return translated
  }

  const translateViaGemini = async (text: string, source: string, target: string, signal: AbortSignal, modelOverride?: string, context?: TranslationRequestContext): Promise<string> => {
    const key = ensureProviderReady('gemini')
    const model = resolveModelForProvider('gemini', modelOverride) || 'gemini-2.0-flash'
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${buildSystemPrompt(source, target, context)}\n\n${text}` }] }],
        generationConfig: { temperature: 0.1 },
      }),
    }, 20000, signal)
    if (response.status === 400) throw new ProviderError('invalid-request', 'Gemini: bledny request (400).')
    if (response.status === 401 || response.status === 403) throw new ProviderError('invalid-api-key', `Gemini: autoryzacja nieudana (HTTP ${response.status}).`)
    if (response.status === 429) throw new ProviderError('rate-limit', 'Gemini: przekroczony limit zapytan (429).')
    if (!response.ok) throw new ProviderError('http-error', `Gemini HTTP ${response.status}`)
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const translated = data.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('').trim() ?? ''
    if (!translated) throw new ProviderError('empty-response', 'Gemini zwrocil pusta odpowiedz')
    return translated
  }

  const translateViaCohere = async (text: string, source: string, target: string, signal: AbortSignal, modelOverride?: string, context?: TranslationRequestContext): Promise<string> => {
    const key = ensureProviderReady('cohere')
    const model = resolveModelForProvider('cohere', modelOverride) || 'command-r'
    const response = await fetchWithTimeout('https://api.cohere.com/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        preamble: buildSystemPrompt(source, target, context),
        message: text,
      }),
    }, 20000, signal)
    if (response.status === 401 || response.status === 403) throw new ProviderError('invalid-api-key', `Cohere: autoryzacja nieudana (HTTP ${response.status}).`)
    if (response.status === 429) throw new ProviderError('rate-limit', 'Cohere: przekroczony limit zapytan (429).')
    if (!response.ok) throw new ProviderError('http-error', `Cohere HTTP ${response.status}`)
    const data = await response.json() as { text?: string }
    const translated = data.text?.trim() ?? ''
    if (!translated) throw new ProviderError('empty-response', 'Cohere zwrocil pusta odpowiedz')
    return translated
  }

  const translateViaGoogleV2 = async (text: string, source: string, target: string, signal: AbortSignal): Promise<string> => {
    const key = ensureProviderReady('google')
    const endpoint = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: normalizeSimpleLang(source),
        target: normalizeSimpleLang(target),
        format: 'text',
      }),
    }, 18000, signal)
    if (response.status === 401 || response.status === 403) throw new ProviderError('invalid-api-key', `Google v2: autoryzacja nieudana (HTTP ${response.status}).`)
    if (response.status === 429) throw new ProviderError('rate-limit', 'Google v2: przekroczony limit zapytan (429).')
    if (!response.ok) throw new ProviderError('http-error', `Google v2 HTTP ${response.status}`)
    const data = await response.json() as { data?: { translations?: Array<{ translatedText?: string }> } }
    const translated = data.data?.translations?.[0]?.translatedText?.trim() ?? ''
    if (!translated) throw new ProviderError('empty-response', 'Google v2 zwrocil pusta odpowiedz')
    return translated
  }

  const translateViaAzureOpenAI = async (): Promise<string> => {
    throw new ProviderError(
      'missing-config',
      'Azure OpenAI wymaga endpointu i deploymentu. Dodaj te pola w konfiguracji providera.',
    )
  }

  const translateViaPapago = async (): Promise<string> => {
    throw new ProviderError(
      'missing-config',
      'Papago wymaga Client ID + Client Secret (nie pojedynczego klucza).',
    )
  }

  const translateViaYandex = async (): Promise<string> => {
    throw new ProviderError(
      'missing-config',
      'Yandex wymaga API key oraz folder_id / IAM token zależnie od trybu.',
    )
  }

  const translateViaEngine = async (text: string, source: string, target: string, signal: AbortSignal, context?: TranslationRequestContext): Promise<string> => {
    if (!text.trim()) return ''
    if (source === target) return text
    ensureSupportedLanguagePair(providerId, source, target)
    if (providerId === 'mymemory') return translateViaMyMemory(text, source, target, signal)
    if (providerId === 'libre') return translateViaLibre(text, source, target, signal)
    if (providerId === 'deepl') return translateViaDeepL(text, source, target, signal, undefined, context)
    if (providerId === 'openai') return translateViaOpenAi(text, source, target, signal, undefined, context)
    if (providerId === 'openrouter') return translateViaOpenRouter(text, source, target, signal, undefined, context)
    if (providerId === 'groq') return translateViaGroq(text, source, target, signal, undefined, context)
    if (providerId === 'together') return translateViaTogether(text, source, target, signal, undefined, context)
    if (providerId === 'mistral') return translateViaMistral(text, source, target, signal, undefined, context)
    if (providerId === 'claude') return translateViaClaude(text, source, target, signal, context)
    if (providerId === 'gemini') return translateViaGemini(text, source, target, signal, undefined, context)
    if (providerId === 'cohere') return translateViaCohere(text, source, target, signal, undefined, context)
    if (providerId === 'google') return translateViaGoogleV2(text, source, target, signal)
    if (providerId === 'azure') return translateViaAzureOpenAI()
    if (providerId === 'papago') return translateViaPapago()
    if (providerId === 'yandex') return translateViaYandex()

    ensureProviderReady(providerId)
    throw new ProviderError(
      'provider-not-implemented',
      `Provider ${providerId} ma zapisany klucz, ale nie jest jeszcze podlaczony do requestu tłumaczenia.`,
    )
  }

  const isSuspiciousTranslation = (sourceText: string, translated: string, source: string, target: string): boolean => {
    if (source === target) return false
    const left = normalizeForComparison(stripAssFormatting(sourceText))
    const right = normalizeForComparison(stripAssFormatting(translated))
    if (!left || left.length < 9) return false
    return left === right
  }

  const waitWithAbort = (ms: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new ProviderError('cancelled', 'Tlumaczenie zatrzymane przez uzytkownika.'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new ProviderError('cancelled', 'Tlumaczenie zatrzymane przez uzytkownika.'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })

  const waitDuringRun = async (ms: number): Promise<void> => {
    let remaining = ms
    while (remaining > 0) {
      if (stopTranslationRef.current) {
        throw new ProviderError('cancelled', 'Tlumaczenie zatrzymane przez uzytkownika.')
      }
      const slice = Math.min(250, remaining)
      await new Promise(resolve => setTimeout(resolve, slice))
      remaining -= slice
    }
  }

  const lineHasTranslatableContent = (row: DialogRow): boolean => {
    return hasTranslatableAssText(row.sourceRaw || row.source)
  }

  const lineHasTranslatedContent = (row: DialogRow | undefined): boolean => {
    if (!row) return false
    const plain = stripAssFormatting(row.target ?? '').trim()
    if (plain.length > 0) return true
    const tokens = tokenizeSubtitleText(row.target ?? '')
    return tokens.some(token => token.type === 'text' && token.value.trim())
  }

  const checksumFromPairs = (pairs: Array<[number, string]>): string => {
    let hash = 0
    const joined = pairs
      .map(([id, value]) => `${id}:${normalizeForComparison(stripAssFormatting(value))}`)
      .join('|')
    for (let i = 0; i < joined.length; i += 1) {
      hash = ((hash << 5) - hash + joined.charCodeAt(i)) | 0
    }
    return `CHK-${Math.abs(hash)}`
  }

  const getProviderBaseDelayMs = (): number => {
    if (providerId === 'deepl') return 650
    return 120
  }

  const deriveRetryDelayMs = (error: ProviderError, fallbackDelayMs: number): number => {
    if (error.code !== 'rate-limit') return fallbackDelayMs
    const match = error.message.match(/Retry-After:\s*(\d+)s/i)
    if (!match) return fallbackDelayMs
    const retryAfterSec = Number(match[1] ?? '0')
    if (!Number.isFinite(retryAfterSec) || retryAfterSec <= 0) return fallbackDelayMs
    return Math.max(fallbackDelayMs, retryAfterSec * 1000)
  }

  const translateSubtitleLinePreservingTags = async (
    sourceText: string,
    source: string,
    target: string,
    signal: AbortSignal,
    context: TranslationRequestContext,
    translator: TranslatorFn = translateViaEngine,
  ): Promise<string> => {
    const tokens = tokenizeSubtitleText(sourceText)
    if (!tokens.length) return sourceText
    if (!tokens.some(token => token.type === 'text' && token.value.trim())) {
      return sourceText
    }

    const parts: string[] = []
    for (const token of tokens) {
      if (token.type === 'tag') {
        parts.push(token.value)
        continue
      }
      if (!token.value.trim()) {
        parts.push(token.value)
        continue
      }
      const translatedChunk = await translator(token.value, source, target, signal, context)
      if (!translatedChunk.trim()) {
        throw new ProviderError('empty-response', 'Silnik zwrocil pusty fragment tlumaczenia.')
      }
      parts.push(translatedChunk)
    }

    return parts.join('')
  }

  const translateSingleRow = async (row: DialogRow, mode: 'primary' | 'fallback' = 'primary'): Promise<TranslationAttemptResult> => {
    const fromMemory = resolveMemoryTranslation(row)
    if (fromMemory && mode === 'primary') return { translated: fromMemory, requiresManualCheck: false }
    if (isNonTranslatableProperNounLine(row.sourceRaw || row.source)) {
      appendTranslationLog(`Linia ${row.id}: wykryto nazwe wlasna/special term — pomijam silnik i oznaczam do recznego sprawdzenia.`)
      return {
        translated: row.source.trim(),
        requiresManualCheck: true,
      }
    }
    const rowIndex = rowsData.findIndex(item => item.id === row.id)
    const previousRow = rowIndex > 0 ? rowsData[rowIndex - 1] : null
    const previousLineContinuation = previousRow
      ? buildContinuationContextFromPreviousLine(previousRow.sourceRaw || previousRow.source)
      : ''
    const baseContext = getTranslationContextForRow(row)
    const context = previousLineContinuation
      ? { ...baseContext, previousLineContinuation }
      : baseContext
    const controller = new AbortController()
    activeTranslationAbortRef.current = controller
    const backoffMs = [2000, 5000, 9000, 14000]
    let translated = ''
    const fallbackTranslator: TranslatorFn = async (text, _source, target, signal, _ctx) => {
      try {
        return await translateViaLibre(text, 'auto', target, signal)
      } catch {
        return translateViaMyMemory(text, 'auto', target, signal)
      }
    }

    for (let attempt = 0; attempt <= backoffMs.length; attempt += 1) {
      try {
        const waitMs = providerCooldownUntilRef.current - Date.now()
        if (waitMs > 0) {
          appendTranslationLog(`Czekam ${Math.ceil(waitMs / 1000)}s na odblokowanie limitu providera...`)
          await waitWithAbort(waitMs, controller.signal)
        }
        // Przekazujemy sourceRaw — zachowuje tagi ASS i \N dla translateSubtitleLinePreservingTags
        const textForTranslation = row.sourceRaw || row.source
        if (mode === 'fallback') {
          translated = await translateSubtitleLinePreservingTags(
            textForTranslation,
            'auto',
            targetLang,
            controller.signal,
            context,
            fallbackTranslator,
          )
        } else {
          translated = await translateSubtitleLinePreservingTags(textForTranslation, sourceLang, targetLang, controller.signal, context)
          if (providerId === 'deepl' && isSuspiciousTranslation(textForTranslation, translated, sourceLang, targetLang)) {
            translated = await translateSubtitleLinePreservingTags(textForTranslation, 'auto', targetLang, controller.signal, context)
          }
        }
        break
      } catch (error) {
        const isRetryable = error instanceof ProviderError
          && (error.code === 'rate-limit' || error.code === 'timeout' || error.code === 'network' || error.code.startsWith('econn'))
        if (!isRetryable || attempt >= backoffMs.length) {
          if (mode === 'primary' && providerId === 'deepl' && error instanceof ProviderError && error.code === 'rate-limit') {
            const textForFallback = row.sourceRaw || row.source
            appendTranslationLog(`DeepL limit dla linii ${row.id}. Probuję fallback LibreTranslate.`)
            try {
              translated = await translateSubtitleLinePreservingTags(
                textForFallback,
                'auto',
                targetLang,
                controller.signal,
                context,
                async (chunkText, _source, target, signal) => translateViaLibre(chunkText, 'auto', target, signal),
              )
              break
            } catch (fallbackError) {
              appendTranslationLog(`Fallback Libre nieudany dla linii ${row.id}. Probuję MyMemory.`)
              try {
                translated = await translateSubtitleLinePreservingTags(
                  textForFallback,
                  'auto',
                  targetLang,
                  controller.signal,
                  context,
                  async (chunkText, _source, target, signal) => translateViaMyMemory(chunkText, 'auto', target, signal),
                )
                break
              } catch {
                activeTranslationAbortRef.current = null
                throw error
              }
            }
          }
          activeTranslationAbortRef.current = null
          throw error
        }
        const delay = error instanceof ProviderError
          ? deriveRetryDelayMs(error, backoffMs[attempt])
          : backoffMs[attempt]
        if (error instanceof ProviderError && error.code === 'rate-limit') {
          providerCooldownUntilRef.current = Date.now() + delay
        }
        appendTranslationLog(`Retry linii ${row.id} (${attempt + 1}/${backoffMs.length}) po bledzie: ${error.message}`)
        await waitWithAbort(delay, controller.signal)
      }
    }
    activeTranslationAbortRef.current = null
    if (!translated) {
      throw new Error(`Brak odpowiedzi silnika (${sourceLang}->${targetLang})`)
    }
    translated = applyTranslationStyleLocally(translated, targetLang, context)
    if (context.gender !== 'Unknown') {
      translated = applyGenderCorrectionLocally(translated, context.gender)
    }
    if (isSuspiciousTranslation(row.sourceRaw || row.source, translated, sourceLang, targetLang)) {
      appendTranslationLog(`Linia ${row.id}: wynik podejrzany (identyczny z oryginalem, ${sourceLang}->${targetLang})`)
    }
    return { translated, requiresManualCheck: false }
  }

  const testProviderConnection = async (provider: string): Promise<string> => {
    const controller = new AbortController()
    try {
      if (provider === 'mymemory') {
        const out = await translateViaMyMemory('Hello world.', 'en', 'pl', controller.signal)
        return `OK: ${out}`
      }
      if (provider === 'libre') {
        const out = await translateViaLibre('Hello world.', 'en', 'pl', controller.signal)
        return `OK: ${out}`
      }
      if (provider === 'deepl') {
        const out = await translateViaDeepL('Hello world.', 'en', 'pl', controller.signal)
        return `OK: ${out}`
      }
      if (provider === 'openai') return `OK: ${await translateViaOpenAi('Hello world.', 'en', 'pl', controller.signal, resolveModelForProvider('openai'))}`
      if (provider === 'openrouter') return `OK: ${await translateViaOpenRouter('Hello world.', 'en', 'pl', controller.signal, resolveModelForProvider('openrouter'))}`
      if (provider === 'groq') return `OK: ${await translateViaGroq('Hello world.', 'en', 'pl', controller.signal, resolveModelForProvider('groq'))}`
      if (provider === 'together') return `OK: ${await translateViaTogether('Hello world.', 'en', 'pl', controller.signal, resolveModelForProvider('together'))}`
      if (provider === 'mistral') return `OK: ${await translateViaMistral('Hello world.', 'en', 'pl', controller.signal, resolveModelForProvider('mistral'))}`
      if (provider === 'claude') return `OK: ${await translateViaClaude('Hello world.', 'en', 'pl', controller.signal)}`
      if (provider === 'gemini') return `OK: ${await translateViaGemini('Hello world.', 'en', 'pl', controller.signal, resolveModelForProvider('gemini'))}`
      if (provider === 'cohere') return `OK: ${await translateViaCohere('Hello world.', 'en', 'pl', controller.signal, resolveModelForProvider('cohere'))}`
      if (provider === 'google') return `OK: ${await translateViaGoogleV2('Hello world.', 'en', 'pl', controller.signal)}`
      if (provider === 'azure') return `BLAD (missing-config): Azure OpenAI wymaga endpointu i deploymentu.`
      if (provider === 'papago') return 'BLAD (missing-config): Papago wymaga Client ID + Client Secret.'
      if (provider === 'yandex') return 'BLAD (missing-config): Yandex wymaga key + folder_id/IAM.'
      ensureProviderReady(provider)
      throw new ProviderError('provider-not-implemented', `Provider ${provider} nie jest obslugiwany.`)
    } catch (error) {
      if (error instanceof ProviderError) {
        return `BLAD (${error.code}): ${error.message}`
      }
      if (error instanceof Error) {
        return `BLAD (network): ${error.message}`
      }
      return 'BLAD: Nieznany blad testu providera'
    }
  }

  const runTranslationByLineIds = async (lineIds: number[]): Promise<void> => {
    if (isTranslating || !lineIds.length) return
    stopTranslationRef.current = false
    setIsTranslating(true)
    setTranslatingLineId(null)
    const requestedLineIds = [...new Set(lineIds)]
    appendTranslationLog(`Start tlumaczenia: provider=${providerId}, source=${sourceLang}, target=${targetLang}, linie=${requestedLineIds.length}`)
    appendTranslationLog('Wybrany styl tlumaczenia jest aktywny i stosowany do wszystkich tlumaczen.')

    // Snapshot wierszy na poczatku uruchomienia — zapobiega stale closure
    // (rowsData nie aktualizuje sie w trakcie async pipeline)
    const rowsSnapshot = rowsData
    const rowsById = new Map(rowsSnapshot.map(row => [row.id, row]))
    const rowIndexById = new Map(rowsSnapshot.map((row, index) => [row.id, index]))

    // Kontrakt per-linia: status + blad
    type LineStatus = 'done' | 'error' | 'rate-limited' | 'cancelled'
    const lineResults = new Map<number, { status: LineStatus; error?: string }>()

    const batchSize = DEFAULT_TRANSLATION_BATCH_SIZE
    const delayBetweenBatchesMs = DEFAULT_DELAY_BETWEEN_BATCHES_MS
    const batches: number[][] = []
    for (let i = 0; i < requestedLineIds.length; i += batchSize) {
      batches.push(requestedLineIds.slice(i, i + batchSize))
    }

    const recordResult = (id: number, status: LineStatus, error?: string): void => {
      lineResults.set(id, { status, error })
    }

    const preflightRowsById = new Map(rowsSnapshot.map(row => [row.id, row]))
    const missingRowsFromInput = requestedLineIds.filter(id => !preflightRowsById.has(id))
    const translatableIds = requestedLineIds.filter(id => {
      const row = preflightRowsById.get(id)
      return row ? lineHasTranslatableContent(row) : false
    })
    const translatableSet = new Set(translatableIds)
    const nonTranslatableIds = requestedLineIds.filter(id => !translatableSet.has(id))

    appendTranslationLog(`Preflight: translatable=${translatableIds.length}, bez-tekstu=${nonTranslatableIds.length}, brak-wiersza=${missingRowsFromInput.length}`)

    try {
      // --- PRZEBIEG 1: glowny ---
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        if (stopTranslationRef.current) break
        const batch = batches[batchIndex]
        appendTranslationLog(`Batch ${batchIndex + 1}/${batches.length}: ${batch.length} linii`)

        if (providerId === 'deepl' && batch.length > 1) {
          const batchRows = batch
            .map(lineId => rowsById.get(lineId))
            .filter((row): row is DialogRow => Boolean(row))
          const batchContexts = batchRows.map(row => getTranslationContextForRow(row))
          const hasContextDependentRows = batchRows.some(row => {
            const rowIndex = rowIndexById.get(row.id) ?? -1
            if (rowIndex <= 0) return false
            const previousRow = rowsSnapshot[rowIndex - 1]
            if (!previousRow) return false
            return buildContinuationContextFromPreviousLine(previousRow.sourceRaw || previousRow.source).length > 0
          })
          const hasAssMarkers = batchRows.some(row => hasAssTechnicalMarkers(row.sourceRaw || row.source))
          const canUseBatch = !hasContextDependentRows
            && !hasAssMarkers
            && batchContexts.every(context => (
            context.effectiveStyle === 'neutral'
            && !context.characterNote
            && !context.speakingTraits
            && context.archetype === 'default'
            && !context.characterTypeId
            && !context.characterSubtypeId
            && !context.characterUserNotes
            && context.effectiveStyleSource === 'global'
            ))
          if (!canUseBatch) {
            appendTranslationLog(`Batch ${batchIndex + 1}: pomijam batch DeepL (aktywne style per-postac).`)
          }
          const memoryResolved = new Map<number, string>()
          const toTranslate = batchRows.filter(row => {
            const fromMemory = resolveMemoryTranslation(row)
            if (fromMemory) {
              memoryResolved.set(row.id, fromMemory)
              return false
            }
            return true
          })

          if (memoryResolved.size > 0) {
            memoryResolved.forEach((_, id) => recordResult(id, 'done'))
            setRowsData(prev => prev.map(item => (
              memoryResolved.has(item.id)
                ? {
                  ...item,
                  target: memoryResolved.get(item.id) as string,
                  pl: 'done',
                  requiresManualCheck: false,
                }
                : item
            )))
          }

          if (toTranslate.length > 0 && !stopTranslationRef.current && canUseBatch) {
            const controller = new AbortController()
            activeTranslationAbortRef.current = controller
            const backoffMs = [2500, 5000, 9000]
            let translatedBatch: string[] | null = null
            for (let attempt = 0; attempt <= backoffMs.length; attempt += 1) {
              try {
                const waitMs = providerCooldownUntilRef.current - Date.now()
                if (waitMs > 0) await waitWithAbort(waitMs, controller.signal)
                translatedBatch = await translateViaDeepLBatch(
                  toTranslate.map(row => row.sourceRaw || row.source),
                  sourceLang,
                  targetLang,
                  controller.signal,
                )
                break
              } catch (error) {
                if (error instanceof ProviderError && error.code === 'cancelled') {
                  stopTranslationRef.current = true
                  translatedBatch = null
                  break
                }
                const isRetryable = error instanceof ProviderError
                  && (error.code === 'rate-limit' || error.code === 'timeout' || error.code === 'network' || error.code.startsWith('econn'))
                if (!isRetryable || attempt >= backoffMs.length) {
                  appendTranslationLog(`Batch ${batchIndex + 1}: fallback per-linia po bledzie batch: ${error instanceof Error ? error.message : 'Nieznany blad'}`)
                  translatedBatch = null
                  break
                }
                const delay = error instanceof ProviderError
                  ? deriveRetryDelayMs(error, backoffMs[attempt])
                  : backoffMs[attempt]
                if (error instanceof ProviderError && error.code === 'rate-limit') {
                  providerCooldownUntilRef.current = Date.now() + delay
                }
                await waitWithAbort(delay, controller.signal)
              }
            }
            activeTranslationAbortRef.current = null

            if (translatedBatch && translatedBatch.length === toTranslate.length) {
              const byId = new Map<number, string>()
              toTranslate.forEach((row, index) => {
                let translated = translatedBatch?.[index] ?? ''
                const context = getTranslationContextForRow(row)
                translated = applyTranslationStyleLocally(translated, targetLang, context)
                if (context.gender !== 'Unknown') translated = applyGenderCorrectionLocally(translated, context.gender)
                if (isSuspiciousTranslation(row.sourceRaw || row.source, translated, sourceLang, targetLang)) {
                  appendTranslationLog(`Linia ${row.id}: wynik podejrzany (batch, ${sourceLang}->${targetLang})`)
                }
                byId.set(row.id, translated)
                recordResult(row.id, 'done')
              })
              setRowsData(prev => prev.map(item => (
                byId.has(item.id)
                  ? {
                    ...item,
                    target: byId.get(item.id) as string,
                    pl: 'done',
                    requiresManualCheck: false,
                  }
                  : item
              )))
              if (!stopTranslationRef.current && batchIndex < batches.length - 1) {
                appendTranslationLog(`Przerwa miedzy batchami: ${Math.ceil(delayBetweenBatchesMs / 1000)}s`)
                await waitDuringRun(delayBetweenBatchesMs)
              }
              continue
            }
          }
        }

        for (const lineId of batch) {
          if (stopTranslationRef.current) break
          const row = rowsById.get(lineId)
          if (!row) continue
          setSelectedId(lineId)
          setSelectedLineIds(new Set([lineId]))
          setTranslatingLineId(lineId)
          try {
            const result = await translateSingleRow(row)
            if (stopTranslationRef.current) break
            recordResult(lineId, 'done')
            setRowsData(prev => prev.map(item => (
              item.id === lineId
                ? {
                  ...item,
                  target: result.translated,
                  pl: result.requiresManualCheck ? 'draft' : 'done',
                  requiresManualCheck: result.requiresManualCheck,
                }
                : item
            )))
          } catch (error) {
            if (error instanceof ProviderError && error.code === 'cancelled') {
              recordResult(lineId, 'cancelled', error.message)
              break
            }
            const isRateLimit = error instanceof ProviderError && error.code === 'rate-limit'
            const diagnostic = error instanceof ProviderError
              ? `${error.code}: ${error.message}`
              : error instanceof Error
                ? error.message
                : 'Nieznany blad tlumaczenia'
            appendTranslationLog(`Linia ${lineId}: ${diagnostic}`)
            recordResult(lineId, isRateLimit ? 'rate-limited' : 'error', diagnostic)
            setRowsData(prev => prev.map(item => (
              item.id === lineId
                ? { ...item, pl: item.target?.trim() ? item.pl : 'empty' }
                : item
            )))
          }
          if (!stopTranslationRef.current) {
            await waitDuringRun(getProviderBaseDelayMs())
          }
        }

        if (!stopTranslationRef.current && batchIndex < batches.length - 1) {
          appendTranslationLog(`Przerwa miedzy batchami: ${Math.ceil(delayBetweenBatchesMs / 1000)}s`)
          await waitDuringRun(delayBetweenBatchesMs)
        }
      }

      // --- PRZEBIEG 2: retry dla bledow (w tym 429) ---
      const retryIds = [...lineResults.entries()]
        .filter(([, r]) => r.status === 'error' || r.status === 'rate-limited')
        .map(([id]) => id)

      if (!stopTranslationRef.current && retryIds.length > 0) {
        // Dodatkowe odczekanie przed 2. przebiegiem gdy byly bledy rate-limit
        const hadRateLimits = retryIds.some(id => lineResults.get(id)?.status === 'rate-limited')
        if (hadRateLimits) {
          const rateLimitPause = 8000
          appendTranslationLog(`Pauza ${Math.ceil(rateLimitPause / 1000)}s przed 2. przebiegiem (rate-limit recovery)...`)
          await waitDuringRun(rateLimitPause)
        }
        appendTranslationLog(`Przebieg 2: retry ${retryIds.length} linii (bledy/rate-limit z przebiegu 1).`)
        for (const lineId of retryIds) {
          if (stopTranslationRef.current) break
          const row = rowsById.get(lineId)
          if (!row) continue
          setTranslatingLineId(lineId)
          try {
            const result = await translateSingleRow(row, 'primary')
            recordResult(lineId, 'done')
            setRowsData(prev => prev.map(item => (
              item.id === lineId
                ? {
                  ...item,
                  target: result.translated,
                  pl: result.requiresManualCheck ? 'draft' : 'done',
                  requiresManualCheck: result.requiresManualCheck,
                }
                : item
            )))
          } catch (error) {
            if (error instanceof ProviderError && error.code === 'cancelled') {
              recordResult(lineId, 'cancelled', error.message)
              break
            }
            const diagnostic = error instanceof Error ? error.message : 'Nieznany blad'
            appendTranslationLog(`Przebieg 2 linia ${lineId}: ${diagnostic} — probuje fallback.`)
            // Przebieg 2 nieudany — ostatnia szansa przez fallback (Libre/MyMemory)
            try {
              const result = await translateSingleRow(row, 'fallback')
              recordResult(lineId, 'done')
              setRowsData(prev => prev.map(item => (
                item.id === lineId
                  ? {
                    ...item,
                    target: result.translated,
                    pl: result.requiresManualCheck ? 'draft' : 'done',
                    requiresManualCheck: result.requiresManualCheck,
                  }
                  : item
              )))
            } catch (fallbackError) {
              if (fallbackError instanceof ProviderError && fallbackError.code === 'cancelled') {
                recordResult(lineId, 'cancelled', fallbackError.message)
                break
              }
              const fallbackDiag = fallbackError instanceof Error ? fallbackError.message : 'Nieznany blad fallbacku'
              appendTranslationLog(`Fallback linia ${lineId}: ${fallbackDiag}`)
              recordResult(lineId, 'error', fallbackDiag)
            }
          }
          if (!stopTranslationRef.current) {
            await waitDuringRun(getProviderBaseDelayMs())
          }
        }
      }

      // --- RAPORT KONCOWY ---
      const doneCount = [...lineResults.values()].filter(r => r.status === 'done').length
      const failedCount = [...lineResults.values()].filter(r => r.status === 'error').length
      const rateLimitCount = [...lineResults.values()].filter(r => r.status === 'rate-limited').length
      const cancelledCount = [...lineResults.values()].filter(r => r.status === 'cancelled').length
      const retriedCount = retryIds.length
      const skippedCount = requestedLineIds.length - lineResults.size
      const failedIds = [...lineResults.entries()].filter(([, r]) => r.status === 'error').map(([id]) => id)
      const rateLimitedIds = [...lineResults.entries()].filter(([, r]) => r.status === 'rate-limited').map(([id]) => id)
      const cancelledIds = [...lineResults.entries()].filter(([, r]) => r.status === 'cancelled').map(([id]) => id)

      const finalRowsById = new Map(rowsDataRef.current.map(row => [row.id, row]))
      const missingTranslationIds = translatableIds.filter(id => !lineHasTranslatedContent(finalRowsById.get(id)))
      const completedWithOutputIds = translatableIds.filter(id => lineHasTranslatedContent(finalRowsById.get(id)))
      const checksum = checksumFromPairs(completedWithOutputIds.map(id => [id, finalRowsById.get(id)?.target ?? '']))

      const parts: string[] = [`Gotowe: ${doneCount}`]
      if (retriedCount > 0) parts.push(`retry: ${retriedCount}`)
      if (failedCount > 0) parts.push(`bledy: ${failedCount}`)
      if (rateLimitCount > 0) parts.push(`rate-limit: ${rateLimitCount}`)
      if (cancelledCount > 0) parts.push(`anulowane: ${cancelledCount}`)
      if (skippedCount > 0) parts.push(`pominiete: ${skippedCount}`)
      appendTranslationLog(`Raport: ${parts.join(' | ')} (z ${requestedLineIds.length} linii).`)
      appendTranslationLog(`Walidacja: oczekiwane=${translatableIds.length}, z-wynikiem=${completedWithOutputIds.length}, braki=${missingTranslationIds.length}, checksum=${checksum}`)

      if (missingRowsFromInput.length > 0) {
        appendTranslationLog(`Brakujace wiersze wejscia: ${missingRowsFromInput.join(', ')}`)
      }
      if (failedIds.length > 0) {
        appendTranslationLog(`Linie z bledem: ${failedIds.join(', ')}`)
      }
      if (rateLimitedIds.length > 0) {
        appendTranslationLog(`Linie zatrzymane przez rate-limit: ${rateLimitedIds.join(', ')}`)
      }
      if (cancelledIds.length > 0) {
        appendTranslationLog(`Linie anulowane (Stop): ${cancelledIds.join(', ')}`)
      }
      if (missingTranslationIds.length > 0) {
        appendTranslationLog(`Brak tlumaczenia po walidacji: ${missingTranslationIds.join(', ')}`)
      }
    } finally {
      const stoppedByUser = stopTranslationRef.current
      setTranslatingLineId(null)
      setIsTranslating(false)
      stopTranslationRef.current = false
      activeTranslationAbortRef.current = null
      appendTranslationLog(stoppedByUser ? 'Koniec tlumaczenia (przerwane przez uzytkownika).' : 'Koniec tlumaczenia.')
    }
  }

  const handleTranslateAll = (): void => {
    void runTranslationByLineIds(rowsData.map(row => row.id))
  }

  const handleTranslateSelected = (): void => {
    const ids = rowsData
      .filter(row => selectedLineIds.has(row.id))
      .map(row => row.id)
    void runTranslationByLineIds(ids)
  }

  const handleStopTranslate = (): void => {
    stopTranslationRef.current = true
    activeTranslationAbortRef.current?.abort()
    activeTranslationAbortRef.current = null
    appendTranslationLog('Zadano zatrzymanie tlumaczenia (Stop) — koncze bezpiecznie biezacy przebieg.')
  }

  const handleMemoryStoreChange = (next: MemoryStore): void => {
    setMemoryStore(next)
  }

  const applySelectedSuggestion = (): void => {
    if (!selectedRow) return
    const chosen = suggestions[selectedSuggestionIndex]
    if (!chosen) return

    setRowsData(prev => prev.map(row => (
      row.id === selectedRow.id
        ? { ...row, target: chosen.target, pl: 'draft', requiresManualCheck: false }
        : row
    )))
    setMemoryStore(prev => ({
      ...prev,
      entries: prev.entries.map(entry => (
        entry.id === chosen.id
          ? { ...entry, usageCount: entry.usageCount + 1 }
          : entry
      )),
    }))
  }

  const handleSkipSuggestion = (): void => {
    setSelectedSuggestionIndex(0)
  }

  const handleChangeLineTarget = (lineId: number, target: string): void => {
    setRowsData(prev => prev.map(row => (row.id === lineId
      ? { ...row, target, requiresManualCheck: false }
      : row)))
  }

  const handleApplyGenderCorrections = (changes: Array<{ lineId: number; after: string }>): void => {
    const byId = new Map(changes.map(change => [change.lineId, change.after]))
    setRowsData(prev => prev.map(row => (byId.has(row.id)
      ? { ...row, target: byId.get(row.id) as string, requiresManualCheck: false }
      : row)))
  }

  const handleModelChange = (modelId: string): void => {
    if (modelId.startsWith('claude:')) {
      setSelectedModelId(`claude:${CLAUDE_LOCKED_MODEL}`)
      return
    }
    setSelectedModelId(modelId)
  }

  const handleSaveApiConfig = async (): Promise<void> => {
    const normalized = normalizeApiConfig(apiConfig)
    try {
      if (window.electronAPI?.saveApiConfig) {
        await window.electronAPI.saveApiConfig(normalized)
      }
      saveApiConfig(normalized)
      setApiConfig(normalized)
      setPersistedApiConfig(normalized)
      setApiSaveStatus('OK: Konfiguracja API zapisana trwale.')
      appendTranslationLog('Zapisano konfiguracje API.')
      setApiOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nieznany blad zapisu konfiguracji API'
      setApiSaveStatus(`BLAD zapisu konfiguracji API: ${message}`)
      appendTranslationLog(`BLAD zapisu konfiguracji API: ${message}`)
    }
  }

  const handleTestProvider = (providerId: string): void => {
    setApiTestStatusByProvider(prev => ({ ...prev, [providerId]: 'Testowanie...' }))
    void testProviderConnection(providerId).then(result => {
      setApiTestStatusByProvider(prev => ({ ...prev, [providerId]: result }))
      appendTranslationLog(`Test providera ${providerId}: ${result}`)
    })
  }

  function fileNameFromPath(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    const pieces = normalized.split('/')
    return pieces[pieces.length - 1] ?? filePath
  }

  function directoryFromPath(filePath: string): string | undefined {
    const normalized = filePath.replace(/\\/g, '/')
    const idx = normalized.lastIndexOf('/')
    if (idx <= 0) return undefined
    return normalized.slice(0, idx)
  }

  const applySubtitleContent = (content: string, filePath?: string): void => {
    const parsed = parseAssOrSsa(content)
    if (parsed.rows.length === 0) {
      console.warn('Nie znaleziono linii Dialogue w pliku ASS/SSA.')
      return
    }
    const assignmentApplied = applyProjectLineAssignments(parsed.rows, projectLineAssignments)
    setLoadedSubtitleFile(parsed)
    setRowsData(assignmentApplied.rows.map(row => ({ ...row, requiresManualCheck: false })))
    setSelectedId(assignmentApplied.rows[0].id)
    setSelectedLineIds(new Set([assignmentApplied.rows[0].id]))
    if (assignmentApplied.applied > 0) {
      appendTranslationLog(`Krok 0: przywrócono ${assignmentApplied.applied} przypisań postaci do linii.`)
    }
    if (filePath) {
      setLoadedFilePath(filePath)
      setLoadedFileName(fileNameFromPath(filePath))
      return
    }
    setLoadedFileName('Wczytany z drag&drop')
  }

  const handleOpenFile = async (): Promise<void> => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.openSubtitleFile({
      projectDir: loadedFilePath ? directoryFromPath(loadedFilePath) : undefined,
    })
    if (result.canceled) return
    if (result.error) {
      console.error(result.error)
      return
    }
    if (!result.content) return
    applySubtitleContent(result.content, result.filePath)
  }

  const handleSaveFile = async (): Promise<void> => {
    if (!window.electronAPI || !loadedFilePath || !loadedSubtitleFile) return
    const content = buildAssOrSsaContent(loadedSubtitleFile, rowsData)
    const result = await window.electronAPI.saveSubtitleFile({
      sourcePath: loadedFilePath,
      content,
    })
    setLoadedFileName(fileNameFromPath(result.savedPath))
    console.log(`Zapisano: ${result.savedPath}`)
  }

  const handleOpenVideoFile = async (): Promise<void> => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.openVideoFile({
      projectDir: videoPath ? directoryFromPath(videoPath) : (loadedFilePath ? directoryFromPath(loadedFilePath) : undefined),
    })
    if (result.canceled) return
    if (result.error || !result.filePath) {
      setVideoError(result.error ?? 'Nie udalo sie zaladowac wideo.')
      return
    }
    setVideoError('')
    setVideoCurrentTime(0)
    setVideoDuration(0)
    pauseAtAfterLineRef.current = null
    setVideoPath(result.filePath)
    setVideoCollapsed(false)
  }

  const jumpToLineInVideo = (lineId: number, shouldPlay: boolean): void => {
    const timing = lineTimings.find(item => item.id === lineId)
    const video = videoRef.current
    if (!timing || !video) return
    const targetTime = shouldPlay
      ? Math.max(0, timing.startSec - preRollSec)
      : Math.max(0, timing.startSec)
    video.currentTime = targetTime
    setVideoCurrentTime(targetTime)
    const pauseAt = timing.endSec + postRollSec
    pauseAtAfterLineRef.current = shouldPlay ? pauseAt : null
    if (shouldPlay) {
      void video.play().catch(error => {
        const message = error instanceof Error ? error.message : 'Nieznany blad play()'
        setVideoError(`Nie mozna uruchomic odtwarzania od wybranej linii: ${message}`)
      })
      return
    }
    video.pause()
  }

  const handleSelectLine = (lineId: number, opts?: { additive?: boolean; range?: boolean }): void => {
    if (opts?.range) {
      const allIds = rowsData.map(row => row.id)
      const from = allIds.indexOf(selectedId)
      const to = allIds.indexOf(lineId)
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from]
        const ranged = new Set(allIds.slice(start, end + 1))
        setSelectedLineIds(ranged)
      }
    } else if (opts?.additive) {
      setSelectedLineIds(prev => {
        const next = new Set(prev)
        if (next.has(lineId)) next.delete(lineId)
        else next.add(lineId)
        return next
      })
    } else {
      setSelectedLineIds(new Set([lineId]))
    }
    setSelectedId(lineId)
    jumpToLineInVideo(lineId, autoPlayOnLineClick)
  }

  const handleActivateLine = (lineId: number): void => {
    setSelectedId(lineId)
    setSelectedLineIds(new Set([lineId]))
    jumpToLineInVideo(lineId, true)
  }

  const handleVideoLoadedMetadata = (): void => {
    const video = videoRef.current
    if (!video) return
    setVideoDuration(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0)
    setVideoCurrentTime(Number.isFinite(video.currentTime) ? video.currentTime : 0)
    setVideoPaused(video.paused)
    setVideoError('')
  }

  const handleVideoDurationChange = (): void => {
    const video = videoRef.current
    if (!video) return
    if (Number.isFinite(video.duration) && video.duration > 0) {
      setVideoDuration(video.duration)
    }
  }

  const handleVideoTimeUpdate = (): void => {
    const video = videoRef.current
    if (!video) return
    const now = video.currentTime
    setVideoCurrentTime(now)
    setVideoPaused(video.paused)

    if (pauseAtAfterLineRef.current !== null && now >= pauseAtAfterLineRef.current) {
      video.pause()
      pauseAtAfterLineRef.current = null
    }

    let active = lineTimings.find(item => now >= item.startSec && now <= item.endSec)
    if (!active) {
      const previous = lineTimings
        .filter(item => item.startSec <= now)
        .sort((a, b) => b.startSec - a.startSec)[0]
      active = previous
    }
    if (!active) return
    if (lastLineSyncFromVideoRef.current === active.id) return
    lastLineSyncFromVideoRef.current = active.id
    setSelectedId(prev => (prev === active?.id ? prev : active!.id))
    setSelectedLineIds(prev => (prev.has(active!.id) && prev.size === 1 ? prev : new Set([active!.id])))
  }

  const handleVideoPlayPause = (): void => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play().catch(error => {
        const message = error instanceof Error ? error.message : 'Nieznany blad play()'
        setVideoError(`Nie mozna uruchomic odtwarzania: ${message}`)
      })
      setVideoPaused(false)
      return
    }
    video.pause()
    setVideoPaused(true)
  }

  useEffect(() => {
    if (!window.electronAPI?.updateDetachedPreviewState) return
    const video = videoRef.current
    void window.electronAPI.updateDetachedPreviewState({
      videoSrc,
      currentTime: videoCurrentTime,
      playbackRate: videoPlaybackRate,
      paused: video?.paused ?? videoPaused,
      sourceText: detachedPreviewSourceText,
      targetText: detachedPreviewTargetText,
    })
  }, [
    videoSrc,
    videoCurrentTime,
    videoPlaybackRate,
    videoPaused,
    detachedPreviewSourceText,
    detachedPreviewTargetText,
  ])

  useEffect(() => {
    if (!window.electronAPI?.onDetachedPreviewCommand) return
    const unsubscribe = window.electronAPI.onDetachedPreviewCommand(payload => {
      if (payload.type === 'toggle-playback') {
        handleVideoPlayPause()
      }
    })
    return unsubscribe
  }, [])

  const handleVideoStop = (): void => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    video.currentTime = 0
    setVideoCurrentTime(0)
    pauseAtAfterLineRef.current = null
  }

  const handleVideoSeekRelative = (delta: number): void => {
    const video = videoRef.current
    if (!video) return
    const next = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta))
    video.currentTime = next
    setVideoCurrentTime(next)
  }

  const handleVideoSeekAbsolute = (nextTime: number): void => {
    const video = videoRef.current
    if (!video) return
    const next = Math.max(0, Math.min(video.duration || 0, nextTime))
    video.currentTime = next
    setVideoCurrentTime(next)
  }

  const updateLineTiming = (lineId: number, startSec: number, endSec: number): void => {
    const normalizedStart = Math.max(0, startSec)
    const normalizedEnd = Math.max(normalizedStart + 0.08, endSec)
    setRowsData(prev => prev.map(row => (
      row.id === lineId
        ? { ...row, start: secondsToSubtitleTime(normalizedStart), end: secondsToSubtitleTime(normalizedEnd) }
        : row
    )))
  }

  const findSpeechBoundary = (
    nearSec: number,
    mode: 'start' | 'end',
    searchWindowSec: number,
  ): number | null => {
    if (!waveformData || waveformData.peaks.length < 8 || waveformData.sampleRate <= 0) return null
    const sr = waveformData.sampleRate
    const peaks = waveformData.peaks
    const duration = waveformData.duration
    const center = Math.max(0, Math.min(duration, nearSec))
    const winStart = Math.max(0, center - searchWindowSec)
    const winEnd = Math.min(duration, center + searchWindowSec)
    const iStart = Math.max(0, Math.floor(winStart * sr))
    const iEnd = Math.min(peaks.length - 1, Math.ceil(winEnd * sr))
    if (iEnd <= iStart) return null

    let localMax = 0
    for (let i = iStart; i <= iEnd; i += 1) localMax = Math.max(localMax, peaks[i] ?? 0)
    const threshold = Math.max(0.02, localMax * 0.34)
    const minRun = Math.max(2, Math.floor(sr * 0.035))

    if (mode === 'start') {
      let run = 0
      for (let i = iStart; i <= iEnd; i += 1) {
        if ((peaks[i] ?? 0) >= threshold) run += 1
        else run = 0
        if (run >= minRun) {
          const idx = i - run + 1
          return idx / sr
        }
      }
      return null
    }

    let run = 0
    for (let i = iEnd; i >= iStart; i -= 1) {
      if ((peaks[i] ?? 0) >= threshold) run += 1
      else run = 0
      if (run >= minRun) {
        const idx = i + run - 1
        return Math.min(duration, idx / sr)
      }
    }
    return null
  }

  const autoSnapLineTiming = (lineId: number, mode: 'start' | 'end' | 'both'): void => {
    const timing = lineTimingById.get(lineId)
    if (!timing) return
    const searchStart = findSpeechBoundary(timing.startSec, 'start', 0.9)
    const searchEnd = findSpeechBoundary(timing.endSec, 'end', 1.1)
    let nextStart = timing.startSec
    let nextEnd = timing.endSec
    if ((mode === 'start' || mode === 'both') && searchStart !== null) nextStart = searchStart
    if ((mode === 'end' || mode === 'both') && searchEnd !== null) nextEnd = searchEnd

    // Safe correction window - keep edits local around original timing.
    const maxShift = 1.25
    nextStart = Math.max(timing.startSec - maxShift, Math.min(timing.startSec + maxShift, nextStart))
    nextEnd = Math.max(timing.endSec - maxShift, Math.min(timing.endSec + maxShift, nextEnd))
    updateLineTiming(lineId, nextStart, Math.max(nextStart + 0.08, nextEnd))
  }

  const handleWaveformSeek = (seconds: number): void => {
    handleVideoSeekAbsolute(seconds)
  }

  const handleAutoSnapStart = (): void => {
    if (!waveformSelection) return
    autoSnapLineTiming(waveformSelection.lineId, 'start')
  }

  const handleAutoSnapEnd = (): void => {
    if (!waveformSelection) return
    autoSnapLineTiming(waveformSelection.lineId, 'end')
  }

  const handleAutoSnapLine = (): void => {
    if (!waveformSelection) return
    autoSnapLineTiming(waveformSelection.lineId, 'both')
  }

  const handleAutoSnapSelected = (): void => {
    const ids = rowsData.filter(row => selectedLineIds.has(row.id)).map(row => row.id)
    ids.forEach(id => autoSnapLineTiming(id, 'both'))
  }

  const handleAutoSnapAll = (): void => {
    rowsData.forEach(row => autoSnapLineTiming(row.id, 'both'))
  }

  const handleVideoError = (): void => {
    const video = videoRef.current
    const mediaError = video?.error
    const code = mediaError?.code ?? 0
    const extension = videoPath?.split('.').pop()?.toLowerCase() ?? ''
    const codeMessage = code === 1
      ? 'Odtwarzanie zostalo przerwane.'
      : code === 2
        ? 'Blad sieci podczas pobierania pliku.'
        : code === 3
          ? 'Blad dekodowania (mozliwy problem z kodekiem).'
          : code === 4
            ? 'Format lub kodek nieobslugiwany przez odtwarzacz Chromium w Electron.'
            : 'Nieznany blad odtwarzania.'
    const extHint = extension
      ? ` Plik .${extension}`
      : ''
    const detail = mediaError?.message ? ` Szczegoly: ${mediaError.message}` : ''
    setVideoError(`${codeMessage}${extHint}.${detail}`)
  }

  useEffect(() => {
    const handleGlobalSpace = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') return
      if (event.repeat) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase() ?? ''
      const isTypingContext = tag === 'input'
        || tag === 'textarea'
        || target?.isContentEditable
      if (isTypingContext) return
      event.preventDefault()
      const video = videoRef.current
      if (!video || !videoSrc) return
      handleVideoPlayPause()
    }

    window.addEventListener('keydown', handleGlobalSpace)
    return () => window.removeEventListener('keydown', handleGlobalSpace)
  }, [videoSrc])

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
  }

  const handleDropFile = async (event: React.DragEvent<HTMLDivElement>): Promise<void> => {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    if (!/\.(ass|ssa)$/i.test(file.name)) return

    const fileWithPath = file as File & { path?: string }
    if (window.electronAPI && fileWithPath.path) {
      try {
        const response = await window.electronAPI.readSubtitleFile(fileWithPath.path)
        applySubtitleContent(response.content, response.filePath)
        return
      } catch (error) {
        console.error(error)
      }
    }

    const text = await file.text()
    applySubtitleContent(text, fileWithPath.path)
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#202128', color: C.text }}
      onDragOver={handleDragOver}
      onDrop={event => { void handleDropFile(event) }}
    >
      <ActionBar
        onOpenFile={() => { void handleOpenFile() }}
        onSaveFile={() => { void handleSaveFile() }}
        onOpenApi={() => setApiOpen(true)}
        onOpenCharacters={handleOpenCharactersModal}
        onOpenMemory={() => setMemoryOpen(true)}
        onOpenGenderCorrection={() => setGenderCorrectionOpen(true)}
        onTranslateAll={handleTranslateAll}
        onTranslateSelected={handleTranslateSelected}
        onStopTranslate={handleStopTranslate}
        isTranslating={isTranslating}
        selectedCount={selectedLineIds.size}
        sourceLang={sourceLang}
        targetLang={targetLang}
        onChangeSourceLang={setSourceLang}
        onChangeTargetLang={setTargetLang}
        selectedModelId={selectedModelId}
        onChangeModelId={handleModelChange}
        modelOptions={TRANSLATION_MODEL_OPTIONS}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <LeftSidebar
          onOpenApi={() => setApiOpen(true)}
          onOpenCharacters={handleOpenCharactersModal}
          onOpenMemory={() => setMemoryOpen(true)}
          onOpenGenderCorrection={() => setGenderCorrectionOpen(true)}
          onLoadVideo={() => { void handleOpenVideoFile() }}
          videoRef={videoRef}
          videoSrc={videoSrc}
          videoError={videoError}
          videoCurrentTime={videoCurrentTime}
          videoDuration={videoDuration}
          onLoadedMetadata={handleVideoLoadedMetadata}
          onDurationChange={handleVideoDurationChange}
          onTimeUpdate={handleVideoTimeUpdate}
          onVideoError={handleVideoError}
          onToggleVideoExpanded={() => {
            void window.electronAPI?.openDetachedPreviewWindow?.()
          }}
          projectOptions={seriesProjects}
          currentProjectId={projectPickerId}
          onSelectProjectId={setProjectPickerId}
          onOpenProjectStep={handleEnterProjectStep}
          onLoadProject={() => { void handleLoadDiskProjectFromButton() }}
          hasActiveProject={!!activeDiskProject}
          assignmentCharacters={assignmentCharacters}
          selectedLineCount={selectedLineIds.size}
          activeAssignmentCharacter={activeAssignmentCharacter}
          assignmentSuggestions={assignmentSuggestions}
          onAssignCharacter={applyCharacterToSelectedLines}
          onClearCharacterAssignment={clearCharacterFromSelectedLines}
          activeDiskProjectTitle={activeDiskProject?.title ?? 'brak (wymagany Krok 0)'}
          loadedFileName={loadedFileName}
        />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
          <UpdateStatusBar
            status={updaterStatus}
            isSupported={isUpdaterSupported}
            onCheck={() => { void checkForUpdates() }}
            onDownload={() => { void downloadUpdate() }}
            onInstall={() => { void installUpdate() }}
          />
          <LinesView
            rows={rowsData}
            hasActiveProject={!!activeDiskProject}
            selectedId={selectedId}
            selectedIds={selectedLineIds}
            translatingLineId={translatingLineId}
            onSelect={handleSelectLine}
            onActivateLine={handleActivateLine}
            getGenderForCharacter={(characterName) => resolveGenderForCharacterName(characterName.trim(), styleSettings.characters)}
          />
          <div style={{ borderTop: `1px solid ${C.border}`, padding: '4px 8px', fontSize: 11, color: C.textDim, background: '#1b1c24' }}>
            Aktywny styl: <strong style={{ color: C.accentY }}>{effectiveStyleLabel}</strong>
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, padding: '4px 8px', fontSize: 11, color: C.textDim, background: '#171920', maxHeight: 62, overflow: 'auto' }}>
            Log tlumaczenia: {translationLogs[0] ?? 'brak'}
          </div>
          <EditorPanel row={selectedRow} onChangeTarget={handleChangeLineTarget} />
          <SuggestionsPanel
            row={selectedRow}
            suggestions={suggestions}
            selectedSuggestionIndex={selectedSuggestionIndex}
            onSelectSuggestionIndex={setSelectedSuggestionIndex}
            onApplySelectedSuggestion={applySelectedSuggestion}
            onSkip={handleSkipSuggestion}
            projectNameById={projectNameById}
          />
          <WaveformPanel
            waveform={waveformData}
            loading={waveformLoading}
            error={waveformError}
            currentTime={videoCurrentTime}
            selected={waveformSelection}
            onSeek={handleWaveformSeek}
            onChangeLineTiming={updateLineTiming}
            onAutoSnapStart={handleAutoSnapStart}
            onAutoSnapEnd={handleAutoSnapEnd}
            onAutoSnapLine={handleAutoSnapLine}
            onAutoSnapSelected={handleAutoSnapSelected}
            onAutoSnapAll={handleAutoSnapAll}
          />
        </div>
      </div>

      <ApiModal
        open={isApiOpen}
        values={apiConfig}
        onChangeValues={(next) => {
          setApiConfig(next)
          if (apiSaveStatus.startsWith('OK')) setApiSaveStatus('')
        }}
        onClose={() => {
          setApiConfig(persistedApiConfig)
          setApiOpen(false)
        }}
        onSave={() => { void handleSaveApiConfig() }}
        onTestProvider={handleTestProvider}
        testStatusByProvider={apiTestStatusByProvider}
        saveStatus={apiSaveStatus}
      />
      <CharacterModal
        open={isCharactersOpen}
        settings={styleSettings}
        rows={rowsData}
        projectId={currentProjectId}
        projectMeta={activeSeriesMeta
          ? {
            title: activeSeriesMeta.title,
            anilistId: activeSeriesMeta.anilistId,
          }
          : null}
        onClose={() => setCharactersOpen(false)}
        onSave={saveStyles}
        onProjectMetaUpdate={handleProjectMetaUpdate}
      />
      <MemoryModal open={isMemoryOpen} currentProjectId={currentProjectId} store={memoryStore} onClose={() => setMemoryOpen(false)} onChange={handleMemoryStoreChange} />
      <GenderCorrectionModal
        open={isGenderCorrectionOpen}
        rows={rowsData}
        characters={styleSettings.characters}
        onClose={() => setGenderCorrectionOpen(false)}
        onApply={handleApplyGenderCorrections}
      />
      <ProjectStepZeroModal
        open={isProjectStepOpen}
        newTitle={newProjectTitle}
        newBaseDir={newProjectBaseDir}
        openDir={openProjectPath}
        statusMessage={projectStepStatus}
        onChangeNewTitle={setNewProjectTitle}
        onPickNewBaseDir={() => { void handlePickNewProjectBaseDir() }}
        onCreate={() => { void handleCreateDiskProject() }}
        onPickOpenDir={() => { void handlePickOpenProjectDir() }}
        onOpenExisting={() => { void handleOpenDiskProject() }}
        onClose={() => setProjectStepOpen(false)}
      />
    </div>
  )
}
