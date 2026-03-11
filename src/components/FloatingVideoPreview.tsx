import React, { useEffect, useMemo, useRef, useState } from 'react'
import { VideoSubtitleOverlay } from './VideoSubtitleOverlay'

interface FloatingRect {
  x: number
  y: number
  width: number
  height: number
}

const STORAGE_KEY = 'animegate.floating-video-preview.session.v1'
const MIN_WIDTH = 520
const MIN_HEIGHT = 320
const EDGE_MARGIN = 8
const HEADER_HEIGHT = 36

function clampRectToViewport(rect: FloatingRect): FloatingRect {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const maxWidth = Math.max(MIN_WIDTH, viewportWidth - EDGE_MARGIN * 2)
  const maxHeight = Math.max(MIN_HEIGHT, viewportHeight - EDGE_MARGIN * 2)
  const width = Math.min(maxWidth, Math.max(MIN_WIDTH, rect.width))
  const height = Math.min(maxHeight, Math.max(MIN_HEIGHT, rect.height))
  const maxX = Math.max(EDGE_MARGIN, viewportWidth - width - EDGE_MARGIN)
  const maxY = Math.max(EDGE_MARGIN, viewportHeight - height - EDGE_MARGIN)
  const x = Math.max(EDGE_MARGIN, Math.min(maxX, rect.x))
  const y = Math.max(EDGE_MARGIN, Math.min(maxY, rect.y))
  return { x, y, width, height }
}

function defaultRect(): FloatingRect {
  const width = Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.74))
  const height = Math.max(MIN_HEIGHT, Math.floor(window.innerHeight * 0.72))
  return clampRectToViewport({
    x: Math.floor((window.innerWidth - width) / 2),
    y: Math.floor((window.innerHeight - height) / 2),
    width,
    height,
  })
}

function loadRectFromSession(): FloatingRect {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultRect()
    const parsed = JSON.parse(raw) as FloatingRect
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y) || !Number.isFinite(parsed.width) || !Number.isFinite(parsed.height)) {
      return defaultRect()
    }
    return clampRectToViewport(parsed)
  } catch {
    return defaultRect()
  }
}

export function FloatingVideoPreview({
  open,
  videoRef,
  videoSrc,
  sourceText,
  targetText,
  onClose,
  onTogglePlayPause,
}: {
  open: boolean
  videoRef: React.RefObject<HTMLVideoElement>
  videoSrc: string | null
  sourceText: string
  targetText: string
  onClose: () => void
  onTogglePlayPause: () => void
}): React.ReactElement | null {
  const [rect, setRect] = useState<FloatingRect>(() => defaultRect())
  const dragRef = useRef<null | { offsetX: number; offsetY: number }>(null)
  const resizeRef = useRef<null | { startX: number; startY: number; startWidth: number; startHeight: number }>(null)

  useEffect(() => {
    if (!open) return
    setRect(loadRectFromSession())
  }, [open])

  useEffect(() => {
    if (!open) return
    const onResize = (): void => {
      setRect(prev => clampRectToViewport(prev))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  useEffect(() => {
    if (!open) return
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rect))
  }, [open, rect])

  useEffect(() => {
    if (!open) return
    const onMove = (event: MouseEvent): void => {
      if (dragRef.current) {
        const next = clampRectToViewport({
          ...rect,
          x: event.clientX - dragRef.current.offsetX,
          y: event.clientY - dragRef.current.offsetY,
        })
        setRect(next)
        return
      }
      if (resizeRef.current) {
        const dx = event.clientX - resizeRef.current.startX
        const dy = event.clientY - resizeRef.current.startY
        const next = clampRectToViewport({
          ...rect,
          width: resizeRef.current.startWidth + dx,
          height: resizeRef.current.startHeight + dy,
        })
        setRect(next)
      }
    }
    const onUp = (): void => {
      dragRef.current = null
      resizeRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [open, rect])

  const canRender = open && !!videoSrc
  const windowStyle = useMemo<React.CSSProperties>(() => ({
    position: 'fixed',
    zIndex: 1400,
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    border: '1px solid #3d3f53',
    borderRadius: 10,
    background: '#10131d',
    boxShadow: '0 12px 44px rgba(0,0,0,0.55)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    userSelect: 'none',
  }), [rect])

  if (!canRender) return null

  return (
    <div style={windowStyle}>
      <div
        style={{
          height: HEADER_HEIGHT,
          borderBottom: '1px solid #3d3f53',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          background: '#171a24',
          cursor: 'move',
          flexShrink: 0,
        }}
        onMouseDown={event => {
          dragRef.current = {
            offsetX: event.clientX - rect.x,
            offsetY: event.clientY - rect.y,
          }
        }}
      >
        <div style={{ fontSize: 12, color: '#6c7086', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Powiekszony podglad sceny • Spacja: play/pause • Klik linii: skok do sceny
        </div>
        <button
          style={{
            height: 26,
            border: '1px solid #3d3f53',
            borderRadius: 4,
            background: '#2a2b3d',
            color: '#cdd6f4',
            padding: '0 10px',
            cursor: 'pointer',
          }}
          onClick={onClose}
        >
          Zamknij
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#000' }}>
        <video
          ref={videoRef}
          src={videoSrc ?? undefined}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          onClick={onTogglePlayPause}
        />
        <VideoSubtitleOverlay sourceText={sourceText} targetText={targetText} />
      </div>

      <div
        style={{
          position: 'absolute',
          width: 18,
          height: 18,
          right: 2,
          bottom: 2,
          cursor: 'nwse-resize',
          borderRight: '2px solid rgba(205,214,244,0.55)',
          borderBottom: '2px solid rgba(205,214,244,0.55)',
          borderBottomRightRadius: 5,
          background: 'linear-gradient(135deg, transparent 0%, transparent 45%, rgba(205,214,244,0.2) 100%)',
        }}
        onMouseDown={event => {
          event.preventDefault()
          event.stopPropagation()
          resizeRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            startWidth: rect.width,
            startHeight: rect.height,
          }
        }}
      />
    </div>
  )
}
