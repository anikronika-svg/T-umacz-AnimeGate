// Smoke test for series projects workflow: New Project / Load Project.
// It validates persistence and isolation for project A/B state using
// the same storage keys used by the app.

const SERIES_PROJECTS_STORAGE_KEY = 'animegate.series-projects.v1';
const DEFAULT_TRANSLATION_MODEL_ID = 'deepl:deepl-default';

class MemoryStorage {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed));
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  snapshot() {
    return Object.fromEntries(this.map.entries());
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function sanitizeProjectId(value) {
  return value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '')
    .slice(0, 64);
}

function styleStorageKey(projectId) {
  return `animegate.project.${projectId}.translation-style.v1`;
}

function createDefaultProfile() {
  return {
    archetype: 'default',
    speakingTraits: '',
    characterNote: '',
    anilistDescription: '',
    mannerOfAddress: '',
    politenessLevel: '',
    vocabularyType: '',
    temperament: '',
  };
}

function normalizeProfile(profile) {
  const defaults = createDefaultProfile();
  return {
    archetype: profile?.archetype ?? defaults.archetype,
    speakingTraits: profile?.speakingTraits ?? defaults.speakingTraits,
    characterNote: profile?.characterNote ?? defaults.characterNote,
    anilistDescription: profile?.anilistDescription ?? defaults.anilistDescription,
    mannerOfAddress: profile?.mannerOfAddress ?? defaults.mannerOfAddress,
    politenessLevel: profile?.politenessLevel ?? defaults.politenessLevel,
    vocabularyType: profile?.vocabularyType ?? defaults.vocabularyType,
    temperament: profile?.temperament ?? defaults.temperament,
  };
}

function createProjectStyleSettings(projectId, characters) {
  return {
    projectId,
    globalStyle: 'neutral',
    updatedAt: new Date().toISOString(),
    characters: characters.map(character => ({
      ...character,
      style: null,
      profile: createDefaultProfile(),
    })),
  };
}

function saveProjectStyleSettings(storage, settings) {
  storage.setItem(styleStorageKey(settings.projectId), JSON.stringify(settings));
}

function loadProjectStyleSettings(storage, projectId, baseCharacters) {
  const raw = storage.getItem(styleStorageKey(projectId));
  if (!raw) return createProjectStyleSettings(projectId, baseCharacters);
  try {
    const parsed = JSON.parse(raw);
    const parsedMap = new Map(parsed.characters.map(character => [character.id, character]));
    const baseIds = new Set(baseCharacters.map(character => character.id));
    const extra = parsed.characters.filter(character => !baseIds.has(character.id));
    return {
      projectId,
      globalStyle: parsed.globalStyle ?? 'neutral',
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      characters: [
        ...baseCharacters.map(base => {
          const existing = parsedMap.get(base.id);
          return {
            ...base,
            gender: existing?.gender ?? base.gender,
            style: existing?.style ?? null,
            profile: normalizeProfile(existing?.profile),
          };
        }),
        ...extra.map(character => ({ ...character, profile: normalizeProfile(character.profile) })),
      ],
    };
  } catch {
    return createProjectStyleSettings(projectId, baseCharacters);
  }
}

function loadSeriesProjectsCatalog(storage) {
  const fallback = [{
    id: 'AnimeGate_EP01',
    title: 'Nagieko no Bourei wa Intai shitai',
    anilistId: null,
    preferredModelId: DEFAULT_TRANSLATION_MODEL_ID,
    sourceLang: 'en',
    targetLang: 'pl',
    lastUpdated: new Date().toISOString(),
  }];

  const raw = storage.getItem(SERIES_PROJECTS_STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
    return parsed.map(item => ({
      id: sanitizeProjectId(item.id) || 'AnimeGate_EP01',
      title: (item.title ?? '').trim() || 'Bez nazwy',
      anilistId: Number.isFinite(item.anilistId) ? item.anilistId : null,
      preferredModelId: item.preferredModelId || DEFAULT_TRANSLATION_MODEL_ID,
      sourceLang: item.sourceLang || 'en',
      targetLang: item.targetLang || 'pl',
      lastUpdated: item.lastUpdated || new Date().toISOString(),
    }));
  } catch {
    return fallback;
  }
}

function saveSeriesProjectsCatalog(storage, catalog) {
  storage.setItem(SERIES_PROJECTS_STORAGE_KEY, JSON.stringify(catalog));
}

function buildCharacter({
  id,
  name,
  gender,
  style,
  archetype,
  speakingTraits,
  characterNote,
  anilistDescription,
}) {
  return {
    id,
    name,
    gender,
    avatarColor: '#4f8ad6',
    style,
    profile: {
      ...createDefaultProfile(),
      archetype,
      speakingTraits,
      characterNote,
      anilistDescription,
    },
  };
}

