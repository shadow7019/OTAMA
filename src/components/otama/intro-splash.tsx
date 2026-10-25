'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * OTAMA intro ident — the Netflix-style opening animation that plays when the
 * app opens. Web (otama.netlify.app), the desktop Electron shell and the
 * Android/iOS WebViews all render this same component, so every OTAMA launch
 * opens with the same moment: black screen → red light ribbons sweep in →
 * the OTAMA wordmark flashes into existence with a "ta-dum" → light burst →
 * the camera zooms through the wordmark into the app.
 *
 * Choreography (pure CSS — see "OTAMA intro ident" in globals.css):
 *   0.10s  three red ribbons sweep toward the center (the Netflix-N homage)
 *   0.88s  convergence flash — the wordmark materializes, "ta" hits
 *   1.10s  "dum" + radial rays burst + expanding ring
 *   2.05s  camera zooms through the wordmark (scale 16)
 *   3.35s  overlay fades, revealing the app
 *   4.20s  JS removes the overlay node
 *
 * The timeline is CSS-driven on purpose: it plays even before React
 * hydrates, and the overlay fades itself out via `animation-fill-mode:
 * forwards` even if JS never runs. JavaScript adds exactly two things:
 * the ta-dum sound (Web Audio — silently skipped when autoplay is blocked,
 * always audible in the desktop app thanks to the no-user-gesture switch),
 * and node cleanup. The ident is unskippable, like Netflix's TV idents.
 * Users with `prefers-reduced-motion: reduce` never see it (CSS media query).
 */

const INTRO_TOTAL_MS = 4200

/** Two-note "ta-dum" synthesized with Web Audio — no audio files needed. */
function createTadum(): AudioContext | null {
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    const ctx = new AC()
    // Browsers create contexts suspended until a user gesture. Electron
    // (autoplay-policy switch) resumes immediately; on the web the context
    // stays suspended and the intro plays visual-only — a graceful no-op.
    void ctx.resume().catch(() => undefined)

    const t0 = ctx.currentTime + 0.9 // "ta" lands on the convergence flash
    const boom = (at: number, from: number, dur: number, vol: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(from, at)
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, from * 0.45), at + dur)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(vol, at + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(at)
      osc.stop(at + dur + 0.1)
    }
    boom(t0, 185, 0.24, 0.22) // "ta" — the short snap
    boom(t0 + 0.22, 112, 1.2, 0.42) // "dum" — the big one, long tail
    return ctx
  } catch {
    return null // no Web Audio — visual-only intro
  }
}

export function IntroSplash() {
  const [gone, setGone] = useState(false)
  const audioRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<number | null>(null)
  const prevOverflowRef = useRef('')

  const closeAudio = useCallback(() => {
    const ctx = audioRef.current
    audioRef.current = null
    if (!ctx) return
    try {
      void ctx.close().catch(() => undefined)
    } catch {
      /* ancient Web Audio without close() */
    }
  }, [])

  useEffect(() => {
    prevOverflowRef.current = document.body.style.overflow
    document.body.style.overflow = 'hidden' // no scrolling under the ident
    audioRef.current = createTadum()
    timerRef.current = window.setTimeout(() => setGone(true), INTRO_TOTAL_MS)
    return () => {
      // Teardown when the component itself unmounts (e.g. route remount).
      if (timerRef.current) window.clearTimeout(timerRef.current)
      document.body.style.overflow = prevOverflowRef.current
      closeAudio()
    }
  }, [closeAudio])

  // IMPORTANT: `return null` below hides the overlay but does NOT unmount
  // this component, so the effect cleanup above never runs on its own. This
  // effect is what actually ends the ident — for the natural timeout AND the
  // Skip button — restoring scroll and stopping the ta-dum in both paths.
  useEffect(() => {
    if (!gone) return
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    document.body.style.overflow = prevOverflowRef.current
    closeAudio()
  }, [gone, closeAudio])

  // The ident is intentionally unskippable (like Netflix's TV idents) — it
  // ends on its own at ~3.85s. prefers-reduced-motion users skip via CSS.

  if (gone) return null

  return (
    <div className="intro-overlay" role="presentation">
      <div className="intro-shake" aria-hidden="true">
        <div className="intro-stage">
          <span className="intro-ribbon intro-r1" />
          <span className="intro-ribbon intro-r2" />
          <span className="intro-ribbon intro-r3" />
          <span className="intro-rays" />
          <span className="intro-ring" />
          <span className="intro-flash" />
          <span className="intro-word">
            <i>O</i>
            <i>T</i>
            <i>A</i>
            <i>M</i>
            <i>A</i>
          </span>
        </div>
      </div>
    </div>
  )
}
