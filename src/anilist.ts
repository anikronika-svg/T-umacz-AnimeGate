import type { CharacterArchetypeId, CharacterGender, TranslationStyleId } from './translationStyle'

const ANILIST_URL = 'https://graphql.anilist.co'

export interface AniListAnimeResult {
  id: number
  title: string
  seasonLabel: string
}

export interface AniListCharacter {
  id: number
  name: string
  gender: CharacterGender
  avatarColor: string
  roleLabel: AniListRoleLabel
  imageUrl: string | null
  description: string
  descriptionShort: string
  personalityTraits: string[]
  inferredArchetype: CharacterArchetypeId
  inferredStyle: TranslationStyleId | null
  inferredMannerOfAddress: string
  inferredPolitenessLevel: string
  inferredVocabularyType: string
  inferredTemperament: string
}

type AniListRoleLabel = 'Glowna' | 'Drugopl.' | 'Tlo' | 'Unknown'

interface GraphQlResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

function toSeasonLabel(episodes?: number | null): string {
  if (!episodes || episodes < 1) return 'brak danych'
  return `${episodes} odc`
}

function colorFromId(id: number): string {
  const hue = Math.abs(id * 47) % 360
  return `hsl(${hue} 45% 58%)`
}

function normalizeGender(raw?: string | null): CharacterGender {
  if (!raw) return 'Unknown'
  const value = raw.toLowerCase()
  if (value.includes('female')) return 'Female'
  if (value.includes('male')) return 'Male'
  return 'Unknown'
}

function normalizeRole(raw?: string | null): AniListRoleLabel {
  const value = (raw ?? '').toUpperCase()
  if (value === 'MAIN') return 'Glowna'
  if (value === 'SUPPORTING') return 'Drugopl.'
  if (value === 'BACKGROUND') return 'Tlo'
  return 'Unknown'
}

function roleRank(role: AniListRoleLabel): number {
  if (role === 'Glowna') return 3
  if (role === 'Drugopl.') return 2
  if (role === 'Tlo') return 1
  return 0
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
}

function sanitizeCharacterDescription(raw?: string | null): string {
  if (!raw) return ''
  return stripHtml(raw)
    .replace(/~!/g, '')
    .replace(/!~/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, '$1')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function shortenDescription(description: string, maxLength = 220): string {
  const clean = description.trim()
  if (!clean) return ''
  if (clean.length <= maxLength) return clean
  const cut = clean.slice(0, maxLength)
  const lastPunctuation = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'))
  if (lastPunctuation >= 80) return `${cut.slice(0, lastPunctuation + 1).trim()}`
  const lastSpace = cut.lastIndexOf(' ')
  if (lastSpace >= 80) return `${cut.slice(0, lastSpace).trim()}...`
  return `${cut.trim()}...`
}

function extractPersonalityTraits(description: string): string[] {
  const normalized = description.toLowerCase()
  if (!normalized) return []

  const traitMatchers: Array<{ trait: string; patterns: RegExp[] }> = [
    { trait: 'spokojna', patterns: [/\bcalm\b/, /\bgentle\b/, /\bquiet\b/, /\bsoft[-\s]?spoken\b/] },
    { trait: 'arogancka', patterns: [/\barrogant\b/, /\bproud\b/, /\bsnobbish\b/, /\bhaughty\b/] },
    { trait: 'nieśmiała', patterns: [/\bshy\b/, /\btimid\b/, /\breserved\b/, /\binsecure\b/] },
    { trait: 'impulsywna', patterns: [/\bimpulsive\b/, /\bhot[-\s]?headed\b/, /\bshort[-\s]?tempered\b/] },
    { trait: 'formalna', patterns: [/\bformal\b/, /\bpolite\b/, /\bcourteous\b/, /\bproper\b/] },
    { trait: 'dziecinna', patterns: [/\bchildish\b/, /\bimmature\b/, /\bplayful\b/, /\byoung\b/] },
    { trait: 'opiekuńcza', patterns: [/\bcaring\b/, /\bkind\b/, /\bprotective\b/, /\bnurturing\b/] },
    { trait: 'zadziorna', patterns: [/\btsundere\b/, /\bsharp[-\s]?tongued\b/, /\babrasive\b/, /\bstubborn\b/] },
    { trait: 'chłodna', patterns: [/\bcold\b/, /\bstoic\b/, /\bemotionless\b/, /\bdetached\b/] },
    { trait: 'energiczna', patterns: [/\benergetic\b/, /\blively\b/, /\bcheerful\b/, /\benthusiastic\b/] },
  ]

  const out: string[] = []
  traitMatchers.forEach(item => {
    if (item.patterns.some(pattern => pattern.test(normalized))) {
      out.push(item.trait)
    }
  })

  return out.slice(0, 5)
}

function hasAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text))
}

