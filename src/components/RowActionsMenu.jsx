import { useEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'

// A compact "⋮ More" menu for a table row's less-frequent actions. Built for
// tables like Projects & Events, where View/Expenses stay as their own
// buttons (toggled constantly, need to stay one click away) while secondary
// actions — Documents, Receipts, Archive — collapse into this so the row
// doesn't force a horizontal scroll just to reach a button on the right.
//
// Each child is expected to be a `.row-menu-item` button; the menu closes
// itself on any click inside (selecting an item) as well as on an outside
// click or Escape, matching NotificationBell's dropdown behavior.
function RowActionsMenu({ label = 'More actions', children }) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

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
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
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

      {isOpen ? (
        <div ref={menuRef} className="row-menu" role="menu" onClick={() => setIsOpen(false)}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

export default RowActionsMenu
