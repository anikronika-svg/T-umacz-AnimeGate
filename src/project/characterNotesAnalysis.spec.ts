import { describe, expect, it } from 'vitest'
import { createDefaultCharacterSpeechProfile } from './characterProfileModel'
import {
  analyzeCharacterNotes,
  mergeCharacterNotesAnalysisIntoProfile,
} from './characterNotesAnalysis'

describe('characterNotesAnalysis heuristic mapping', () => {
  it('maps niesmiala i zakochana case to dandere-like profile', () => {
    const notes = [
      'jest bardzo nieśmiała',
      'łatwo się zawstydza',
      'mówi cicho',
      'jest zakochana, ale ukrywa uczucia',
      'wypowiada się delikatnie i z wahaniem',
    ].join('. ')
    const result = analyzeCharacterNotes(notes)
    expect(result.suggestedTypeId).toBe('dandere')
    expect(['zakochana', 'niesmiala']).toContain(result.suggestedSubtypeId)
    expect(result.speakingTraits.toLowerCase()).toContain('delikat')
  })

  it('maps chlodna i zdystansowana case to kuudere/samotnik spectrum', () => {
    const notes = [
      'chłodna wobec innych',
      'zdystansowana',
      'ukrywa emocje',
      'mówi krótko i rzeczowo',
      'rzadko okazuje uczucia',
    ].join('. ')
    const result = analyzeCharacterNotes(notes)
    expect(['kuudere', 'samotnik']).toContain(result.suggestedTypeId)
    expect(result.temperament.toLowerCase()).toContain('chłod')
  })

  it('maps wredna i arogancka case to sharp profile', () => {
    const notes = [
      'patrzy na innych z góry',
      'jest arogancka',
      'bywa niemiła',
      'mówi kąśliwie',
      'często brzmi pogardliwie',
    ].join('. ')
    const result = analyzeCharacterNotes(notes)
    expect(['wredna_zlosliwa', 'arystokratka_dama', 'manipulator']).toContain(result.suggestedTypeId)
    expect(result.speakingTraits.toLowerCase()).toMatch(/kąśliw|ostrz|drażliw/)
  })

  it('maps energiczna i komediowa case to genki/comedy', () => {
    const notes = [
      'bardzo energiczna',
      'głośna',
      'impulsywna',
      'często żartuje',
      'wnosi chaos i komedię',
    ].join('. ')
    const result = analyzeCharacterNotes(notes)
    expect(['genki', 'postac_komediowa']).toContain(result.suggestedTypeId)
    expect(result.temperament.toLowerCase()).toMatch(/żywioł|impulsyw|ekspresyj/)
  })

  it('maps opiekuncza i spokojna case to warm supportive profile', () => {
    const notes = [
      'troskliwa',
      'opiekuńcza',
      'spokojna',
      'ciepła wobec innych',
      'mówi łagodnie i dojrzale',
    ].join('. ')
    const result = analyzeCharacterNotes(notes)
    expect(['opiekuncza', 'mentor', 'starsza_siostra']).toContain(result.suggestedTypeId)
    expect(result.mannerOfAddress.toLowerCase()).toMatch(/łagod|opieku|uprzejm/)
  })

  it('does not override manual step3 fields while still storing notes', () => {
    const profile = {
      ...createDefaultCharacterSpeechProfile(),
      characterTypeId: 'kuudere',
      characterSubtypeId: 'logiczna',
      speakingTraits: 'ręcznie ustawione',
      characterNote: 'ręczna notatka',
    }
    const next = mergeCharacterNotesAnalysisIntoProfile(profile, 'jest bardzo energiczna i komediowa')
    expect(next.characterUserNotes).toContain('energiczna')
    expect(next.speakingTraits).toBe('ręcznie ustawione')
    expect(next.characterNote).toBe('ręczna notatka')
    expect(next.characterTypeId).toBe('kuudere')
    expect(next.characterSubtypeId).toBe('logiczna')
  })
})