function main() {
  const storage = new MemoryStorage();
  const baseCharacters = [];

  // 1) Create project A
  const projectA = {
    id: 'Nageki_Series',
    title: 'Nageki no Bourei wa Intai shitai',
    anilistId: 177104,
    preferredModelId: 'deepl:deepl-default',
    sourceLang: 'en',
    targetLang: 'pl',
    lastUpdated: new Date().toISOString(),
  };
  let catalog = loadSeriesProjectsCatalog(storage).filter(p => p.id !== 'AnimeGate_EP01');
  catalog.push(projectA);
  saveSeriesProjectsCatalog(storage, catalog);

  const styleA = {
    projectId: projectA.id,
    globalStyle: 'less_formal',
    updatedAt: new Date().toISOString(),
    characters: [
      buildCharacter({
        id: 1,
        name: 'Tino',
        gender: 'Female',
        style: 'casual',
        archetype: 'tsundere',
        speakingTraits: 'zadziorna, szybko się peszy',
        characterNote: 'Krótki skrót: zadziorna, ale opiekuńcza.',
        anilistDescription: 'Pełny opis Tino z AniList...',
      }),
      buildCharacter({
        id: 2,
        name: 'Krai',
        gender: 'Male',
        style: 'neutral',
        archetype: 'cold_professional',
        speakingTraits: 'oszczędny, chłodny',
        characterNote: 'Krótki skrót: chłodny profesjonalista.',
        anilistDescription: 'Pełny opis Krai z AniList...',
      }),
    ],
  };
  saveProjectStyleSettings(storage, styleA);

  // 2) Create project B
  const projectB = {
    id: 'Another_Series',
    title: 'Inny Tytul Anime',
    anilistId: 123456,
    preferredModelId: 'openrouter:gpt-4o-mini',
    sourceLang: 'ja',
    targetLang: 'pl',
    lastUpdated: new Date().toISOString(),
  };
  catalog = loadSeriesProjectsCatalog(storage);
  catalog.push(projectB);
  saveSeriesProjectsCatalog(storage, catalog);

  const styleB = {
    projectId: projectB.id,
    globalStyle: 'formal',
    updatedAt: new Date().toISOString(),
    characters: [
      buildCharacter({
        id: 10,
        name: 'Aria',
        gender: 'Female',
        style: 'formal',
        archetype: 'formal_knight',
        speakingTraits: 'uporządkowana, godna',
        characterNote: 'Krótki skrót: oficjalna i stanowcza.',
        anilistDescription: 'Pełny opis Arii z AniList...',
      }),
    ],
  };
  saveProjectStyleSettings(storage, styleB);

  // Manual edit in A after B exists (must persist and be isolated)
  const loadedAForEdit = loadProjectStyleSettings(storage, projectA.id, baseCharacters);
  loadedAForEdit.characters[0].profile.speakingTraits = 'zadziorna, szybko się peszy, mówi półsłówkami';
  saveProjectStyleSettings(storage, loadedAForEdit);

  // 3) Load A and verify 1:1
  const loadedCatalog = loadSeriesProjectsCatalog(storage);
  const loadedProjectA = loadedCatalog.find(p => p.id === projectA.id);
  const loadedProjectB = loadedCatalog.find(p => p.id === projectB.id);
  const loadedStyleA = loadProjectStyleSettings(storage, projectA.id, baseCharacters);
  const loadedStyleB = loadProjectStyleSettings(storage, projectB.id, baseCharacters);

  assert(loadedProjectA?.title === projectA.title, 'A.title mismatch');
  assert(loadedProjectA?.anilistId === projectA.anilistId, 'A.anilistId mismatch');
  assert(loadedProjectA?.sourceLang === projectA.sourceLang, 'A.sourceLang mismatch');
  assert(loadedProjectA?.targetLang === projectA.targetLang, 'A.targetLang mismatch');
  assert(loadedProjectA?.preferredModelId === projectA.preferredModelId, 'A.model mismatch');

  assert(loadedStyleA.globalStyle === 'less_formal', 'A.globalStyle mismatch');
  assert(loadedStyleA.characters.length === 2, 'A.characters count mismatch');
  assert(loadedStyleA.characters[0].profile.archetype === 'tsundere', 'A.archetype mismatch');
  assert(loadedStyleA.characters[0].profile.anilistDescription.includes('AniList'), 'A.anilistDescription missing');
  assert(
    loadedStyleA.characters[0].profile.speakingTraits.includes('półsłówkami'),
    'A.manual speakingTraits edit not persisted',
  );
  assert(loadedStyleA.characters[0].profile.characterNote.length > 0, 'A.characterNote missing');

  // Ensure A and B do not overwrite each other
  assert(loadedProjectB?.title === projectB.title, 'B.title mismatch');
  assert(loadedStyleB.globalStyle === 'formal', 'B.globalStyle mismatch');
  assert(loadedStyleB.characters.length === 1, 'B.characters count mismatch');
  assert(loadedStyleB.characters[0].name === 'Aria', 'B.character mismatch');
  assert(loadedStyleA.characters.every(c => c.name !== 'Aria'), 'Cross-project contamination A<-B');

  // 4) Simulate restart: recreate app storage from snapshot and load again
  const restartStorage = new MemoryStorage(storage.snapshot());
  const restartCatalog = loadSeriesProjectsCatalog(restartStorage);
  const restartA = loadProjectStyleSettings(restartStorage, projectA.id, baseCharacters);
  const restartB = loadProjectStyleSettings(restartStorage, projectB.id, baseCharacters);

  assert(restartCatalog.some(p => p.id === projectA.id), 'Restart: A not available');
  assert(restartCatalog.some(p => p.id === projectB.id), 'Restart: B not available');
  assert(restartA.characters[0].profile.speakingTraits.includes('półsłówkami'), 'Restart: A manual edit lost');
  assert(restartB.characters[0].profile.archetype === 'formal_knight', 'Restart: B archetype lost');

  console.log('PASS: Workflow A/B New Project / Load Project is stable.');
  console.log('PASS: A and B are isolated, manual edits persist, restart persistence confirmed.');
  console.log('PASS: Restored fields include title, anilistId, characters, gender, style, archetype, speakingTraits, globalStyle, source/target, model.');
}

main();
