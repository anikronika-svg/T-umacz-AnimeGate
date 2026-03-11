import React from 'react'

export interface CharacterNotesItem {
  id: number
  name: string
  notes: string
}

interface CharacterNotesModalProps {
  open: boolean
  characters: CharacterNotesItem[]
  onClose: () => void
  onChangeNotes: (characterId: number, notes: string) => void
}

const palette = {
  bg: '#1d1f2a',
  panel: '#242633',
  input: '#2b2d35',
  border: '#3d3f53',
  text: '#cdd6f4',
  textDim: '#6c7086',
  accent: '#89b4fa',
}

export function CharacterNotesModal({
  open,
  characters,
  onClose,
  onChangeNotes,
}: CharacterNotesModalProps): React.ReactElement | null {
  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,12,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1006 }}>
      <div style={{ width: 'min(1120px, 96vw)', maxHeight: '90vh', background: palette.bg, border: `1px solid ${palette.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 34, borderBottom: `1px solid ${palette.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px' }}>
          <strong style={{ color: palette.accent }}>Profil / notatki postaci</strong>
          <button
            type="button"
            onClick={onClose}
            style={{ height: 24, minWidth: 38, background: palette.input, border: `1px solid ${palette.border}`, color: palette.text, cursor: 'pointer' }}
          >
            Zamknij
          </button>
        </div>
        <div style={{ padding: 10, color: palette.textDim, fontSize: 12, borderBottom: `1px solid ${palette.border}` }}>
          Wklej opis charakteru, sposobu mówienia, relacji i temperamentu. Te notatki będą używane jako dodatkowy kontekst w Kroku 3 i podczas tłumaczenia.
        </div>
        <div style={{ padding: 10, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
          {characters.map(character => (
            <div key={character.id} style={{ border: `1px solid ${palette.border}`, background: palette.panel, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: palette.text }}>{character.name}</div>
              <div style={{ fontSize: 11, color: palette.textDim }}>charakter • sposób mówienia • relacje • status • temperament</div>
              <textarea
                value={character.notes}
                onChange={event => onChangeNotes(character.id, event.currentTarget.value)}
                placeholder="Wpisz notatki o postaci..."
                rows={8}
                style={{
                  width: '100%',
                  minHeight: 170,
                  resize: 'vertical',
                  background: palette.input,
                  border: `1px solid ${palette.border}`,
                  color: palette.text,
                  padding: '8px 9px',
                  fontSize: 12,
                  lineHeight: 1.35,
                }}
              />
            </div>
          ))}
          {characters.length === 0 && (
            <div style={{ color: palette.textDim, fontSize: 12 }}>Brak postaci. Najpierw dodaj postacie w Kroku 1.</div>
          )}
        </div>
      </div>
    </div>
  )
}
