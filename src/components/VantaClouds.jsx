import { useEffect, useRef, useState } from 'react'

// Animated clouds backdrop for the login screen (vanta.js — tengbao/vanta).
// Vanta paints into a WebGL canvas it appends to `el`, so we hand it a bare
// div and let it own the contents. THREE must be passed in explicitly;
// vanta's UMD build otherwise reaches for a global that Vite won't provide.
export default function VantaClouds() {
  const hostRef = useRef(null)
  const effectRef = useRef(null)

  // Honour reduced-motion: a drifting sky is exactly the kind of ambient
  // animation that setting is meant to suppress. Resolved during the initial
  // render (not in the effect) so we never mount a canvas we won't animate.
  const [prefersReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (prefersReduced) return

    let cancelled = false

    async function start() {
      try {
        // Import the ES source, not `vanta/dist/*.min` — the dist files are UMD
        // bundles that Vite's dev-time dependency optimizer cannot process
        // ("might be incompatible with the dep optimizer"), and they need CJS
        // interop guesswork. The src build is plain ESM with a real default.
        const [{ default: CLOUDS }, THREE] = await Promise.all([
          import('vanta/src/vanta.clouds.js'),
          import('three'),
        ])
        if (cancelled || !hostRef.current) return

        if (typeof CLOUDS !== 'function') {
          throw new Error('vanta.clouds did not resolve to a callable effect')
        }

        effectRef.current = CLOUDS({
          el: hostRef.current,
          THREE,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200.0,
          minWidth: 200.0,
          // Brand-tuned sky: cool teal daylight rather than vanta's default
          // blue, so the clouds sit under Cuenta's palette instead of beside it.
          backgroundColor: 0xf7fafb,
          skyColor: 0x5fa8b8,
          cloudColor: 0xc4d8dd,
          cloudShadowColor: 0x123f42,
          sunColor: 0xffd9a8,
          sunGlareColor: 0xffbe8a,
          sunlightColor: 0xfff0da,
          speed: 0.7,
        })
      } catch (error) {
        // WebGL unavailable, blocked, or the chunk failed — the CSS gradient
        // underneath is a complete fallback, so just stop.
        console.warn('Vanta clouds unavailable, using gradient fallback:', error)
        if (!cancelled) setFailed(true)
      }
    }

    start()

    return () => {
      cancelled = true
      if (effectRef.current) {
        effectRef.current.destroy()
        effectRef.current = null
      }
    }
  }, [prefersReduced])

  if (prefersReduced || failed) return null

  return <div className="login-vanta" ref={hostRef} aria-hidden="true" />
}
