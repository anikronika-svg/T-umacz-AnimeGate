import React, { useMemo, useState } from 'react'
import {
  parseBulkCharacterNotes,
  type BulkCharacterNotesMatch,
  type BulkCharacterNotesParseResult,
} from '../project/bulkCharacterNotesParser'

export interface CharacterNotesItem {
  id: number
  name: string
  notes: string
}

export type BulkNotesApplyMode = 'safe_append' | 'fill_empty_only' | 'overwrite_all'

interface CharacterNotesModalProps {
  open: boolean
  characters: CharacterNotesItem[]
  onClose: () => void
  onChangeNotes: (characterId: number, notes: string) => void
  onApplyBulkNotes: (entries: BulkCharacterNotesMatch[], mode: BulkNotesApplyMode) => { applied: number; skipped: number }
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
  onApplyBulkNotes,
}: CharacterNotesModalProps): React.ReactElement | null {
  const [isBulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkMode, setBulkMode] = useState<BulkNotesApplyMode>('safe_append')
  const [bulkResult, setBulkResult] = useState<BulkCharacterNotesParseResult | null>(null)
  const [applySummary, setApplySummary] = useState('')

  const parserCharacters = useMemo(
    () => characters.map(item => ({ id: item.id, name: item.name })),
    [characters],
  )

  const runBulkParse = (): void => {
    const parsed = parseBulkCharacterNotes(bulkText, parserCharacters)
    setBulkResult(parsed)
    setApplySummary('')
  }

  const handleApplyBulk = (): void => {
    if (!bulkResult || !bulkResult.matched.length) return
    const summary = onApplyBulkNotes(bulkResult.matched, bulkMode)
    setApplySummary(`Zastosowano: ${summary.applied}, pominieto: ${summary.skipped}.`)
  }

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,12,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1006 }}>
      <div style={{ width: 'min(1120px, 96vw)', maxHeight: '90vh', background: palette.bg, border: `1px solid ${palette.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 34, borderBottom: `1px solid ${palette.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px' }}>
          <strong style={{ color: palette.accent }}>Profil / notatki postaci</strong>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setBulkOpen(true)
                setBulkResult(null)
                setApplySummary('')
              }}
              style={{ height: 24, background: '#0a6fb5', border: `1px solid #1199f5`, color: '#fff', cursor: 'pointer', padding: '0 10px' }}
            >
              Wklej zbiorcze notatki
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ height: 24, minWidth: 38, background: palette.input, border: `1px solid ${palette.border}`, color: palette.text, cursor: 'pointer' }}
            >
              Zamknij
            </button>
          </div>
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

      {isBulkOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,12,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1007 }}>
          <div style={{ width: 'min(980px, 96vw)', maxHeight: '90vh', background: palette.bg, border: `1px solid ${palette.border}`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 34, borderBottom: `1px solid ${palette.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px' }}>
              <strong style={{ color: palette.accent }}>Import notatek z tekstu</strong>
              <button type="button" onClick={() => setBulkOpen(false)} style={{ height: 24, background: palette.input, border: `1px solid ${palette.border}`, color: palette.text, cursor: 'pointer' }}>Zamknij</button>
            </div>
            <div style={{ padding: 10, color: palette.textDim, fontSize: 12, borderBottom: `1px solid ${palette.border}` }}>
              Wklej tekst w formacie: nazwa postaci, potem opis. Kolejne sekcje rozdzielaj kolejną nazwą postaci.
            </div>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
              <textarea
                value={bulkText}
                onChange={event => setBulkText(event.currentTarget.value)}
                placeholder={'Itaru Hashida\nOpis...\n\nKurisu Makise\nOpis...'}
                style={{ width: '100%', minHeight: 220, background: palette.input, border: `1px solid ${palette.border}`, color: palette.text, padding: 10, fontSize: 12, lineHeight: 1.4, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, color: palette.textDim }}>Tryb zapisu:</label>
                <select value={bulkMode} onChange={event => setBulkMode(event.currentTarget.value as BulkNotesApplyMode)} style={{ height: 26, background: palette.input, border: `1px solid ${palette.border}`, color: palette.text, padding: '0 6px' }}>
                  <option value="safe_append">Nadpisz puste, do istniejacych dopisz</option>
                  <option value="fill_empty_only">Nadpisz tylko puste pola</option>
                  <option value="overwrite_all">Nadpisz wszystko</option>
                </select>
                <button type="button" onClick={runBulkParse} style={{ height: 26, background: '#0a6fb5', border: '1px solid #1199f5', color: '#fff', padding: '0 10px', cursor: 'pointer' }}>
                  Rozdziel notatki
                </button>
                <button
                  type="button"
                  onClick={handleApplyBulk}
                  disabled={!bulkResult || bulkResult.matched.length === 0}
                  style={{ height: 26, background: (!bulkResult || bulkResult.matched.length === 0) ? palette.input : '#2d7f47', border: `1px solid ${(!bulkResult || bulkResult.matched.length === 0) ? palette.border : '#4aa368'}`, color: palette.text, padding: '0 10px', cursor: (!bulkResult || bulkResult.matched.length === 0) ? 'not-allowed' : 'pointer' }}
                >
                  Zastosuj do postaci
                </button>
              </div>

              {bulkResult && (
                <div style={{ border: `1px solid ${palette.border}`, background: palette.panel, padding: 8, fontSize: 12, color: palette.text }}>
                  <div>Rozpoznano sekcje: {bulkResult.totalSections}</div>
                  <div>Dopasowane postacie: {bulkResult.matched.length}</div>
                  <div>Nierozpoznane sekcje: {bulkResult.unmatchedSections.length}</div>
                  {applySummary && <div style={{ marginTop: 6, color: '#9dd39b' }}>{applySummary}</div>}
                  {bulkResult.matched.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <strong>Dopasowane:</strong>
                      <div style={{ marginTop: 4, color: palette.textDim }}>
                        {bulkResult.matched.map(item => item.characterName).join(', ')}
                      </div>
                    </div>
                  )}
                  {bulkResult.unmatchedSections.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <strong>Nierozpoznane naglowki:</strong>
                      <ul style={{ margin: '4px 0 0 18px', color: '#f7a0a0' }}>
                        {bulkResult.unmatchedSections.map((item, index) => (
                          <li key={`${item.header}-${index}`}>{item.header}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
