import { describe, expect, it } from 'vitest'
import { leakRepairEngine } from './leakRepairEngine'
import type { TranslationQualityIssue } from './translationQualityValidator'

const englishLeakIssue: TranslationQualityIssue = { type: 'english-leak', message: 'leak' }
const mixedIssue: TranslationQualityIssue = { type: 'mixed-language', message: 'mixed' }

describe('leakRepairEngine', () => {
  it('applies safe short-line repair', async () => {
    const result = await leakRepairEngine({
      sourceRawOrPlain: 'Hey!',
      target: 'Hey!',
      issues: [englishLeakIssue],
      leakDetection: { englishTokens: ['hey'], polishTokens: [], mixed: false },
      postProcess: value => ({
        value,
        issues: [],
        leakDetection: { englishTokens: [], polishTokens: ['hej'], mixed: false },
        requiresManualCheck: false,
      }),
    })
    expect(result.value).toBe('Hej!')
    expect(result.metadata.repairMode).toBe('safe_replace')
  })

  it('keeps ASS tags intact for safe replacements', async () => {
    const result = await leakRepairEngine({
      sourceRawOrPlain: '{\\i1}relics{\\i0}',
      target: '{\\i1}relics{\\i0}',
      issues: [englishLeakIssue],
      leakDetection: { englishTokens: ['relics'], polishTokens: [], mixed: false },
      terms: { relics: 'relikty' },
      postProcess: value => ({
        value,
        issues: [],
        leakDetection: { englishTokens: [], polishTokens: ['relikty'], mixed: false },
        requiresManualCheck: false,
      }),
    })
    expect(result.value).toBe('{\\i1}relikty{\\i0}')
  })

  it('triggers controlled retry for mixed language', async () => {
    const result = await leakRepairEngine({
      sourceRawOrPlain: 'Find the relics.',
      target: 'Find the relikty.',
      issues: [mixedIssue],
      leakDetection: { englishTokens: ['find'], polishTokens: ['relikty'], mixed: true },
      postProcess: value => ({
        value,
        issues: [mixedIssue],
        leakDetection: { englishTokens: ['find'], polishTokens: ['relikty'], mixed: true },
        requiresManualCheck: true,
      }),
      retryTranslate: async () => ({
        value: 'Znajdź relikty.',
        issues: [],
        leakDetection: { englishTokens: [], polishTokens: ['znajdź', 'relikty'], mixed: false },
        requiresManualCheck: false,
      }),
    })
    expect(result.value).toBe('Znajdź relikty.')
    expect(result.metadata.repairMode).toBe('controlled_retry')
    expect(result.metadata.repairSucceeded).toBe(true)
  })

  it('keeps original line when retry fails', async () => {
    const result = await leakRepairEngine({
      sourceRawOrPlain: 'Find the relics.',
      target: 'Find the relikty.',
      issues: [mixedIssue],
      leakDetection: { englishTokens: ['find'], polishTokens: ['relikty'], mixed: true },
      postProcess: value => ({
        value,
        issues: [mixedIssue],
        leakDetection: { englishTokens: ['find'], polishTokens: ['relikty'], mixed: true },
        requiresManualCheck: true,
      }),
      retryTranslate: async () => ({
        value: 'Find the relikty.',
        issues: [mixedIssue],
        leakDetection: { englishTokens: ['find'], polishTokens: ['relikty'], mixed: true },
        requiresManualCheck: true,
      }),
    })
    expect(result.value).toBe('Find the relikty.')
    expect(result.metadata.repairSucceeded).toBe(false)
  })

  it('skips repair for ambiguous lines without critical issues', async () => {
    const result = await leakRepairEngine({
      sourceRawOrPlain: 'Yokohama.',
      target: 'Yokohama.',
      issues: [],
      leakDetection: { englishTokens: [], polishTokens: [], mixed: false },
      postProcess: value => ({
        value,
        issues: [],
        leakDetection: { englishTokens: [], polishTokens: [], mixed: false },
        requiresManualCheck: false,
      }),
    })
    expect(result.metadata.repairMode).toBe('skipped')
  })
})
