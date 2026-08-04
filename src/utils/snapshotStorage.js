/**
 * snapshotStorage.js
 *
 * Robust, high-capacity client-side snapshot persistence utilizing IndexedDB
 * with automatic fallback to localStorage.
 *
 * This prevents QuotaExceededErrors from localStorage when saving full pre-restore
 * database snapshots that contain project photos, receipts, or large JSON payloads.
 */

const DB_NAME = 'cuenta_snapshots_db'
const DB_VERSION = 1
const STORE_NAME = 'snapshots'
const LS_FALLBACK_KEY = 'cuenta.pre_restore_snapshots'

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not available'))
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ── LocalStorage Fallback Helpers ──────────────────────────────
function getFromLocalStorage(id) {
  try {
    const raw = window.localStorage.getItem(LS_FALLBACK_KEY)
    if (!raw) return null
    const all = JSON.parse(raw)
    return all[id]?.snapshot || all[id] || null
  } catch {
    return null
  }
}

function saveToLocalStorage(id, snapshotData) {
  try {
    const raw = window.localStorage.getItem(LS_FALLBACK_KEY)
    const all = raw ? JSON.parse(raw) : {}
    all[id] = {
      timestamp: new Date().toISOString(),
      snapshot: snapshotData,
    }
    window.localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(all))
  } catch (err) {
    console.warn('[snapshotStorage] LocalStorage quota fallback exceeded:', err?.message)
  }
}

function removeFromLocalStorage(id) {
  try {
    const raw = window.localStorage.getItem(LS_FALLBACK_KEY)
    if (!raw) return
    const all = JSON.parse(raw)
    delete all[id]
    window.localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Save a snapshot by identifier (e.g., filename, history ID, or '__latest_pre_restore__')
 */
export async function saveSnapshot(identifier, snapshotData) {
  if (!identifier || !snapshotData) return false

  // Always mirror in localStorage for immediate sync (best effort)
  saveToLocalStorage(identifier, snapshotData)

  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const record = {
        id: String(identifier),
        timestamp: new Date().toISOString(),
        snapshot: snapshotData,
      }
      const request = store.put(record)

      request.onsuccess = () => resolve(true)
      request.onerror = () => {
        console.warn('[snapshotStorage] IndexedDB put error:', request.error)
        resolve(false)
      }
      tx.oncomplete = () => db.close()
    })
  } catch (err) {
    console.warn('[snapshotStorage] Failed to save in IndexedDB:', err?.message)
    return false
  }
}

/**
 * Retrieve a snapshot by identifier
 */
export async function getSnapshot(identifier) {
  if (!identifier) return null

  // 1. Try IndexedDB first
  try {
    const db = await openDB()
    const result = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(String(identifier))

      request.onsuccess = () => resolve(request.result?.snapshot || null)
      request.onerror = () => resolve(null)
      tx.oncomplete = () => db.close()
    })

    if (result) return result
  } catch (err) {
    console.warn('[snapshotStorage] IndexedDB read error:', err?.message)
  }

  // 2. Fallback to LocalStorage
  return getFromLocalStorage(identifier)
}

/**
 * Remove a snapshot by identifier
 */
export async function removeSnapshot(identifier) {
  if (!identifier) return

  removeFromLocalStorage(identifier)

  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(String(identifier))

      request.onsuccess = () => resolve(true)
      request.onerror = () => resolve(false)
      tx.oncomplete = () => db.close()
    })
  } catch (err) {
    console.warn('[snapshotStorage] IndexedDB remove error:', err?.message)
  }
}
