import React, { useEffect, useMemo, useState } from 'react'
import type {
  CharacterGender,
  CharacterStyleAssignment,
} from '../translationStyle'
import type {
  CharacterSpeakingStyle,
  CharacterTranslationGender,
} from '../project/characterProfileModel'

const PANEL = {
  bg: '#1d1f2a',
  surface: '#242633',
  border: '#3d3f53',
  text: '#cdd6f4',
  textDim: '#6c7086',
  accent: '#89b4fa',
}

const SPEAKING_STYLE_OPTIONS: CharacterSpeakingStyle[] = [
  'neutralny',
  'formalny',
  'nieformalny',
  'chlodny',
  'cieply',
  'agresywny',
  'delikatny',
  'dziecinny',
  'dumny',
  'sarkastyczny',
]

const GENDER_OPTIONS: CharacterGender[] = ['Unknown', 'Male', 'Female', 'Nonbinary', 'Other']
const TRANSLATION_GENDER_OPTIONS: CharacterTranslationGender[] = ['unknown', 'masculine', 'feminine', 'neutral']

function genderLabel(value: CharacterGender): string {
  if (value === 'Male') return 'Mężczyzna'
  if (value === 'Female') return 'Kobieta'
  if (value === 'Nonbinary') return 'Niebinarny'
  if (value === 'Other') return 'Inna'
  return 'Nieustawiona'
}

function translationGenderLabel(value: CharacterTranslationGender): string {
  if (value === 'masculine') return 'Męska'
  if (value === 'feminine') return 'Żeńska'
  if (value === 'neutral') return 'Neutralna'
  return 'Nieustawiona'
}

interface CharacterProfileEditorModalProps {
  open: boolean
  character: CharacterStyleAssignment | null
  onClose: () => void
  onSave: (next: CharacterStyleAssignment) => void
  onResetToAuto: (characterId: number) => void
}

