import { describe, expect, it } from 'vitest'
import { importTranslationMemoryFromAssPair } from './translationMemoryImporter'

const ASS_HEADER = `
[Script Info]
Title: test

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

describe('translationMemoryImporter', () => {
  it('pairs EN/PL lines and imports entries', () => {
    const en = `${ASS_HEADER}
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Find the relics.
Dialogue: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,{\\i1}Hello{\\i0}
`
    const pl = `${ASS_HEADER}
Dialogue: 0,0:00:01.02,0:00:03.00,Default,,0,0,0,,Znajdz relikty.
Dialogue: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,{\\i1}Czesc{\\i0}
`
    const result = importTranslationMemoryFromAssPair(en, pl, { series: 'Test', episode: '01', groupName: 'GroupX', sourceQuality: 'trusted_professional_import' })
    expect(result.entries.length).toBe(2)
    expect(result.rejected).toBe(0)
    expect(result.trusted).toBeGreaterThan(0)
    expect(result.entries[0].series).toBe('Test')
    expect(result.entries[0].sourceQuality).toBe('trusted_professional_import')
  })

  it('ignores empty and tag-only lines', () => {
    const en = `${ASS_HEADER}
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\i1}{\\i0}
Dialogue: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,
Dialogue: 0,0:00:06.00,0:00:07.00,Default,,0,0,0,,Okay.
`
    const pl = `${ASS_HEADER}
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\i1}{\\i0}
Dialogue: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,
Dialogue: 0,0:00:06.00,0:00:07.00,Default,,0,0,0,,Dobrze.
`
    const result = importTranslationMemoryFromAssPair(en, pl)
    expect(result.entries.length).toBe(1)
    expect(result.rejected).toBe(0)
  })

  it('marks low-confidence pairs for identical source/target', () => {
    const en = `${ASS_HEADER}
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello.
`
    const pl = `${ASS_HEADER}
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello.
`
    const result = importTranslationMemoryFromAssPair(en, pl)
    expect(result.entries.length).toBe(1)
    expect(result.entries[0].quality).toBe('low-confidence')
    expect(result.lowConfidence).toBe(1)
  })

  it('marks mixed-language output as low-confidence', () => {
    const en = `${ASS_HEADER}
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Find the relics.
`
    const pl = `${ASS_HEADER}
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Find the relikty.
`
    const result = importTranslationMemoryFromAssPair(en, pl)
    expect(result.entries.length).toBe(1)
    expect(result.lowConfidence).toBe(1)
  })
})
