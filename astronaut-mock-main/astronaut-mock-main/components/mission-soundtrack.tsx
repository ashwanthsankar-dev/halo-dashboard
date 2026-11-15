'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function MissionSoundtrack() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [playbackError, setPlaybackError] = useState('')

  const playSoundtrack = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    void audio.play().then(() => {
      setPlaying(true)
      setAutoplayBlocked(false)
      setPlaybackError('')
    }).catch(reason => {
      if (reason instanceof DOMException && reason.name === 'NotAllowedError') {
        setAutoplayBlocked(true)
      } else {
        setPlaybackError('The mission soundtrack could not be played.')
        console.error('Unable to play the mission soundtrack.', reason)
      }
    })
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = 0.32

    const removeInteractionListeners = () => {
      document.removeEventListener('pointerdown', retryAfterInteraction, true)
      document.removeEventListener('keydown', retryAfterInteraction, true)
      audio.removeEventListener('playing', removeInteractionListeners)
    }
    const retryAfterInteraction = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.mission-soundtrack-control')) return
      if (audio.paused) playSoundtrack()
    }

    document.addEventListener('pointerdown', retryAfterInteraction, true)
    document.addEventListener('keydown', retryAfterInteraction, true)
    audio.addEventListener('playing', removeInteractionListeners)
    playSoundtrack()

    return removeInteractionListeners
  }, [playSoundtrack])

  function toggleSoundtrack() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) playSoundtrack()
    else audio.pause()
  }

  return <div className="mission-soundtrack-widget">
    <audio
      ref={audioRef}
      src="/mission-soundtrack.mp3"
      autoPlay
      loop
      preload="auto"
      data-halo-soundtrack="true"
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onError={() => {
        setPlaybackError('The local mission soundtrack could not be loaded.')
        console.error('Unable to load the local mission soundtrack.')
      }}
    />
    <button
      className="mission-soundtrack-control"
      type="button"
      aria-pressed={playing}
      aria-label={playing ? 'Pause mission soundtrack' : 'Play mission soundtrack'}
      onClick={toggleSoundtrack}
    >
      {playing ? '♫ Pause soundtrack' : autoplayBlocked ? '♪ Enable soundtrack' : '♪ Play soundtrack'}
    </button>
    {playbackError && <span className="mission-soundtrack-error" role="alert">{playbackError}</span>}
  </div>
}