function inferArchetypeFromDescription(description: string, traits: string[]): CharacterArchetypeId {
  const normalized = `${description} ${traits.join(' ')}`.toLowerCase()
  if (!normalized.trim()) return 'default'

  if (hasAnyPattern(normalized, [/\btsundere\b/, /\bsharp[-\s]?tongued\b/, /\bdefensive\b/])) return 'tsundere'
  if (hasAnyPattern(normalized, [/\bknight\b/, /\bchival(?:ry|rous)\b/, /\bhonor(?:able)?\b/])) return 'formal_knight'
  if (hasAnyPattern(normalized, [/\bchild\b/, /\bkid\b/, /\byoung\b/, /\belementary\b/])) return 'child'
  if (hasAnyPattern(normalized, [/\belderly\b/, /\bold(?:er)?\b/, /\bgrandpa\b/, /\bveteran\b/])) return 'elderly_man'
  if (hasAnyPattern(normalized, [/\benergetic\b/, /\blively\b/, /\bgenki\b/, /\benthusiastic\b/])) return 'energetic_girl'
  if (hasAnyPattern(normalized, [/\bcold\b/, /\bstoic\b/, /\bprofessional\b/, /\bdetached\b/])) return 'cold_professional'
  if (hasAnyPattern(normalized, [/\baristocrat\b/, /\bnoble\b/, /\barrogant\b/, /\bproud\b/, /\bhaughty\b/])) return 'arrogant_noble'
  if (hasAnyPattern(normalized, [/\bshy\b/, /\btimid\b/, /\breserved\b/, /\binsecure\b/])) return 'shy'
  if (hasAnyPattern(normalized, [/\bcomic\b/, /\bfunny\b/, /\bslacker\b/, /\blazy\b/, /\bjoker\b/])) return 'comic_slacker'
  if (hasAnyPattern(normalized, [/\bcalm\b/, /\bgentle\b/, /\bsoft[-\s]?spoken\b/, /\bquiet\b/])) return 'calm_girl'
  return 'default'
}

function inferStyleFromDescription(description: string, traits: string[]): TranslationStyleId | null {
  const normalized = `${description} ${traits.join(' ')}`.toLowerCase()
  if (!normalized.trim()) return null

  if (hasAnyPattern(normalized, [/\bformal\b/, /\bpolite\b/, /\bcourteous\b/, /\bproper\b/])) return 'formal'
  if (hasAnyPattern(normalized, [/\bchild\b/, /\bchildish\b/, /\bimmature\b/])) return 'childish'
  if (hasAnyPattern(normalized, [/\benergetic\b/, /\blively\b/, /\bcheerful\b/])) return 'energetic'
  if (hasAnyPattern(normalized, [/\bcold\b/, /\bstoic\b/, /\bdetached\b/])) return 'cold'
  if (hasAnyPattern(normalized, [/\bshy\b/, /\btimid\b/, /\binsecure\b/])) return 'shy'
  if (hasAnyPattern(normalized, [/\bconfident\b/, /\bassertive\b/, /\bbold\b/])) return 'confident'
  if (hasAnyPattern(normalized, [/\bsarcastic\b/, /\bironic\b/, /\bmocking\b/])) return 'sarcastic'
  if (hasAnyPattern(normalized, [/\baggressive\b/, /\bhot[-\s]?headed\b/, /\babrasive\b/])) return 'aggressive'
  if (hasAnyPattern(normalized, [/\belegant\b/, /\baristocrat\b/, /\bnoble\b/])) return 'elegant'
  if (hasAnyPattern(normalized, [/\bstrict\b/, /\brigid\b/, /\bdisciplined\b/])) return 'rigid'
  if (hasAnyPattern(normalized, [/\bcasual\b/, /\bplayful\b/, /\beasygoing\b/, /\bcomic\b/])) return 'casual'
  return null
}

