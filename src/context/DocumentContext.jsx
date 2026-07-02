import { createContext, useContext, useEffect, useState } from 'react'

const DocumentContext = createContext(null)
const STORAGE_KEY = 'cuenta.documentHistory.v2'

function getInitialState() {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored)
  } catch {
    return []
  }
}

export function DocumentProvider({ children }) {
  const [documents, setDocuments] = useState(() => getInitialState())

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(documents))
    }
  }, [documents])

  function addDocument(doc) {
    setDocuments((prev) => [
      {
        id: typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}`,
        dateGenerated: new Date().toISOString(),
        ...doc,
      },
      ...prev,
    ])
  }

  function deleteDocument(docId) {
    setDocuments((prev) => prev.filter((d) => d.id !== docId))
  }

  return (
    <DocumentContext.Provider value={{ documents, addDocument, deleteDocument }}>
      {children}
    </DocumentContext.Provider>
  )
}

export function useDocuments() {
  const context = useContext(DocumentContext)
  if (!context) {
    throw new Error('useDocuments must be used within a DocumentProvider')
  }
  return context
}
