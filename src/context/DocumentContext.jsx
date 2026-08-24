import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from './AuthContext'

const DocumentContext = createContext(null)
const DEFAULT_DOCUMENT_QUERY = {
  page: 1,
  pageSize: 10,
  search: '',
  type: 'All',
  archived: false,
}

function mapDocument(row) {
  return {
    ...row,
    dateGenerated: row.date_generated,
    archivedAt: row.archived_at,
    generatedBy: row.generated_by,
    createdBy: row.created_by,
    fileName: row.file_name,
    filePath: row.file_path,
    storageUrl: row.storage_url,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    status: row.status || (row.archived_at ? 'archived' : 'generated'),
  }
}

function createFileName(name) {
  const safeName = String(name || 'document')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${safeName || 'document'}.pdf`
}

function isMissingMetadataColumn(error) {
  return error?.code === 'PGRST204' || /column .* does not exist|schema cache/i.test(error?.message || '')
}

function normalizeDocumentSearch(value) {
  return String(value || '').replace(/[(),]/g, ' ').trim()
}

export function DocumentProvider({ children }) {
  const { user, isLoading: isAuthLoading } = useAuth()
  const userId = user?.id
  const [documents, setDocuments] = useState([])
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  const [documentsError, setDocumentsError] = useState('')
  const [totalCount, setTotalCount] = useState(0)
  const [documentStats, setDocumentStats] = useState({
    total: 0,
    active: 0,
    archived: 0,
    uploaded: 0,
  })
  const [documentTypes, setDocumentTypes] = useState([])
  const currentQueryRef = useRef(DEFAULT_DOCUMENT_QUERY)
  const latestDocumentsRequestRef = useRef(0)

  const loadDocuments = useCallback(async (options = currentQueryRef.current) => {
    const queryOptions = {
      ...currentQueryRef.current,
      ...(options || {}),
    }
    const page = Math.max(1, Number(queryOptions.page) || 1)
    const pageSize = Math.max(1, Number(queryOptions.pageSize) || 10)
    const search = normalizeDocumentSearch(queryOptions.search)
    const type = queryOptions.type || 'All'
    const archived = Boolean(queryOptions.archived)
    currentQueryRef.current = { page, pageSize, search, type, archived }
    const requestId = ++latestDocumentsRequestRef.current

    if (isAuthLoading) return []

    if (!userId) {
      setDocuments([])
      setTotalCount(0)
      setDocumentsError('')
      setIsLoadingDocuments(false)
      return []
    }

    setIsLoadingDocuments(true)
    setDocumentsError('')

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    let query = supabase
      .from('documents')
      .select('*', { count: 'exact' })
      .order('date_generated', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)

    query = archived
      ? query.not('archived_at', 'is', null)
      : query.is('archived_at', null)

    if (type !== 'All') query = query.eq('type', type)
    if (search) {
      query = query.or(`name.ilike.%${search}%,project.ilike.%${search}%`)
    }

    const { data, error, count } = await query

    if (requestId !== latestDocumentsRequestRef.current) return []

    if (error) {
      console.error('Error fetching documents:', error)
      setDocumentsError(`Unable to load documents: ${error.message}`)
      setIsLoadingDocuments(false)
      return []
    }

    const mapped = (data || []).map(mapDocument)
    setDocuments(mapped)
    setTotalCount(count ?? 0)
    setIsLoadingDocuments(false)
    return mapped
  }, [isAuthLoading, userId])

  const loadDocumentStats = useCallback(async () => {
    if (isAuthLoading || !userId) {
      setDocumentStats({ total: 0, active: 0, archived: 0, uploaded: 0 })
      setDocumentTypes([])
      return
    }

    const [totalResult, activeResult, archivedResult, uploadedResult, typesResult] = await Promise.all([
      supabase.from('documents').select('id', { count: 'exact', head: true }),
      supabase.from('documents').select('id', { count: 'exact', head: true }).is('archived_at', null),
      supabase.from('documents').select('id', { count: 'exact', head: true }).not('archived_at', 'is', null),
      supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .or('file_path.not.is.null,storage_url.not.is.null'),
      supabase.from('documents').select('type'),
    ])

    const countError = totalResult.error || activeResult.error || archivedResult.error
    if (countError) {
      console.error('Error fetching document totals:', countError)
      return
    }

    setDocumentStats({
      total: totalResult.count ?? 0,
      active: activeResult.count ?? 0,
      archived: archivedResult.count ?? 0,
      uploaded: uploadedResult.error ? 0 : (uploadedResult.count ?? 0),
    })

    if (!typesResult.error) {
      setDocumentTypes(
        Array.from(new Set((typesResult.data || []).map((row) => row.type).filter(Boolean))).sort(),
      )
    }
  }, [isAuthLoading, userId])

  useEffect(() => {
    let cancelled = false
    if (!isAuthLoading && !userId) {
      queueMicrotask(() => {
        if (cancelled) return
        setDocuments([])
        setTotalCount(0)
        setDocumentStats({ total: 0, active: 0, archived: 0, uploaded: 0 })
        setDocumentTypes([])
      })
    }

    const handleRollback = () => {
      loadDocuments()
      loadDocumentStats()
    }
    window.addEventListener('cuenta:rollback-complete', handleRollback)
    return () => {
      cancelled = true
      window.removeEventListener('cuenta:rollback-complete', handleRollback)
    }
  }, [isAuthLoading, userId, loadDocuments, loadDocumentStats])

  async function addDocument(doc) {
    if (!userId) {
      throw new Error('You must be signed in before generating a document.')
    }

    if (!doc?.name || !doc?.type || !doc?.generatedBy) {
      throw new Error('Document title, type, and generated-by information are required.')
    }

    const dateGenerated = new Date().toISOString()
    const basePayload = {
      date_generated: dateGenerated,
      name: doc.name,
      project: doc.project || null,
      generated_by: doc.generatedBy,
      type: doc.type,
      data: doc.data || null,
      archived_at: null,
    }
    const trackingPayload = {
      ...basePayload,
      created_by: userId,
      related_entity_type: doc.relatedEntityType || null,
      related_entity_id: doc.relatedEntityId ? String(doc.relatedEntityId) : null,
      file_name: doc.fileName || createFileName(doc.name),
      file_path: doc.filePath || null,
      storage_url: doc.storageUrl || null,
      status: doc.status || 'generated',
    }

    setDocumentsError('')

    let result = await supabase.from('documents').insert(trackingPayload).select().single()

    // Keep the application deployable before the companion metadata migration is
    // applied. Missing-column failures happen before an INSERT is executed, so
    // retrying with the legacy shape cannot create a duplicate row.
    if (result.error && isMissingMetadataColumn(result.error)) {
      console.warn('Document metadata columns are not deployed yet; saving the legacy record shape.')
      result = await supabase.from('documents').insert(basePayload).select().single()
    }

    const { data: insertedData, error } = result

    if (error) {
      console.error('Error adding document:', error)
      const message = `Unable to record document: ${error.message}`
      setDocumentsError(message)
      throw new Error(message, { cause: error })
    }

    const savedDocument = mapDocument({ ...trackingPayload, ...insertedData })
    await Promise.all([
      loadDocuments({ ...currentQueryRef.current, page: 1 }),
      loadDocumentStats(),
    ])
    window.dispatchEvent(new CustomEvent('cuenta:document-created', { detail: savedDocument }))
    return savedDocument
  }

  async function deleteDocument(docId) {
    const backup = [...documents]
    setDocuments((prev) => prev.filter((d) => d.id !== docId))

    const { error } = await supabase.from('documents').delete().eq('id', docId)
    if (error) {
      console.error('Error deleting document:', error)
      setDocuments(backup)
    } else {
      await Promise.all([loadDocuments(), loadDocumentStats()])
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
    } else {
      await Promise.all([loadDocuments(), loadDocumentStats()])
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
    } else {
      await Promise.all([loadDocuments(), loadDocumentStats()])
    }
  }

  return (
    <DocumentContext.Provider
      value={{
        documents,
        isLoadingDocuments,
        documentsError,
        totalCount,
        documentStats,
        documentTypes,
        refreshDocuments: loadDocuments,
        refreshDocumentStats: loadDocumentStats,
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
