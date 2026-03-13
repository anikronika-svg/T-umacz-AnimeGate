import { describe, expect, it } from 'vitest'
import { buildDialogueContext } from './dialogueContextEngine'

describe('dialogueContextEngine', () => {
  it('builds previous and next line context', () => {
    const rows = [
      { sourceRaw: 'Where are you going?', source: 'Where are you going?' },
      { sourceRaw: 'Shopping.', source: 'Shopping.' },
      { sourceRaw: 'Okay.', source: 'Okay.' },
    ]

    const context = buildDialogueContext(rows, 1, { previousLines: 2, nextLines: 1 })
    expect(context.previousLines).toEqual(['Where are you going?'])
    expect(context.nextLines).toEqual(['Okay.'])
  })

  it('skips empty or tag-only lines', () => {
    const rows = [
      { sourceRaw: '{\\an8}', source: '' },
      { sourceRaw: 'Hello.', source: 'Hello.' },
      { sourceRaw: 'World.', source: 'World.' },
    ]

    const context = buildDialogueContext(rows, 1, { previousLines: 2, nextLines: 1 })
    expect(context.previousLines).toEqual([])
    expect(context.nextLines).toEqual(['World.'])
  })
})
