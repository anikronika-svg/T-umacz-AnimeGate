import { describe, expect, it } from 'vitest'
import { applyProjectLineAssignments, buildProjectLineAssignments } from './assignmentMatching'

describe('assignmentMatching', () => {
  it('stores resolved character using base speaker identity and keeps speaker mode tag', () => {
    const rows = [{
      id: 1,
      start: '0:00:01.00',
      end: '0:00:02.00',
      style: 'Default',
      sourceRaw: 'Hello',
      character: 'Tino (N)',
    }]

    const assignments = buildProjectLineAssignments(rows, raw => raw === 'Tino' ? 'Tino Shade' : raw)
    expect(assignments[0]).toMatchObject({
      rawCharacter: 'Tino (N)',
      resolvedCharacterName: 'Tino Shade',
      speakerModeTag: 'N',
    })
  })

  it('restores canonical character for bracketed variants after project load', () => {
    const rows = [{
      id: 1,
      start: '0:00:01.00',
      end: '0:00:02.00',
      style: 'Default',
      sourceRaw: 'Hello',
      character: 'Tino (M)',
    }]

    const assignments = [{
      lineId: 7,
      rawCharacter: 'Tino (N)',
      resolvedCharacterName: 'Tino Shade',
      lineKey: 'different-line-key',
    }]

    const applied = applyProjectLineAssignments(rows, assignments)
    expect(applied.applied).toBe(1)
    expect(applied.rows[0]?.character).toBe('Tino Shade')
  })
})