export function CharacterProfileEditorModal({
  open,
  character,
  onClose,
  onSave,
  onResetToAuto,
}: CharacterProfileEditorModalProps): React.ReactElement | null {
  const [draft, setDraft] = useState<CharacterStyleAssignment | null>(null)

  useEffect(() => {
    if (!open || !character) return
    setDraft(character)
  }, [open, character])

  const traitsText = useMemo(
    () => (draft?.profile.personalityTraits ?? []).join(', '),
    [draft?.profile.personalityTraits],
  )

  if (!open || !character || !draft) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,12,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1012 }}>
      <div style={{ width: 'min(920px, 96vw)', maxHeight: '92vh', background: PANEL.bg, border: `1px solid ${PANEL.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 36, borderBottom: `1px solid ${PANEL.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px' }}>
          <strong style={{ color: PANEL.accent }}>Edytuj postać</strong>
          <button type="button" onClick={onClose} style={{ height: 24, minWidth: 40, background: PANEL.surface, border: `1px solid ${PANEL.border}`, color: PANEL.text, cursor: 'pointer' }}>Zamknij</button>
        </div>
        <div style={{ padding: 10, display: 'grid', gap: 8, overflow: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: PANEL.textDim }}>Nazwa postaci</span>
              <input
                value={draft.name}
                onChange={event => setDraft(prev => (prev ? { ...prev, name: event.currentTarget.value } : prev))}
                style={{ height: 30, background: PANEL.surface, border: `1px solid ${PANEL.border}`, color: PANEL.text, padding: '0 8px' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: PANEL.textDim }}>Nazwa oryginalna</span>
              <input
                value={draft.originalName ?? ''}
                onChange={event => setDraft(prev => (prev ? { ...prev, originalName: event.currentTarget.value } : prev))}
                style={{ height: 30, background: PANEL.surface, border: `1px solid ${PANEL.border}`, color: PANEL.text, padding: '0 8px' }}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: PANEL.textDim }}>Płeć</span>
              <select
                value={draft.gender}
                onChange={event => setDraft(prev => (prev ? { ...prev, gender: event.currentTarget.value as CharacterGender } : prev))}
                style={{ height: 30, background: PANEL.surface, border: `1px solid ${PANEL.border}`, color: PANEL.text, padding: '0 6px' }}
              >
                {GENDER_OPTIONS.map(value => (
                  <option key={value} value={value}>{genderLabel(value)}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: PANEL.textDim }}>Rodzaj tłumaczenia</span>
              <select
                value={draft.profile.translationGender}
                onChange={event => setDraft(prev => (
                  prev
                    ? {
                      ...prev,
                      profile: {
                        ...prev.profile,
                        translationGender: event.currentTarget.value as CharacterTranslationGender,
                        isUserEdited: true,
                        updatedAt: new Date().toISOString(),
                        manualOverrides: { ...prev.profile.manualOverrides, translationGender: true },
                      },
                    }
                    : prev
                ))}
                style={{ height: 30, background: PANEL.surface, border: `1px solid ${PANEL.border}`, color: PANEL.text, padding: '0 6px' }}
              >
                {TRANSLATION_GENDER_OPTIONS.map(value => (
                  <option key={value} value={value}>{translationGenderLabel(value)}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: PANEL.textDim }}>Styl mówienia</span>
              <select
                value={draft.profile.speakingStyle}
                onChange={event => setDraft(prev => (
                  prev
                    ? {
                      ...prev,
                      profile: {
                        ...prev.profile,
                        speakingStyle: event.currentTarget.value as CharacterSpeakingStyle,
                        isUserEdited: true,
                        updatedAt: new Date().toISOString(),
                        manualOverrides: { ...prev.profile.manualOverrides, speakingStyle: true },
                      },
                    }
                    : prev
                ))}
                style={{ height: 30, background: PANEL.surface, border: `1px solid ${PANEL.border}`, color: PANEL.text, padding: '0 6px' }}
              >
                {SPEAKING_STYLE_OPTIONS.map(value => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: PANEL.textDim }}>Cechy charakteru (tagi, po przecinku)</span>
              <input
                value={traitsText}
                onChange={event => setDraft(prev => (
                  prev
                    ? {
                      ...prev,
                      profile: {
                        ...prev.profile,
                        personalityTraits: event.currentTarget.value
                          .split(',')
                          .map(item => item.trim())
                          .filter(Boolean),
                        isUserEdited: true,
                        updatedAt: new Date().toISOString(),
                        manualOverrides: { ...prev.profile.manualOverrides, personalityTraits: true },
                      },
                    }
                    : prev
                ))}
                style={{ height: 30, background: PANEL.surface, border: `1px solid ${PANEL.border}`, color: PANEL.text, padding: '0 8px' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: PANEL.textDim }}>Ton wypowiedzi</span>
              <input
                value={draft.profile.toneProfile}
                onChange={event => setDraft(prev => (
                  prev
                    ? {
                      ...prev,
                      profile: {
                        ...prev.profile,
                        toneProfile: event.currentTarget.value,
                        isUserEdited: true,
                        updatedAt: new Date().toISOString(),
                        manualOverrides: { ...prev.profile.manualOverrides, toneProfile: true },
                      },
                    }
                    : prev
                ))}
                placeholder="np. spokojna, elegancka, rzeczowa"
                style={{ height: 30, background: PANEL.surface, border: `1px solid ${PANEL.border}`, color: PANEL.text, padding: '0 8px' }}
              />
            </label>
          </div>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: PANEL.textDim }}>Notatki tłumaczeniowe</span>
            <textarea
              value={draft.profile.translationNotes}
              onChange={event => setDraft(prev => (
                prev
                  ? {
                    ...prev,
                    profile: {
                      ...prev.profile,
                      translationNotes: event.currentTarget.value,
                      isUserEdited: true,
                      updatedAt: new Date().toISOString(),
                      manualOverrides: { ...prev.profile.manualOverrides, translationNotes: true },
                    },
                  }
                  : prev
              ))}
              rows={3}
              style={{ background: PANEL.surface, border: `1px solid ${PANEL.border}`, color: PANEL.text, padding: '8px 10px', resize: 'vertical' }}
            />
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: PANEL.textDim }}>Relacje / kontekst</span>
            <textarea
              value={draft.profile.relationshipNotes}
              onChange={event => setDraft(prev => (
                prev
                  ? {
                    ...prev,
                    profile: {
                      ...prev.profile,
                      relationshipNotes: event.currentTarget.value,
                      isUserEdited: true,
                      updatedAt: new Date().toISOString(),
                      manualOverrides: { ...prev.profile.manualOverrides, relationshipNotes: true },
                    },
                  }
                  : prev
              ))}
              rows={3}
              style={{ background: PANEL.surface, border: `1px solid ${PANEL.border}`, color: PANEL.text, padding: '8px 10px', resize: 'vertical' }}
            />
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: PANEL.textDim }}>Własna wskazówka do tłumaczenia</span>
            <textarea
              value={draft.profile.customPromptHint}
              onChange={event => setDraft(prev => (
                prev
                  ? {
                    ...prev,
                    profile: {
                      ...prev.profile,
                      customPromptHint: event.currentTarget.value,
                      isUserEdited: true,
                      updatedAt: new Date().toISOString(),
                      manualOverrides: { ...prev.profile.manualOverrides, customPromptHint: true },
                    },
                  }
                  : prev
              ))}
              rows={2}
              style={{ background: PANEL.surface, border: `1px solid ${PANEL.border}`, color: PANEL.text, padding: '8px 10px', resize: 'vertical' }}
            />
          </label>
        </div>
        <div style={{ borderTop: `1px solid ${PANEL.border}`, padding: 10, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={() => onResetToAuto(character.id)}
            style={{ height: 30, background: '#2f3347', border: `1px solid ${PANEL.border}`, color: PANEL.text, padding: '0 10px', cursor: 'pointer' }}
          >
            Resetuj do automatycznego wykrycia
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={{ height: 30, background: '#2f3347', border: `1px solid ${PANEL.border}`, color: PANEL.text, padding: '0 12px', cursor: 'pointer' }}>Anuluj</button>
            <button
              type="button"
              onClick={() => onSave(draft)}
              style={{ height: 30, background: '#0a6fb5', border: '1px solid #1199f5', color: '#fff', padding: '0 14px', cursor: 'pointer', fontWeight: 700 }}
            >
              Zapisz
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
