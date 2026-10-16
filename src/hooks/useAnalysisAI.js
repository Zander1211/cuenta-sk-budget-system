import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'

const normalizeSeverity = (v) =>
  v === 'high' || v === 'medium' || v === 'low' ? v : 'low'

function isFinancialOnly(text) {
  if (!text) return true
  const lower = String(text).toLowerCase()
  return !(
    lower.includes('pending approval') ||
    lower.includes('pending budget') ||
    lower.includes('pending review') ||
    lower.includes('approval status') ||
    lower.includes('awaiting review') ||
    lower.includes('missing receipt') ||
    lower.includes('receipt compliance')
  )
}

function normalize(payload) {
  if (!payload || typeof payload !== 'object') {
    return { summary: '', insights: [], recommendations: [], updatedAt: null }
  }
  const rawInsights = Array.isArray(payload.insights) ? payload.insights : []
  const rawAlerts = Array.isArray(payload.alerts) ? payload.alerts : []
  const rawRecommendations = Array.isArray(payload.recommendations) ? payload.recommendations : []

  const mapInsight = (item) => ({
    type: item.type || 'insight',
    title: item.title || item.headline || 'Insight',
    detail: item.detail || item.description || '',
    // Optional short justification. Falls back to a severity-based line at render time.
    why: item.why || item.reason || item.rationale || '',
    severity: normalizeSeverity(item.severity || item.level),
  })

  // Filter out any workflow-related or pending approval items to ensure pure financial analysis
  const filteredInsights = [...rawInsights.map(mapInsight), ...rawAlerts.map(mapInsight)].filter((item) =>
    isFinancialOnly(`${item.title} ${item.detail} ${item.why}`)
  )

  const filteredRecommendations = rawRecommendations
    .map((r) => (typeof r === 'string' ? r : r.title || r.detail || ''))
    .filter(Boolean)
    .filter((r) => isFinancialOnly(r))

  return {
    summary: typeof payload.summary === 'string' ? payload.summary : '',
    // Merge alerts into insights list so panels get a single stream.
    insights: filteredInsights,
    recommendations: filteredRecommendations,
    updatedAt: payload.updatedAt || payload.updated_at || new Date().toISOString(),
  }
}

// Layer 2 (AI interpretation). Deterministic metrics come in via `payload`; the AI
// only explains them. On failure we keep deterministic `fallback` insights visible.
//
// `enabled` gates the first automatic run (e.g. skip when there's no data).
export function useAnalysisAI(payload, { fallback = [], enabled = true } = {}) {
  const [state, setState] = useState({ status: 'idle', summary: '', insights: [], recommendations: [], updatedAt: null })
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const signature = JSON.stringify(payload)

  const run = useCallback(async () => {
    const id = ++requestId.current
    if (!enabled) {
      setState({ status: 'ready', summary: '', insights: [], recommendations: [], updatedAt: null })
      return
    }
    setError('')
    setState({ status: 'loading', summary: '', insights: [], recommendations: [], updatedAt: null })

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-analysis', {
        body: payload,
      })
      if (id !== requestId.current) return // stale response
      if (fnError) throw fnError
      const normalized = normalize(data)
      setState({ status: 'ready', ...normalized })
    } catch (err) {
      if (id !== requestId.current) return
      if (import.meta.env?.DEV) console.warn('AI analysis failed:', err?.message || err)
      setState((prev) => ({ ...prev, status: 'error' }))
      let errorMessage = err?.message || 'AI interpretation is temporarily unavailable.'
      if (errorMessage.includes('non-2xx status code')) {
        errorMessage = 'AI interpretation failed (API quota exceeded or service error).'
      }
      setError(errorMessage)
    }
    // `signature` fully encodes `payload`; listing payload would re-create on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled])

  // Auto-run on mount and whenever the deterministic signature meaningfully changes
  // (i.e. a filter was applied / data changed) — not on every render.
  useEffect(() => {
    // Intentional fetch-on-change effect; `run` sets loading/ready/error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    run()
    return () => { requestId.current += 1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled])

  // Present AI insights when available, otherwise deterministic fallback.
  const insights = state.insights.length ? state.insights : fallback
  const recommendations = state.recommendations

  return { ...state, insights, recommendations, error, refresh: run }
}
