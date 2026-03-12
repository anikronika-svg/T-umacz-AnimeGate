import {
  createDefaultCharacterSpeechProfile,
  createDefaultGlobalStyleProfile,
  normalizeCharacterSpeechProfile,
  normalizeGlobalStyleProfile,
  type CharacterSpeechProfile,
  type ProjectGlobalStyleProfile,
} from './project/characterProfileModel'
import { resolveCharacterByName } from './project/characterNameMatching'

export type CharacterGender = 'Male' | 'Female' | 'Unknown'

export type TranslationStyleId =
  | 'neutral'
  | 'formal'
  | 'less_formal'
  | 'casual'
  | 'rigid'
  | 'shy'
  | 'confident'
  | 'sarcastic'
  | 'childish'
  | 'elegant'
  | 'cold'
  | 'aggressive'
  | 'energetic'

export interface TranslationStyleOption {
  id: TranslationStyleId
  label: string
  hint: string
}

export type CharacterArchetypeId =
  | 'default'
  | 'tsundere'
  | 'formal_knight'
  | 'child'
  | 'elderly_man'
  | 'calm_girl'
  | 'energetic_girl'
  | 'cold_professional'
  | 'arrogant_noble'
  | 'shy'
  | 'comic_slacker'

export interface CharacterArchetypeOption {
  id: CharacterArchetypeId
  label: string
  hint: string
  toneRule: string
}

export type CharacterStyleProfile = CharacterSpeechProfile & {
  archetype: CharacterArchetypeId
}

export interface CharacterStyleAssignment {
  id: number
  name: string
  anilistCharacterId?: number | null
  anilistRole?: string
  imageUrl?: string | null
  gender: CharacterGender
  avatarColor: string
  style: TranslationStyleId | null
  profile: CharacterStyleProfile
}

export interface ProjectTranslationStyleSettings {
  projectId: string
  globalStyle: TranslationStyleId
  globalStyleProfile: ProjectGlobalStyleProfile
  characters: CharacterStyleAssignment[]
  updatedAt: string
}

export const TRANSLATION_STYLES: TranslationStyleOption[] = [
  { id: 'neutral', label: 'Neutralny', hint: 'Naturalny, standardowy ton.' },
  { id: 'formal', label: 'Formalny', hint: 'Grzeczny i bardziej poprawny.' },
  { id: 'less_formal', label: 'Mniej formalny', hint: 'Poluzowany, ale nadal uprzejmy.' },
  { id: 'casual', label: 'Luzny', hint: 'Swobodny, codzienny sposob mowienia.' },
  { id: 'rigid', label: 'Sztywny', hint: 'Zachowawczy i zdystansowany ton.' },
  { id: 'shy', label: 'Ciaspowaty / niesmialy', hint: 'Ostrozny, mniej bezposredni.' },
  { id: 'confident', label: 'Pewny siebie', hint: 'Bezposredni i stanowczy.' },
  { id: 'sarcastic', label: 'Sarkastyczny', hint: 'Lekko ironiczny i uszczypliwy.' },
  { id: 'childish', label: 'Dziecinny', hint: 'Prosty, emocjonalny, mlodszy styl.' },
  { id: 'elegant', label: 'Elegancki', hint: 'Wyszukany i gladki jezyk.' },
  { id: 'cold', label: 'Chlodny', hint: 'Krotki, rzeczowy, oschly ton.' },
  { id: 'aggressive', label: 'Agresywny', hint: 'Twardsze i ostrzejsze brzmienie.' },
  { id: 'energetic', label: 'Energiczny', hint: 'Dynamiczny i zywy styl wypowiedzi.' },
]

export const GLOBAL_STYLE_OPTIONS: TranslationStyleId[] = [
  'neutral',
  'formal',
  'less_formal',
  'casual',
]