function inferProfileHints(description: string, traits: string[]): {
  mannerOfAddress: string
  politenessLevel: string
  vocabularyType: string
  temperament: string
} {
  const normalized = `${description} ${traits.join(' ')}`.toLowerCase()
  if (!normalized.trim()) {
    return {
      mannerOfAddress: '',
      politenessLevel: '',
      vocabularyType: '',
      temperament: '',
    }
  }

  const politenessLevel = hasAnyPattern(normalized, [/\bformal\b/, /\bpolite\b/, /\bcourteous\b/])
    ? 'Wysoki'
    : hasAnyPattern(normalized, [/\bcasual\b/, /\bslang\b/, /\beasygoing\b/])
      ? 'Niski'
      : 'Sredni'
  const mannerOfAddress = politenessLevel === 'Wysoki'
    ? 'Uprzejme zwroty i pelne formy'
    : politenessLevel === 'Niski'
      ? 'Bezposrednie, swobodne zwroty'
      : 'Naturalne, neutralne zwroty'
  const vocabularyType = hasAnyPattern(normalized, [/\bchild\b/, /\bchildish\b/, /\bimmature\b/])
    ? 'Proste i codzienne'
    : hasAnyPattern(normalized, [/\baristocrat\b/, /\bnoble\b/, /\belegant\b/])
      ? 'Podwyzszony rejestr'
      : hasAnyPattern(normalized, [/\bcold\b/, /\bprofessional\b/, /\bstrict\b/])
        ? 'Precyzyjne i rzeczowe'
        : 'Naturalne, dialogowe'
  const temperament = hasAnyPattern(normalized, [/\bcalm\b/, /\bgentle\b/, /\bquiet\b/])
    ? 'Spokojny'
    : hasAnyPattern(normalized, [/\benergetic\b/, /\benthusiastic\b/, /\bimpulsive\b/])
      ? 'Zywiołowy'
      : hasAnyPattern(normalized, [/\bcold\b/, /\bstoic\b/, /\bdetached\b/])
        ? 'Powściągliwy'
        : hasAnyPattern(normalized, [/\barrogant\b/, /\bproud\b/, /\bhaughty\b/])
          ? 'Wyniosły'
          : 'Zrownowazony'

  return {
    mannerOfAddress,
    politenessLevel,
    vocabularyType,
    temperament,
  }
}

async function requestAniList<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`AniList HTTP ${response.status}`)
  }

  const parsed = await response.json() as GraphQlResponse<T>
  if (parsed.errors?.length) {
    throw new Error(parsed.errors[0].message || 'AniList GraphQL error')
  }

  if (!parsed.data) {
    throw new Error('AniList returned empty data')
  }

  return parsed.data
}

export async function searchAnimeByTitle(queryText: string): Promise<AniListAnimeResult[]> {
  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 8) {
        media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
          id
          episodes
          title {
            romaji
            english
          }
        }
      }
    }
  `

  interface Payload {
    Page: {
      media: Array<{
        id: number
        episodes?: number | null
        title: {
          romaji?: string | null
          english?: string | null
        }
      }>
    }
  }

  const data = await requestAniList<Payload>(query, { search: queryText })
  return data.Page.media.map(media => ({
    id: media.id,
    title: media.title.english || media.title.romaji || `Anime #${media.id}`,
    seasonLabel: toSeasonLabel(media.episodes),
  }))
}

export async function getAnimeCharacters(mediaId: number): Promise<AniListCharacter[]> {
  const query = `
    query ($mediaId: Int, $page: Int) {
      Media(id: $mediaId, type: ANIME) {
        characters(page: $page, perPage: 50, sort: [ROLE, RELEVANCE, ID]) {
          pageInfo {
            hasNextPage
          }
          edges {
            role
            node {
              id
              name {
                full
              }
              gender
              description(asHtml: false)
              image {
                large
                medium
              }
            }
          }
        }
      }
    }
  `

  interface Payload {
    Media: {
      characters: {
        pageInfo: {
          hasNextPage: boolean
        }
        edges: Array<{
          role?: string | null
          node: {
            id: number
            gender?: string | null
            name: {
              full?: string | null
            }
            description?: string | null
            image?: {
              large?: string | null
              medium?: string | null
            } | null
          }
        }>
      }
    }
  }

  const allEdges: Payload['Media']['characters']['edges'] = []
  let page = 1
  let hasNextPage = true

  while (hasNextPage) {
    const data = await requestAniList<Payload>(query, { mediaId, page })
    const chars = data.Media?.characters
    if (!chars) break
    allEdges.push(...chars.edges)
    hasNextPage = Boolean(chars.pageInfo?.hasNextPage)
    page += 1
    if (page > 20) break
  }

  const seen = new Set<number>()

  return allEdges
    .filter(edge => !!edge?.node?.id && !seen.has(edge.node.id) && !!edge.node.name.full)
    .map(edge => {
      const node = edge.node
      seen.add(node.id)
      const description = sanitizeCharacterDescription(node.description)
      const personalityTraits = extractPersonalityTraits(description)
      const inferredArchetype = inferArchetypeFromDescription(description, personalityTraits)
      const inferredStyle = inferStyleFromDescription(description, personalityTraits)
      const inferredProfile = inferProfileHints(description, personalityTraits)
      return {
        id: node.id,
        name: node.name.full as string,
        gender: normalizeGender(node.gender),
        avatarColor: colorFromId(node.id),
        roleLabel: normalizeRole(edge.role),
        imageUrl: node.image?.large || node.image?.medium || null,
        description,
        descriptionShort: shortenDescription(description),
        personalityTraits,
        inferredArchetype,
        inferredStyle,
        inferredMannerOfAddress: inferredProfile.mannerOfAddress,
        inferredPolitenessLevel: inferredProfile.politenessLevel,
        inferredVocabularyType: inferredProfile.vocabularyType,
        inferredTemperament: inferredProfile.temperament,
      }
    })
}

