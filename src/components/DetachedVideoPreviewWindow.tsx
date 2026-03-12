import React, { useEffect, useMemo, useRef, useState } from 'react'
import { VideoSubtitleOverlay } from './VideoSubtitleOverlay'

interface DetachedPreviewState {
  videoSrc: string | null
  currentTime: number
  playbackRate: number
  paused: boolean
  sourceText: string
  targetText: string
}

export function DetachedVideoPreviewWindow(): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const previewAreaRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<DetachedPreviewState>({
    videoSrc: null,
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    sourceText: '',
    targetText: '',
  })
  const [videoFrame, setVideoFrame] = useState({ left: 0, top: 0, width: 0, height: 0 })

  const updateVideoFrame = (): void => {
    const area = previewAreaRef.current
    const video = videoRef.current
    if (!area) return
    const containerWidth = area.clientWidth
    const containerHeight = area.clientHeight
    if (containerWidth <= 0 || containerHeight <= 0) return

    const naturalWidth = video?.videoWidth ?? 0
    const naturalHeight = video?.videoHeight ?? 0
    if (naturalWidth <= 0 || naturalHeight <= 0) {
      setVideoFrame({
        left: 0,
        top: 0,
        width: containerWidth,
        height: containerHeight,
      })
      return
    }

    const mediaAspect = naturalWidth / naturalHeight
    const containerAspect = containerWidth / containerHeight
    let width = containerWidth
    let height = containerHeight
    if (containerAspect > mediaAspect) {
      width = containerHeight * mediaAspect
      height = containerHeight
    } else {
      width = containerWidth
      height = containerWidth / mediaAspect
    }
    setVideoFrame({
      left: Math.max(0, (containerWidth - width) / 2),
      top: Math.max(0, (containerHeight - height) / 2),
      width: Math.max(1, width),
      height: Math.max(1, height),
    })
  }

  useEffect(() => {
    if (!window.electronAPI) return
    void window.electronAPI.getDetachedPreviewState().then(next => {
      setState(next)
    })
    const unsubscribe = window.electronAPI.onDetachedPreviewState(next => {
      setState(next)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !state.videoSrc) return

    video.muted = false
    video.playbackRate = Math.max(0.25, Math.min(3, state.playbackRate || 1))
    if (Math.abs(video.currentTime - state.currentTime) > 0.22) {
      video.currentTime = Math.max(0, state.currentTime)
    }

    if (state.paused) {
      if (!video.paused) video.pause()
    } else if (video.paused) {
      void video.play().catch(() => undefined)
    }
  }, [state.currentTime, state.playbackRate, state.paused, state.videoSrc])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' && event.key !== ' ') return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase() ?? ''
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return
      event.preventDefault()
      void window.electronAPI?.requestDetachedPreviewTogglePlayback()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    updateVideoFrame()
  }, [state.videoSrc])

  useEffect(() => {
    const area = previewAreaRef.current
    if (!area) return
    const observer = new ResizeObserver(() => updateVideoFrame())
    observer.observe(area)
    return () => observer.disconnect()
  }, [])

  const rootStyle = useMemo<React.CSSProperties>(() => ({
    display: 'flex',
    flexDirection: 'column',
    width: '100vw',
    height: '100vh',
    margin: 0,
    background: '#10131d',
    color: '#cdd6f4',
    fontFamily: 'Segoe UI, Arial, sans-serif',
    overflow: 'hidden',
  }), [])

  return (
    <div style={rootStyle}>
      <div style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', borderBottom: '1px solid #3d3f53', background: '#171a24' }}>
        <div style={{ fontSize: 12, color: '#6c7086', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Powiekszony podglad sceny • Spacja: play/pause • Klik linii: skok do sceny
        </div>
        <button
          style={{ height: 24, border: '1px solid #3d3f53', borderRadius: 4, background: '#2a2b3d', color: '#cdd6f4', padding: '0 10px', cursor: 'pointer' }}
          onClick={() => {
            void window.electronAPI?.closeDetachedPreviewWindow()
          }}
        >
          Zamknij
        </button>
      </div>

      <div ref={previewAreaRef} style={{ position: 'relative', flex: 1, minHeight: 0, background: '#000' }}>
        {state.videoSrc ? (
          <video
            ref={videoRef}
            src={state.videoSrc}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            onLoadedMetadata={updateVideoFrame}
            onClick={() => {
              void window.electronAPI?.requestDetachedPreviewTogglePlayback()
            }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6c7086', fontSize: 13 }}>
            Brak zaladowanego wideo
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            left: videoFrame.left,
            top: videoFrame.top,
            width: videoFrame.width,
            height: videoFrame.height,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <VideoSubtitleOverlay sourceText={state.sourceText} targetText={state.targetText} />
        </div>
      </div>
    </div>
  )
}