export const CHARACTER_ARCHETYPES: CharacterArchetypeOption[] = [
  {
    id: 'default',
    label: 'Domyslny',
    hint: 'Naturalny ton bez dodatkowej stylizacji.',
    toneRule: 'Keep a balanced, natural subtitle tone with no archetype exaggeration.',
  },
  {
    id: 'tsundere',
    label: 'Tsundere',
    hint: 'Lekko zadziorna, obronna, czasem chlodna.',
    toneRule: 'Use a mildly sharp and defensive tone, but keep it natural and readable.',
  },
  {
    id: 'formal_knight',
    label: 'Formalny rycerz',
    hint: 'Oficjalny, honorowy, uporzadkowany jezyk.',
    toneRule: 'Use polite, honorable, and structured phrasing; avoid slang.',
  },
  {
    id: 'child',
    label: 'Dziecko',
    hint: 'Prostsze i krotsze zdania, mlodszy ton.',
    toneRule: 'Use simpler vocabulary and shorter, softer sentence structures.',
  },
  {
    id: 'elderly_man',
    label: 'Starszy pan',
    hint: 'Spokojny, stateczny, lekko klasyczny ton.',
    toneRule: 'Use calm, measured, slightly old-fashioned but natural phrasing.',
  },
  {
    id: 'calm_girl',
    label: 'Spokojna dziewczyna',
    hint: 'Lagodniejsze i delikatniejsze brzmienie.',
    toneRule: 'Use gentle and calm wording, avoiding aggressive tone.',
  },
  {
    id: 'energetic_girl',
    label: 'Energiczna dziewczyna',
    hint: 'Zywsza, bardziej ekspresyjna i bezposrednia.',
    toneRule: 'Use lively, direct, upbeat phrasing while preserving meaning.',
  },
  {
    id: 'cold_professional',
    label: 'Zimny profesjonalista',
    hint: 'Krotko, rzeczowo, oszczednie emocjonalnie.',
    toneRule: 'Keep wording concise, precise, and emotionally restrained.',
  },
  {
    id: 'arrogant_noble',
    label: 'Arogancki szlachcic',
    hint: 'Wyniosly ton i wyzszy rejestr.',
    toneRule: 'Use elevated and slightly condescending noble register without parody.',
  },
  {
    id: 'shy',
    label: 'Niesmiala postac',
    hint: 'Ostrozna, mniej bezposrednia, delikatna.',
    toneRule: 'Use tentative, softer phrasing and less direct statements.',
  },
  {
    id: 'comic_slacker',
    label: 'Luzak / komediowy',
    hint: 'Swobodny, lekko humorystyczny rytm.',
    toneRule: 'Use easygoing colloquial rhythm with light humor when natural.',
  },
]

const styleById = new Map(TRANSLATION_STYLES.map(s => [s.id, s]))
const archetypeById = new Map(CHARACTER_ARCHETYPES.map(item => [item.id, item]))

function normalizeCharacterNameForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

function findCharacterByName(
  settings: ProjectTranslationStyleSettings,
  characterName: string,
): CharacterStyleAssignment | undefined {
  const exact = settings.characters.find(item => item.name === characterName)
  if (exact) return exact
  const resolved = resolveCharacterByName(characterName, settings.characters, { preferKnownGender: true })
  if (resolved) return resolved
  const normalized = normalizeCharacterNameForMatch(characterName)
  if (!normalized) return undefined
  return settings.characters.find(item => normalizeCharacterNameForMatch(item.name) === normalized)
}

function storageKey(projectId: string): string {
  return `animegate.project.${projectId}.translation-style.v1`
}

export function getStyleLabel(styleId: TranslationStyleId): string {
  return styleById.get(styleId)?.label ?? 'Neutralny'
}

export function getArchetypeLabel(archetypeId: CharacterArchetypeId): string {
  return archetypeById.get(archetypeId)?.label ?? 'Domyslny'
}

export function getArchetypeToneRule(archetypeId: CharacterArchetypeId): string {
  return archetypeById.get(archetypeId)?.toneRule ?? archetypeById.get('default')?.toneRule ?? ''
}

export function createDefaultProfile(): CharacterStyleProfile {
  return normalizeCharacterSpeechProfile(createDefaultCharacterSpeechProfile()) as CharacterStyleProfile
}

function normalizeProfile(profile?: Partial<CharacterStyleProfile> | null): CharacterStyleProfile {
  return normalizeCharacterSpeechProfile(profile) as CharacterStyleProfile
}

export function createProjectStyleSettings(
  projectId: string,
  characters: Omit<CharacterStyleAssignment, 'style' | 'profile'>[],
): ProjectTranslationStyleSettings {
  return {
    projectId,
    globalStyle: 'neutral',
    globalStyleProfile: createDefaultGlobalStyleProfile('neutral'),
    updatedAt: new Date().toISOString(),
    characters: characters.map(character => ({
      ...character,
      style: null,
      profile: createDefaultProfile(),
    })),
  }
}

export function saveProjectStyleSettings(settings: ProjectTranslationStyleSettings): void {
  localStorage.setItem(storageKey(settings.projectId), JSON.stringify(settings))
}

