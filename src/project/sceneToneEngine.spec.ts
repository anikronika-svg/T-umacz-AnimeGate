import { describe, expect, it } from 'vitest'
import { buildSceneToneSummary } from './sceneToneEngine'

const lines = (texts: string[]) => texts.map(text => ({ source: text }))

describe('sceneToneEngine', () => {
  it('detects tense dialogue cluster', () => {
    const result = buildSceneToneSummary(lines(['Run!', 'Now!', 'Hurry!']), 1)
    expect(result.tone).toBe('action')
  })

  it('detects comedic scene', () => {
    const result = buildSceneToneSummary(lines(['Haha, serio?', 'To był żart!']), 0)
    expect(result.tone).toBe('comedic')
  })

  it('detects calm mentor scene', () => {
    const result = buildSceneToneSummary(lines(['Spokojnie.', 'Oddychaj.']), 0)
    expect(result.tone).toBe('calm')
  })

  it('detects reflective thought scene', () => {
    const result = buildSceneToneSummary(lines(['...Nie wiem.']), 0, { speakerModeTag: 'M' })
    expect(result.tone).toBe('reflective')
  })

  it('detects local scene shift', () => {
    const result = buildSceneToneSummary(lines(['Cisza.', 'Run!', 'Now!']), 1)
    expect(result.tone).toBe('action')
  })
})
