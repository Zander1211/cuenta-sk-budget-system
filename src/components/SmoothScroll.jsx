import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ReactLenis, useLenis } from 'lenis/react'

// Track the user's reduced-motion preference so we never force inertial scrolling
// on someone who has asked the OS to minimize motion.
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

// Reset the page to the top on route change (Lenis-aware, with a native fallback).
// React Router does not scroll to top between routes on its own.
export function ScrollToTop() {
  const { pathname } = useLocation()
  const lenis = useLenis()
  useEffect(() => {
    if (lenis) lenis.scrollTo(0, { immediate: true })
    else window.scrollTo(0, 0)
  }, [pathname, lenis])
  return null
}

// Smooth, inertia-based smoothing for the main window scroll. Nested scroll areas
// (sidebar, chat log, modals) opt out with a `data-lenis-prevent` attribute.
export default function SmoothScroll({ children }) {
  const prefersReduced = usePrefersReducedMotion()
  const options = useMemo(
    () => ({
      lerp: prefersReduced ? 1 : 0.1, // lerp: 1 => no inertia when reduced motion is requested
      smoothWheel: !prefersReduced,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
      // Keep native scrolling inside overlays/nested scroll areas so the page
      // behind a modal never scrolls, and opted-out regions stay untouched.
      prevent: (node) =>
        node.hasAttribute?.('data-lenis-prevent') || node.classList?.contains('modal-overlay'),
    }),
    [prefersReduced]
  )
  return (
    <ReactLenis root options={options}>
      {children}
    </ReactLenis>
  )
}
