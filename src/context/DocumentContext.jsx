import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase/supabaseClient'

const DocumentContext = createContext(null)

export function DocumentProvider({ children }) {
  const [documents, setDocuments] = useState([])

  const loadDocuments = useCallback(async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('date_generated', { ascending: false })

    if (error) {
      console.error('Error fetching documents:', error)
      return
    }

    if (data) {
      const mapped = data.map((d) => ({
        ...d,
        dateGenerated: d.date_generated,
        archivedAt: d.archived_at,
        generatedBy: d.generated_by,
      }))
      setDocuments(mapped)
    }
  }, [])

  useEffect(() => {
    loadDocuments()

    const handleRollback = () => {
      loadDocuments()
    }
    window.addEventListener('cuenta:rollback-complete', handleRollback)
    return () => {
      window.removeEventListener('cuenta:rollback-complete', handleRollback)
    }
  }, [loadDocuments])

  async function addDocument(doc) {
    // Generate a temporary ID for optimistic update
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const dateGenerated = new Date().toISOString()
    
    const newDoc = {
      id: tempId,
      dateGenerated,
      ...doc
    }
    
    // Optimistic update
    setDocuments((prev) => [newDoc, ...prev])

    // Save to Supabase (omit id to let Postgres generate UUID)
    const { data: insertedData, error } = await supabase.from('documents').insert({
      date_generated: dateGenerated,
      name: doc.name,
      project: doc.project,
      generated_by: doc.generatedBy,
      type: doc.type,
      data: doc.data,
      archived_at: null
    }).select().single()

    if (error) {
      console.error('Error adding document:', error)
      // Rollback optimistic update
      setDocuments((prev) => prev.filter((d) => d.id !== tempId))
    } else if (insertedData) {
      // Update optimistic document with actual DB UUID
      setDocuments((prev) => prev.map((d) => d.id === tempId ? {
        ...d,
        id: insertedData.id
      } : d))
    }
  }

  async function deleteDocument(docId) {
    const backup = [...documents]
    setDocuments((prev) => prev.filter((d) => d.id !== docId))

    const { error } = await supabase.from('documents').delete().eq('id', docId)
    if (error) {
      console.error('Error deleting document:', error)
      setDocuments(backup)
    }
  }

  async function archiveDocument(docId) {
    const timestamp = new Date().toISOString()
    const backup = [...documents]
    
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, archivedAt: timestamp } : d))
    )

    const { error } = await supabase
      .from('documents')
      .update({ archived_at: timestamp })
      .eq('id', docId)
      
    if (error) {
      console.error('Error archiving document:', error)
      setDocuments(backup)
    }
  }

  async function restoreDocument(docId) {
    const backup = [...documents]
    
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, archivedAt: null } : d))
    )

    const { error } = await supabase
      .from('documents')
      .update({ archived_at: null })
      .eq('id', docId)
      
    if (error) {
      console.error('Error restoring document:', error)
      setDocuments(backup)
    }
  }

  return (
    <DocumentContext.Provider
      value={{
        documents,
        refreshDocuments: loadDocuments,
        addDocument,
        deleteDocument,
        archiveDocument,
        restoreDocument
      }}
    >
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
