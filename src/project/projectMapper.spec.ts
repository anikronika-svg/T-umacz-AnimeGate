import { describe, expect, it } from 'vitest'
import {
  buildDiskProjectConfig,
  hydrateStateFromDiskProject,
  PROJECT_SCHEMA_VERSION,
  type DiskProjectConfigV1,
} from './projectMapper'
import { createProjectStyleSettings } from '../translationStyle'

describe('projectMapper character profile persistence', () => {
  it('serializes and hydrates extended character profile fields', () => {
    const settings = createProjectStyleSettings('test_project', [{
      id: 1,
      name: 'Tino',
      displayName: 'Tino',
      originalName: 'Tino Shade',
      gender: 'Female',
      avatarColor: '#4f8ad6',
      imageUrl: 'https://img.example/tino.jpg',
      avatarPath: 'cache/tino.jpg',
      avatarUrl: 'https://img.example/tino.jpg',
    }])
    settings.characters[0].profile.translationGender = 'feminine'
    settings.characters[0].profile.speakingStyle = 'cieply'
    settings.characters[0].profile.personalityTraits = ['lojalna', 'uprzejma']
    settings.characters[0].profile.translationNotes = 'Mow łagodnie i dojrzale.'
    settings.characters[0].profile.customPromptHint = 'Unikaj agresywnych zwrotow.'
    settings.characters[0].profile.isUserEdited = true

    const disk = buildDiskProjectConfig({
      projectDir: 'C:/tmp/project',
      configPath: 'C:/tmp/project/animegate-project.json',
      projectId: 'test_project',
      title: 'Test',
      anilistId: 123,
      sourceLang: 'en',
      targetLang: 'pl',
      preferredModelId: 'deepl:deepl-default',
      styleSettings: settings,
      lineCharacterAssignments: [],
    })

    const hydrated = hydrateStateFromDiskProject(disk)
    const character = hydrated.styleSettings.characters[0]
    expect(character.profile.translationGender).toBe('feminine')
    expect(character.profile.speakingStyle).toBe('cieply')
    expect(character.profile.personalityTraits).toEqual(['lojalna', 'uprzejma'])
    expect(character.profile.translationNotes).toContain('łagodnie')
    expect(character.profile.customPromptHint).toContain('agresywnych')
    expect(character.profile.isUserEdited).toBe(true)
  })

  it('hydrates older profile payloads with safe defaults (migration fallback)', () => {
    const oldConfig: DiskProjectConfigV1 = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      projectId: 'old_project',
      title: 'Old',
      projectDir: 'C:/tmp/old',
      configPath: 'C:/tmp/old/animegate-project.json',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      anilist: { id: null, title: 'Old' },
      translationPreferences: { sourceLang: 'en', targetLang: 'pl', preferredModelId: 'deepl:deepl-default' },
      characterWorkflow: {
        characters: [{
          id: 1,
          name: 'Old Character',
          gender: 'Unknown',
          avatarColor: '#4f8ad6',
          style: null,
          profile: {
            archetype: 'default',
            speakingTraits: '',
            characterNote: '',
            anilistDescription: '',
            mannerOfAddress: '',
            politenessLevel: '',
            vocabularyType: '',
            temperament: '',
          },
        }],
        lineCharacterAssignments: [],
      },
      translationStyleSettings: {
        projectId: 'old_project',
        globalStyle: 'neutral',
        characters: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    }

    const hydrated = hydrateStateFromDiskProject(oldConfig)
    expect(hydrated.styleSettings.characters[0].profile.translationGender).toBe('unknown')
    expect(hydrated.styleSettings.characters[0].profile.speakingStyle).toBe('neutralny')
    expect(hydrated.styleSettings.characters[0].profile.translationNotes).toBe('')
    expect(hydrated.styleSettings.characters[0].profile.personalityTraits).toEqual([])
  })
})
