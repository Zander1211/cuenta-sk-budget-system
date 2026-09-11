import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'

const MENU_GAP = 6
// Rough estimate used only to decide whether the menu should open upward
// instead of downward — it doesn't need to be exact, just enough to tell
// whether the trigger is near the bottom of the viewport.
const ESTIMATED_MENU_HEIGHT = 190

// A compact "⋮ More" menu for a table row's less-frequent actions. Built for
// tables like Projects & Events, where View/Expenses stay as their own
// buttons (toggled constantly, need to stay one click away) while secondary
// actions — Documents, Receipts, Archive — collapse into this so the row
// doesn't force a horizontal scroll just to reach a button on the right.
//
// The menu is portaled to <body> and positioned with `position: fixed` from
// the trigger's own bounding box, instead of `position: absolute` inside the
// row. Tables like this one sit inside a `.table-scroll` wrapper
// (`overflow-x: auto`), and setting overflow on one axis makes the browser
// clip the other axis too — an absolutely-positioned dropdown from a row
// near the bottom of the table was getting cut off there, invisible with no
// way to scroll to it (the visible symptom: opening the menu on one of the
// last rows showed nothing, and it "disappeared" on scroll). Escaping to a
// portal sidesteps that ancestor clipping entirely.
//
// Each child is expected to be a `.row-menu-item` button; the menu closes
// itself on any click inside (selecting an item) as well as on an outside
// click, Escape, or the page scrolling underneath it, matching
// NotificationBell's dropdown behavior.
function RowActionsMenu({ label = 'More actions', children }) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const openUpward = rect.bottom + MENU_GAP + ESTIMATED_MENU_HEIGHT > window.innerHeight

    setPosition({
      right: Math.max(8, window.innerWidth - rect.right),
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + MENU_GAP }
        : { top: rect.bottom + MENU_GAP }),
    })
  }, [isOpen])

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        menuRef.current && !menuRef.current.contains(event.target)
        && triggerRef.current && !triggerRef.current.contains(event.target)
      ) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsOpen(false)
    }
    // Any ancestor scrolling underneath (the table wrapper, the page, a
    // modal body) invalidates the computed position — close rather than
    // track it, same as most popovers. `capture: true` catches scroll on
    // any scrollable ancestor, since scroll events don't bubble.
    function handleScroll() {
      setIsOpen(false)
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
      window.addEventListener('scroll', handleScroll, true)
      window.addEventListener('resize', handleScroll)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleScroll)
    }
  }, [isOpen])

  return (
    <div className="row-menu-wrap">
      <button
        type="button"
        ref={triggerRef}
        className="icon-button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={label}
        title={label}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <MoreVertical size={16} aria-hidden="true" />
      </button>

      {isOpen && position
        ? createPortal(
            <div
              ref={menuRef}
              className="row-menu row-menu-portal"
              role="menu"
              style={position}
              onClick={() => setIsOpen(false)}
            >
              {children}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

export default RowActionsMenu
