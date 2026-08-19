import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Scroll reveal for the public portal.
 *
 * Two motions, both earning their place rather than decorating:
 *   1. `.pub-reveal` elements fade and rise in document order, which gives a
 *      long single-page report a reading sequence instead of dumping every
 *      section on the reader at once.
 *   2. `.pub-reveal-seg` segments of the allocation bar grow from zero width,
 *      so the reader watches the categories add up to the whole. That is the
 *      chart's actual claim, animated.
 *
 * Nothing pins, hijacks or loops. Under `prefers-reduced-motion` the effect is
 * skipped entirely and the CSS restores full opacity, so no content depends on
 * an animation having run.
 *
 * @param {unknown} deps value that, when it changes, means new nodes were
 *   rendered and the triggers must be rebuilt.
 */
export function useScrollReveal(deps) {
  const scopeRef = useRef(null)

  useEffect(() => {
    const scope = scopeRef.current
    if (!scope) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // Only now is it safe for the CSS to hide the targets: if this module had
    // failed to load, the page would still have rendered fully visible.
    scope.classList.add('reveal-ready')

    const ctx = gsap.context(() => {
      gsap.utils.toArray('.pub-reveal').forEach(node => {
        gsap.fromTo(
          node,
          { opacity: 0, y: 18 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: 'power2.out',
            scrollTrigger: { trigger: node, start: 'top 88%', once: true },
          },
        )
      })

      const segments = gsap.utils.toArray('.pub-reveal-seg')
      if (segments.length) {
        gsap.from(segments, {
          scaleX: 0,
          duration: 0.55,
          ease: 'power2.out',
          stagger: 0.05,
          scrollTrigger: { trigger: segments[0].parentNode, start: 'top 88%', once: true },
        })
      }
    }, scope)

    // ScrollTrigger measures on create; the fonts and charts above it can still
    // be settling, so recalculate once the layout has quiesced.
    const refresh = requestAnimationFrame(() => ScrollTrigger.refresh())

    return () => {
      cancelAnimationFrame(refresh)
      ctx.revert()
      scope.classList.remove('reveal-ready')
    }
  }, [deps])

  return scopeRef
}