export function loadProjectStyleSettings(
  projectId: string,
  baseCharacters: Omit<CharacterStyleAssignment, 'style' | 'profile'>[],
): ProjectTranslationStyleSettings {
  const raw = localStorage.getItem(storageKey(projectId))

  if (!raw) {
    return createProjectStyleSettings(projectId, baseCharacters)
  }

  try {
    const parsed = JSON.parse(raw) as ProjectTranslationStyleSettings
    const parsedMap = new Map(parsed.characters.map(character => [character.id, character]))
    const baseIds = new Set(baseCharacters.map(character => character.id))
    const extraParsedCharacters = parsed.characters.filter(character => !baseIds.has(character.id))

    return {
      projectId,
      globalStyle: parsed.globalStyle ?? 'neutral',
      globalStyleProfile: normalizeGlobalStyleProfile(parsed.globalStyleProfile, parsed.globalStyle ?? 'neutral'),
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      characters: [
        ...baseCharacters.map(base => {
          const existing = parsedMap.get(base.id)
          return {
            ...base,
            imageUrl: existing?.imageUrl ?? null,
            gender: existing?.gender ?? base.gender,
            style: existing?.style ?? null,
            profile: normalizeProfile(existing?.profile),
          }
        }),
        ...extraParsedCharacters.map(character => ({
          ...character,
          imageUrl: character.imageUrl ?? null,
          profile: normalizeProfile(character.profile),
        })),
      ],
    }
  } catch {
    return createProjectStyleSettings(projectId, baseCharacters)
  }
}

export function resolveEffectiveStyle(
  settings: ProjectTranslationStyleSettings,
  characterName: string,
): { style: TranslationStyleId; source: 'character' | 'global' } {
  const character = findCharacterByName(settings, characterName)

  if (character?.style) {
    return { style: character.style, source: 'character' }
  }

  return { style: settings.globalStyle, source: 'global' }
}

export function buildTranslationStyleContext(
  settings: ProjectTranslationStyleSettings,
  characterName: string,
  gender: CharacterGender | null,
): string {
  const effective = resolveEffectiveStyle(settings, characterName)
  const character = findCharacterByName(settings, characterName)
  const displayName = characterName.trim() || 'Narrator'

  const chunks = [
    `Postac: ${displayName}`,
    `Plec: ${gender ?? 'Unknown'}`,
    `Styl globalny: ${getStyleLabel(settings.globalStyle)}`,
    `Styl aktywny: ${getStyleLabel(effective.style)} (${effective.source === 'character' ? 'nadpisanie postaci' : 'globalny'})`,
    `Archetyp: ${getArchetypeLabel(character?.profile.archetype ?? 'default')}`,
    character?.profile.characterTypeId ? `Typ charakteru: ${character.profile.characterTypeId}` : '',
    character?.profile.characterSubtypeId ? `Podtyp charakteru: ${character.profile.characterSubtypeId}` : '',
    `STYLE_ID_ACTIVE: ${effective.style}`,
    `STYLE_SOURCE: ${effective.source}`,
  ]

  const archetypeRule = getArchetypeToneRule(character?.profile.archetype ?? 'default')
  if (archetypeRule) {
    chunks.push(`Archetype tone rule: ${archetypeRule}`)
  }

  if (character?.profile.speakingTraits) {
    chunks.push(`Dodatkowe cechy mowienia: ${character.profile.speakingTraits}`)
  }

  if (character?.profile.characterNote) {
    chunks.push(`Notatka postaci: ${character.profile.characterNote}`)
  }

  if (character?.profile.characterUserNotes) {
    chunks.push(`Notatki uzytkownika (Krok 2): ${character.profile.characterUserNotes}`)
  }

  if (character?.profile.personalitySummary) {
    chunks.push(`Skrot osobowosci: ${character.profile.personalitySummary}`)
  }

  if (character?.profile.mannerOfAddress) {
    chunks.push(`Zwroty do innych: ${character.profile.mannerOfAddress}`)
  }

  if (character?.profile.politenessLevel) {
    chunks.push(`Poziom grzecznosci: ${character.profile.politenessLevel}`)
  }

  if (character?.profile.vocabularyType) {
    chunks.push(`Slownictwo: ${character.profile.vocabularyType}`)
  }

  if (character?.profile.temperament) {
    chunks.push(`Temperament: ${character.profile.temperament}`)
  }

  if (character?.profile.anilistDescription) {
    const short = character.profile.anilistDescription.length > 260
      ? `${character.profile.anilistDescription.slice(0, 260).trim()}...`
      : character.profile.anilistDescription
    chunks.push(`Opis AniList (skrot): ${short}`)
  }

  return chunks.join('\n')
}
