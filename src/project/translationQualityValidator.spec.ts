import { describe, expect, it } from 'vitest'
import { validateTranslationQuality } from './translationQualityValidator'

describe('translationQualityValidator', () => {
  it('flags untranslated english fragments', () => {
    const result = validateTranslationQuality('Hello', 'Master!', {})
    expect(result.requiresManualCheck).toBe(true)
    expect(result.issues.some(issue => issue.type === 'english-leak')).toBe(true)
  })

  it('flags terminology inconsistencies', () => {
    const result = validateTranslationQuality('Relics', 'Te relics są cenne.', {
      terms: { relics: 'relikty' },
    })
    expect(result.issues.some(issue => issue.type === 'terminology-inconsistent')).toBe(true)
  })

  it('flags mixed language output', () => {
    const result = validateTranslationQuality('Find the relics.', 'Find the relikty.', {
      terms: { relics: 'relikty' },
    })
    expect(result.issues.some(issue => issue.type === 'mixed-language')).toBe(true)
  })

  it('detects repetition and grammar anomalies', () => {
    const result = validateTranslationQuality('Test', 'Myślę, że jeśli jeśli tak.', {})
    expect(result.issues.some(issue => issue.type === 'repetition')).toBe(true)
  })
})