interface RelatedMediaEdge {
  relationType?: string | null
  node?: {
    id: number
    type?: string | null
  } | null
}

interface RelatedMediaPayload {
  Media: {
    id: number
    relations?: {
      edges: RelatedMediaEdge[]
    } | null
  } | null
}

async function getDirectSeriesLinks(mediaId: number): Promise<number[]> {
  const query = `
    query ($mediaId: Int) {
      Media(id: $mediaId, type: ANIME) {
        id
        relations {
          edges {
            relationType
            node {
              id
              type
            }
          }
        }
      }
    }
  `

  const data = await requestAniList<RelatedMediaPayload>(query, { mediaId })
  if (!data.Media?.relations?.edges?.length) return []

  return data.Media.relations.edges
    .filter(edge => {
      const relationType = (edge.relationType ?? '').toUpperCase()
      const nodeType = (edge.node?.type ?? '').toUpperCase()
      if (nodeType !== 'ANIME') return false
      return relationType === 'PREQUEL' || relationType === 'SEQUEL'
    })
    .map(edge => edge.node?.id)
    .filter((id): id is number => Number.isFinite(id))
}

async function getSeriesMediaIds(startMediaId: number): Promise<number[]> {
  const toVisit: number[] = [startMediaId]
  const visited = new Set<number>()
  const result = new Set<number>()

  while (toVisit.length > 0) {
    const currentId = toVisit.shift() as number
    if (visited.has(currentId)) continue
    visited.add(currentId)
    result.add(currentId)
    if (visited.size > 40) break

    try {
      const linkedIds = await getDirectSeriesLinks(currentId)
      linkedIds.forEach(id => {
        if (!visited.has(id)) toVisit.push(id)
      })
    } catch {
      // Ignorujemy pojedynczy blad relacji i kontynuujemy dla pozostalych wpisow.
    }
  }

  return [...result]
}

export async function getAnimeCharactersForSeries(mediaId: number): Promise<AniListCharacter[]> {
  const mediaIds = await getSeriesMediaIds(mediaId)
  const casts = await Promise.all(mediaIds.map(id => getAnimeCharacters(id)))
  const merged = new Map<number, AniListCharacter>()

  casts.flat().forEach(character => {
    const existing = merged.get(character.id)
    if (!existing) {
      merged.set(character.id, { ...character })
      return
    }

    const next: AniListCharacter = {
      ...existing,
      name: existing.name || character.name,
      imageUrl: existing.imageUrl || character.imageUrl,
      gender: existing.gender === 'Unknown' ? character.gender : existing.gender,
      description: existing.description.length >= character.description.length ? existing.description : character.description,
      descriptionShort: existing.descriptionShort.length >= character.descriptionShort.length ? existing.descriptionShort : character.descriptionShort,
      personalityTraits: [...new Set([...existing.personalityTraits, ...character.personalityTraits])].slice(0, 6),
      inferredArchetype: existing.inferredArchetype !== 'default' ? existing.inferredArchetype : character.inferredArchetype,
      inferredStyle: existing.inferredStyle ?? character.inferredStyle ?? null,
      inferredMannerOfAddress: existing.inferredMannerOfAddress || character.inferredMannerOfAddress,
      inferredPolitenessLevel: existing.inferredPolitenessLevel || character.inferredPolitenessLevel,
      inferredVocabularyType: existing.inferredVocabularyType || character.inferredVocabularyType,
      inferredTemperament: existing.inferredTemperament || character.inferredTemperament,
      roleLabel: roleRank(character.roleLabel) > roleRank(existing.roleLabel)
        ? character.roleLabel
        : existing.roleLabel,
    }
    merged.set(character.id, next)
  })

  return [...merged.values()].sort((a, b) => (
    roleRank(b.roleLabel) - roleRank(a.roleLabel)
    || a.name.localeCompare(b.name, 'pl')
  ))
}
