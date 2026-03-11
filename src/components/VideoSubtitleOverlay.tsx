import React from 'react'

export function VideoSubtitleOverlay({
  sourceText,
  targetText,
}: {
  sourceText: string
  targetText: string
}): React.ReactElement {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          top: 10,
          pointerEvents: 'none',
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            maxWidth: '95%',
            color: '#ffffff',
            fontSize: 18,
            fontWeight: 600,
            lineHeight: 1.28,
            textShadow: '0 1px 2px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.9)',
            background: 'rgba(0, 0, 0, 0.34)',
            borderRadius: 6,
            padding: '4px 10px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {sourceText || ' '}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
          pointerEvents: 'none',
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            maxWidth: '95%',
            color: '#ffffff',
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1.3,
            textShadow: '0 2px 4px rgba(0,0,0,0.98), 0 0 9px rgba(0,0,0,0.9)',
            background: 'rgba(0, 0, 0, 0.45)',
            borderRadius: 7,
            padding: '5px 12px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {targetText || ' '}
        </div>
      </div>
    </>
  )
}
