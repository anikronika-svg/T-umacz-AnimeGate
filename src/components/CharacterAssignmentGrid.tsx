import React, { useMemo, useState } from 'react'
import type { CharacterGender } from '../translationStyle'
import type { CharacterAssignmentSuggestion } from '../project/characterAssignmentSuggestions'

export interface CharacterAssignmentGridItem {
  id: number
  name: string
  gender: CharacterGender
  role?: string
  avatarColor: string
  imageUrl?: string | null
}

function genderLabel(gender: CharacterGender): string {
  if (gender === 'Female') return 'Kobieta'
  if (gender === 'Male') return 'Mezczyzna'
  return 'Unknown'
}

function cardKeyFromName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
}

export function CharacterAssignmentGrid({
  projectLoaded,
  characters,
  selectedLineCount,
  activeCharacterName,
  suggestions,
  onAssignCharacter,
  onClearAssignment,
}: {
  projectLoaded: boolean
  characters: CharacterAssignmentGridItem[]
  selectedLineCount: number
  activeCharacterName: string
  suggestions: CharacterAssignmentSuggestion[]
  onAssignCharacter: (characterName: string) => void
  onClearAssignment: () => void
}): React.ReactElement {
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set())
  const activeKey = cardKeyFromName(activeCharacterName)
  const suggestionsHint = useMemo(
    () => suggestions.map((item, index) => `${index + 1}. ${item.name} (${item.score})`).join(' | '),
    [suggestions],
  )

  return (
    <div style={{ borderBottom: '1px solid #3d3f53', padding: 8, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 12, color: '#89b4fa', fontWeight: 700 }}>Postacie do przypisywania</div>
        <div style={{ fontSize: 10, color: '#6c7086' }}>Zaznaczone: {selectedLineCount}</div>
      </div>

      {!projectLoaded ? (
        <div style={{ border: '1px solid #2e2f42', background: '#171925', padding: 10, fontSize: 11, color: '#6c7086' }}>
          Wczytaj lub utworz projekt, aby zobaczyc postacie do przypisywania.
        </div>
      ) : (
        <>
          <button
            style={{
              height: 26,
              border: '1px solid #3d3f53',
              borderRadius: 4,
              background: activeCharacterName ? '#25263a' : '#284267',
              color: activeCharacterName ? '#6c7086' : '#fff',
              cursor: 'pointer',
              marginBottom: 6,
            }}
            onClick={onClearAssignment}
          >
            Brak postaci
          </button>

          <div style={{ maxHeight: 282, overflowY: 'auto', border: '1px solid #2e2f42', background: '#171925', padding: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
              {characters.map(character => {
                const cardKey = cardKeyFromName(character.name)
                const isActive = cardKey === activeKey
                const imageUrl = character.imageUrl?.trim() || ''
                const showImage = imageUrl.length > 0 && !brokenImages.has(cardKey)
                return (
                  <button
                    key={character.id}
                    onClick={() => onAssignCharacter(character.name)}
                    title={`${character.name}${character.role ? ` • ${character.role}` : ''}`}
                    style={{
                      border: `1px solid ${isActive ? '#5f87d0' : '#303249'}`,
                      background: isActive ? '#2b3552' : '#1b1e2b',
                      borderRadius: 6,
                      padding: 4,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                      alignItems: 'center',
                      minWidth: 0,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 4, overflow: 'hidden', background: '#11131b', border: '1px solid #2e2f42' }}>
                      {showImage ? (
                        <img
                          src={imageUrl}
                          alt={character.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={() => {
                            setBrokenImages(prev => {
                              const next = new Set(prev)
                              next.add(cardKey)
                              return next
                            })
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: character.avatarColor || '#4f8ad6',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: 16,
                          }}
                        >
                          {(character.name.trim().slice(0, 1) || '?').toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div style={{ width: '100%', fontSize: 10, color: '#cdd6f4', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {character.name}
                    </div>
                    <div style={{ width: '100%', fontSize: 9, color: '#6c7086', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {genderLabel(character.gender)}{character.role ? ` • ${character.role}` : ''}
                    </div>
                  </button>
                )
              })}
            </div>
            {characters.length === 0 && (
              <div style={{ padding: 10, fontSize: 11, color: '#6c7086' }}>
                Brak postaci w aktywnym projekcie. Dodaj je w Kroku 1 (Postacie).
              </div>
            )}
          </div>

          <div style={{ marginTop: 8, border: '1px solid #2e2f42', background: '#171b28', padding: 6 }}>
            <div style={{ fontSize: 11, color: '#89b4fa', fontWeight: 700, marginBottom: 4 }}>
              Sugestie (1/2/3)
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.name}-${index}`}
                  style={{
                    height: 24,
                    border: '1px solid #365176',
                    borderRadius: 4,
                    background: '#243048',
                    color: '#cdd6f4',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0 6px',
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                  onClick={() => onAssignCharacter(suggestion.name)}
                  title={suggestion.reasons.join(' | ')}
                >
                  <span>{index + 1}. {suggestion.name}</span>
                  <span style={{ fontSize: 10, color: '#6c7086' }}>{suggestion.score}</span>
                </button>
              ))}
              {suggestions.length === 0 && (
                <div style={{ fontSize: 10, color: '#6c7086', padding: '2px 4px' }}>
                  Brak sugestii dla tej linii.
                </div>
              )}
            </div>
            {!!suggestionsHint && (
              <div style={{ marginTop: 4, fontSize: 9, color: '#6c7086', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {suggestionsHint}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
